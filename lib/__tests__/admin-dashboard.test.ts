import { describe, it, expect } from "vitest";
import { computeRevenueVitals } from "@/lib/admin-dashboard";

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
