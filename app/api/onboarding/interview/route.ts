// POST /api/onboarding/interview
//
// Persists the assistant-interview answers (from /meet + the /welcome
// interview step) as the personalization loop:
//   1. Confirmed cp_coach_memory rows (source "explicit") — Dhara's system
//      prompt includes confirmed memories, so the assistant knows the coach
//      from its first message.
//   2. emphasize_* flags on cp_coaches — nav/dashboard prioritization
//      (same never-hide semantics as lib/onboarding.ts).
//
// Idempotent: re-submitting promotes/refreshes existing rows instead of
// duplicating (dedup by normalized text, same rule as the memory ladder).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { normalizeMemoryText } from "@/lib/dhara/memory";
import {
  interviewToMemories,
  interviewToEmphasis,
  optionValues,
  EMPTY_ANSWERS,
  TIME_DRAIN_OPTIONS,
  HAND_OFF_OPTIONS,
  DESIRE_OPTIONS,
  NICHE_OPTIONS,
  STAGE_OPTIONS,
  TONE_OPTIONS,
  type InterviewAnswers,
} from "@/lib/assistant-interview";

export const runtime = "edge";

const TIME_DRAINS: string[] = optionValues(TIME_DRAIN_OPTIONS);
const HAND_OFFS: string[] = optionValues(HAND_OFF_OPTIONS);
const DESIRES: string[] = optionValues(DESIRE_OPTIONS);
const NICHES: string[] = optionValues(NICHE_OPTIONS);
const STAGES: string[] = optionValues(STAGE_OPTIONS);
const TONES: string[] = optionValues(TONE_OPTIONS);

function pick<T extends string>(v: unknown, allowed: string[]): T | null {
  return typeof v === "string" && allowed.includes(v) ? (v as T) : null;
}

function sanitize(body: Record<string, unknown>): InterviewAnswers {
  const desires = Array.isArray(body.desires)
    ? (body.desires.filter((d) => typeof d === "string" && DESIRES.includes(d)) as InterviewAnswers["desires"])
    : [];
  return {
    ...EMPTY_ANSWERS,
    timeDrain: pick(body.timeDrain, TIME_DRAINS),
    handOffFirst: pick(body.handOffFirst, HAND_OFFS),
    desires,
    niche: pick(body.niche, NICHES),
    stage: pick(body.stage, STAGES),
    tone: pick(body.tone, TONES),
  };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "onboarding/interview", 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const answers = sanitize(body);

  const memories = interviewToMemories(answers);
  if (memories.length === 0) {
    return NextResponse.json({ error: "No answers provided" }, { status: 400 });
  }

  // 1. Memories — dedup by normalized text against active rows, promote to
  //    confirmed on re-submit rather than duplicating.
  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from("cp_coach_memory")
    .select("id, text")
    .eq("coach_id", user.id)
    .eq("status", "active");
  const existingByText = new Map(
    (existingRows ?? []).map((r) => [normalizeMemoryText(r.text as string), r.id as string]),
  );

  const nowIso = new Date().toISOString();
  let saved = 0;
  for (const m of memories) {
    const existingId = existingByText.get(normalizeMemoryText(m.text));
    if (existingId) {
      await admin.from("cp_coach_memory")
        .update({ confidence: "confirmed", last_seen_at: nowIso, updated_at: nowIso })
        .eq("id", existingId).eq("coach_id", user.id);
    } else {
      await admin.from("cp_coach_memory").insert({
        coach_id: user.id,
        kind: m.kind,
        text: m.text,
        source: "explicit",
        confidence: "confirmed",
      });
    }
    saved++;
  }

  // 2. Nav emphasis — user client so RLS owns the write.
  const emphasis = interviewToEmphasis(answers);
  const { error: coachErr } = await supabase
    .from("cp_coaches")
    .update(emphasis)
    .eq("id", user.id);

  return NextResponse.json({
    ok: true,
    saved,
    emphasis,
    coachUpdateFailed: Boolean(coachErr),
  });
}
