// lib/admin-dashboard.ts
//
// Admin Mode data layer. Structured aggregations for the working
// dashboard (vitals + boxes). NO AI — display data only.

import { createClient } from "@/lib/supabase-server";
import { summarizeTrust } from "@/lib/voice-trust";
import { scoreRightNowItems, type RightNowItem, type RawPulseData } from "@/lib/ambient";

// ── Types ─────────────────────────────────────────────────────────────

export type AdminDashboard = {
  monthLabel: string;
  vitals: {
    revenue: {
      thisMonthCents: number;
      lastMonthCents: number;
      trend: "up" | "down" | "flat";
      pctChange: number | null;
      sparkline: number[]; // 6 buckets, oldest→newest (cents)
    };
    members: { active: number; newThisMonth: number; offeringCount: number };
    sessions: { thisMonth: number; upcomingThisWeek: number };
    trust: { rate: number | null };
  };
  attention: RightNowItem[];
  content: { draft: number; scheduled: number; publishedThisWeek: number };
  revenueByOffering: Array<{
    id: string;
    name: string;
    revenueCents: number;
    enrolled: number;
    capacity: number | null;
    priceCents: number | null;
    pctFull: number | null;
    projectedCents: number | null;
  }>;
  leadPipeline: { new: number; contacted: number; qualified: number; booked: number; won: number };
  thisWeek: Array<{ id: string; title: string; startsAt: string; clientName: string | null; meetingUrl: string | null }>;
};

// ── Pure helper: revenue vitals ───────────────────────────────────────

type PaymentRow = { amount_cents: number; created_at: string; status: string };

function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function computeRevenueVitals(
  payments: PaymentRow[],
  now: number,
): AdminDashboard["vitals"]["revenue"] {
  const nowDate = new Date(now);
  const thisIdx = monthIndex(nowDate);

  // 6 buckets: thisIdx-5 .. thisIdx
  const buckets = [0, 0, 0, 0, 0, 0];
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const idx = monthIndex(new Date(p.created_at));
    const slot = idx - (thisIdx - 5);
    if (slot >= 0 && slot <= 5) buckets[slot] += p.amount_cents;
  }

  const thisMonthCents = buckets[5];
  const lastMonthCents = buckets[4];
  const pctChange =
    lastMonthCents > 0
      ? Math.round(((thisMonthCents - lastMonthCents) / lastMonthCents) * 100)
      : null;
  const trend: "up" | "down" | "flat" =
    thisMonthCents > lastMonthCents ? "up" : thisMonthCents < lastMonthCents ? "down" : "flat";

  return { thisMonthCents, lastMonthCents, trend, pctChange, sparkline: buckets };
}
