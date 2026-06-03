import { describe, it, expect } from "vitest";
import { buildStarterPrompts, tailoredGreeting, type DharaStats } from "@/lib/dhara/prompts";

const base = (over: Partial<DharaStats> = {}): DharaStats => ({
  revenueCents: 0, leads: 0, clients: 0, quizzes: 0, draftsReady: 0, topPainPoint: null, slipping: [], ...over,
});

describe("buildStarterPrompts", () => {
  it("returns at most 3", () => {
    const s = base({ revenueCents: 1400000, leads: 26, clients: 8, quizzes: 5, draftsReady: 11, topPainPoint: { name: "Burnout", count: 12 } });
    expect(buildStarterPrompts(s)).toHaveLength(3);
  });

  it("leads with money, then pain points when both present", () => {
    const s = base({ revenueCents: 1400000, leads: 26, topPainPoint: { name: "Burnout", count: 12 } });
    const p = buildStarterPrompts(s);
    expect(p[0].message).toBe("how much revenue did I make this month");
    expect(p[1].message).toBe("which pain points do most leads have");
  });

  it("skips the pain-point prompt when nothing is tagged", () => {
    const s = base({ leads: 5 });
    expect(buildStarterPrompts(s).some((x) => x.message.includes("pain"))).toBe(false);
  });

  it("bakes the draft count into the label", () => {
    const s = base({ draftsReady: 11, leads: 3 });
    expect(buildStarterPrompts(s).some((x) => x.label.includes("11"))).toBe(true);
  });

  it("gives a brand-new coach (no data) sensible fallbacks", () => {
    const p = buildStarterPrompts(base());
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.some((x) => x.message.includes("dashboard"))).toBe(true);
  });
});

describe("tailoredGreeting", () => {
  it("leads with revenue when present", () => {
    expect(tailoredGreeting(base({ revenueCents: 1400000 }))).toContain("$14,000");
  });
  it("falls back to a calm prompt with no data", () => {
    expect(tailoredGreeting(base())).toContain("What's on your mind");
  });
});
