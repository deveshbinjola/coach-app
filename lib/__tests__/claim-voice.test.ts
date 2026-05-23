import { describe, it, expect } from "vitest";
import { decideClaimAction, type PendingRow } from "../../supabase/functions/_shared/claim-voice";

const pending: PendingRow = {
  id: "11111111-1111-1111-1111-111111111111",
  voice_json: { tone: ["direct"] },
  sample_messages: ["post one", "post two", "post three"],
};

describe("decideClaimAction", () => {
  it("inserts when there is a pending row and no existing voice profile", () => {
    expect(decideClaimAction(false, pending)).toEqual({ action: "insert" });
  });

  it("marks-only (no insert) when the coach already has a voice profile", () => {
    expect(decideClaimAction(true, pending)).toEqual({ action: "mark_only" });
  });

  it("does nothing when there is no pending row", () => {
    expect(decideClaimAction(false, null)).toEqual({ action: "none" });
    expect(decideClaimAction(true, null)).toEqual({ action: "none" });
  });
});
