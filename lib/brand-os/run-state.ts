// Brand OS run state — single source of truth for "where is the coach?"
//
// Used by the Voice page CTA, the Content workspace pillar strip, and any
// other surface that needs to show different copy based on Brand OS state.
//
// Resolved server-side from cp_brand_os_runs + cp_coaches.brand_voice_overlay.
//
// v5 (2026-06-06): variant widened to include 'snapshot' | 'full_round'. A v5
// run is "complete" only when the Full Round has finished AND the 24-hour
// hold has expired (unlocked_at is set). A v5 snapshot-only run with no
// purchase is treated as in_progress: the coach can still claim the reveal
// but the onboarding gate stays closed until they finish the Full Round.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RunVariant = "mvp" | "full" | "snapshot" | "full_round";

export type BrandOsRunState =
  | { kind: "none" }
  | {
      kind: "in_progress";
      runId: string;
      variant: RunVariant;
      variant_v: "legacy" | "v5";
      tier: "snapshot" | "full_round" | null;
      currentQuestionId: string | null;
    }
  | {
      kind: "snapshot_complete_unpaid";    // v5 only: coach finished the free Snapshot, has not paid for Full Round
      runId: string;
      variant: RunVariant;
      variant_v: "v5";
    }
  | {
      kind: "full_round_in_hold";          // v5 only: Full Round answered, 24h hold not yet expired
      runId: string;
      variant: RunVariant;
      variant_v: "v5";
      holdUntil: string;
    }
  | {
      kind: "complete_no_synthesis";
      runId: string;
      variant: RunVariant;
      variant_v: "legacy" | "v5";
    }
  | {
      kind: "complete";
      runId: string;
      variant: RunVariant;
      variant_v: "legacy" | "v5";
      synthesizedAt: string | null;
    };

type RunRow = {
  id: string;
  state: string | null;
  variant: string | null;
  variant_v: string | null;
  tier: string | null;
  current_question_id: string | null;
  synthesis_json: unknown;
  synthesized_at: string | null;
  hold_until: string | null;
  unlocked_at: string | null;
  started_at: string;
};

function classifyVariant(v: string | null): RunVariant {
  if (v === "snapshot" || v === "full_round" || v === "mvp" || v === "full") return v;
  return "mvp";
}

function classifyVariantV(v: string | null): "legacy" | "v5" {
  return v === "v5" ? "v5" : "legacy";
}

export async function resolveBrandOsRunState(
  supabase: SupabaseClient,
  coachId: string
): Promise<BrandOsRunState> {
  const { data } = await supabase
    .from("cp_brand_os_runs")
    .select("id, state, variant, variant_v, tier, current_question_id, synthesis_json, synthesized_at, hold_until, unlocked_at, started_at")
    .eq("coach_id", coachId)
    .order("started_at", { ascending: false })
    .limit(5);

  const rows = (data ?? []) as RunRow[];
  if (rows.length === 0) return { kind: "none" };

  // v5 runs: prefer the most recent. The "completion" definition is different.
  const v5Rows = rows.filter((r) => r.variant_v === "v5");
  if (v5Rows.length > 0) {
    const r = v5Rows[0];
    const variant = classifyVariant(r.variant);
    const now = Date.now();

    // Full Round done + 24h hold expired + unlocked = fully complete.
    const holdExpired = r.hold_until ? new Date(r.hold_until).getTime() < now : false;
    const fullRoundDone =
      r.tier === "full_round" &&
      (r.state === "complete" || r.synthesis_json || r.hold_until);

    if (fullRoundDone && (r.unlocked_at || holdExpired)) {
      return {
        kind: "complete",
        runId: r.id,
        variant,
        variant_v: "v5",
        synthesizedAt: r.synthesized_at,
      };
    }

    // Full Round answered, still in 24h hold.
    if (fullRoundDone && r.hold_until && !holdExpired && !r.unlocked_at) {
      return {
        kind: "full_round_in_hold",
        runId: r.id,
        variant,
        variant_v: "v5",
        holdUntil: r.hold_until,
      };
    }

    // Snapshot done, no Full Round purchase yet (the run sat after reveal).
    if (r.tier === "snapshot" && (r.state === "complete" || r.synthesis_json)) {
      return {
        kind: "snapshot_complete_unpaid",
        runId: r.id,
        variant,
        variant_v: "v5",
      };
    }

    // Default: in progress on either tier.
    return {
      kind: "in_progress",
      runId: r.id,
      variant,
      variant_v: "v5",
      tier: (r.tier as "snapshot" | "full_round" | null) ?? null,
      currentQuestionId: r.current_question_id,
    };
  }

  // Legacy resolution path · unchanged behaviour for in-flight legacy runs.
  const completeWithSynth = rows.find((r) => r.state === "complete" && r.synthesis_json);
  const completeNoSynth   = rows.find((r) => r.state === "complete");
  const inProgress        = rows.find((r) => r.state === "active" || r.state === null || r.state === "draft");

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
      variant: classifyVariant(completeWithSynth.variant),
      variant_v: classifyVariantV(completeWithSynth.variant_v),
      synthesizedAt: completeWithSynth.synthesized_at,
    };
  }

  if (completeNoSynth) {
    return {
      kind: "complete_no_synthesis",
      runId: completeNoSynth.id,
      variant: classifyVariant(completeNoSynth.variant),
      variant_v: classifyVariantV(completeNoSynth.variant_v),
    };
  }

  if (inProgress) {
    return {
      kind: "in_progress",
      runId: inProgress.id,
      variant: classifyVariant(inProgress.variant),
      variant_v: classifyVariantV(inProgress.variant_v),
      tier: (inProgress.tier as "snapshot" | "full_round" | null) ?? null,
      currentQuestionId: inProgress.current_question_id,
    };
  }

  return { kind: "none" };
}
