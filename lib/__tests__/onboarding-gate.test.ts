// Tests for lib/onboarding-gate.ts
//
// One-product decision (2026-07-29): Coach Assistant is the one product,
// so the gate never redirects anyone. Trial ($7) buyers, expired trials,
// and standard coaches all take the same path (welcome flow via the
// middleware activation gate, or command center). Pin it so a regression
// back to Brand OS jail is loud.

import { describe, it, expect } from "vitest";
import { decideGatePath, type GateDecisionInput } from "@/lib/onboarding-gate";

function input(overrides: Partial<GateDecisionInput> = {}): GateDecisionInput {
  return {
    plan: "standard",
    trialExpired: false,
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe("decideGatePath — nobody is gated (one product, one front door)", () => {
  it("standard coach proceeds", () => {
    expect(decideGatePath(input())).toBeNull();
  });

  it("trial ($7) buyer, not onboarded, proceeds (no more Brand OS scoping)", () => {
    expect(decideGatePath(input({ plan: "trial" }))).toBeNull();
  });

  it("expired standard trial, not onboarded, proceeds", () => {
    expect(decideGatePath(input({ plan: "standard", trialExpired: true }))).toBeNull();
  });

  it("trial buyer already onboarded proceeds", () => {
    expect(
      decideGatePath(input({ plan: "trial", onboardingCompletedAt: "2026-05-01T00:00:00Z" })),
    ).toBeNull();
  });

  it("founding / null plans proceed", () => {
    expect(decideGatePath(input({ plan: "founding" }))).toBeNull();
    expect(decideGatePath(input({ plan: null }))).toBeNull();
  });
});
