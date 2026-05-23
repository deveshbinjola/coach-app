// Onboarding state — shared read/write helpers.
//
// Drives the post-signup gate sequence:
//   1. Brand OS MVP run (resolved via lib/brand-os/run-state.ts)
//   2. /onboarding reality questions (this module)
//   3. Land on platform with surfaces emphasized per their answers
//
// The "emphasize_*" booleans control nav prominence — never visibility.
// Coaches who answer "no" to a question see that surface de-emphasized
// (smaller card on home, tucked later in nav) but never hidden. They can
// always opt in later from /settings.

import type { SupabaseClient } from "@supabase/supabase-js";
import { logFunnelEvent } from "@/lib/funnel-log";

export type OnboardingAnswers = {
  has_past_content: boolean | null;
  has_leads_to_import: boolean | null;
  has_active_clients: boolean | null;
  creates_content_actively: boolean | null;
};

export type OnboardingState = OnboardingAnswers & {
  completed_at: string | null;
  emphasize_content: boolean;
  emphasize_leads: boolean;
  emphasize_clients: boolean;
};

export type OnboardingGate =
  | { phase: "brand_os_mvp"; reason: "never_started" | "in_progress" | "no_synthesis"; runId?: string }
  | { phase: "reality_questions" }
  | { phase: "complete"; state: OnboardingState };

const COACH_COLUMNS = `
  onboarding_completed_at,
  has_past_content,
  has_leads_to_import,
  has_active_clients,
  creates_content_actively,
  emphasize_content,
  emphasize_leads,
  emphasize_clients
`;

export async function loadOnboardingState(
  supabase: SupabaseClient,
  coachId: string,
): Promise<OnboardingState | null> {
  const { data } = await supabase
    .from("cp_coaches")
    .select(COACH_COLUMNS)
    .eq("id", coachId)
    .maybeSingle();
  if (!data) return null;
  return {
    completed_at:             (data.onboarding_completed_at as string | null) ?? null,
    has_past_content:         (data.has_past_content as boolean | null) ?? null,
    has_leads_to_import:      (data.has_leads_to_import as boolean | null) ?? null,
    has_active_clients:       (data.has_active_clients as boolean | null) ?? null,
    creates_content_actively: (data.creates_content_actively as boolean | null) ?? null,
    emphasize_content:        (data.emphasize_content as boolean | null) ?? true,
    emphasize_leads:          (data.emphasize_leads as boolean | null) ?? true,
    emphasize_clients:        (data.emphasize_clients as boolean | null) ?? true,
  };
}

/** Save the four answers + derive emphasis flags. A "no" on any surface
 *  flips that surface to de-emphasized; coaches who said "I'm starting
 *  from scratch" get Content emphasized because that's where they need
 *  to begin. */
export async function saveOnboardingAnswers(
  supabase: SupabaseClient,
  coachId: string,
  answers: OnboardingAnswers,
): Promise<OnboardingState> {
  const allNo =
    answers.has_past_content === false &&
    answers.has_leads_to_import === false &&
    answers.has_active_clients === false &&
    answers.creates_content_actively === false;

  // Default emphasis: surface gets primary billing if the coach said yes
  // to its primary signal. All-no coaches are early-stage → Content stays
  // emphasized as their starting point.
  const emphasize_content =
    answers.creates_content_actively === true || answers.has_past_content === true || allNo;
  const emphasize_leads   = answers.has_leads_to_import === true || allNo === false ? answers.has_leads_to_import !== false : false;
  const emphasize_clients = answers.has_active_clients === true;

  const now = new Date().toISOString();
  await supabase
    .from("cp_coaches")
    .update({
      has_past_content:         answers.has_past_content,
      has_leads_to_import:      answers.has_leads_to_import,
      has_active_clients:       answers.has_active_clients,
      creates_content_actively: answers.creates_content_actively,
      // Always emphasize at least Content if they're all-no early-stage
      // OR if they're a content-active coach. Leads/Clients defer to their
      // explicit yes.
      emphasize_content,
      emphasize_leads: emphasize_leads !== undefined ? emphasize_leads : true,
      emphasize_clients,
      onboarding_completed_at: now,
      updated_at: now,
    })
    .eq("id", coachId);

  // Re-load to return canonical state.
  const next = await loadOnboardingState(supabase, coachId);
  if (!next) throw new Error("Failed to reload onboarding state after save.");
  void logFunnelEvent(coachId, "reality_questions_completed");
  return next;
}

/** Single-source resolver for "where should this coach be right now?"
 *  Combines Brand OS run state with onboarding state. Called from layout
 *  guards on every authed surface. */
export async function resolveOnboardingGate(
  supabase: SupabaseClient,
  coachId: string,
): Promise<OnboardingGate> {
  // Defer Brand OS run state import to avoid circulars in tests.
  const { resolveBrandOsRunState } = await import("@/lib/brand-os/run-state");
  const runState = await resolveBrandOsRunState(supabase, coachId);

  if (runState.kind === "none") {
    return { phase: "brand_os_mvp", reason: "never_started" };
  }
  if (runState.kind === "in_progress") {
    return { phase: "brand_os_mvp", reason: "in_progress", runId: runState.runId };
  }
  if (runState.kind === "complete_no_synthesis") {
    return { phase: "brand_os_mvp", reason: "no_synthesis", runId: runState.runId };
  }

  // Brand OS done. Now check reality-questions onboarding.
  const state = await loadOnboardingState(supabase, coachId);
  if (!state || !state.completed_at) {
    return { phase: "reality_questions" };
  }

  return { phase: "complete", state };
}

/** Server helper: returns a path to redirect to if the coach is not where
 *  they should be, otherwise null. Pages call this at the top of their
 *  loader and `redirect()` if a path comes back.
 *
 *  Also enforces the trial-tier scope: $7 trip-wire buyers (plan='trial')
 *  can only access Brand OS routes. Any non-Brand-OS surface (Content,
 *  Leads, Clients, Command Center) bounces them to a soft upgrade page.
 *
 *  Usage:
 *    const redirectTo = await enforceOnboardingGate(supabase, user.id);
 *    if (redirectTo) redirect(redirectTo);
 */
export async function enforceOnboardingGate(
  supabase: SupabaseClient,
  coachId: string,
): Promise<string | null> {
  // Plan check first — trial buyers are scoped to Brand OS only, and
  // any 10-day free trial that has expired gets downgraded back to
  // brand-os-only on this page load (lazy expiration).
  const { data: planRow } = await supabase
    .from("cp_coaches")
    .select("plan, trial_ends_at, onboarding_completed_at")
    .eq("id", coachId)
    .maybeSingle();
  const trialExpired =
    planRow?.plan === "standard" &&
    planRow.trial_ends_at &&
    new Date(planRow.trial_ends_at as string).getTime() < Date.now();
  if (trialExpired) {
    // Fire-and-forget downgrade; we treat the coach as trial-tier for
    // this request either way.
    void supabase
      .from("cp_coaches")
      .update({ plan: "trial", updated_at: new Date().toISOString() })
      .eq("id", coachId);
  }
  if ((planRow?.plan === "trial" || trialExpired) && !planRow?.onboarding_completed_at) {
    // Trial-only gate: $7 trip-wire buyers who haven't completed full
    // onboarding are scoped to Brand OS surfaces only. Coaches who
    // finished onboarding (e.g. founder, upgraded users) get full access.
    const { resolveBrandOsRunState } = await import("@/lib/brand-os/run-state");
    const rs = await resolveBrandOsRunState(supabase, coachId);
    if (rs.kind === "complete")              return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "complete_no_synthesis") return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "in_progress")           return `/brand-os/run/${rs.runId}`;
    return "/brand-os";
  }

  const gate = await resolveOnboardingGate(supabase, coachId);
  if (gate.phase === "complete") {
    void logFunnelEvent(coachId, "app_opened");
    return null;
  }
  if (gate.phase === "reality_questions") return "/onboarding";
  // brand_os_mvp phase
  if (gate.reason === "never_started") return "/brand-os";
  if (gate.runId && gate.reason === "no_synthesis") return `/brand-os/run/${gate.runId}/output`;
  if (gate.runId) return `/brand-os/run/${gate.runId}`;
  return "/brand-os";
}
