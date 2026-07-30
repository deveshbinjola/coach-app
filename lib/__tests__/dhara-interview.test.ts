import { describe, it, expect } from "vitest";
import {
  hasBeenInterviewed,
  buildInterviewDirective,
  interviewOpener,
  INTERVIEW_COMPLETE_AT,
  type InterviewSubject,
} from "@/lib/dhara/interview";
import { buildDharaSystemPrompt, type DharaContext } from "@/lib/dhara/persona";

const mem = (source: string, status = "active"): InterviewSubject =>
  ({ source, status }) as InterviewSubject;

describe("hasBeenInterviewed", () => {
  it("is false for a coach with no memories (the installed-base case)", () => {
    expect(hasBeenInterviewed([])).toBe(false);
  });

  it("is false when memories came from conversation, not the interview", () => {
    const memories = Array.from({ length: 10 }, () => mem("conversation"));
    expect(hasBeenInterviewed(memories)).toBe(false);
  });

  it("is true once enough explicit answers exist (the /welcome form path)", () => {
    const memories = Array.from({ length: INTERVIEW_COMPLETE_AT }, () => mem("explicit"));
    expect(hasBeenInterviewed(memories)).toBe(true);
  });

  it("stays false partway through the conversational interview", () => {
    const memories = Array.from({ length: INTERVIEW_COMPLETE_AT - 1 }, () => mem("explicit"));
    expect(hasBeenInterviewed(memories)).toBe(false);
  });

  it("ignores forgotten memories", () => {
    const memories = Array.from({ length: 6 }, () => mem("explicit", "forgotten"));
    expect(hasBeenInterviewed(memories)).toBe(false);
  });
});

describe("interview directive", () => {
  it("enforces one question at a time and no repeat asking", () => {
    const d = buildInterviewDirective().toLowerCase();
    expect(d).toContain("one question per message");
    expect(d).toContain("never ask twice");
    expect(d).toContain("conversation, not a form");
  });

  it("contains no em dash (brand copy rule)", () => {
    expect(buildInterviewDirective()).not.toContain("—");
    expect(interviewOpener("Sunny")).not.toContain("—");
  });
});

describe("interviewOpener", () => {
  it("uses the coach's name when known", () => {
    expect(interviewOpener("Sunny")).toContain("Sunny");
  });

  it("works without a name", () => {
    expect(interviewOpener("")).toMatch(/^We have not properly met/);
  });
});

describe("system prompt wiring", () => {
  const base: DharaContext = {
    coachFirstName: "Sunny",
    identityText: "",
    snapshotText: "",
    memories: [],
  };

  it("omits the interview directive for an interviewed coach", () => {
    expect(buildDharaSystemPrompt(base)).not.toContain("INTERVIEW MODE");
  });

  it("appends the interview directive when interview mode is on", () => {
    const p = buildDharaSystemPrompt({ ...base, interviewMode: true });
    expect(p).toContain("INTERVIEW MODE");
    // Persona rules must survive: the interview does not replace the voice.
    expect(p.toLowerCase()).toContain("never invent");
  });
});
