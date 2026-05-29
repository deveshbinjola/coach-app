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

// ── Pure helper: new-lead triage items (admin attention only) ─────────
// Coach mode never shows these — they live in the admin assembly so the
// calm Coach view stays untouched.

export function computeNewLeadItems(
  leads: Array<{ id: string; full_name: string; status: string; created_at: string }>,
  now: number,
): RightNowItem[] {
  const oneDayAgo = now - 86_400_000;
  return leads
    .filter((l) => l.status === "new" && new Date(l.created_at).getTime() < oneDayAgo)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((l) => ({
      id: `new-lead-${l.id}`,
      leadId: l.id,
      leadName: l.full_name,
      priority: 5,
      reason: "new lead, not contacted",
      action: { label: "Triage", href: `/leads/${l.id}`, type: "link" as const },
      source: "lead" as const,
    }));
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

// ── Orchestrator ──────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function getAdminDashboard(coachId: string, now: number): Promise<AdminDashboard> {
  const supabase = createClient();
  const nowDate = new Date(now);
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const sixMonthsAgo = new Date(now - 186 * 86_400_000).toISOString();
  const weekEnd = new Date(now + 7 * 86_400_000).toISOString();

  const [
    eventsRes, sessionsRes, leadsRes, messagesRes, enrollmentsRes,
    paymentsRes, membersRes, contentRes, roomsRes, offeringsRes, trustRes,
  ] = await Promise.all([
    supabase.from("cp_client_events").select("id, title, starts_at, meeting_url, client_room_id").eq("coach_id", coachId),
    supabase.from("cp_coaching_sessions").select("id, client_id, session_date, key_topics").eq("coach_id", coachId).gte("session_date", monthStart.toISOString()),
    supabase.from("cp_leads").select("id, full_name, status, created_at").eq("coach_id", coachId),
    supabase.from("cp_lead_messages").select("id, lead_id, direction, sent_at, created_at").eq("coach_id", coachId),
    supabase.from("cp_sequence_enrollments").select("id, lead_id, status, sequence_id").eq("coach_id", coachId).eq("status", "failed"),
    supabase.from("cp_payments").select("offering_id, amount_cents, status, created_at").eq("coach_id", coachId).gte("created_at", sixMonthsAgo),
    // cp_offering_members has no coach_id column — rely on RLS (matches offerings detail page pattern)
    supabase.from("cp_offering_members").select("id, offering_id, status, joined_at"),
    supabase.from("cp_content").select("id, title, status, published_at").eq("coach_id", coachId),
    supabase.from("cp_client_rooms").select("id, lead_id").eq("coach_id", coachId),
    supabase.from("cp_offerings").select("id, name, status, price_cents, capacity").eq("coach_id", coachId),
    supabase.from("cp_lead_messages").select("id, lead_id, coach_id, channel, direction, content, ai_drafted, was_edited, original_draft, created_at").eq("coach_id", coachId),
  ]);

  const events = eventsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const leads = (leadsRes.data ?? []) as Array<{ id: string; full_name: string; status: string; created_at: string }>;
  const messages = messagesRes.data ?? [];
  const enrollments = enrollmentsRes.data ?? [];
  const payments = (paymentsRes.data ?? []) as Array<{ offering_id: string | null; amount_cents: number; status: string; created_at: string }>;
  const members = (membersRes.data ?? []) as Array<{ id: string; offering_id: string; status: string; joined_at: string | null }>;
  const content = (contentRes.data ?? []) as Array<{ id: string; title: string; status: string; published_at: string | null }>;
  const rooms = (roomsRes.data ?? []) as Array<{ id: string; lead_id: string }>;
  const offerings = (offeringsRes.data ?? []) as Array<{ id: string; name: string; status: string; price_cents: number | null; capacity: number | null }>;

  // Attention: reuse the shared scorer (uncapped) + new-lead items, re-sorted.
  const rawData: RawPulseData = {
    calendarEvents: events.map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, meeting_url: e.meeting_url, client_room_id: e.client_room_id })),
    capturedToday: [],
    sessionsThisMonth: sessions.map((s) => ({ client_id: s.client_id, session_date: s.session_date })),
    activeClients: leads.map((l) => ({ id: l.id, full_name: l.full_name, status: l.status })),
    waitingMessages: messages.map((m) => ({ id: m.id, lead_id: m.lead_id, direction: m.direction, sent_at: m.sent_at, created_at: m.created_at })),
    failedEnrollments: enrollments.map((e) => ({ id: e.id, lead_id: e.lead_id, status: e.status, sequence_id: e.sequence_id })),
    paymentsWindow: payments.map((p) => ({ amount_cents: p.amount_cents, created_at: p.created_at })),
    activeMembers: members.map((m) => ({ id: m.id, status: m.status })),
    draftContent: content.filter((c) => c.status === "draft").map((c) => ({ id: c.id, title: c.title, status: c.status })),
    clientRooms: rooms.map((r) => ({ id: r.id, lead_id: r.lead_id })),
    now,
  };
  const scored = scoreRightNowItems(rawData, Infinity);
  const attention = [...scored, ...computeNewLeadItems(leads, now)].sort((a, b) => a.priority - b.priority);

  const trust = summarizeTrust((trustRes.data ?? []) as any, now);

  const monthStartIso = monthStart.toISOString();
  const newMembersThisMonth = members.filter((m) => m.status === "active" && m.joined_at && m.joined_at >= monthStartIso).length;
  const activeMembers = members.filter((m) => m.status === "active").length;
  const offeringCount = new Set(members.filter((m) => m.status === "active").map((m) => m.offering_id)).size;

  return {
    monthLabel: `${MONTHS[nowDate.getUTCMonth()]} ${nowDate.getUTCFullYear()}`,
    vitals: {
      revenue: computeRevenueVitals(payments, now),
      members: { active: activeMembers, newThisMonth: newMembersThisMonth, offeringCount },
      sessions: {
        thisMonth: sessions.length,
        upcomingThisWeek: events.filter((e) => e.starts_at > nowDate.toISOString() && e.starts_at <= weekEnd).length,
      },
      trust: { rate: trust.asIsPct28 },
    },
    attention,
    content: computeContentPipeline(content, now),
    revenueByOffering: computeRevenueByOffering(offerings, members, payments, now),
    leadPipeline: computeLeadPipeline(leads),
    thisWeek: computeThisWeek(events, rooms, leads, now),
  };
}
