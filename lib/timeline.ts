// lib/timeline.ts
import type { LeadMessage, Lead } from "@/lib/types";
import type { CoachingSession } from "@/lib/session-intelligence";

// ── Types ─────────────────────────────────────────────────────────────

export type TimelineEventKind =
  | "message_outbound"
  | "message_inbound"
  | "session"
  | "payment"
  | "brand_os"
  | "quiz"
  | "status_change"
  | "lead_created";

export type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  timestamp: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
  accent: "green" | "indigo" | "amber" | "blue" | "none";
  linkTo?: string;
};

export type ContactSummary = {
  totalSessions: number;
  totalPaidCents: number;
  brandOsStatus: "complete" | "in_progress" | "not_started";
  brandOsStep: number;
  clientSince: string | null;
  nextSessionDate: string | null;
};

// ── Normalizers ───────────────────────────────────────────────────────

export function normalizeMessages(messages: LeadMessage[]): TimelineEvent[] {
  return messages.map((m) => ({
    id: `msg-${m.id}`,
    kind: m.direction === "outbound" ? "message_outbound" : "message_inbound",
    timestamp: m.sent_at ?? m.created_at,
    title: m.direction === "outbound" ? "You sent a message" : "They replied",
    subtitle: m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content,
    accent: "none" as const,
    metadata: { channel: m.channel, ai_drafted: m.ai_drafted },
  }));
}

type PaymentRow = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  customer_email: string | null;
  created_at: string;
};

export function normalizePayments(payments: PaymentRow[]): TimelineEvent[] {
  return payments.map((p) => {
    const dollars = (p.amount_cents / 100).toFixed(p.amount_cents % 100 === 0 ? 0 : 2);
    const failed = p.status === "failed" || p.status === "refunded";
    return {
      id: `pay-${p.id}`,
      kind: "payment" as const,
      timestamp: p.created_at,
      title: failed
        ? `Payment ${p.status} — $${dollars}`
        : `Payment received — $${dollars}`,
      accent: "none" as const,
      metadata: { status: p.status, amount_cents: p.amount_cents },
    };
  });
}

export function normalizeSessions(sessions: CoachingSession[]): TimelineEvent[] {
  return sessions.map((s, i, arr) => ({
    id: `ses-${s.id}`,
    kind: "session" as const,
    timestamp: s.session_date,
    title: `Session #${arr.length - i} completed`,
    subtitle: s.ai_summary
      ? s.ai_summary.length > 150
        ? s.ai_summary.slice(0, 150) + "…"
        : s.ai_summary
      : undefined,
    accent: "green" as const,
    linkTo: `/sessions/${s.id}`,
    metadata: {
      commitments_count: s.commitments.length,
      somatic_count: s.somatic_observations.length,
      key_topics: s.key_topics,
    },
  }));
}

type BrandOsRow = {
  id: string;
  coach_id: string;
  audience: string | null;
  current_module: string | null;
  started_at: string | null;
  completed_at: string | null;
  label: string | null;
};

export function normalizeBrandOs(runs: BrandOsRow[]): TimelineEvent[] {
  return runs.map((r) => {
    const step = moduleToStep(r.current_module);
    const done = r.completed_at != null;
    return {
      id: `bos-${r.id}`,
      kind: "brand_os" as const,
      timestamp: r.completed_at ?? r.started_at ?? r.id,
      title: done
        ? `Brand OS — Complete`
        : `Brand OS — Step ${step} in progress`,
      subtitle: r.label ?? undefined,
      accent: "indigo" as const,
      linkTo: `/brand-os`,
      metadata: { step, complete: done },
    };
  });
}

function moduleToStep(mod: string | null): number {
  if (!mod) return 1;
  const map: Record<string, number> = {
    avatar: 1,
    voice: 2,
    pillars: 3,
    content: 4,
  };
  return map[mod.toLowerCase()] ?? 1;
}

type FunnelEventRow = {
  id: string;
  coach_id: string;
  name: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export function normalizeFunnelEvents(events: FunnelEventRow[]): TimelineEvent[] {
  return events
    .filter((e) => e.name === "quiz_completed" || e.name === "funnel_completed")
    .map((e) => ({
      id: `fun-${e.id}`,
      kind: "quiz" as const,
      timestamp: e.created_at,
      title: "Quiz completed",
      accent: "amber" as const,
      metadata: e.meta as Record<string, string | number | boolean> | undefined,
    }));
}

type TripwireRow = { id: string; email: string; amount: number; created_at: string };
type SubscriptionRow = {
  id: string;
  customer_email: string;
  amount: number;
  status: string;
  interval: string | null;
  created_at: string;
};

export function normalizeTripwires(rows: TripwireRow[]): TimelineEvent[] {
  return rows.map((r) => ({
    id: `trp-${r.id}`,
    kind: "payment" as const,
    timestamp: r.created_at,
    title: `Tripwire payment — $${r.amount}`,
    accent: "none" as const,
    metadata: { status: "paid", amount_cents: r.amount * 100 },
  }));
}

export function normalizeSubscriptions(rows: SubscriptionRow[]): TimelineEvent[] {
  return rows.map((r) => {
    const failed = r.status === "canceled" || r.status === "past_due";
    return {
      id: `sub-${r.id}`,
      kind: "payment" as const,
      timestamp: r.created_at,
      title: failed
        ? `Subscription ${r.status} — $${r.amount}`
        : `Subscription started — $${r.amount}/${r.interval ?? "mo"}`,
      accent: "none" as const,
      metadata: { status: r.status, amount_cents: r.amount * 100 },
    };
  });
}

export function normalizeLeadLifecycle(lead: Lead): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `lc-created-${lead.id}`,
      kind: "lead_created",
      timestamp: lead.created_at,
      title: "Lead created",
      subtitle: `via ${lead.source}`,
      accent: "none",
    },
  ];
  if (lead.status === "client" || lead.status === "closed_lost") {
    events.push({
      id: `lc-status-${lead.id}`,
      kind: "status_change",
      timestamp: lead.updated_at,
      title: `Status changed to ${lead.status.replace("_", " ")}`,
      accent: "none",
    });
  }
  return events;
}

// ── Merge + Sort ──────────────────────────────────────────────────────

export function mergeTimeline(...sources: TimelineEvent[][]): TimelineEvent[] {
  return sources
    .flat()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ── Day grouping ──────────────────────────────────────────────────────

export type DayGroup = { label: string; date: string; events: TimelineEvent[] };

export function groupByDay(events: TimelineEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (const ev of events) {
    const date = ev.timestamp.slice(0, 10);
    if (!current || current.date !== date) {
      let label: string = date;
      if (date === today) label = "Today";
      else if (date === yesterday) label = "Yesterday";
      else label = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
      current = { label, date, events: [] };
      groups.push(current);
    }
    current.events.push(ev);
  }
  return groups;
}

// ── Summary computation ───────────────────────────────────────────────

export function computeSummary(
  lead: Lead,
  sessions: CoachingSession[],
  payments: PaymentRow[],
  brandOsRuns: BrandOsRow[],
): ContactSummary {
  const paidPayments = payments.filter((p) => p.status === "succeeded" || p.status === "paid");
  const totalPaidCents = paidPayments.reduce((sum, p) => sum + p.amount_cents, 0);

  let brandOsStatus: ContactSummary["brandOsStatus"] = "not_started";
  let brandOsStep = 0;
  if (brandOsRuns.length > 0) {
    const latest = brandOsRuns[0];
    brandOsStep = moduleToStep(latest.current_module);
    brandOsStatus = latest.completed_at ? "complete" : "in_progress";
  }

  const futureSessions = sessions
    .filter((s) => new Date(s.session_date) > new Date())
    .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());

  return {
    totalSessions: sessions.length,
    totalPaidCents,
    brandOsStatus,
    brandOsStep,
    clientSince: lead.status === "client" ? lead.updated_at : null,
    nextSessionDate: futureSessions[0]?.session_date ?? null,
  };
}
