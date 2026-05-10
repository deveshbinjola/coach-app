import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type ExtractedRule = {
  id: string;
  text: string;
  confidence: "preliminary" | "real";
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const sourceType = normalizeSourceType(form.get("source_type"));
  const title = normalizeTitle(form.get("title"), sourceType);
  const minutes = normalizeMinutes(form.get("duration_minutes"));
  const pastedTranscript = stringValue(form.get("transcript"));
  const audio = form.get("audio");

  if (!sourceType) {
    return NextResponse.json({ error: "source_type required" }, { status: 400 });
  }

  const audioFile = audio instanceof File && audio.size > 0 ? audio : null;
  if (audioFile && audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file must be 25 MB or smaller." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("*")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeProfile = (profile as VoiceProfile | null) ?? null;
  if (!activeProfile) {
    return NextResponse.json({ error: "No active voice profile." }, { status: 400 });
  }

  let transcript = pastedTranscript;
  let transcriptionSource: "openai" | "manual" = transcript ? "manual" : "openai";

  if (audioFile) {
    const transcribed = await transcribeAudio(audioFile);
    if (!transcribed.ok) {
      return NextResponse.json({ error: transcribed.error }, { status: transcribed.status });
    }
    transcript = transcribed.text;
    transcriptionSource = "openai";
  }

  transcript = transcript.trim();
  if (transcript.length < 80) {
    return NextResponse.json(
      { error: "Transcript needs at least a few real paragraphs." },
      { status: 400 }
    );
  }

  const rules = await extractRules(transcript, activeProfile);
  const nextVoiceJson = mergeTrainingSignal(
    activeProfile.voice_json,
    sourceType,
    minutes
  );
  const nextSamples = [
    compactTranscriptSample(transcript),
    ...(activeProfile.sample_messages ?? []),
  ].filter(Boolean).slice(0, 12);

  const { data: source, error: sourceError } = await supabase
    .from("cp_voice_training_sources")
    .insert({
      coach_id: user.id,
      voice_profile_id: activeProfile.id,
      source_type: sourceType,
      title,
      transcript,
      audio_filename: audioFile?.name ?? null,
      audio_mime_type: audioFile?.type ?? null,
      duration_minutes: minutes,
      extracted_rules: rules,
      approved_rule_ids: [],
    })
    .select("*")
    .single();

  if (sourceError || !source) {
    return NextResponse.json(
      { error: sourceError?.message ?? "Could not save training source." },
      { status: 500 }
    );
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("cp_voice_profiles")
    .update({
      voice_json: nextVoiceJson,
      sample_messages: nextSamples,
    })
    .eq("id", activeProfile.id)
    .eq("coach_id", user.id)
    .select("*")
    .single();

  if (profileError || !updatedProfile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Could not update voice profile." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: updatedProfile,
    source: source as VoiceTrainingSource,
    transcript,
    transcription_source: transcriptionSource,
    extracted_rules: rules,
  });
}

async function transcribeAudio(file: File): Promise<
  | { ok: true; text: string }
  | { ok: false; error: string; status: number }
> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 501,
      error: "OPENAI_API_KEY is not configured. Paste a transcript for now.",
    };
  }

  const form = new FormData();
  form.set("file", file);
  form.set("model", TRANSCRIBE_MODEL);
  form.set("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      ok: false,
      status: response.status,
      error: message || "Transcription failed.",
    };
  }

  const data = await response.json();
  return { ok: true, text: String(data?.text ?? "").trim() };
}

async function extractRules(
  transcript: string,
  profile: VoiceProfile
): Promise<ExtractedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackRules(transcript);

  const system = [
    "You extract voice memory rules for a coach AI assistant.",
    "Use only evidence from the transcript.",
    "Rules must help future outbound drafts sound more like the coach.",
    "Return JSON only with this shape: {\"rules\":[{\"text\":\"...\",\"confidence\":\"preliminary\"|\"real\"}]}",
    "No em dash characters.",
  ].join(" ");

  const prompt = [
    "ACTIVE VOICE PROFILE:",
    JSON.stringify(profile.voice_json ?? {}, null, 2),
    "",
    "TRANSCRIPT:",
    transcript.slice(0, 12_000),
    "",
    "Extract 3 to 5 voice rules. Good rules are specific, behavioral, and easy for a drafter to follow.",
  ].join("\n");

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return fallbackRules(transcript);
    const data = await response.json();
    const text = String(data?.content?.[0]?.text ?? "").trim();
    const parsed = JSON.parse(text) as { rules?: Array<{ text?: unknown; confidence?: unknown }> };
    return normalizeRules(parsed.rules);
  } catch {
    return fallbackRules(transcript);
  }
}

function fallbackRules(transcript: string): ExtractedRule[] {
  const lower = transcript.toLowerCase();
  const rules = [
    lower.includes("price") || lower.includes("cost") || lower.includes("expensive")
      ? "When price comes up, stay calm, direct, and do not over-explain."
      : null,
    lower.includes("call")
      ? "When inviting someone forward, make the next step feel simple and human."
      : null,
    transcript.split(/[.!?]\s+/).some((sentence) => sentence.trim().length < 55)
      ? "Use short sentences when making the core point."
      : null,
    "Keep the tone grounded and specific, like a real conversation.",
  ].filter(Boolean) as string[];

  return rules.slice(0, 4).map((text) => ({
    id: ruleId(text),
    text,
    confidence: "preliminary",
  }));
}

function normalizeRules(input: Array<{ text?: unknown; confidence?: unknown }> | undefined): ExtractedRule[] {
  const rules = (input ?? [])
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim().replace(/\u2014/g, ",") : "",
      confidence: item.confidence === "real" ? "real" as const : "preliminary" as const,
    }))
    .filter((item) => item.text.length >= 12)
    .slice(0, 5);

  return rules.map((rule) => ({
    ...rule,
    id: ruleId(rule.text),
  }));
}

function mergeTrainingSignal(
  voiceJson: Record<string, unknown>,
  sourceType: "sales_call" | "voice_note" | "workshop",
  minutes: number
): Record<string, unknown> {
  const current = (voiceJson.training_signal as Record<string, unknown> | undefined) ?? {};
  return {
    ...voiceJson,
    training_signal: {
      ...current,
      audio_minutes: numericSignal(current.audio_minutes) + minutes,
      sales_calls:
        numericSignal(current.sales_calls) + (sourceType === "sales_call" ? 1 : 0),
      transcripts_added: numericSignal(current.transcripts_added) + 1,
    },
  };
}

function normalizeSourceType(value: FormDataEntryValue | null): "sales_call" | "voice_note" | "workshop" | null {
  return value === "sales_call" || value === "voice_note" || value === "workshop"
    ? value
    : null;
}

function normalizeTitle(value: FormDataEntryValue | null, sourceType: string | null): string {
  const title = stringValue(value);
  if (title) return title.slice(0, 120);
  if (sourceType === "sales_call") return "Sales call";
  if (sourceType === "workshop") return "Workshop";
  return "Voice note";
}

function normalizeMinutes(value: FormDataEntryValue | null): number {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function numericSignal(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compactTranscriptSample(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 900);
}

function ruleId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `transcript-${hash.toString(16)}`;
}
