import { describe, it, expect } from "vitest";
import { buildDharaSystemPrompt, type DharaContext } from "@/lib/dhara/persona";

const ctx: DharaContext = {
  coachFirstName: "Sunny",
  identityText: "Avatar: men's coaches. Voice: direct, somatic. Pillars: nervous system, purpose, integration.",
  snapshotText: "Revenue this month: $14,000 (up). 2 clients quiet. 11 drafts ready.",
  memories: [
    { text: "Prefers short DMs", confidence: "confirmed" },
    { text: "Might be launching a fall cohort", confidence: "candidate" },
  ],
};

describe("buildDharaSystemPrompt", () => {
  it("includes the grounded-guide voice and the core guardrails", () => {
    const p = buildDharaSystemPrompt(ctx).toLowerCase();
    expect(p).toContain("grounded");
    expect(p).toContain("amplify");
    expect(p).toContain("never invent");
  });
  it("contains no em dashes (house rule)", () => {
    expect(buildDharaSystemPrompt(ctx)).not.toContain("—");
  });
  it("states confirmed memories as fact and flags candidates as unconfirmed", () => {
    const p = buildDharaSystemPrompt(ctx);
    expect(p).toContain("Prefers short DMs");
    expect(p.toLowerCase()).toContain("unconfirmed");
    expect(p).toContain("fall cohort");
  });
  it("keeps 'repeated' memories soft, not in the confirmed-fact block", () => {
    const p = buildDharaSystemPrompt({
      coachFirstName: "Sunny", identityText: "x", snapshotText: "y",
      memories: [{ text: "Runs a Tuesday men's circle", confidence: "repeated" }],
    });
    // The confirmed/fact section should NOT list it as a hard fact;
    // it should appear in the soft/unconfirmed section instead.
    const [factSection, softSection] = p.split("WHAT YOU SUSPECT");
    expect(factSection).not.toContain("Runs a Tuesday men's circle");
    expect(softSection).toContain("Runs a Tuesday men's circle");
  });
});
