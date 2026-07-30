import { describe, it, expect } from "vitest";
import { decideClarification, buildClarifyDirective } from "@/lib/assistant/clarify";
import { buildDharaSystemPrompt, type DharaContext } from "@/lib/dhara/persona";

describe("decideClarification — never interrupt cheap work", () => {
  it("never asks for cheap output, however vague", () => {
    const d = decideClarification({ brief: "write something", cost: "cheap" });
    expect(d.ask).toBe(false);
    if (!d.ask) expect(d.reason).toBe("cheap_output");
  });
});

describe("decideClarification — asks once, about the biggest gap", () => {
  it("asks about audience first when nothing is specified", () => {
    const d = decideClarification({ brief: "write me a post", cost: "substantial" });
    expect(d.ask).toBe(true);
    if (d.ask) {
      expect(d.gap).toBe("audience");
      expect(d.question).toBe("Who is this for, your list or someone specific?");
    }
  });

  it("moves to outcome once audience is stated", () => {
    const d = decideClarification({
      brief: "write a post for my list about burnout",
      cost: "substantial",
    });
    expect(d.ask).toBe(true);
    if (d.ask) expect(d.gap).toBe("outcome");
  });

  it("returns exactly one question, never a list", () => {
    const d = decideClarification({ brief: "make me a campaign", cost: "substantial" });
    if (d.ask) {
      expect(d.question.split("?").filter(Boolean)).toHaveLength(1);
    }
  });
});

describe("decideClarification — never asks what it already knows", () => {
  it("stays quiet when the brief answers everything", () => {
    const d = decideClarification({
      brief: "email my list about the cohort closing tomorrow, get them to book a call",
      cost: "substantial",
    });
    expect(d.ask).toBe(false);
    if (!d.ask) expect(d.reason).toBe("brief_is_specific");
  });

  it("uses what it already knows instead of asking again", () => {
    const withoutMemory = decideClarification({
      brief: "write the launch piece, make them sign up, going out this week",
      cost: "substantial",
    });
    expect(withoutMemory.ask).toBe(true);
    if (withoutMemory.ask) expect(withoutMemory.gap).toBe("audience");

    const withMemory = decideClarification({
      brief: "write the launch piece, make them sign up, going out this week",
      cost: "substantial",
      known: ["Always writes to my list of men's coaches"],
    });
    expect(withMemory.ask).toBe(false);
  });
});

describe("clarify directive", () => {
  it("states the one-question discipline", () => {
    const d = buildClarifyDirective().toLowerCase();
    expect(d).toContain("one question");
    expect(d).toContain("never a list");
    expect(d).toContain("never ask the same thing twice");
  });

  it("contains no em dash (brand copy rule)", () => {
    expect(buildClarifyDirective()).not.toContain("—");
  });

  it("is wired into every Dhara prompt, interviewing or not", () => {
    const base: DharaContext = {
      coachFirstName: "Sunny",
      identityText: "",
      snapshotText: "",
      memories: [],
    };
    expect(buildDharaSystemPrompt(base)).toContain("BEFORE YOU PRODUCE SOMETHING SUBSTANTIAL");
    expect(buildDharaSystemPrompt({ ...base, interviewMode: true }))
      .toContain("BEFORE YOU PRODUCE SOMETHING SUBSTANTIAL");
  });
});
