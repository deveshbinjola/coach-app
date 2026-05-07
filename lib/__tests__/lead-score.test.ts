// Tests for lib/lead-score.ts
//
// The score formula is the spine of every "what to do next" surface
// (Lead Rescue, Inbox ranking, Insight queue). If the weights change
// silently, the priority order coaches act on changes silently.
// These tests pin the contract so a regression is loud.

import { describe, it, expect } from "vitest";
import {
  scoreBreakdown,
  computeLeadScore,
  sortByScore,
  scoreTier,
} from "@/lib/lead-score";
import { makeLead, TEST_NOW, hoursAgo, daysAgo } from "./factories";

describe("scoreBreakdown — temperature weighting", () => {
  it("on_fire scores 100 baseline (no other signals)", () => {
    const b = scoreBreakdown(makeLead({ temperature: "on_fire" }), TEST_NOW);
    expect(b.temperature).toBe(100);
    expect(b.total).toBe(100);
  });

  it("hot=80, warm=50, cold=20, dormant=5", () => {
    expect(scoreBreakdown(makeLead({ temperature: "hot" }), TEST_NOW).temperature).toBe(80);
    expect(scoreBreakdown(makeLead({ temperature: "warm" }), TEST_NOW).temperature).toBe(50);
    expect(scoreBreakdown(makeLead({ temperature: "cold" }), TEST_NOW).temperature).toBe(20);
    expect(scoreBreakdown(makeLead({ temperature: "dormant" }), TEST_NOW).temperature).toBe(5);
  });
});

describe("scoreBreakdown — discovery bonus", () => {
  it("adds 20 when discovery_call_completed is true", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "warm", discovery_call_completed: true }),
      TEST_NOW
    );
    expect(b.discovery).toBe(20);
    expect(b.total).toBe(70); // 50 warm + 20 discovery
  });

  it("adds 0 when discovery_call_completed is false", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "warm", discovery_call_completed: false }),
      TEST_NOW
    );
    expect(b.discovery).toBe(0);
  });
});

describe("scoreBreakdown — pain signals", () => {
  it("scores 5 per signal", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "cold", pain_signal: ["money", "time"] as any }),
      TEST_NOW
    );
    expect(b.pain).toBe(10);
  });

  it("caps at 20 even with many signals", () => {
    const b = scoreBreakdown(
      makeLead({
        temperature: "cold",
        pain_signal: ["a", "b", "c", "d", "e", "f"] as any,
      }),
      TEST_NOW
    );
    expect(b.pain).toBe(20);
  });

  it("returns 0 when pain_signal is undefined or non-array", () => {
    const b = scoreBreakdown(
      // Cast through unknown to force a non-array value past the type guard,
      // simulating a partial Supabase row missing the column.
      makeLead({ pain_signal: undefined as unknown as never }),
      TEST_NOW
    );
    expect(b.pain).toBe(0);
  });
});

describe("scoreBreakdown — recency", () => {
  it("adds 10 if last_contact_at within 7 days", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "cold", last_contact_at: daysAgo(3) }),
      TEST_NOW
    );
    expect(b.recency).toBe(10);
  });

  it("adds 5 if last_contact_at between 7 and 30 days", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "cold", last_contact_at: daysAgo(15) }),
      TEST_NOW
    );
    expect(b.recency).toBe(5);
  });

  it("adds 0 if last_contact_at older than 30 days", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "cold", last_contact_at: daysAgo(45) }),
      TEST_NOW
    );
    expect(b.recency).toBe(0);
  });

  it("adds 0 if last_contact_at is null", () => {
    const b = scoreBreakdown(
      makeLead({ temperature: "cold", last_contact_at: null }),
      TEST_NOW
    );
    expect(b.recency).toBe(0);
  });

  it("uses injected `now` so SSR/CSR computations match", () => {
    // Lead contacted exactly at the 7-day boundary. Injecting `now` should
    // give a deterministic answer; using ambient Date.now would drift.
    const fixedNow = new Date("2026-05-01T12:00:00.000Z").getTime();
    const b = scoreBreakdown(
      makeLead({
        temperature: "cold",
        last_contact_at: new Date(fixedNow - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      fixedNow
    );
    expect(b.recency).toBe(10); // exactly 7 days = boundary, included
  });
});

describe("computeLeadScore — full stack", () => {
  it("on_fire + discovery + 4 pain + recent within 7d = 100+20+20+10 = 150 (the ceiling)", () => {
    const score = computeLeadScore(
      makeLead({
        temperature: "on_fire",
        discovery_call_completed: true,
        pain_signal: ["a", "b", "c", "d"] as any,
        last_contact_at: hoursAgo(2),
      }),
      TEST_NOW
    );
    expect(score).toBe(150);
  });

  it("dormant + no signals = 5 (the floor)", () => {
    const score = computeLeadScore(
      makeLead({ temperature: "dormant" }),
      TEST_NOW
    );
    expect(score).toBe(5);
  });

  it("returns 0 when given a null/undefined lead (defensive)", () => {
    expect(scoreBreakdown(null as unknown as never).total).toBe(0);
  });
});

describe("sortByScore — ranking", () => {
  it("sorts highest score first", () => {
    const cold    = makeLead({ id: "a", temperature: "cold" });    // 20
    const onFire  = makeLead({ id: "b", temperature: "on_fire" }); // 100
    const warm    = makeLead({ id: "c", temperature: "warm" });    // 50
    const sorted  = sortByScore([cold, onFire, warm], TEST_NOW);
    expect(sorted.map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on next_followup_at (sooner first)", () => {
    const a = makeLead({ id: "a", temperature: "warm", next_followup_at: hoursAgo(-72) }); // 3 days from now
    const b = makeLead({ id: "b", temperature: "warm", next_followup_at: hoursAgo(-24) }); // 1 day from now
    expect(sortByScore([a, b], TEST_NOW).map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("breaks final ties on created_at (newer first)", () => {
    const older = makeLead({ id: "old", temperature: "warm", created_at: daysAgo(10) });
    const newer = makeLead({ id: "new", temperature: "warm", created_at: daysAgo(1) });
    expect(sortByScore([older, newer], TEST_NOW).map((l) => l.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      makeLead({ id: "a", temperature: "cold" }),
      makeLead({ id: "b", temperature: "on_fire" }),
    ];
    sortByScore(input, TEST_NOW);
    expect(input.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("scoreTier — visual bucket thresholds", () => {
  it.each([
    [150, "top"],
    [120, "top"],
    [119, "high"],
    [80,  "high"],
    [79,  "mid"],
    [40,  "mid"],
    [39,  "low"],
    [0,   "low"],
  ])("score %i → %s tier", (score, tier) => {
    expect(scoreTier(score)).toBe(tier);
  });
});
