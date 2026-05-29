import { describe, it, expect } from "vitest";
import { computeRevenueVitals, computeLeadPipeline, computeContentPipeline, computeRevenueByOffering, computeThisWeek } from "@/lib/admin-dashboard";

describe("computeRevenueVitals", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();

  it("sums this month and last month, computes up trend and pctChange", () => {
    const payments = [
      { amount_cents: 1000000, created_at: "2026-05-03T00:00:00Z", status: "completed" },
      { amount_cents: 400000, created_at: "2026-05-10T00:00:00Z", status: "completed" },
      { amount_cents: 1190000, created_at: "2026-04-12T00:00:00Z", status: "completed" },
    ];
    const v = computeRevenueVitals(payments, now);
    expect(v.thisMonthCents).toBe(1400000);
    expect(v.lastMonthCents).toBe(1190000);
    expect(v.trend).toBe("up");
    expect(v.pctChange).toBe(18); // round((1400000-1190000)/1190000*100)
  });

  it("ignores non-completed payments", () => {
    const payments = [
      { amount_cents: 500000, created_at: "2026-05-03T00:00:00Z", status: "pending" },
    ];
    expect(computeRevenueVitals(payments, now).thisMonthCents).toBe(0);
  });

  it("returns null pctChange and flat trend when last month is zero", () => {
    const payments = [{ amount_cents: 100000, created_at: "2026-05-03T00:00:00Z", status: "completed" }];
    const v = computeRevenueVitals(payments, now);
    expect(v.lastMonthCents).toBe(0);
    expect(v.pctChange).toBeNull();
    expect(v.trend).toBe("up");
  });

  it("produces a 6-bucket sparkline oldest-to-newest ending with this month", () => {
    const payments = [{ amount_cents: 1400000, created_at: "2026-05-03T00:00:00Z", status: "completed" }];
    const v = computeRevenueVitals(payments, now);
    expect(v.sparkline).toHaveLength(6);
    expect(v.sparkline[5]).toBe(1400000);
  });
});

describe("computeLeadPipeline", () => {
  it("buckets by status and excludes closed_lost", () => {
    const leads = [
      { status: "new" }, { status: "new" }, { status: "contacted" },
      { status: "qualified" }, { status: "booked" }, { status: "client" },
      { status: "closed_lost" },
    ];
    const p = computeLeadPipeline(leads);
    expect(p).toEqual({ new: 2, contacted: 1, qualified: 1, booked: 1, won: 1 });
  });
});

describe("computeContentPipeline", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();
  it("counts drafts, scheduled, and published-in-last-7-days", () => {
    const content = [
      { status: "draft", published_at: null },
      { status: "draft", published_at: null },
      { status: "scheduled", published_at: null },
      { status: "published", published_at: "2026-05-12T00:00:00Z" }, // within 7d
      { status: "published", published_at: "2026-05-01T00:00:00Z" }, // older than 7d
    ];
    expect(computeContentPipeline(content, now)).toEqual({ draft: 2, scheduled: 1, publishedThisWeek: 1 });
  });
});

describe("computeRevenueByOffering", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();
  it("attributes this-month completed payments, counts active members, computes capacity", () => {
    const offerings = [
      { id: "o1", name: "Cohort", status: "active", price_cents: 200000, capacity: 10 },
      { id: "o2", name: "Archived", status: "archived", price_cents: 100000, capacity: 5 },
    ];
    const members = [
      { offering_id: "o1", status: "active" },
      { offering_id: "o1", status: "active" },
      { offering_id: "o1", status: "dropped" },
    ];
    const payments = [
      { offering_id: "o1", amount_cents: 200000, status: "completed", created_at: "2026-05-02T00:00:00Z" },
      { offering_id: "o1", amount_cents: 200000, status: "completed", created_at: "2026-04-02T00:00:00Z" }, // last month
    ];
    const rows = computeRevenueByOffering(offerings, members, payments, now);
    expect(rows).toHaveLength(1); // archived excluded
    expect(rows[0]).toMatchObject({
      id: "o1", name: "Cohort", revenueCents: 200000, enrolled: 2,
      capacity: 10, priceCents: 200000, pctFull: 20, projectedCents: 2000000,
    });
  });

  it("null pctFull + projected when capacity is null", () => {
    const rows = computeRevenueByOffering(
      [{ id: "o1", name: "1:1", status: "active", price_cents: 1200000, capacity: null }],
      [{ offering_id: "o1", status: "active" }],
      [], now,
    );
    expect(rows[0].pctFull).toBeNull();
    expect(rows[0].projectedCents).toBeNull();
  });
});

describe("computeThisWeek", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();
  it("returns events in the next 7 days with client name resolved, sorted ascending", () => {
    const events = [
      { id: "e1", title: "Group call", starts_at: "2026-05-17T10:00:00Z", meeting_url: "https://z/1", client_room_id: null },
      { id: "e2", title: "Marcus 1:1", starts_at: "2026-05-16T14:00:00Z", meeting_url: null, client_room_id: "r1" },
      { id: "e3", title: "Too far", starts_at: "2026-05-30T10:00:00Z", meeting_url: null, client_room_id: null },
      { id: "e4", title: "Past", starts_at: "2026-05-10T10:00:00Z", meeting_url: null, client_room_id: null },
    ];
    const rooms = [{ id: "r1", lead_id: "l1" }];
    const leads = [{ id: "l1", full_name: "Marcus Lee" }];
    const week = computeThisWeek(events, rooms, leads, now);
    expect(week.map((w) => w.id)).toEqual(["e2", "e1"]);
    expect(week[0].clientName).toBe("Marcus Lee");
    expect(week[1].clientName).toBeNull();
  });
});
