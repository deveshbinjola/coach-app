import { describe, it, expect } from "vitest";
import { buildWatchdogDigest, isDigestQuiet, type CoachRow, type OpenBug } from "@/lib/cron/watchdog-digest";

const NOW = new Date("2026-08-09T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

const coach = (id: string, name: string): CoachRow => ({ id, full_name: name, email: `${name}@x.com` });

const bug = (over: Partial<OpenBug> & Pick<OpenBug, "id" | "coach_id" | "severity" | "created_at">): OpenBug => ({
  title: "Bug",
  ...over,
});

describe("buildWatchdogDigest", () => {
  it("tallies open bugs by severity", () => {
    const digest = buildWatchdogDigest({
      bugs: [
        bug({ id: "1", coach_id: "c1", severity: "critical", created_at: new Date(NOW).toISOString() }),
        bug({ id: "2", coach_id: "c1", severity: "high", created_at: new Date(NOW).toISOString() }),
        bug({ id: "3", coach_id: "c1", severity: "normal", created_at: new Date(NOW).toISOString() }),
        bug({ id: "4", coach_id: "c1", severity: "low", created_at: new Date(NOW).toISOString() }),
      ],
      coaches: [coach("c1", "Ann")],
      activityCoachIds: [],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });

    expect(digest.openBugs.total).toBe(4);
    expect(digest.openBugs.bySeverity).toEqual({ critical: 1, high: 1, normal: 1, low: 1 });
  });

  it("flags high/critical bugs older than the stale window, and only those", () => {
    const digest = buildWatchdogDigest({
      bugs: [
        // 30h old, high — stale
        bug({ id: "stale", coach_id: "c1", severity: "high", created_at: new Date(NOW - 30 * HOUR).toISOString() }),
        // 30h old, normal severity — not stale-eligible regardless of age
        bug({ id: "old-normal", coach_id: "c1", severity: "normal", created_at: new Date(NOW - 30 * HOUR).toISOString() }),
        // 1h old, critical — too fresh
        bug({ id: "fresh-critical", coach_id: "c1", severity: "critical", created_at: new Date(NOW - HOUR).toISOString() }),
      ],
      coaches: [coach("c1", "Ann")],
      activityCoachIds: [],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });

    expect(digest.staleHighSeverity.map((b) => b.id)).toEqual(["stale"]);
    expect(digest.staleHighSeverity[0].coach).toBe("Ann");
    expect(digest.staleHighSeverity[0].hoursOpen).toBe(30);
  });

  it("falls back to the email local-part when a coach has no full_name", () => {
    const digest = buildWatchdogDigest({
      bugs: [bug({ id: "1", coach_id: "c1", severity: "critical", created_at: new Date(NOW - 48 * HOUR).toISOString() })],
      coaches: [{ id: "c1", full_name: null, email: "marcus@example.com" }],
      activityCoachIds: [],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });

    expect(digest.staleHighSeverity[0].coach).toBe("marcus");
  });

  it("flags coaches at or above the volume threshold, sorted highest first", () => {
    const digest = buildWatchdogDigest({
      bugs: [],
      coaches: [coach("c1", "Ann"), coach("c2", "Ben"), coach("c3", "Cy")],
      activityCoachIds: [
        ...Array(200).fill("c1"), // exactly at threshold
        ...Array(50).fill("c2"), // below threshold
        ...Array(500).fill("c3"), // well above
      ],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });

    expect(digest.agentActivity.windowCalls).toBe(750);
    expect(digest.agentActivity.highVolumeCoaches.map((c) => c.name)).toEqual(["Cy", "Ann"]);
    expect(digest.agentActivity.highVolumeCoaches[0].count).toBe(500);
  });
});

describe("isDigestQuiet", () => {
  it("is quiet when nothing is flagged", () => {
    const digest = buildWatchdogDigest({
      bugs: [],
      coaches: [],
      activityCoachIds: [],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });
    expect(isDigestQuiet(digest)).toBe(true);
  });

  it("is not quiet when a stale bug or a volume flag exists", () => {
    const staleBugDigest = buildWatchdogDigest({
      bugs: [bug({ id: "1", coach_id: "c1", severity: "critical", created_at: new Date(NOW - 48 * HOUR).toISOString() })],
      coaches: [coach("c1", "Ann")],
      activityCoachIds: [],
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });
    expect(isDigestQuiet(staleBugDigest)).toBe(false);

    const volumeDigest = buildWatchdogDigest({
      bugs: [],
      coaches: [coach("c1", "Ann")],
      activityCoachIds: Array(200).fill("c1"),
      nowMs: NOW,
      staleHours: 24,
      highVolumeCalls: 200,
    });
    expect(isDigestQuiet(volumeDigest)).toBe(false);
  });
});
