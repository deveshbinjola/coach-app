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
import { decideGatePath } from "@/lib/onboarding-gate";
import type { BrandOsRunState } from "@/lib/brand-os/run-state";

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
 *  Brand OS no longer gates (Plan 2) — this only distinguishes the
 *  reality-questions step from a fully onboarded coach. */
export async function resolveOnboardingGate(
  supabase: SupabaseClient,
  coachId: string,
): Promise<OnboardingGate> {
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
  // Plan / trial state first. An expired 10-day free trial gets lazily
  // downgraded back to trial-tier on this page load.
  const { data: planRow } = await supabase
    .from("cp_coaches")
    .select("plan, trial_ends_at, onboarding_completed_at")
    .eq("id", coachId)
    .maybeSingle();

  const plan = (planRow?.plan as string | null) ?? null;
  const onboardingCompletedAt = (planRow?.onboarding_completed_at as string | null) ?? null;
  const trialExpired =
    plan === "standard" &&
    !!planRow?.trial_ends_at &&
    new Date(planRow.trial_ends_at as string).getTime() < Date.now();

  if (trialExpired) {
    // Fire-and-forget downgrade; we treat the coach as trial-tier for
    // this request either way.
    void supabase
      .from("cp_coaches")
      .update({ plan: "trial", updated_at: new Date().toISOString() })
      .eq("id", coachId);
  }

  const isTrialScoped = (plan === "trial" || trialExpired) && !onboardingCompletedAt;

  // Only the trial-scoped branch needs the Brand OS run state (to choose
  // the right Brand OS URL). Standard coaches skip that query.
  let brandOsRunState: BrandOsRunState = { kind: "none" };
  let realityQuestionsComplete = false;
  if (isTrialScoped) {
    const { resolveBrandOsRunState } = await import("@/lib/brand-os/run-state");
    brandOsRunState = await resolveBrandOsRunState(supabase, coachId);
  } else {
    const state = await loadOnboardingState(supabase, coachId);
    realityQuestionsComplete = !!state?.completed_at;
  }

  const path = decideGatePath({
    plan,
    trialExpired,
    onboardingCompletedAt,
    realityQuestionsComplete,
    brandOsRunState,
  });

  if (path === null) {
    void logFunnelEvent(coachId, "app_opened");
  }
  return path;
}
