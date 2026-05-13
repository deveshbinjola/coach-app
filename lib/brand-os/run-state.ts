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
  const completeNoSynth   = rows.find((r) => r.state === "complete");
  const inProgress        = rows.find((r) => r.state === "active" || r.state === null || r.state === "draft");

  // Lazy cleanup: if the coach has ANY completed run, stale in-progress
  // drafts should disappear from CTAs. Mark them abandoned in the DB so
  // they stop showing up everywhere — not just hidden from this resolver.
  // Done in a fire-and-forget update; the response uses the completed run
  // either way.
  if ((completeWithSynth || completeNoSynth) && inProgress) {
    void supabase
      .from("cp_brand_os_runs")
      .update({ state: "abandoned" })
      .eq("coach_id", coachId)
      .in("state", ["active", "draft"])
      .not("id", "eq", (completeWithSynth ?? completeNoSynth!).id);
  }

  if (completeWithSynth) {
    return {
      kind: "complete",
      runId: completeWithSynth.id,
      variant: (completeWithSynth.variant as "mvp" | "full" | null) ?? "mvp",
      synthesizedAt: completeWithSynth.synthesized_at,
    };
  }

  if (completeNoSynth) {
    return {
      kind: "complete_no_synthesis",
      runId: completeNoSynth.id,
      variant: (completeNoSynth.variant as "mvp" | "full" | null) ?? "mvp",
    };
  }

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
