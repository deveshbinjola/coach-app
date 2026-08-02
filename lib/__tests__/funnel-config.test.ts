import { describe, it, expect } from "vitest";
import { validateFunnelConfigShape, type FunnelConfig } from "@/lib/funnel-config";

function validConfig(): FunnelConfig {
  const choices = (q: string): import("@/lib/funnel-config").FunnelChoice[] => [
    { key: "a", text: `${q}-a`, scores: { pillar_1: 2 } as Record<string, number> },
    { key: "b", text: `${q}-b`, scores: { pillar_2: 2 } as Record<string, number> },
    { key: "c", text: `${q}-c`, scores: { pillar_3: 2 } as Record<string, number> },
  ];
  return {
    intro: { headline: "Quiz", subhead: "Find out", cta_label: "Start" },
    questions: [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, text: `Q${n}`, choices: choices(`q${n}`) })),
    results: [
      { key: "pillar_1", pillar_name: "One", headline: "H1", body: "B1", cta_text: "Go", cta_url: "https://x.com" },
      { key: "pillar_2", pillar_name: "Two", headline: "H2", body: "B2", cta_text: "Go", cta_url: "" },
      { key: "pillar_3", pillar_name: "Three", headline: "H3", body: "B3", cta_text: "Go", cta_url: "https://y.com" },
    ],
    branding: { primary_hex: "#0B6E23", accent_hex: "#085119", background_hex: "#FAFAF8", font_family: "Plus Jakarta Sans" },
  };
}

describe("validateFunnelConfigShape", () => {
  it("accepts a well-formed config (empty cta_url allowed)", () => {
    expect(validateFunnelConfigShape(validConfig()).valid).toBe(true);
  });
  it("rejects when not exactly 5 questions", () => {
    const c = validConfig(); c.questions = c.questions.slice(0, 4);
    expect(validateFunnelConfigShape(c).valid).toBe(false);
  });
  it("rejects when a question lacks 3 choices", () => {
    const c = validConfig(); c.questions[0].choices = c.questions[0].choices.slice(0, 2);
    expect(validateFunnelConfigShape(c).valid).toBe(false);
  });
  it("rejects when not exactly 3 results", () => {
    const c = validConfig(); c.results = c.results.slice(0, 2);
    expect(validateFunnelConfigShape(c).valid).toBe(false);
  });
  it("rejects when a choice scores an unknown result key", () => {
    const c = validConfig(); c.questions[0].choices[0].scores = { pillar_9: 2 };
    expect(validateFunnelConfigShape(c).valid).toBe(false);
  });
  it("rejects a non-object", () => {
    expect(validateFunnelConfigShape(null as unknown as FunnelConfig).valid).toBe(false);
  });
});
