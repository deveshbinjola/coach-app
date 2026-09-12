import { describe, it, expect } from "vitest";
import { computeLeadFunnel, LEAD_FUNNEL_STAGES, leadStageLabel } from "@/lib/funnel";

const NOW = new Date("2026-09-11T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("computeLeadFunnel", () => {
  it("returns all stages at zero when nothing happened", () => {
    const stats = computeLeadFunnel([], NOW);
    expect(stats.map((s) => s.stage)).toEqual([...LEAD_FUNNEL_STAGES]);
    expect(stats.every((s) => s.leads === 0 && s.pctOfStart === 0)).toBe(true);
  });

  it("counts distinct leads per stage and names the drop between stages", () => {
    const rows = [
      // 4 created, 2 contacted, 1 booked, 1 client, 1 paid
      { name: "lead_created", created_at: daysAgo(10), meta: { lead_id: "a" } },
      { name: "lead_created", created_at: daysAgo(9), meta: { lead_id: "b" } },
      { name: "lead_created", created_at: daysAgo(8), meta: { lead_id: "c" } },
      { name: "lead_created", created_at: daysAgo(7), meta: { lead_id: "d" } },
      { name: "lead_contacted", created_at: daysAgo(6), meta: { lead_id: "a" } },
      { name: "lead_contacted", created_at: daysAgo(6), meta: { lead_id: "b" } },
      // duplicate event for same lead must not double-count
      { name: "lead_contacted", created_at: daysAgo(5), meta: { lead_id: "b" } },
      { name: "lead_booked", created_at: daysAgo(4), meta: { lead_id: "a" } },
      { name: "lead_became_client", created_at: daysAgo(2), meta: { lead_id: "a" } },
      { name: "payment_received", created_at: daysAgo(1), meta: { lead_id: "a" } },
    ];
    const stats = computeLeadFunnel(rows, NOW);
    expect(stats.map((s) => s.leads)).toEqual([4, 2, 1, 1, 1]);
    expect(stats[1]!.dropFromPrev).toBe(50); // 4 -> 2
    expect(stats[2]!.dropFromPrev).toBe(50); // 2 -> 1
    expect(stats[3]!.dropFromPrev).toBe(0);  // held
    expect(stats[0]!.pctOfStart).toBe(100);
    expect(stats[4]!.pctOfStart).toBe(25);
  });

  it("ignores events outside the trailing window", () => {
    const stats = computeLeadFunnel(
      [
        { name: "lead_created", created_at: daysAgo(45), meta: { lead_id: "old" } },
        { name: "lead_created", created_at: daysAgo(2), meta: { lead_id: "fresh" } },
      ],
      NOW,
    );
    expect(stats[0]!.leads).toBe(1);
  });

  it("counts unlinked payment events once each — money without a lead_id must not vanish", () => {
    const stats = computeLeadFunnel(
      [
        { name: "payment_received", created_at: daysAgo(1), meta: null },
        { name: "payment_received", created_at: daysAgo(2), meta: {} },
      ],
      NOW,
    );
    expect(stats[4]!.leads).toBe(2);
  });

  it("ignores off-ladder and unknown event names", () => {
    const stats = computeLeadFunnel(
      [
        { name: "lead_enrolled", created_at: daysAgo(1), meta: { lead_id: "a" } },
        { name: "lead_closed_lost", created_at: daysAgo(1), meta: { lead_id: "a" } },
        { name: "signup_completed", created_at: daysAgo(1), meta: null },
      ],
      NOW,
    );
    expect(stats.every((s) => s.leads === 0)).toBe(true);
  });

  it("labels every stage in human words", () => {
    expect(LEAD_FUNNEL_STAGES.map(leadStageLabel)).toEqual(["New", "Contacted", "Booked", "Client", "Paid"]);
  });
});
