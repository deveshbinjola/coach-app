// Pins the reaction contract from the 2026-08-18 copy pass.
//
// The panel's catch: once the deliberate blanks exist, an empty string is
// indistinguishable from "not written yet", and the next contributor will
// helpfully fill the silent ones. So null is the ONLY way to be quiet, and
// "" is a bug these tests fail on.

import { describe, it, expect } from "vitest";
import {
  TIME_DRAIN_OPTIONS, HAND_OFF_OPTIONS, DESIRE_OPTIONS,
  NICHE_OPTIONS, STAGE_OPTIONS, TONE_OPTIONS,
} from "@/lib/assistant-interview";

const ALL = [
  ...TIME_DRAIN_OPTIONS, ...HAND_OFF_OPTIONS, ...DESIRE_OPTIONS,
  ...NICHE_OPTIONS, ...STAGE_OPTIONS, ...TONE_OPTIONS,
];

describe("interview reactions", () => {
  it("covers every option exactly once", () => {
    expect(ALL).toHaveLength(25);
    expect(new Set(ALL.map((o) => o.value)).size).toBe(25);
  });

  it("never uses an empty string — null is the only way to be silent", () => {
    const empty = ALL.filter((o) => o.reaction === "");
    expect(empty.map((o) => o.value)).toEqual([]);
  });

  it("keeps tone deliberately silent", () => {
    expect(TONE_OPTIONS.every((o) => o.reaction === null)).toBe(true);
  });

  it("gives every other set a written reaction", () => {
    const spoken = [
      ...TIME_DRAIN_OPTIONS, ...HAND_OFF_OPTIONS, ...DESIRE_OPTIONS,
      ...NICHE_OPTIONS, ...STAGE_OPTIONS,
    ];
    expect(spoken.every((o) => typeof o.reaction === "string" && o.reaction.length > 20)).toBe(true);
  });

  it("leads with the coach's situation, not the product", () => {
    // The eight originals all opened with a capability claim ("Lead follow-up
    // is exactly the kind of thing I never drop"). Cheap guard against that
    // drifting back: no reaction may open with an assistant-first phrase.
    const productFirst = /^(I'll|I will|I never|I'm|Done\.|One clear brief)/;
    const offenders = ALL.filter(
      (o) => typeof o.reaction === "string" && productFirst.test(o.reaction),
    );
    expect(offenders.map((o) => o.value)).toEqual([]);
  });
});
