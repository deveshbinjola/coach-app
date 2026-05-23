// Tests for lib/onboarding-gate.ts
//
// decideGatePath is the redirect decision for enforceOnboardingGate.
// The whole point of Plan 2: Brand OS must NOT gate standard coaches,
// but trial ($7) buyers stay scoped to Brand OS until onboarded. Pin
// both behaviors so a regression is loud.

import { describe, it, expect } from "vitest";
import { decideGatePath, type GateDecisionInput } from "@/lib/onboarding-gate";
import type { BrandOsRunState } from "@/lib/brand-os/run-state";

const NONE: BrandOsRunState = { kind: "none" };

function input(overrides: Partial<GateDecisionInput> = {}): GateDecisionInput {
  return {
    plan: "standard",
    trialExpired: false,
    onboardingCompletedAt: null,
    brandOsRunState: NONE,
    ...overrides,
  };
}

describe("decideGatePath — standard coach proceeds (no Brand OS, no reality-questions gate)", () => {
  it("returns null for a standard coach with no Brand OS run", () => {
    expect(decideGatePath(input({ brandOsRunState: NONE }))).toBeNull();
  });
});

describe("decideGatePath — trial ($7) scoping preserved", () => {
  it("trial + not onboarded + no run → /brand-os", () => {
    expect(
      decideGatePath(input({ plan: "trial", brandOsRunState: { kind: "none" } }))
    ).toBe("/brand-os");
  });

  it("trial + not onboarded + in_progress → /brand-os/run/{id}", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "in_progress", runId: "R1", variant: "mvp", currentQuestionId: null },
        })
      )
    ).toBe("/brand-os/run/R1");
  });

  it("trial + not onboarded + complete → /brand-os/run/{id}/output", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "complete", runId: "R2", variant: "mvp", synthesizedAt: null },
        })
      )
    ).toBe("/brand-os/run/R2/output");
  });

  it("trial + not onboarded + complete_no_synthesis → /brand-os/run/{id}/output", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "complete_no_synthesis", runId: "R3", variant: "mvp" },
        })
      )
    ).toBe("/brand-os/run/R3/output");
  });

  it("trial but ALREADY onboarded → treated as full coach (not scoped)", () => {
    const path = decideGatePath(
      input({ plan: "trial", onboardingCompletedAt: "2026-05-01T00:00:00Z" })
    );
    expect(path).toBeNull();
  });

  it("expired standard trial + not onboarded → scoped to Brand OS", () => {
    expect(
      decideGatePath(input({ plan: "standard", trialExpired: true, brandOsRunState: { kind: "none" } }))
    ).toBe("/brand-os");
  });

  it("expired standard trial but ALREADY onboarded → full access", () => {
    expect(
      decideGatePath(
        input({ plan: "standard", trialExpired: true, onboardingCompletedAt: "2026-05-01T00:00:00Z" })
      )
    ).toBeNull();
  });
});
