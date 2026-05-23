// lib/onboarding-gate.ts
//
// Pure gate-decision logic for enforceOnboardingGate. No I/O — the async
// wrapper in lib/onboarding.ts loads the data and calls this.
//
// Plan 2: Brand OS is no longer a gate for standard coaches.
// Plan 5b: the reality-questions step is no longer a gate either — the
// welcome flow (voice + magic) is the single onboarding. Standard coaches
// proceed straight through. Trial ($7) buyers remain scoped to Brand OS
// surfaces until they complete onboarding (or upgrade).

import type { BrandOsRunState } from "@/lib/brand-os/run-state";

export type GateDecisionInput = {
  plan: string | null;
  trialExpired: boolean;
  onboardingCompletedAt: string | null;
  /** Only consulted for trial-scoped coaches (to pick the Brand OS URL). */
  brandOsRunState: BrandOsRunState;
};

/** Returns the path to redirect to, or null if the coach may proceed. */
export function decideGatePath(input: GateDecisionInput): string | null {
  const isTrialScoped =
    (input.plan === "trial" || input.trialExpired) && !input.onboardingCompletedAt;

  if (isTrialScoped) {
    const rs = input.brandOsRunState;
    if (rs.kind === "complete")              return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "complete_no_synthesis") return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "in_progress")           return `/brand-os/run/${rs.runId}`;
    return "/brand-os";
  }

  // Standard / full coach. Neither Brand OS nor reality questions gate.
  return null;
}
