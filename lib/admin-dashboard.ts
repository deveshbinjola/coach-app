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

// ── Pure helper: lead pipeline ────────────────────────────────────────

export function computeLeadPipeline(
  leads: Array<{ status: string }>,
): AdminDashboard["leadPipeline"] {
  const p = { new: 0, contacted: 0, qualified: 0, booked: 0, won: 0 };
  for (const l of leads) {
    if (l.status === "new") p.new++;
    else if (l.status === "contacted") p.contacted++;
    else if (l.status === "qualified") p.qualified++;
    else if (l.status === "booked") p.booked++;
    else if (l.status === "client") p.won++;
    // closed_lost intentionally excluded
  }
  return p;
}

// ── Pure helper: content pipeline ─────────────────────────────────────

export function computeContentPipeline(
  content: Array<{ status: string; published_at: string | null }>,
  now: number,
): AdminDashboard["content"] {
  const sevenDaysAgo = now - 7 * 86_400_000;
  let draft = 0, scheduled = 0, publishedThisWeek = 0;
  for (const c of content) {
    if (c.status === "draft") draft++;
    else if (c.status === "scheduled") scheduled++;
    else if (c.status === "published" && c.published_at && new Date(c.published_at).getTime() >= sevenDaysAgo) {
      publishedThisWeek++;
    }
  }
  return { draft, scheduled, publishedThisWeek };
}
