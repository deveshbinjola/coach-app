// GET /api/funnels/[id]/analytics — per-question analytics for a funnel.
//
// Returns:
//   - totalResponses: number of completed quiz responses
//   - perQuestion: array with { questionId, questionText, responseCount, choices }
//     where choices is { key, text, count, percent }
//   - resultDistribution: array with { key, pillarName, count, percent }
//
// Computes from cp_funnel_responses.answers (JSON array).
// Capped at 2000 most recent responses for performance.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

type AnswerEntry = { q_id: string; choice: string };

type QuestionConfig = {
  id: string;
  text: string;
  choices: Array<{ key: string; text: string }>;
};

type ResultConfig = {
  key: string;
  pillar_name: string;
};

type FunnelConfig = {
  questions: QuestionConfig[];
  results: ResultConfig[];
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch funnel config (for question text / choice text lookups)
  const { data: funnel, error: funnelErr } = await supabase
    .from("cp_funnels")
    .select("id, config")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .single();

  if (funnelErr || !funnel) {
    return NextResponse.json({ error: "Funnel not found." }, { status: 404 });
  }

  const config = funnel.config as FunnelConfig;

  // Fetch recent responses (cap at 2000 for edge performance)
  const { data: responses, error: respErr } = await supabase
    .from("cp_funnel_responses")
    .select("answers, result_key")
    .eq("funnel_id", params.id)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (respErr) {
    return NextResponse.json({ error: "Failed to load responses." }, { status: 500 });
  }

  const totalResponses = responses?.length ?? 0;

  // ── Per-question stats ────────────────────────────────────

  const perQuestion = config.questions.map((q, idx) => {
    const choiceCounts: Record<string, number> = {};
    // Initialize all choice keys to 0
    for (const ch of q.choices) {
      choiceCounts[ch.key] = 0;
    }

    let answeredCount = 0;

    for (const resp of responses ?? []) {
      const answers = resp.answers as AnswerEntry[] | null;
      if (!answers) continue;
      const answer = answers.find((a) => a.q_id === q.id);
      if (answer) {
        answeredCount++;
        choiceCounts[answer.choice] = (choiceCounts[answer.choice] || 0) + 1;
      }
    }

    return {
      questionIndex: idx + 1,
      questionId: q.id,
      questionText: q.text,
      responseCount: answeredCount,
      dropOff: idx === 0 ? 0 : Math.max(0, (perQuestionCounts(config, responses ?? [], idx - 1)) - answeredCount),
      choices: q.choices.map((ch) => ({
        key: ch.key,
        text: ch.text,
        count: choiceCounts[ch.key] || 0,
        percent: answeredCount > 0
          ? Math.round(((choiceCounts[ch.key] || 0) / answeredCount) * 100)
          : 0,
      })),
    };
  });

  // ── Result distribution ───────────────────────────────────

  const resultCounts: Record<string, number> = {};
  for (const r of config.results) {
    resultCounts[r.key] = 0;
  }
  for (const resp of responses ?? []) {
    if (resp.result_key) {
      resultCounts[resp.result_key] = (resultCounts[resp.result_key] || 0) + 1;
    }
  }

  const resultDistribution = config.results.map((r) => ({
    key: r.key,
    pillarName: r.pillar_name,
    count: resultCounts[r.key] || 0,
    percent: totalResponses > 0
      ? Math.round(((resultCounts[r.key] || 0) / totalResponses) * 100)
      : 0,
  }));

  return NextResponse.json({
    totalResponses,
    perQuestion,
    resultDistribution,
  });
}

// Helper: count how many responses answered question at given index
function perQuestionCounts(
  config: FunnelConfig,
  responses: Array<{ answers: unknown }>,
  idx: number
): number {
  const qId = config.questions[idx]?.id;
  if (!qId) return 0;
  let count = 0;
  for (const resp of responses) {
    const answers = resp.answers as AnswerEntry[] | null;
    if (answers?.some((a) => a.q_id === qId)) count++;
  }
  return count;
}
