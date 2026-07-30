// lib/onboarding-gate.ts
//
// Pure gate-decision logic for enforceOnboardingGate. No I/O — the async
// wrapper in lib/onboarding.ts loads the data and calls this.
//
// History of this gate:
//   Plan 2:  Brand OS stopped gating standard coaches.
//   Plan 5b: reality questions stopped gating; the welcome flow became
//            the single onboarding.
//   2026-07-29 (one-product decision): the trial ($7) Brand OS scoping is
//            retired too. Coach Assistant is the one product — Brand OS is
//            a capability inside it, not a walled garden. Every signed-in
//            coach takes the same path: /welcome if not activated (the
//            middleware handles that), /command-center otherwise. Plan
//            still means something for UPSELL surfaces (e.g. the Brand OS
//            output page shows trial buyers the upgrade view), but it no
//            longer decides where a coach is allowed to go.

export type GateDecisionInput = {
  plan: string | null;
  trialExpired: boolean;
  onboardingCompletedAt: string | null;
};

/** Returns the path to redirect to, or null if the coach may proceed.
 *  Since the one-product decision, every coach proceeds. The function is
 *  kept (rather than deleted) so the decision stays visible, pinned by
 *  tests, and easy to reverse deliberately rather than accidentally. */
export function decideGatePath(_input: GateDecisionInput): string | null {
  return null;
}
