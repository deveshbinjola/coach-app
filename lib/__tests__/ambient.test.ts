// lib/__tests__/ambient.test.ts
import { describe, it, expect } from "vitest";
import { scoreRightNowItems, computeMetrics, type RawPulseData } from "@/lib/ambient";

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
});
