// Tests for lib/funnel.ts
//
// computeFunnel is what the baseline report depends on. If stage ordering
// or distinct-coach counting regresses, the baseline we measure v2 against
// is wrong. Pin the contract.

import { describe, it, expect } from "vitest";
import {
  FUNNEL_STAGES,
  isFunnelEvent,
  computeFunnel,
  type FunnelEventRow,
} from "@/lib/funnel";

const NOW = new Date("2026-05-22T00:00:00.000Z");

function ev(coach_id: string, name: string, created_at = "2026-05-01T00:00:00.000Z"): FunnelEventRow {
  return { coach_id, name, created_at };
}

describe("isFunnelEvent", () => {
  it("accepts known event names", () => {
    expect(isFunnelEvent("signup_completed")).toBe(true);
    expect(isFunnelEvent("app_opened")).toBe(true);
  });
  it("rejects unknown names", () => {
    expect(isFunnelEvent("nope")).toBe(false);
    expect(isFunnelEvent("")).toBe(false);
  });
});

describe("computeFunnel — stage counts", () => {
  it("counts distinct coaches per stage, ignoring duplicate milestone rows", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed"),
      ev("a", "signup_completed"), // duplicate — must not double-count
      ev("b", "signup_completed"),
      ev("a", "brand_os_started"),
      ev("a", "brand_os_completed"),
    ];
    const report = computeFunnel(events, NOW);
    const signup = report.stages.find((s) => s.stage === "signup_completed")!;
    const started = report.stages.find((s) => s.stage === "brand_os_started")!;
    expect(signup.coaches).toBe(2);
    expect(started.coaches).toBe(1);
    expect(report.totalCoaches).toBe(2);
  });

  it("orders stages per FUNNEL_STAGES", () => {
    const report = computeFunnel([], NOW);
    expect(report.stages.map((s) => s.stage)).toEqual([...FUNNEL_STAGES]);
  });

  it("computes drop-off from previous stage", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed"),
      ev("b", "signup_completed"),
      ev("c", "signup_completed"),
      ev("d", "signup_completed"),
      ev("a", "brand_os_started"),
      ev("b", "brand_os_started"),
    ];
    const report = computeFunnel(events, NOW);
    const started = report.stages.find((s) => s.stage === "brand_os_started")!;
    expect(started.coaches).toBe(2);
    expect(started.dropFromPrev).toBe(50); // 4 -> 2 = 50% drop
  });
});

describe("computeFunnel — derived metrics", () => {
  it("brandOsAbandoned = started and not completed", () => {
    const events: FunnelEventRow[] = [
      ev("a", "brand_os_started"),
      ev("a", "brand_os_completed"),
      ev("b", "brand_os_started"), // abandoned
    ];
    expect(computeFunnel(events, NOW).brandOsAbandoned).toBe(1);
  });

  it("returnedDay7 = app_opened on/after signup + 7 days", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed", "2026-05-01T00:00:00.000Z"),
      ev("a", "app_opened", "2026-05-09T00:00:00.000Z"), // +8d -> counts
      ev("b", "signup_completed", "2026-05-01T00:00:00.000Z"),
      ev("b", "app_opened", "2026-05-03T00:00:00.000Z"), // +2d -> no
    ];
    expect(computeFunnel(events, NOW).returnedDay7).toBe(1);
  });
});
