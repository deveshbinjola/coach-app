// lib/__tests__/ambient.test.ts
import { describe, it, expect } from "vitest";
import { scoreRightNowItems, computeMetrics, computeDaySummary, detectSessionRhythm, pickHonestQuestion, extractUntappedTopics, generatePostSessionDraft, type RawPulseData } from "@/lib/ambient";

describe("generatePostSessionDraft", () => {
  it("returns null when no API key is set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generatePostSessionDraft({
      clientName: "Marcus",
      aiSummary: "Discussed boundaries with COO",
      commitments: ["Set boundary with COO this week"],
      keyTopics: ["boundaries", "leadership"],
      voiceProfile: null,
    });

    expect(result).toBeNull();
    process.env.ANTHROPIC_API_KEY = original;
  });
});

describe("scoreRightNowItems", () => {
  const now = new Date("2026-06-01T14:00:00Z").getTime();

  it("ranks session-in-under-1-hour as priority 1", () => {
    const data: RawPulseData = {
      calendarEvents: [
        {
          id: "ev-1",
          title: "Coaching: Marcus",
          starts_at: new Date(now + 45 * 60_000).toISOString(),
          meeting_url: "https://zoom.us/j/123",
          client_room_id: "room-1",
        },
      ],
      capturedToday: [],
      sessionsThisMonth: [],
      activeClients: [{ id: "lead-1", full_name: "Marcus Rivera", status: "client" }],
      waitingMessages: [],
      failedEnrollments: [],
      paymentsWindow: [],
      activeMembers: [],
      draftContent: [],
      clientRooms: [{ id: "room-1", lead_id: "lead-1" }],
      now,
    };
    const items = scoreRightNowItems(data);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].priority).toBe(1);
    expect(items[0].source).toBe("session");
    expect(items[0].leadName).toBe("Marcus Rivera");
  });

  it("ranks sequence failure as priority 2", () => {
    const data: RawPulseData = {
      calendarEvents: [],
      capturedToday: [],
      sessionsThisMonth: [],
      activeClients: [{ id: "lead-2", full_name: "Elena Park", status: "client" }],
      waitingMessages: [],
      failedEnrollments: [
        { id: "enr-1", lead_id: "lead-2", status: "failed", sequence_id: "seq-1" },
      ],
      paymentsWindow: [],
      activeMembers: [],
      draftContent: [],
      clientRooms: [],
      now,
    };
    const items = scoreRightNowItems(data);
    expect(items[0].priority).toBe(2);
    expect(items[0].source).toBe("sequence");
  });

  it("ranks inbound message > 48h as priority 3", () => {
    const twoDaysAgo = new Date(now - 49 * 3600_000).toISOString();
    const data: RawPulseData = {
      calendarEvents: [],
      capturedToday: [],
      sessionsThisMonth: [],
      activeClients: [{ id: "lead-3", full_name: "Aisha Coleman", status: "client" }],
      waitingMessages: [
        { id: "msg-1", lead_id: "lead-3", direction: "inbound", sent_at: twoDaysAgo, created_at: twoDaysAgo },
      ],
      failedEnrollments: [],
      paymentsWindow: [],
      activeMembers: [],
      draftContent: [],
      clientRooms: [],
      now,
    };
    const items = scoreRightNowItems(data);
    expect(items[0].priority).toBe(3);
    expect(items[0].source).toBe("message");
  });

  it("returns max 6 items (1 hero + 5 quiet list)", () => {
    const data: RawPulseData = {
      calendarEvents: [],
      capturedToday: [],
      sessionsThisMonth: [],
      activeClients: Array.from({ length: 10 }, (_, i) => ({
        id: `lead-${i}`,
        full_name: `Client ${i}`,
        status: "client" as const,
      })),
      waitingMessages: Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i}`,
        lead_id: `lead-${i}`,
        direction: "inbound" as const,
        sent_at: new Date(now - (50 + i) * 3600_000).toISOString(),
        created_at: new Date(now - (50 + i) * 3600_000).toISOString(),
      })),
      failedEnrollments: [],
      paymentsWindow: [],
      activeMembers: [],
      draftContent: [],
      clientRooms: [],
      now,
    };
    const items = scoreRightNowItems(data);
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it("returns empty array when nothing needs attention", () => {
    const data: RawPulseData = {
      calendarEvents: [],
      capturedToday: [],
      sessionsThisMonth: [],
      activeClients: [],
      waitingMessages: [],
      failedEnrollments: [],
      paymentsWindow: [],
      activeMembers: [],
      draftContent: [],
      clientRooms: [],
      now,
    };
    const items = scoreRightNowItems(data);
    expect(items).toEqual([]);
  });
});

describe("computeMetrics", () => {
  it("computes revenue trend correctly", () => {
    const now = new Date("2026-06-15T10:00:00Z").getTime();
    const thisMonth = new Date("2026-06-05T10:00:00Z").toISOString();
    const lastMonth = new Date("2026-05-10T10:00:00Z").toISOString();

    const metrics = computeMetrics({
      paymentsWindow: [
        { amount_cents: 200_00, created_at: thisMonth },
        { amount_cents: 300_00, created_at: thisMonth },
        { amount_cents: 100_00, created_at: lastMonth },
      ],
      activeMembers: [{ id: "m1", status: "active" }, { id: "m2", status: "active" }],
      sessionsThisMonth: [{ client_id: "c1", session_date: thisMonth }],
      trustRate: 85,
      now,
    });

    expect(metrics.revenue.amount).toBe(500_00);
    expect(metrics.revenue.trend).toBe("up");
    expect(metrics.activeMembers).toBe(2);
    expect(metrics.sessionsThisMonth).toBe(1);
    expect(metrics.trustRate).toBe(85);
  });

  it("returns flat when both months are zero", () => {
    const now = new Date("2026-06-15T10:00:00Z").getTime();
    const metrics = computeMetrics({
      paymentsWindow: [],
      activeMembers: [],
      sessionsThisMonth: [],
      trustRate: null,
      now,
    });
    expect(metrics.revenue.amount).toBe(0);
    expect(metrics.revenue.trend).toBe("flat");
  });

  it("returns down when last month revenue exceeds this month", () => {
    const now = new Date("2026-06-15T10:00:00Z").getTime();
    const thisMonth = new Date("2026-06-05T10:00:00Z").toISOString();
    const lastMonth = new Date("2026-05-10T10:00:00Z").toISOString();
    const metrics = computeMetrics({
      paymentsWindow: [
        { amount_cents: 100_00, created_at: thisMonth },
        { amount_cents: 500_00, created_at: lastMonth },
      ],
      activeMembers: [],
      sessionsThisMonth: [],
      trustRate: null,
      now,
    });
    expect(metrics.revenue.trend).toBe("down");
  });

  it("counts only active members (ignores inactive)", () => {
    const now = new Date("2026-06-15T10:00:00Z").getTime();
    const metrics = computeMetrics({
      paymentsWindow: [],
      activeMembers: [
        { id: "m1", status: "active" },
        { id: "m2", status: "inactive" },
        { id: "m3", status: "active" },
      ],
      sessionsThisMonth: [],
      trustRate: null,
      now,
    });
    expect(metrics.activeMembers).toBe(2);
  });
});

describe("detectSessionRhythm", () => {
  it("returns null for fewer than 2 sessions", () => {
    expect(detectSessionRhythm([])).toBeNull();
    expect(detectSessionRhythm(["2026-06-01"])).toBeNull();
  });

  it("detects 2nd consecutive week for a 7-day gap", () => {
    const result = detectSessionRhythm(["2026-06-01", "2026-06-08"]);
    expect(result).toBe("2nd consecutive week");
  });

  it("returns null for irregular gaps (15 days)", () => {
    const result = detectSessionRhythm(["2026-06-01", "2026-06-16"]);
    expect(result).toBeNull();
  });

  it("detects 3rd consecutive week for 3 consecutive weekly sessions", () => {
    const result = detectSessionRhythm(["2026-06-01", "2026-06-08", "2026-06-15"]);
    expect(result).toBe("3rd consecutive week");
  });
});

describe("computeDaySummary", () => {
  it("returns correct counts for sessions, drafts, and leadsWaiting", () => {
    const items = [
      { id: "1", priority: 3, reason: "msg", source: "message" as const, action: { label: "Reply", type: "compose" as const } },
      { id: "2", priority: 2, reason: "seq", source: "sequence" as const, action: { label: "View", type: "link" as const } },
      { id: "3", priority: 1, reason: "session", source: "session" as const, action: { label: "Join", type: "link" as const } },
    ];
    const summary = computeDaySummary(items, 4, 2);
    expect(summary.sessions).toBe(4);
    expect(summary.draftsReady).toBe(2);
    expect(summary.leadsWaiting).toBe(2); // message + sequence sources
  });
});

describe("pickHonestQuestion", () => {
  const DAY = 86_400_000;
  const day = (n: number) => new Date("2026-01-01T12:00:00Z").getTime() + n * DAY;
  const run = (coachId: string, days: number) =>
    Array.from({ length: days }, (_, i) => pickHonestQuestion(day(i), coachId));

  it("returns a string", () => {
    const q = pickHonestQuestion(Date.now(), "coach-a");
    expect(typeof q).toBe("string");
    expect(q.length).toBeGreaterThan(0);
  });

  it("is stable within a day (cacheable, no flicker between renders)", () => {
    const morning = new Date("2026-06-15T09:00:00Z").getTime();
    const night = new Date("2026-06-15T23:59:00Z").getTime();
    expect(pickHonestQuestion(morning, "coach-a")).toBe(pickHonestQuestion(night, "coach-a"));
  });

  it("never repeats on consecutive days", () => {
    const seen = run("coach-a", 60);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });

  it("covers the whole pool (no question is starved)", () => {
    // Two full cycles of any plausible pool size.
    const seen = run("coach-a", 60);
    const pool = new Set(seen);
    // Every question seen in the first 30 days is also reachable later,
    // i.e. the walk cycles the full set rather than favouring a subset.
    const firstHalf = new Set(seen.slice(0, 30));
    expect(firstHalf.size).toBe(pool.size);
  });

  it("differs between coaches on the same day (not a shared rerun schedule)", () => {
    const a = run("coach-a", 20).join("|");
    const b = run("coach-b", 20).join("|");
    expect(a).not.toBe(b);
  });

  it("is not the old day-of-year walk (order is shuffled, not sequential)", () => {
    // The old implementation produced the pool in fixed list order. If the
    // sequence for 14 days is identical for two different coaches, the
    // shuffle is not seeded per coach and the regression is back.
    expect(run("coach-a", 14)).not.toEqual(run("coach-z", 14));
  });
});

describe("extractUntappedTopics", () => {
  it("finds topics in 3+ sessions not covered by content", () => {
    const sessionTopics = [
      ["boundaries", "leadership"],
      ["boundaries", "vulnerability"],
      ["boundaries", "anger"],
      ["leadership", "communication"],
    ];
    const contentTitles = ["Leadership in coaching", "Finding your voice"];

    const result = extractUntappedTopics(sessionTopics, contentTitles);

    expect(result).toEqual([
      { topic: "boundaries", sessionCount: 3 },
    ]);
  });

  it("returns empty when all frequent topics are covered", () => {
    const sessionTopics = [
      ["boundaries"],
      ["boundaries"],
      ["boundaries"],
    ];
    const contentTitles = ["Setting boundaries with clients"];

    const result = extractUntappedTopics(sessionTopics, contentTitles);
    expect(result).toEqual([]);
  });

  it("returns empty when no topic appears 3+ times", () => {
    const sessionTopics = [["a"], ["b"], ["c"]];
    const contentTitles: string[] = [];

    const result = extractUntappedTopics(sessionTopics, contentTitles);
    expect(result).toEqual([]);
  });
});
