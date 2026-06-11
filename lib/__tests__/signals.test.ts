import { describe, it, expect } from "vitest";
import { buildSignalRow, SIGNAL_KINDS, type NewSignal } from "@/lib/signals";

describe("buildSignalRow", () => {
  const base: NewSignal = {
    source: "session", kind: "commitment", refTable: "cp_coaching_sessions",
    refId: "11111111-1111-1111-1111-111111111111", subjectId: "22222222-2222-2222-2222-222222222222",
    text: "Practice the morning breath drill daily", evidence: "I'll do the breath thing every morning",
  };
  it("stamps coach_id and defaults", () => {
    const row = buildSignalRow("coach-1", base);
    expect(row.coach_id).toBe("coach-1");
    expect(row.status).toBe("active");
    expect(row.confidence).toBe("candidate");
    expect(row.weight).toBe(1);
    expect(row.text).toBe(base.text);
    expect(row.evidence).toBe(base.evidence);
  });
  it("rejects an unknown kind", () => {
    expect(() => buildSignalRow("c", { ...base, kind: "bogus" as NewSignal["kind"] })).toThrow();
  });
  it("trims text and tolerates missing evidence/subject", () => {
    const row = buildSignalRow("c", { ...base, text: "  x  ", evidence: undefined, subjectId: undefined });
    expect(row.text).toBe("x");
    expect(row.evidence).toBeNull();
    expect(row.subject_id).toBeNull();
  });
  it("SIGNAL_KINDS is the canonical list", () => {
    expect(SIGNAL_KINDS).toContain("commitment");
    expect(SIGNAL_KINDS).toContain("pattern");
  });
});
