import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthOrTrial } from "@/lib/brand-os/auth-or-trial";
import { rateLimitByUser } from "@/lib/rate-limit";
import { transcribeAudio } from "@/lib/brand-os/voice-discovery";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const auth = await resolveAuthOrTrial(request);
  if (!auth.ok) return auth.response;
  const { coachId, dbClient } = auth;

  const rl = rateLimitByUser(coachId, "voice/compose", 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const form = await request.formData();
  const audioFile = form.get("audio") as File | null;
  const context = (form.get("context") as string | null) ?? "";
  const purpose = (form.get("purpose") as string | null) ?? "content";
  const leadName = (form.get("leadName") as string | null) ?? "";

  if (!audioFile) {
    return NextResponse.json({ error: "audio field required" }, { status: 400 });
  }

  const audioBuffer = await audioFile.arrayBuffer();
  const transcript = await transcribeAudio(audioBuffer, audioFile.type || "audio/webm");

  if (!transcript.trim()) {
    return NextResponse.json({ error: "no_speech", transcript: "" }, { status: 200 });
  }

  const { data: coach } = await dbClient
    .from("cp_coaches")
    .select("brand_voice_overlay")
    .eq("id", coachId)
    .maybeSingle();

  const overlay = coach?.brand_voice_overlay as {
    tone?: string;
    rhythm?: string;
    vocab_yes?: string[];
    vocab_no?: string[];
    signature_moves?: string[];
  } | null;

  const { data: voiceProfile } = await dbClient
    .from("cp_voice_profiles")
    .select("tone_keywords, avoid_keywords, writing_style")
    .eq("coach_id", coachId)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const voiceBlock = buildVoiceBlock(overlay, voiceProfile);
  const purposeInstruction = getPurposeInstruction(purpose, leadName);

  const systemPrompt = `You are a ghostwriter for a coach. You write in THEIR voice, not yours.

${voiceBlock}

RULES:
- Write exactly how this coach talks. Use their words, their rhythm, their cadence.
- Keep it short and punchy unless their style is long-form.
- No hashtags unless they explicitly mentioned them.
- No emojis unless that's their style.
- No "Hey friend" or generic coaching opener unless that's their actual voice.
- Output ONLY the draft. No preamble, no "here's your draft", no explanation.`;

  const userPrompt = `${purposeInstruction}

The coach rambled this into their mic:

"${transcript}"

${context ? `Additional context: ${context}` : ""}

Write the polished draft in their voice. Output ONLY the draft text.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json(
      { error: "anthropic_error", detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const aiData = (await aiRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const draft = aiData.content?.find((c) => c.type === "text")?.text ?? "";

  return NextResponse.json({ transcript, draft });
}

function buildVoiceBlock(
  overlay: {
    tone?: string;
    rhythm?: string;
    vocab_yes?: string[];
    vocab_no?: string[];
    signature_moves?: string[];
  } | null,
  voiceProfile: {
    tone_keywords?: string;
    avoid_keywords?: string;
    writing_style?: string;
  } | null,
): string {
  const parts: string[] = [];

  if (overlay?.tone) parts.push(`TONE: ${overlay.tone}`);
  if (overlay?.rhythm) parts.push(`RHYTHM: ${overlay.rhythm}`);
  if (overlay?.vocab_yes?.length) parts.push(`WORDS THEY USE: ${overlay.vocab_yes.join(", ")}`);
  if (overlay?.vocab_no?.length) parts.push(`WORDS THEY NEVER USE: ${overlay.vocab_no.join(", ")}`);
  if (overlay?.signature_moves?.length) parts.push(`SIGNATURE MOVES: ${overlay.signature_moves.join("; ")}`);

  if (voiceProfile?.tone_keywords) parts.push(`TONE KEYWORDS: ${voiceProfile.tone_keywords}`);
  if (voiceProfile?.avoid_keywords) parts.push(`AVOID: ${voiceProfile.avoid_keywords}`);
  if (voiceProfile?.writing_style) parts.push(`WRITING STYLE: ${voiceProfile.writing_style}`);

  if (parts.length === 0) {
    return "VOICE: No voice profile loaded yet. Write in a direct, warm, coach-like tone. Avoid corporate language.";
  }

  return `COACH'S VOICE DNA:\n${parts.join("\n")}`;
}

function getPurposeInstruction(purpose: string, leadName: string): string {
  switch (purpose) {
    case "dm":
    case "outreach":
      return `Write a personal DM/outreach message${leadName ? ` to ${leadName}` : ""}. Keep it warm, direct, not salesy.`;
    case "email":
      return `Write an email${leadName ? ` to ${leadName}` : ""}. Professional but human.`;
    case "caption":
    case "instagram":
      return "Write an Instagram caption. Hook in the first line. No hashtags unless the coach uses them.";
    case "carousel":
      return "Write carousel slide copy. One idea per slide. Short, punchy lines.";
    case "newsletter":
      return "Write a newsletter section. Conversational, personal, teaches one thing.";
    case "content":
    default:
      return "Write a content piece (post, caption, or message) based on what the coach described.";
  }
}
