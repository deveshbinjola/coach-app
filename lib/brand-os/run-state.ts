// Brand OS run state — single source of truth for "where is the coach?"
//
// Used by the Voice page CTA, the Content workspace pillar strip, and any
// other surface that needs to show different copy based on Brand OS state.
//
// Resolved server-side from cp_brand_os_runs + cp_coaches.brand_voice_overlay.

import type { SupabaseClient } from "@supabase/supabase-js";

export type BrandOsRunState =
  | { kind: "none" }                                              // never started a run
  | { kind: "in_progress"; runId: string; variant: "mvp" | "full"; currentQuestionId: string | null }
  | { kind: "complete_no_synthesis"; runId: string; variant: "mvp" | "full" }
  | { kind: "complete";              runId: string; variant: "mvp" | "full"; synthesizedAt: string | null };

export async function resolveBrandOsRunState(
  supabase: SupabaseClient,
  coachId: string
): Promise<BrandOsRunState> {
  const { data } = await supabase
    .from("cp_brand_os_runs")
    .select("id, state, variant, current_question_id, synthesis_json, synthesized_at, started_at")
    .eq("coach_id", coachId)
    .order("started_at", { ascending: false })
    .limit(5);

  const rows = (data ?? []) as Array<{
    id: string;
    state: string | null;
    variant: string | null;
    current_question_id: string | null;
    synthesis_json: unknown;
    synthesized_at: string | null;
    started_at: string;
  }>;
  if (rows.length === 0) return { kind: "none" };

  // Prefer the most recent completed run with synthesis (the canonical
  // "Brand OS done" state). Then completed without synthesis. Then any
  // in-progress run. Then none.
  const completeWithSynth = rows.find((r) => r.state === "complete" && r.synthesis_json);
  if (completeWithSynth) {
    return {
      kind: "complete",
      runId: completeWithSynth.id,
      variant: (completeWithSynth.variant as "mvp" | "full" | null) ?? "mvp",
      synthesizedAt: completeWithSynth.synthesized_at,
    };
  }

  const completeNoSynth = rows.find((r) => r.state === "complete");
  if (completeNoSynth) {
    return {
      kind: "complete_no_synthesis",
      runId: completeNoSynth.id,
      variant: (completeNoSynth.variant as "mvp" | "full" | null) ?? "mvp",
    };
  }

  const inProgress = rows.find((r) => r.state === "active" || r.state === null || r.state === "draft");
  if (inProgress) {
    return {
      kind: "in_progress",
      runId: inProgress.id,
      variant: (inProgress.variant as "mvp" | "full" | null) ?? "mvp",
      currentQuestionId: inProgress.current_question_id,
    };
  }

  return { kind: "none" };
}
