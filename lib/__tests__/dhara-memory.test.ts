import { describe, it, expect } from "vitest";
import { normalizeMemoryText, mergeOrInsert, parseExtraction, type CoachMemory } from "@/lib/dhara/memory";

const base = (over: Partial<CoachMemory> = {}): CoachMemory => ({
  id: "m1", coachId: "c1", kind: "preference", text: "Prefers short DMs",
  source: "conversation", sourceRef: null, confidence: "candidate", status: "active",
  ...over,
});

describe("normalizeMemoryText", () => {
  it("lowercases, trims, collapses spaces, strips trailing punctuation", () => {
    expect(normalizeMemoryText("  Prefers   short DMs. ")).toBe("prefers short dms");
  });
});

describe("mergeOrInsert", () => {
  it("inserts when no match", () => {
    const r = mergeOrInsert([], { kind: "preference", text: "Prefers short DMs" });
    expect(r.action).toBe("insert");
    if (r.action === "insert") expect(r.confidence).toBe("candidate");
  });
  it("promotes candidate -> repeated on duplicate text", () => {
    const r = mergeOrInsert([base()], { kind: "preference", text: "prefers short DMS" });
    expect(r.action).toBe("promote");
    if (r.action === "promote") { expect(r.targetId).toBe("m1"); expect(r.confidence).toBe("repeated"); }
  });
  it("keeps confirmed as confirmed on duplicate", () => {
    const r = mergeOrInsert([base({ confidence: "confirmed" })], { kind: "preference", text: "Prefers short DMs" });
    expect(r.action).toBe("promote");
    if (r.action === "promote") expect(r.confidence).toBe("confirmed");
  });
});

describe("parseExtraction", () => {
  it("parses a JSON array of memories", () => {
    const out = parseExtraction('[{"kind":"goal","text":"Launching a men\'s cohort in fall"}]');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("goal");
  });
  it("returns [] on junk / non-array / bad kinds", () => {
    expect(parseExtraction("not json")).toEqual([]);
    expect(parseExtraction('{"kind":"goal"}')).toEqual([]);
    expect(parseExtraction('[{"kind":"banana","text":"x"}]')).toEqual([]);
  });
});
