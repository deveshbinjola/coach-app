import { describe, it, expect } from "vitest";
import { assemblePrep, type PrepSignal } from "@/lib/coaching-prep";

const sig = (over: Partial<PrepSignal>): PrepSignal => ({
  id: "x", kind: "topic", text: "t", evidence: "e", confidence: "candidate", status: "active",
  created_at: "2026-06-01T00:00:00Z", ...over,
});

describe("assemblePrep", () => {
  it("recap = topics from newest first", () => {
    const out = assemblePrep([sig({ kind: "topic", text: "older", created_at: "2026-05-01T00:00:00Z" }), sig({ kind: "topic", text: "newer", created_at: "2026-06-01T00:00:00Z" })]);
    expect(out.lastRecap[0]).toBe("newer");
  });
  it("firm commitments require confidence >= repeated; singles go to possible", () => {
    const out = assemblePrep([
      sig({ kind: "commitment", text: "firm", confidence: "repeated" }),
      sig({ kind: "commitment", text: "maybe", confidence: "candidate" }),
    ]);
    expect(out.openCommitments).toContain("firm");
    expect(out.possible).toContain("maybe");
    expect(out.openCommitments).not.toContain("maybe");
  });
  it("excludes dismissed", () => {
    const out = assemblePrep([sig({ kind: "commitment", text: "gone", confidence: "confirmed", status: "dismissed" })]);
    expect(out.openCommitments).not.toContain("gone");
  });
  it("patterns require >= repeated", () => {
    const out = assemblePrep([sig({ kind: "pattern", text: "weak", confidence: "candidate" }), sig({ kind: "pattern", text: "strong", confidence: "confirmed" })]);
    expect(out.formingPatterns).toEqual(["strong"]);
  });
});
