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

// ── Pure helper: revenue by offering ──────────────────────────────────

export function computeRevenueByOffering(
  offerings: Array<{ id: string; name: string; status: string; price_cents: number | null; capacity: number | null }>,
  members: Array<{ offering_id: string; status: string }>,
  payments: Array<{ offering_id: string | null; amount_cents: number; status: string; created_at: string }>,
  now: number,
): AdminDashboard["revenueByOffering"] {
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const revByOffering = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "completed" || !p.offering_id) continue;
    if (new Date(p.created_at).getTime() < monthStartMs) continue;
    revByOffering.set(p.offering_id, (revByOffering.get(p.offering_id) ?? 0) + p.amount_cents);
  }

  const activeByOffering = new Map<string, number>();
  for (const m of members) {
    if (m.status !== "active") continue;
    activeByOffering.set(m.offering_id, (activeByOffering.get(m.offering_id) ?? 0) + 1);
  }

  return offerings
    .filter((o) => o.status === "active")
    .map((o) => {
      const enrolled = activeByOffering.get(o.id) ?? 0;
      const pctFull = o.capacity != null && o.capacity > 0 ? Math.round((enrolled / o.capacity) * 100) : null;
      const projectedCents =
        o.capacity != null && o.price_cents != null && enrolled < o.capacity
          ? o.capacity * o.price_cents
          : null;
      return {
        id: o.id,
        name: o.name,
        revenueCents: revByOffering.get(o.id) ?? 0,
        enrolled,
        capacity: o.capacity,
        priceCents: o.price_cents,
        pctFull,
        projectedCents,
      };
    });
}

// ── Pure helper: this week ────────────────────────────────────────────

export function computeThisWeek(
  events: Array<{ id: string; title: string; starts_at: string; meeting_url: string | null; client_room_id: string | null }>,
  rooms: Array<{ id: string; lead_id: string }>,
  leads: Array<{ id: string; full_name: string }>,
  now: number,
): AdminDashboard["thisWeek"] {
  const weekEnd = now + 7 * 86_400_000;
  const roomToLead = new Map(rooms.map((r) => [r.id, r.lead_id]));
  const leadName = new Map(leads.map((l) => [l.id, l.full_name]));

  return events
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return t > now && t <= weekEnd;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((e) => {
      const leadId = e.client_room_id ? roomToLead.get(e.client_room_id) ?? null : null;
      return {
        id: e.id,
        title: e.title,
        startsAt: e.starts_at,
        clientName: leadId ? leadName.get(leadId) ?? null : null,
        meetingUrl: e.meeting_url,
      };
    });
}
