// POST /api/brand-os/scout-test
//
// The Scout Calibration Test (Brand OS Module 2 Q3). Takes the coach's
// Signal Q1 writing samples, asks Anthropic to:
//   - Pull 3 short sentences verbatim from their samples
//   - Write 2 new sentences in their style (the "mimics")
// Shuffles the 5 sentences, returns them with metadata. Stores the answer
// (sentences + truth) in the signal.q3 answer row as JSON.
//
// V1: shuffles + reveals truth client-side. Coaches aren't going to cheat
// themselves, so we don't need to gate the truth behind a second round-trip.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";

export const runtime = "edge";

type GenBody = { runId: string };

type ScoutSentence = { id: string; text: string; isAi: boolean };

type ScoutAnswerPayload = {
  phase: "generated" | "revealed";
  sentences: ScoutSentence[];
  userPicks?: string[]; // ids of sentences the coach thinks are AI
  score?: number;       // 0 | 1 | 2
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "brand-os/scout-test", 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await request.json()) as GenBody;
  if (!body?.runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  // Confirm the run belongs to this coach + grab audience.
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, audience")
    .eq("id", body.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  // Pull the coach's signal.q1 answer (their pasted writing samples).
  const { data: q1Answer } = await supabase
    .from("cp_brand_os_answers")
    .select("raw_text")
    .eq("run_id", body.runId)
    .eq("question_id", "signal.q1")
    .maybeSingle();

  const samples = (q1Answer?.raw_text as string | null)?.trim() ?? "";
  if (samples.length < 100) {
    return NextResponse.json({
      error: "Not enough writing samples in Signal Q1 to run the Scout Test (need ≥100 chars).",
    }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "Anthropic API not configured.",
    }, { status: 500 });
  }

  const audience = run.audience as "M" | "W" | "X";
  const sysPrompt = buildScoutSystemPrompt(audience);
  const userPrompt = `Here are the coach's writing samples:\n\n${samples.slice(0, 8000)}\n\nReturn STRICT JSON only.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: sysPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json({ error: "anthropic_error", detail: detail.slice(0, 500) }, { status: 502 });
  }

  const aiData = await aiRes.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = aiData.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "could_not_parse_ai_response", raw: raw.slice(0, 500) }, { status: 502 });
  }

  type Parsed = { verbatim: string[]; mimics: string[] };
  let parsed: Parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Parsed;
  } catch {
    return NextResponse.json({ error: "invalid_ai_json", raw: raw.slice(0, 500) }, { status: 502 });
  }

  const verbatim = (parsed.verbatim ?? []).slice(0, 3).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  const mimics   = (parsed.mimics ?? []).slice(0, 2).filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  if (verbatim.length < 3 || mimics.length < 2) {
    return NextResponse.json({
      error: "ai_returned_incomplete_set",
      detail: `verbatim=${verbatim.length}, mimics=${mimics.length}`,
    }, { status: 502 });
  }

  const sentences: ScoutSentence[] = [
    ...verbatim.map((text, i) => ({ id: `v${i}`, text: text.trim(), isAi: false })),
    ...mimics.map((text, i) => ({ id: `m${i}`, text: text.trim(), isAi: true })),
  ];
  shuffle(sentences);

  const payload: ScoutAnswerPayload = { phase: "generated", sentences };

  await supabase
    .from("cp_brand_os_answers")
    .upsert({
      run_id: body.runId,
      module: "signal",
      question_id: "signal.q3",
      raw_text: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    }, { onConflict: "run_id,question_id" });

  return NextResponse.json(payload);
}

// PATCH /api/brand-os/scout-test  →  reveal + score
//
// Coach has picked 2 sentences they think are AI. Compute the score
// (count how many of their picks were actually isAi=true), update the
// answer row's phase to "revealed", and write the score to the run row.

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  type PatchBody = { runId: string; picks: string[] };
  const body = (await request.json()) as PatchBody;
  if (!body?.runId || !Array.isArray(body?.picks) || body.picks.length !== 2) {
    return NextResponse.json({ error: "runId + exactly 2 picks required" }, { status: 400 });
  }

  // Verify ownership.
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id")
    .eq("id", body.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("cp_brand_os_answers")
    .select("raw_text")
    .eq("run_id", body.runId)
    .eq("question_id", "signal.q3")
    .maybeSingle();
  const rawText = (existing?.raw_text as string | null) ?? "";
  if (!rawText) return NextResponse.json({ error: "scout_test_not_generated_yet" }, { status: 400 });

  let payload: ScoutAnswerPayload;
  try {
    payload = JSON.parse(rawText) as ScoutAnswerPayload;
  } catch {
    return NextResponse.json({ error: "answer_row_corrupt" }, { status: 500 });
  }

  const aiIds = new Set(payload.sentences.filter((s) => s.isAi).map((s) => s.id));
  const correctCount = body.picks.filter((id) => aiIds.has(id)).length;
  const score = Math.min(2, Math.max(0, correctCount)); // 0 | 1 | 2

  const revealed: ScoutAnswerPayload = {
    ...payload,
    phase: "revealed",
    userPicks: body.picks,
    score,
  };

  await Promise.all([
    supabase
      .from("cp_brand_os_answers")
      .update({
        raw_text: JSON.stringify(revealed),
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", body.runId)
      .eq("question_id", "signal.q3"),
    supabase
      .from("cp_brand_os_runs")
      .update({ scout_test_score: score })
      .eq("id", body.runId),
  ]);

  return NextResponse.json(revealed);
}

// ────────────────────────────────────────────────────────────────────

function buildScoutSystemPrompt(audience: "M" | "W" | "X"): string {
  const register =
    audience === "M" ? "masculine-coded, direct, edge-aware, purpose-driven"
    : audience === "W" ? "feminine-coded, somatic, nervous-system aware, embodied"
    : "balanced, soft-direct";

  return `You are the Brand OS Scout Calibration Test generator.

Voice register the coach is operating in: ${register}.

Given the coach's writing samples below, produce a 5-sentence calibration test.

TASK:
1. Pick exactly 3 SHORT sentences VERBATIM from the samples. Choose sentences that:
   - Are between 6 and 24 words.
   - Don't start with a personal name (avoid name leak).
   - Stand alone (no mid-paragraph fragments).
2. Write exactly 2 NEW sentences in the coach's apparent style. They must:
   - Match the coach's sentence rhythm + vocabulary observed in the samples.
   - Be plausible but not identical to anything in the samples.
   - Be between 8 and 22 words.
   - Stay within the ${register} register.

Return STRICT JSON only — no prose around it:

{
  "verbatim": ["sentence 1 from samples", "sentence 2 from samples", "sentence 3 from samples"],
  "mimics":   ["new sentence A in their style", "new sentence B in their style"]
}

If you cannot find 3 viable verbatim sentences, return the best 3 you can (still keep verbatim quality over count parity).
Do not number them. Do not include any commentary. Just the JSON.`;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
