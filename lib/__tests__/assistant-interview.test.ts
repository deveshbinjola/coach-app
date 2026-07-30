import { describe, it, expect } from "vitest";
import {
  deriveArchetype,
  interviewToMemories,
  interviewToEmphasis,
  reflectionLine,
  optionValues,
  EMPTY_ANSWERS,
  TIME_DRAIN_OPTIONS,
  HAND_OFF_OPTIONS,
  DESIRE_OPTIONS,
  NICHE_OPTIONS,
  STAGE_OPTIONS,
  TONE_OPTIONS,
  type InterviewAnswers,
} from "@/lib/assistant-interview";

const full: InterviewAnswers = {
  timeDrain: "leads_dms",
  handOffFirst: "drafting",
  desires: ["sounds_like_me", "never_cold"],
  niche: "mens_work",
  stage: "building",
  tone: "direct",
};

describe("deriveArchetype", () => {
  it("maps handOffFirst as the primary signal", () => {
    expect(deriveArchetype({ timeDrain: "leads_dms", handOffFirst: "drafting" }).slug).toBe("ghostwriter");
    expect(deriveArchetype({ timeDrain: null, handOffFirst: "followups" }).slug).toBe("closer");
    expect(deriveArchetype({ timeDrain: null, handOffFirst: "clients" }).slug).toBe("operator");
    expect(deriveArchetype({ timeDrain: null, handOffFirst: "briefing" }).slug).toBe("chief_of_staff");
  });

  it("falls back to timeDrain, then chief of staff", () => {
    expect(deriveArchetype({ timeDrain: "content", handOffFirst: null }).slug).toBe("ghostwriter");
    expect(deriveArchetype({ timeDrain: null, handOffFirst: null }).slug).toBe("chief_of_staff");
  });
});

describe("interviewToMemories", () => {
  it("flattens every answered question into a memory row", () => {
    const rows = interviewToMemories(full);
    // niche + stage + tone + timeDrain + handOffFirst + 2 desires
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.kind === "fact")).toHaveLength(3);
    expect(rows.filter((r) => r.kind === "preference")).toHaveLength(1);
    expect(rows.filter((r) => r.kind === "goal")).toHaveLength(3);
  });

  it("returns nothing for empty answers", () => {
    expect(interviewToMemories(EMPTY_ANSWERS)).toHaveLength(0);
  });
});

describe("interviewToEmphasis", () => {
  it("emphasizes only the areas the coach named", () => {
    const e = interviewToEmphasis({
      ...EMPTY_ANSWERS,
      timeDrain: "leads_dms",
      handOffFirst: "followups",
      desires: ["never_cold"],
    });
    expect(e).toEqual({ emphasize_leads: true, emphasize_content: false, emphasize_clients: false });
  });

  it("keeps everything on for broad answers", () => {
    const e = interviewToEmphasis({ ...EMPTY_ANSWERS, timeDrain: "everything" });
    expect(e).toEqual({ emphasize_leads: true, emphasize_content: true, emphasize_clients: true });
  });

  it("never de-emphasizes everything at once", () => {
    const e = interviewToEmphasis(EMPTY_ANSWERS);
    expect(e.emphasize_leads || e.emphasize_content || e.emphasize_clients).toBe(true);
  });
});

describe("reflectionLine", () => {
  it("leads with handOffFirst and appends the tone", () => {
    const line = reflectionLine(full);
    expect(line).toContain("drafting content in your voice");
    expect(line).toContain("No fluff");
  });

  it("falls back to timeDrain when handOffFirst is missing", () => {
    const line = reflectionLine({ ...EMPTY_ANSWERS, timeDrain: "leads_dms" });
    expect(line).toContain("chasing leads in the DMs");
  });

  it("returns null when there is nothing to reflect", () => {
    expect(reflectionLine(EMPTY_ANSWERS)).toBeNull();
    expect(reflectionLine({ ...EMPTY_ANSWERS, tone: "warm" })).toBeNull();
  });

  it("never contains an em dash", () => {
    const line = reflectionLine(full);
    expect(line).not.toContain("—");
  });
});

describe("optionValues", () => {
  it("exposes the registries the API validates against", () => {
    expect(optionValues(TIME_DRAIN_OPTIONS)).toContain("everything");
    expect(optionValues(HAND_OFF_OPTIONS)).toContain("briefing");
    expect(optionValues(DESIRE_OPTIONS)).toHaveLength(5);
    expect(optionValues(NICHE_OPTIONS)).toContain("mens_work");
    expect(optionValues(STAGE_OPTIONS)).toHaveLength(3);
    expect(optionValues(TONE_OPTIONS)).toHaveLength(3);
  });
});
