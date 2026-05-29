// Session Intelligence — types and AI extraction for the coaching session
// capture + pattern recognition system. Distinct from session-memory.ts
// (which handles per-client-room quick notes). This is the full session
// notepad with cross-client pattern analysis.

import type { VoiceProfile } from "@/lib/types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// ── Types ─────────────────────────────────────────────────────────────

export type InsightType = "pattern" | "growth" | "question_quality" | "recommendation";

export type CoachingSession = {
  id: string;
  client_id: string;
  coach_id: string;
  session_date: string;
  duration_minutes: number | null;
  raw_notes: string;
  transcript: string | null;
  ai_summary: string | null;
  key_topics: string[];
  commitments: string[];
  somatic_observations: string[];
  patterns_flagged: string[];
  created_at: string;
  updated_at: string;
};

export type SessionInsight = {
  id: string;
  coach_id: string;
  insight_type: InsightType;
  insight_text: string;
  related_session_ids: string[];
  created_at: string;
};

export type ClientJourney = {
  id: string;
  client_id: string;
  total_sessions: number;
  current_themes: string[];
  progress_notes: string | null;
  last_session_date: string | null;
  next_session_brief: string | null;
};

// ── AI extraction ─────────────────────────────────────────────────────

export type SessionAnalysis = {
  ai_summary: string;
  key_topics: string[];
  commitments: string[];
  somatic_observations: string[];
  patterns_flagged: string[];
  extraction_source: "ai" | "fallback";
};

export async function analyzeSession({
  rawNotes,
  transcript,
  clientName,
  previousSessions,
  profile,
}: {
  rawNotes: string;
  transcript: string | null;
  clientName: string;
  previousSessions: Array<{ ai_summary: string | null; key_topics: string[]; commitments: string[] }>;
  profile: VoiceProfile | null;
}): Promise<SessionAnalysis> {
  const fallback = deterministicAnalysis(rawNotes);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const system = [
    "You are a coaching session analyst.",
    "Analyze session notes/transcripts and extract structured insights.",
    "Focus on somatic observations (body-based, embodiment cues),",
    "key themes, client commitments, and cross-session patterns.",
    "Return strict JSON only. No em dash characters.",
    "Do not invent facts. Use only the provided material.",
  ].join(" ");

  const previousContext = previousSessions.length
    ? previousSessions
        .slice(0, 3)
        .map(
          (s, i) =>
            `Session ${i + 1}: ${s.ai_summary || "No summary"}\nTopics: ${s.key_topics.join(", ") || "none"}\nCommitments: ${s.commitments.join(", ") || "none"}`
        )
        .join("\n\n")
    : "(first session)";

  const prompt = [
    "Analyze this coaching session and return JSON.",
    "",
    "JSON shape:",
    JSON.stringify({
      ai_summary: "2-3 sentence summary of what happened in this session",
      key_topics: ["topic discussed"],
      commitments: ["specific action the client committed to"],
      somatic_observations: ["body-based observation, e.g. 'tension in shoulders when discussing work'"],
      patterns_flagged: ["pattern noticed across sessions, e.g. 'avoidance of vulnerability when X comes up'"],
    }),
    "",
    "Rules:",
    "- ai_summary: 2-3 sentences, honest and direct.",
    "- key_topics: 2-5 items. Short phrases, not sentences.",
    "- commitments: 1-5 specific actions. If none stated, return empty array.",
    "- somatic_observations: 0-3 items. Only include if notes mention body, breath, tension, energy, posture, etc.",
    "- patterns_flagged: 0-3 items. Only flag if there are previous sessions showing a recurring theme.",
    "",
    "CLIENT: " + clientName,
    "",
    "PREVIOUS SESSIONS:",
    previousContext,
    "",
    "COACH VOICE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2).slice(0, 500),
    "",
    "SESSION NOTES:",
    rawNotes,
    ...(transcript ? ["\nTRANSCRIPT:", transcript.slice(0, 3000)] : []),
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
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return fallback;
    const result = await response.json();
    const text = String(result?.content?.[0]?.text ?? "").trim();
    const parsed = JSON.parse(stripCodeFence(text));
    return normalizeAnalysis(parsed, fallback);
  } catch {
    return fallback;
  }
}

// ── Pre-session brief generation ──────────────────────────────────────

export async function generatePreSessionBrief({
  clientName,
  recentSessions,
  openCommitments,
}: {
  clientName: string;
  recentSessions: Array<{ ai_summary: string | null; key_topics: string[]; commitments: string[]; session_date: string }>;
  openCommitments: string[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || recentSessions.length === 0) {
    return openCommitments.length
      ? `Open commitments: ${openCommitments.join("; ")}`
      : "First session with this client. No prior context.";
  }

  const system =
    "You write 2-3 bullet pre-session briefs for coaches. Be direct, useful, no fluff. No em dashes.";

  const sessionContext = recentSessions
    .slice(0, 3)
    .map(
      (s) =>
        `[${s.session_date}] ${s.ai_summary || "No summary"}\nTopics: ${s.key_topics.join(", ")}\nCommitments: ${s.commitments.join(", ")}`
    )
    .join("\n\n");

  const prompt = [
    `Write a pre-session brief for the next coaching session with ${clientName}.`,
    "Return 2-3 bullet points. Each bullet is one line, starting with a dash.",
    "Focus on: what to check in about, open commitments, emerging patterns.",
    "",
    "RECENT SESSIONS:",
    sessionContext,
    "",
    "OPEN COMMITMENTS:",
    openCommitments.length ? openCommitments.join("\n") : "(none)",
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
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return "Could not generate brief.";
    const result = await response.json();
    return String(result?.content?.[0]?.text ?? "").trim();
  } catch {
    return "Could not generate brief.";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function deterministicAnalysis(notes: string): SessionAnalysis {
  const sentences = notes
    .split(/[.\n]/)
    .map((l) => l.trim())
    .filter(Boolean);

  const topics = sentences
    .filter((s) => s.length > 10 && s.length < 80)
    .slice(0, 4);

  const commitments = sentences
    .filter((s) => /commit|homework|practice|will|going to|next step/i.test(s))
    .slice(0, 3);

  const somatic = sentences
    .filter((s) => /body|breath|tension|chest|stomach|posture|shaking|energy|somatic|grounding/i.test(s))
    .slice(0, 3);

  return {
    ai_summary: sentences.slice(0, 2).join(". ") + "." || "Session notes captured.",
    key_topics: topics.length ? topics : ["Session captured"],
    commitments,
    somatic_observations: somatic,
    patterns_flagged: [],
    extraction_source: "fallback",
  };
}

function normalizeAnalysis(value: unknown, fallback: SessionAnalysis): SessionAnalysis {
  const r = isRecord(value) ? value : {};
  return {
    ai_summary: stringValue(r.ai_summary, fallback.ai_summary, 500),
    key_topics: stringList(r.key_topics, fallback.key_topics),
    commitments: stringList(r.commitments, fallback.commitments),
    somatic_observations: stringList(r.somatic_observations, fallback.somatic_observations),
    patterns_flagged: stringList(r.patterns_flagged, fallback.patterns_flagged),
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
