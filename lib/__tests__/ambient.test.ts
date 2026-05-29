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
  it("returns a string", () => {
    const q = pickHonestQuestion(Date.now());
    expect(typeof q).toBe("string");
    expect(q.length).toBeGreaterThan(0);
  });

  it("returns the same question for the same day (deterministic)", () => {
    const now = new Date("2026-06-15T09:00:00Z").getTime();
    const later = new Date("2026-06-15T23:59:00Z").getTime();
    expect(pickHonestQuestion(now)).toBe(pickHonestQuestion(later));
  });

  it("returns a different question for a different day", () => {
    const day1 = new Date("2026-06-01T12:00:00Z").getTime();
    const day2 = new Date("2026-06-02T12:00:00Z").getTime();
    // Not guaranteed to differ for every pair, but these specific days map to different indices
    const q1 = pickHonestQuestion(day1);
    const q2 = pickHonestQuestion(day2);
    expect(q1).not.toBe(q2);
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
