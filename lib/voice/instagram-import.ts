// lib/voice/instagram-import.ts
//
// Shared Instagram-import processing. Extracted from the sync route
// (app/api/voice/import/instagram/route.ts) so the async onboarding
// endpoints (start + status) reuse one implementation.
//
// Split of concerns:
//   - The SCRAPE (Apify call) stays with each caller — sync route uses the
//     blocking run-sync endpoint; the async status endpoint polls a run and
//     fetches the dataset.
//   - Everything AFTER captions are in hand (transcript -> Claude rules ->
//     voice profile + training source) lives here in processInstagramCaptions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";
import {
  SYSTEM_RULE_HEADER,
  SYSTEM_RULE_FOOTER,
  safeParseJson,
  detectGenericPhrases,
} from "@/lib/voice/extract-rules";

export const APIFY_DEFAULT_ACTOR = "apify/instagram-scraper";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

export type InstagramCaption = {
  caption: string;
  url?: string;
  timestamp?: string;
  likes?: number;
  comments?: number;
};

export type ExtractedRule = {
  id: string;
  text: string;
  confidence: "preliminary" | "real";
  category?: "hook" | "story" | "cta" | "belief" | "offer" | "avoid" | "rhythm";
};

export type ProcessResult = {
  profile: VoiceProfile;
  source: VoiceTrainingSource;
  captionsUsed: number;
  extractedRules: ExtractedRule[];
  learnedPatterns: Array<{ label: string; text: string }>;
};

/** Given scraped captions, run rule extraction, update (or create) the active
 *  voice profile, and write a training source. Shared by the sync route and
 *  the async status endpoint. Throws on unrecoverable DB errors; callers wrap. */
export async function processInstagramCaptions(
  supabase: SupabaseClient,
  coachId: string,
  handle: string,
  captions: InstagramCaption[],
): Promise<ProcessResult> {
  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("*")
    .eq("coach_id", coachId)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeProfile = (profile as VoiceProfile | null) ?? null;

  const transcript = buildInstagramTranscript(handle, captions);
  const rules = await extractInstagramRules(transcript, activeProfile);
  const nextVoiceJson = mergeInstagramSignal(activeProfile?.voice_json ?? {}, {
    handle,
    captionsUsed: captions.length,
    rules,
    transcript,
  });
  const nextSamples = [
    ...captions.slice(0, 5).map((item) => item.caption),
    ...(activeProfile?.sample_messages ?? []),
  ].filter(Boolean).slice(0, 12);

  const workingProfile = activeProfile ?? await createStarterProfile(supabase, {
    coachId,
    voiceJson: nextVoiceJson,
    sampleMessages: nextSamples,
  });

  if (!workingProfile) {
    throw new Error("Could not create voice profile for import.");
  }

  const { data: source, error: sourceError } = await supabase
    .from("cp_voice_training_sources")
    .insert({
      coach_id: coachId,
      voice_profile_id: workingProfile.id,
      source_type: "instagram",
      title: `Instagram import · @${handle}`,
      transcript,
      audio_filename: null,
      audio_mime_type: null,
      duration_minutes: 0,
      extracted_rules: rules,
      approved_rule_ids: [],
    })
    .select("*")
    .single();

  if (sourceError || !source) {
    throw new Error(sourceError?.message ?? "Could not save Instagram import.");
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("cp_voice_profiles")
    .update({
      voice_json: nextVoiceJson,
      sample_messages: nextSamples,
    })
    .eq("id", workingProfile.id)
    .eq("coach_id", coachId)
    .select("*")
    .single();

  if (profileError || !updatedProfile) {
    throw new Error(profileError?.message ?? "Could not update voice profile.");
  }

  return {
    profile: updatedProfile as VoiceProfile,
    source: source as VoiceTrainingSource,
    captionsUsed: captions.length,
    extractedRules: rules,
    learnedPatterns: summarizeLearnedPatterns(rules, transcript),
  };
}

async function extractInstagramRules(
  transcript: string,
  profile: VoiceProfile | null
): Promise<ExtractedRule[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackInstagramRules(transcript);

  const system = [
    SYSTEM_RULE_HEADER,
    "The source is Instagram captions written by this coach.",
    "Rules must help future Instagram drafts sound like THIS coach, not like a generic IG content creator.",
    "Use only the provided captions and the active voice profile.",
    SYSTEM_RULE_FOOTER,
  ].join("\n");

  const prompt = [
    "ACTIVE VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "INSTAGRAM CAPTION CORPUS:",
    transcript.slice(0, 14_000),
    "",
    "Extract 6 specific voice rules for INSTAGRAM content. Instagram-specific patterns to look for:",
    "- HOOKS: How do they open captions? First-line pattern (question, bold claim, one-liner, story entry)?",
    "- RHYTHM: Short punchy lines with line breaks? Long flowing paragraphs? Mixed?",
    "- CTAs: Do they say 'DM me', 'save this', 'comment below', 'link in bio'? What's their specific CTA pattern?",
    "- VISUAL LANGUAGE: Do they reference the image/carousel? Use emojis? Hashtag strategy?",
    "- STORY ARC: Do they open with personal stories, client wins, hot takes, or teaching?",
    "- CLOSERS: How do they end? Question? CTA? One-liner? Signature phrase?",
    "Each rule must be specific to how THIS coach writes on Instagram, not generic writing advice.",
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
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.warn("[voice/instagram] Anthropic HTTP", response.status, "— using fallback");
      return fallbackInstagramRules(transcript);
    }
    const data = await response.json();
    const raw = String(data?.content?.[0]?.text ?? "");
    const parsed = safeParseJson<{ rules?: Array<{ text?: unknown; confidence?: unknown; category?: unknown; evidence?: unknown }> }>(raw);
    if (!parsed?.rules) {
      console.warn("[voice/instagram] Could not parse rules JSON — using fallback. Raw head:", raw.slice(0, 200));
      return fallbackInstagramRules(transcript);
    }
    // Telemetry — log when the model produces generic coach-content advice.
    for (const r of parsed.rules) {
      const hits = detectGenericPhrases(String(r?.text ?? ""));
      if (hits.length > 0) {
        console.warn("[voice/instagram] generic rule produced:", { text: r.text, hits });
      }
    }
    return normalizeRules(parsed.rules);
  } catch (err) {
    console.warn("[voice/instagram] extract threw — using fallback:", err);
    return fallbackInstagramRules(transcript);
  }
}

async function createStarterProfile(
  supabase: SupabaseClient,
  {
    coachId,
    voiceJson,
    sampleMessages,
  }: {
    coachId: string;
    voiceJson: Record<string, unknown>;
    sampleMessages: string[];
  }
): Promise<VoiceProfile | null> {
  const { data: latest } = await supabase
    .from("cp_voice_profiles")
    .select("version")
    .eq("coach_id", coachId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("cp_voice_profiles")
    .update({ active: false })
    .eq("coach_id", coachId)
    .eq("active", true);

  const { data, error } = await supabase
    .from("cp_voice_profiles")
    .insert({
      coach_id: coachId,
      voice_json: {
        tone: ["specific", "direct", "conversational"],
        sentence_rhythm: "Imported from real Instagram captions. Refine with the five questions when needed.",
        vocabulary: {
          use: topWords(JSON.stringify(voiceJson)).slice(0, 6),
          avoid: ["generic AI phrasing", "corporate filler"],
        },
        openers: ["Start from a real observation."],
        closers: ["Use the coach's existing CTA pattern."],
        ctas: extractCtas(JSON.stringify(voiceJson)),
        do_nots: ["Do not flatten the coach into generic motivational content."],
        ...voiceJson,
        training_signal: {
          ...recordValue(voiceJson.training_signal),
          instagram_started_profile: 1,
        },
      },
      sample_messages: sampleMessages,
      version: (latest?.version ?? 0) + 1,
      active: true,
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return data as VoiceProfile;
}

export function normalizeApifyItems(items: unknown): InstagramCaption[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items
    .map((item) => {
      const row = isRecord(item) ? item : {};
      const caption = stringValue(
        row.caption ??
          row.text ??
          row.description ??
          row.alt ??
          row.firstComment
      );
      return {
        caption: caption.replace(/\s+\n/g, "\n").trim(),
        url: stringValue(row.url ?? row.postUrl ?? row.shortCode),
        timestamp: stringValue(row.timestamp ?? row.date ?? row.createdAt),
        likes: numberValue(row.likesCount ?? row.likes),
        comments: numberValue(row.commentsCount ?? row.comments),
      };
    })
    .filter((item) => item.caption.length >= 35)
    .filter((item) => {
      const key = item.caption.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildInstagramTranscript(handle: string, captions: InstagramCaption[]): string {
  const rows = captions.map((item, index) => {
    const meta = [
      item.timestamp ? `date: ${item.timestamp}` : null,
      typeof item.likes === "number" ? `likes: ${item.likes}` : null,
      typeof item.comments === "number" ? `comments: ${item.comments}` : null,
      item.url ? `url: ${item.url}` : null,
    ].filter(Boolean);

    return [
      `CAPTION ${index + 1}${meta.length ? ` (${meta.join(", ")})` : ""}:`,
      item.caption,
    ].join("\n");
  });

  return [`Instagram captions imported for @${handle}.`, "", ...rows].join("\n\n");
}

function mergeInstagramSignal(
  voiceJson: Record<string, unknown>,
  {
    handle,
    captionsUsed,
    rules,
    transcript,
  }: {
    handle: string;
    captionsUsed: number;
    rules: ExtractedRule[];
    transcript: string;
  }
): Record<string, unknown> {
  const currentTraining = recordValue(voiceJson.training_signal);
  const currentSources = recordValue(voiceJson.source_counts);
  const currentModes = recordValue(voiceJson.voice_modes);
  const oldInstagram = recordValue(currentModes.instagram);

  const nextPosts = numericSignal(currentTraining.posts) + captionsUsed;
  const frequentWords = topWords(transcript);
  const ctaPatterns = extractCtas(transcript);
  const learnedPatterns = summarizeLearnedPatterns(rules, transcript);

  return {
    ...voiceJson,
    voice_modes: {
      ...currentModes,
      instagram: {
        ...oldInstagram,
        handle,
        captions_used: numericSignal(oldInstagram.captions_used) + captionsUsed,
        updated_at: new Date().toISOString(),
        fingerprint: {
          frequent_words: frequentWords,
          cta_patterns: ctaPatterns,
          extracted_rules: rules.map((rule) => rule.text),
          learned_patterns: learnedPatterns,
        },
      },
    },
    training_signal: {
      ...currentTraining,
      posts: nextPosts,
      captions_used: numericSignal(currentTraining.captions_used) + captionsUsed,
      instagram_imports: numericSignal(currentTraining.instagram_imports) + 1,
      transcripts_added: numericSignal(currentTraining.transcripts_added) + 1,
    },
    source_counts: {
      ...currentSources,
      posts: numericSignal(currentSources.posts) + captionsUsed,
      instagram: numericSignal(currentSources.instagram) + captionsUsed,
    },
  };
}

function fallbackInstagramRules(transcript: string): ExtractedRule[] {
  const lower = transcript.toLowerCase();
  const rules = [
    { text: "Open with a concrete tension, claim, or lived observation before explaining.", category: "hook" as const },
    lower.includes("dm ") || lower.includes("comment ")
      ? { text: "Use direct CTAs that tell the reader exactly what to send or comment.", category: "cta" as const }
      : { text: "Keep CTAs simple and conversational instead of sounding like a funnel.", category: "cta" as const },
    lower.includes("client") || lower.includes("student")
      ? { text: "Use client moments as proof, but keep the lesson bigger than the case study.", category: "story" as const }
      : null,
    transcript.split(/\n+/).filter((line) => line.trim().length > 0).length > 16
      ? { text: "Use line breaks to create pacing and make posts easy to scan.", category: "rhythm" as const }
      : null,
    { text: "Avoid generic motivational phrasing when a sharper, more specific sentence is available.", category: "avoid" as const },
  ].filter(Boolean) as Array<{ text: string; category: ExtractedRule["category"] }>;

  return rules.slice(0, 5).map(({ text, category }) => ({
    id: ruleId(`instagram:${text}`),
    text,
    category,
    confidence: "preliminary",
  }));
}

function normalizeRules(input: Array<{ text?: unknown; confidence?: unknown; category?: unknown }> | undefined): ExtractedRule[] {
  const rules = (input ?? [])
    .map((item) => ({
      text: typeof item.text === "string" ? item.text.trim().replace(/—/g, ",") : "",
      confidence: item.confidence === "real" ? "real" as const : "preliminary" as const,
      category: normalizeCategory(item.category),
    }))
    .filter((item) => item.text.length >= 12)
    .slice(0, 6);

  return rules.map((rule) => ({
    ...rule,
    id: ruleId(`instagram:${rule.text}`),
  }));
}

function normalizeCategory(value: unknown): ExtractedRule["category"] | undefined {
  return value === "hook" ||
    value === "story" ||
    value === "cta" ||
    value === "belief" ||
    value === "offer" ||
    value === "avoid" ||
    value === "rhythm"
    ? value
    : undefined;
}

function summarizeLearnedPatterns(rules: ExtractedRule[], transcript: string): Array<{
  label: string;
  text: string;
}> {
  const byCategory = new Map<string, ExtractedRule>();
  rules.forEach((rule) => {
    if (rule.category && !byCategory.has(rule.category)) byCategory.set(rule.category, rule);
  });
  fallbackInstagramRules(transcript).forEach((rule) => {
    if (rule.category && !byCategory.has(rule.category)) byCategory.set(rule.category, rule);
  });

  return [
    ["hook", "Hook style"],
    ["story", "Story style"],
    ["cta", "CTA style"],
    ["belief", "Beliefs"],
    ["offer", "Offer language"],
    ["avoid", "Avoid"],
  ]
    .map(([key, label]) => {
      const rule = byCategory.get(key);
      return rule ? { label, text: rule.text } : null;
    })
    .filter(Boolean)
    .slice(0, 4) as Array<{ label: string; text: string }>;
}

export function normalizeInstagramHandle(value: unknown): string {
  const raw = stringValue(value)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(raw) ? raw : "";
}

export function normalizeLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(stringValue(value));
  if (!Number.isFinite(parsed)) return 18;
  return Math.max(3, Math.min(50, Math.round(parsed)));
}

function topWords(value: string): string[] {
  const stop = new Set([
    "the", "and", "you", "that", "this", "with", "for", "your", "are", "but",
    "not", "from", "have", "was", "they", "then", "when", "what", "can", "just",
  ]);
  const counts = new Map<string, number>();
  value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function extractCtas(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(dm|comment|reply|send|save|share|follow)\b/i.test(line))
    .slice(0, 5);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericSignal(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ruleId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `ig-${hash.toString(16)}`;
}
