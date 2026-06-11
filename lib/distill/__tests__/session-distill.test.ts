import { describe, it, expect } from "vitest";
import { buildDistillPrompt, parseDistillResponse, toSignals } from "@/lib/distill/session-distill";

describe("buildDistillPrompt", () => {
  it("forbids invention + em-dashes and demands evidence + JSON", () => {
    const p = buildDistillPrompt("client said they keep skipping mornings");
    expect(p.toLowerCase()).toContain("do not invent");
    expect(p.toLowerCase()).toContain("evidence");
    expect(p.toLowerCase()).toContain("em-dash");
    expect(p).toContain('"commitments"');
  });
});
describe("parseDistillResponse", () => {
  it("parses clean + fenced JSON into buckets of {text, evidence}", () => {
    const raw = '```json\n{"topics":[{"text":"mornings","evidence":"skipping mornings"}],"commitments":[],"patterns":[],"somatic":[]}\n```';
    const r = parseDistillResponse(raw);
    expect(r.topics[0]).toEqual({ text: "mornings", evidence: "skipping mornings" });
  });
  it("returns empty buckets on garbage", () => {
    const r = parseDistillResponse("not json");
    expect(r).toEqual({ topics: [], commitments: [], patterns: [], somatic: [] });
  });
  it("drops items with empty text", () => {
    const r = parseDistillResponse('{"topics":[{"text":"","evidence":"x"},{"text":"ok"}],"commitments":[],"patterns":[],"somatic":[]}');
    expect(r.topics).toEqual([{ text: "ok", evidence: null }]);
  });
});
describe("toSignals", () => {
  it("maps buckets to NewSignal[] with the right kinds + refs", () => {
    const parsed = { topics: [{ text: "t", evidence: "te" }], commitments: [{ text: "c", evidence: null }], patterns: [], somatic: [] };
    const sigs = toSignals(parsed, { sessionId: "s1", subjectId: "lead1" });
    expect(sigs).toEqual([
      { source: "session", kind: "topic", refTable: "cp_coaching_sessions", refId: "s1", subjectId: "lead1", text: "t", evidence: "te" },
      { source: "session", kind: "commitment", refTable: "cp_coaching_sessions", refId: "s1", subjectId: "lead1", text: "c", evidence: null },
    ]);
  });
});
