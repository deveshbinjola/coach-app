import type { VoiceProfile } from "@/lib/types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export type MemoryExtraction = {
  title: string;
  wins: string[];
  blockers: string[];
  commitments: string[];
  next_focus: string;
  follow_up_draft: string;
  content_ideas: string[];
  extraction_source: "ai" | "fallback";
};

export async function extractSessionMemory({
  notes,
  title,
  clientName,
  currentFocus,
  profile,
}: {
  notes: string;
  title: string;
  clientName: string;
  currentFocus: string | null;
  profile: VoiceProfile | null;
}): Promise<MemoryExtraction> {
  const fallback = deterministicExtraction(notes, title);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const system = [
    "You turn coaching session notes into operational memory.",
    "Return strict JSON only.",
    "Use the coach voice profile for the follow_up_draft only.",
    "Do not invent facts. Use only the provided notes.",
    "No em dash characters.",
  ].join(" ");

  const prompt = [
    "Create session memory for a coach platform.",
    "",
    "JSON shape:",
    JSON.stringify({
      title: "short title",
      wins: ["specific client win"],
      blockers: ["specific blocker"],
      commitments: ["homework action for the client"],
      next_focus: "one sentence focus for the next session",
      follow_up_draft: "short recap message in the coach voice",
      content_ideas: ["anonymous content idea from the session theme"],
    }),
    "",
    "Rules:",
    "- Keep every array to 1 to 5 items.",
    "- The follow up should be warm, direct, and ready to send.",
    "- Content ideas must be anonymous. Never mention private details.",
    "- If a field is unknown, return an empty array or a short honest sentence.",
    "",
    "CLIENT:",
    clientName,
    "",
    "CURRENT FOCUS:",
    currentFocus || "(none yet)",
    "",
    "VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "VOICE SAMPLES:",
    (profile?.sample_messages ?? []).slice(0, 4).join("\n\n") || "(none)",
    "",
    "SESSION TITLE:",
    title || "(untitled)",
    "",
    "SESSION NOTES:",
    notes,
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
        model: MODEL,
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return fallback;
    const result = await response.json();
    const text = String(result?.content?.[0]?.text ?? "").trim();
    const parsed = JSON.parse(stripCodeFence(text));
    return normalizeExtraction(parsed, fallback);
  } catch {
    return fallback;
  }
}

function deterministicExtraction(notes: string, title: string): MemoryExtraction {
  const sentences = notes
    .split(/[.\n]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = sentences[0] ?? notes.slice(0, 140);
  const commitments = sentences
    .filter((line) => /homework|commit|next|practice|send|write|do|try/i.test(line))
    .slice(0, 3);

  return {
    title: title || "Session memory",
    wins: sentences.filter((line) => /win|worked|better|clear|progress/i.test(line)).slice(0, 3),
    blockers: sentences.filter((line) => /stuck|blocked|fear|pressure|avoid|conflict/i.test(line)).slice(0, 3),
    commitments: commitments.length ? commitments : ["Send a short recap and confirm the next step."],
    next_focus: first || "Clarify the next honest move.",
    follow_up_draft: [
      "Good session today.",
      first ? `The main thread I heard: ${first}` : "The main thread is clearer now.",
      "For next time, keep the next step small and real. Reply when you have done it.",
    ].join("\n\n"),
    content_ideas: first ? [`Anonymous lesson from this session: ${first}`] : [],
    extraction_source: "fallback",
  };
}

function normalizeExtraction(value: unknown, fallback: MemoryExtraction): MemoryExtraction {
  const record = isRecord(value) ? value : {};
  return {
    title: stringValue(record.title, fallback.title, 90),
    wins: stringList(record.wins, fallback.wins),
    blockers: stringList(record.blockers, fallback.blockers),
    commitments: stringList(record.commitments, fallback.commitments),
    next_focus: stringValue(record.next_focus, fallback.next_focus, 240),
    follow_up_draft: stringValue(record.follow_up_draft, fallback.follow_up_draft, 1200),
    content_ideas: stringList(record.content_ideas, fallback.content_ideas),
    extraction_source: "ai",
  };
}

function stripCodeFence(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
}

function stringList(value: unknown, fallback: string[]) {
  const list = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
  return (list.length ? list : fallback).filter(Boolean).slice(0, 5);
}
