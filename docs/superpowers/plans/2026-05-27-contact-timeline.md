# Contact Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified timeline to `/leads/[id]` that merges messages, sessions, payments, Brand OS runs, quiz events, and status changes into one chronological feed with tabs and filter chips.

**Architecture:** Client-side merge. Server page fires 8 parallel Supabase queries, passes typed arrays to LeadDetail. A new `ContactTimeline` component normalizes each array into `TimelineEvent[]`, sorts by date descending, groups by day, and renders event cards. Tab state lives in LeadDetail; the existing messages view becomes one tab.

**Tech Stack:** Next.js (edge runtime), Supabase, React, existing UI primitives (Badge, Card), CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-05-27-contact-timeline-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/timeline.ts` | Create | TimelineEvent type, 8 normalizer fns, mergeTimeline(), computeSummary() |
| `components/TabBar.tsx` | Create | Generic reusable tab bar (used by LeadDetail) |
| `components/SummaryCard.tsx` | Create | Sidebar summary: session count, total paid, Brand OS status |
| `components/ContactTimeline.tsx` | Create | Timeline renderer: day groups, event cards, filter chips |
| `app/leads/[id]/page.tsx` | Modify | Add 5 parallel queries, pass new props to LeadDetail |
| `components/LeadDetail.tsx` | Modify | Add tab state, render TabBar/ContactTimeline/SummaryCard, wrap existing messages in tab |

---

### Task 1: Timeline types and normalizers (`lib/timeline.ts`)

**Files:**
- Create: `lib/timeline.ts`

- [ ] **Step 1: Create the TimelineEvent type and normalizer functions**

```typescript
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
      let label = date;
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx tsc --noEmit lib/timeline.ts 2>&1 | head -20`

Expected: no errors (or only errors from unresolved path aliases, which is fine — the build will resolve them).

- [ ] **Step 3: Commit**

```bash
git add lib/timeline.ts
git commit -m "feat(timeline): add TimelineEvent types, normalizers, merge, and summary"
```

---

### Task 2: TabBar component (`components/TabBar.tsx`)

**Files:**
- Create: `components/TabBar.tsx`

- [ ] **Step 1: Create the TabBar component**

```tsx
// components/TabBar.tsx
"use client";

type Tab = { key: string; label: string; count?: number };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

export default function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div className="flex gap-0 border-b border-[var(--border-faint)] mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            "px-4 py-2 text-[length:var(--t-caption)] font-bold transition-colors",
            active === tab.key
              ? "text-[color:var(--brand)] border-b-2 border-[var(--brand)]"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
          ].join(" ")}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-[color:var(--text-faint)]">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TabBar.tsx
git commit -m "feat(timeline): add reusable TabBar component"
```

---

### Task 3: SummaryCard component (`components/SummaryCard.tsx`)

**Files:**
- Create: `components/SummaryCard.tsx`

- [ ] **Step 1: Create the SummaryCard component**

```tsx
// components/SummaryCard.tsx
"use client";

import type { ContactSummary } from "@/lib/timeline";

export default function SummaryCard({ summary }: { summary: ContactSummary }) {
  const dollars = summary.totalPaidCents > 0
    ? `$${(summary.totalPaidCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "$0";

  const brandLabel =
    summary.brandOsStatus === "complete"
      ? "Complete ✓"
      : summary.brandOsStatus === "in_progress"
        ? `Step ${summary.brandOsStep}/4`
        : "Not started";

  const brandColor =
    summary.brandOsStatus === "complete"
      ? "var(--brand)"
      : summary.brandOsStatus === "in_progress"
        ? "var(--info)"
        : "var(--text-faint)";

  return (
    <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_4%,var(--surface-elevated))] p-3 mb-3">
      <div className="text-[length:var(--t-caption)] leading-relaxed">
        <span className="font-bold text-[color:var(--brand)]">{summary.totalSessions}</span>
        <span className="text-[color:var(--text-muted)]"> sessions · </span>
        <span className="font-bold text-[color:var(--brand)]">{dollars}</span>
        <span className="text-[color:var(--text-muted)]"> paid</span>
      </div>
      <div className="text-[length:var(--t-caption)] mt-1">
        <span className="text-[color:var(--text-muted)]">Brand OS: </span>
        <span style={{ color: brandColor }} className="font-bold">{brandLabel}</span>
      </div>
      {summary.clientSince && (
        <div className="text-[10px] text-[color:var(--text-faint)] mt-1">
          Client since {new Date(summary.clientSince).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      )}
      {summary.nextSessionDate && (
        <div className="text-[10px] text-[color:var(--text-faint)] mt-0.5">
          Next: {new Date(summary.nextSessionDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SummaryCard.tsx
git commit -m "feat(timeline): add SummaryCard sidebar component"
```

---

### Task 4: ContactTimeline component (`components/ContactTimeline.tsx`)

**Files:**
- Create: `components/ContactTimeline.tsx`

- [ ] **Step 1: Create the ContactTimeline component with filter chips and event card rendering**

```tsx
// components/ContactTimeline.tsx
"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { TimelineEvent, TimelineEventKind, DayGroup } from "@/lib/timeline";
import { groupByDay } from "@/lib/timeline";

// ── Filter types ──────────────────────────────────────────────────────

type FilterKey = "all" | "messages" | "sessions" | "payments" | "brand_os";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "sessions", label: "Sessions" },
  { key: "payments", label: "Payments" },
  { key: "brand_os", label: "Brand OS" },
];

const FILTER_KINDS: Record<FilterKey, TimelineEventKind[] | null> = {
  all: null,
  messages: ["message_outbound", "message_inbound"],
  sessions: ["session"],
  payments: ["payment"],
  brand_os: ["brand_os", "quiz"],
};

// Structural events always show (lead_created, status_change)
const STRUCTURAL: TimelineEventKind[] = ["lead_created", "status_change"];

// ── Main component ────────────────────────────────────────────────────

export default function ContactTimeline({ events }: { events: TimelineEvent[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const kinds = FILTER_KINDS[filter];
    if (!kinds) return events;
    return events.filter(
      (e) => kinds.includes(e.kind) || STRUCTURAL.includes(e.kind),
    );
  }, [events, filter]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
        No activity yet. Events will appear here as you interact with this lead.
      </div>
    );
  }

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
              filter === f.key
                ? "bg-[var(--brand-soft)] text-[color:var(--brand)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                : "border border-[var(--border-faint)] text-[color:var(--text-muted)] hover:border-[var(--border)]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Day groups */}
      {groups.map((group) => (
        <div key={group.date} className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-faint)] pb-1.5 mb-3 border-b border-[var(--border-faint)]">
            {group.label}
          </div>
          <div className="space-y-2">
            {group.events.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Event card renderer ───────────────────────────────────────────────

const ICONS: Record<TimelineEventKind, string> = {
  session: "🧠",
  payment: "💳",
  brand_os: "📊",
  quiz: "📝",
  message_outbound: "↑",
  message_inbound: "↓",
  status_change: "⟳",
  lead_created: "+",
};

const ACCENT_BORDER: Record<TimelineEvent["accent"], string> = {
  green: "border-l-[3px] border-l-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_4%,var(--surface-elevated))]",
  indigo: "border-l-[3px] border-l-[#6366f1] bg-[color-mix(in_srgb,#6366f1_4%,var(--surface-elevated))]",
  amber: "border-l-[3px] border-l-[#fbbf24] bg-[color-mix(in_srgb,#fbbf24_4%,var(--surface-elevated))]",
  blue: "border-l-[3px] border-l-[var(--info)] bg-[color-mix(in_srgb,var(--info)_4%,var(--surface-elevated))]",
  none: "bg-[var(--surface-deep)]",
};

const ICON_BG: Record<TimelineEvent["accent"], string> = {
  green: "bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface-elevated))] text-[color:var(--brand)]",
  indigo: "bg-[color-mix(in_srgb,#6366f1_10%,var(--surface-elevated))] text-[#6366f1]",
  amber: "bg-[color-mix(in_srgb,#fbbf24_10%,var(--surface-elevated))] text-[#fbbf24]",
  blue: "bg-[color-mix(in_srgb,var(--info)_10%,var(--surface-elevated))] text-[color:var(--info)]",
  none: "bg-[var(--surface-deep)] text-[color:var(--text-faint)]",
};

function EventCard({ event }: { event: TimelineEvent }) {
  const isMinimal = event.kind === "status_change" || event.kind === "lead_created";
  const icon = ICONS[event.kind];
  const time = formatTime(event.timestamp);

  if (isMinimal) {
    return (
      <div className="flex gap-3 items-center px-3 py-1.5">
        <div className="w-7 h-7 rounded-md bg-[var(--surface-deep)] flex items-center justify-center text-[13px] text-[color:var(--text-faint)] shrink-0">
          {icon}
        </div>
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] flex-1">
          {event.title}
          {event.subtitle && (
            <span className="text-[color:var(--text-faint)]"> {event.subtitle}</span>
          )}
        </div>
        <div className="text-[11px] text-[color:var(--text-faint)] whitespace-nowrap">{time}</div>
      </div>
    );
  }

  const accent = event.accent;

  return (
    <div className={`flex gap-3 items-start p-3 rounded-[var(--r-md)] ${ACCENT_BORDER[accent]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shrink-0 ${ICON_BG[accent]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
            {event.title}
          </div>
          <div className="text-[11px] text-[color:var(--text-faint)] whitespace-nowrap">{time}</div>
        </div>
        {event.subtitle && (
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-relaxed">
            {event.subtitle}
          </div>
        )}
        {/* Session-specific badges */}
        {event.kind === "session" && event.metadata && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {(event.metadata.commitments_count as number) > 0 && (
              <Badge tone="brand" size="xs">
                {event.metadata.commitments_count as number} commitment{(event.metadata.commitments_count as number) !== 1 ? "s" : ""}
              </Badge>
            )}
            {(event.metadata.somatic_count as number) > 0 && (
              <Badge tone="info" size="xs">
                {event.metadata.somatic_count as number} somatic note{(event.metadata.somatic_count as number) !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
        {/* Quiz answer grid */}
        {event.kind === "quiz" && event.metadata && (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {Object.entries(event.metadata)
              .filter(([k]) => typeof event.metadata![k] === "string" || typeof event.metadata![k] === "number")
              .slice(0, 4)
              .map(([key, val]) => (
                <div
                  key={key}
                  className="text-[11px] px-2 py-1 rounded bg-[var(--surface-deep)]"
                >
                  <span className="text-[color:var(--text-faint)]">
                    {key.replace(/_/g, " ")}:
                  </span>{" "}
                  <span className="text-[color:var(--text)]">{String(val)}</span>
                </div>
              ))}
          </div>
        )}
        {/* Brand OS progress dots */}
        {event.kind === "brand_os" && event.metadata && (
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-4 h-1 rounded-full ${
                  step <= (event.metadata!.step as number)
                    ? "bg-[#6366f1]"
                    : "bg-[var(--border-faint)]"
                }`}
              />
            ))}
          </div>
        )}
        {event.linkTo && (
          <a
            href={event.linkTo}
            className="text-[11px] font-bold mt-2 inline-block transition-colors"
            style={{ color: accent === "indigo" ? "#6366f1" : accent === "amber" ? "#fbbf24" : "var(--brand)" }}
          >
            → View details
          </a>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ContactTimeline.tsx
git commit -m "feat(timeline): add ContactTimeline component with filter chips and event cards"
```

---

### Task 5: Add parallel queries to page.tsx

**Files:**
- Modify: `app/leads/[id]/page.tsx`

- [ ] **Step 1: Add imports for CoachingSession type**

At the top of `app/leads/[id]/page.tsx`, add after the existing imports:

```typescript
import type { CoachingSession } from "@/lib/session-intelligence";
```

- [ ] **Step 2: Add 5 new parallel queries inside the existing Promise.all block**

Replace the existing `Promise.all` block (the referrer/referrals section) with a larger parallel fetch. The new block goes right after `const typedLead = lead as Lead;`:

Find the existing code:
```typescript
  const [referrerRes, referralsRes] = await Promise.all([
    typedLead.referred_by_lead_id
      ? supabase
          .from("cp_leads")
          .select("id, full_name, status")
          .eq("id", typedLead.referred_by_lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("cp_leads")
      .select("id, full_name, status")
      .eq("referred_by_lead_id", params.id),
  ]);
```

Replace with:
```typescript
  const [referrerRes, referralsRes, sessionsRes, paymentsRes, brandOsRes, funnelRes, subsRes, tripRes] = await Promise.all([
    typedLead.referred_by_lead_id
      ? supabase
          .from("cp_leads")
          .select("id, full_name, status")
          .eq("id", typedLead.referred_by_lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("cp_leads")
      .select("id, full_name, status")
      .eq("referred_by_lead_id", params.id),
    // Timeline: coaching sessions for this lead
    supabase
      .from("cp_coaching_sessions")
      .select("*")
      .eq("client_id", params.id)
      .eq("coach_id", user?.id ?? "")
      .order("session_date", { ascending: false }),
    // Timeline: payments by this lead's email
    typedLead.email
      ? supabase
          .from("cp_payments")
          .select("id, amount_cents, currency, status, customer_email, created_at")
          .eq("customer_email", typedLead.email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // Timeline: Brand OS runs
    supabase
      .from("cp_brand_os_runs")
      .select("id, coach_id, audience, current_module, started_at, completed_at, label")
      .eq("coach_id", user?.id ?? "")
      .order("started_at", { ascending: false }),
    // Timeline: funnel events
    supabase
      .from("cp_funnel_events")
      .select("id, coach_id, name, meta, created_at")
      .eq("coach_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(20),
    // Timeline: subscriptions
    typedLead.email
      ? supabase
          .from("cp_subscriptions")
          .select("id, customer_email, amount, status, interval, created_at")
          .eq("customer_email", typedLead.email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // Timeline: tripwire purchases
    typedLead.email
      ? supabase
          .from("cp_tripwire_purchases")
          .select("id, email, amount, created_at")
          .eq("email", typedLead.email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
```

- [ ] **Step 3: Pass new data as props to LeadDetail**

Find the existing `<LeadDetail` JSX and add the new props. After the existing props:

```tsx
        <LeadDetail
          lead={typedLead}
          initialMessages={(messages ?? []) as LeadMessage[]}
          referrer={referrer}
          referrals={referrals}
          voiceProfileSlug={voiceProfileSlug}
          sessions={(sessionsRes.data ?? []) as CoachingSession[]}
          payments={(paymentsRes.data ?? []) as any[]}
          brandOsRuns={(brandOsRes.data ?? []) as any[]}
          funnelEvents={(funnelRes.data ?? []) as any[]}
          subscriptions={(subsRes.data ?? []) as any[]}
          tripwires={(tripRes.data ?? []) as any[]}
        />
```

- [ ] **Step 4: Commit**

```bash
git add app/leads/\\[id\\]/page.tsx
git commit -m "feat(timeline): add parallel timeline queries to lead detail page"
```

---

### Task 6: Wire timeline into LeadDetail

**Files:**
- Modify: `components/LeadDetail.tsx`

- [ ] **Step 1: Add imports at the top of LeadDetail.tsx**

Add after existing imports:

```typescript
import TabBar from "./TabBar";
import SummaryCard from "./SummaryCard";
import ContactTimeline from "./ContactTimeline";
import type { CoachingSession } from "@/lib/session-intelligence";
import {
  mergeTimeline,
  computeSummary,
  normalizeMessages,
  normalizeSessions,
  normalizePayments,
  normalizeBrandOs,
  normalizeFunnelEvents,
  normalizeSubscriptions,
  normalizeTripwires,
  normalizeLeadLifecycle,
  type TimelineEvent,
} from "@/lib/timeline";
```

- [ ] **Step 2: Add new props to the component signature**

Find the existing props type in the function signature and add the timeline data props:

```typescript
export default function LeadDetail({
  lead,
  initialMessages,
  referrer,
  referrals,
  voiceProfileSlug,
  sessions = [],
  payments = [],
  brandOsRuns = [],
  funnelEvents = [],
  subscriptions = [],
  tripwires = [],
}: {
  lead: Lead;
  initialMessages: LeadMessage[];
  referrer?: ReferralRef | null;
  referrals?: ReferralRef[];
  voiceProfileSlug?: import("@/lib/voice-profiles").VoiceProfileSlug;
  sessions?: CoachingSession[];
  payments?: any[];
  brandOsRuns?: any[];
  funnelEvents?: any[];
  subscriptions?: any[];
  tripwires?: any[];
}) {
```

- [ ] **Step 3: Add tab state and timeline computation**

After the existing `useState` declarations (around line 67, after `const [currentLead, setCurrentLead] = useState<Lead>(lead);`), add:

```typescript
  const [activeTab, setActiveTab] = useState<string>("timeline");

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    return mergeTimeline(
      normalizeMessages(messages),
      normalizeSessions(sessions),
      normalizePayments(payments),
      normalizeBrandOs(brandOsRuns),
      normalizeFunnelEvents(funnelEvents),
      normalizeSubscriptions(subscriptions),
      normalizeTripwires(tripwires),
      normalizeLeadLifecycle(currentLead),
    );
  }, [messages, sessions, payments, brandOsRuns, funnelEvents, subscriptions, tripwires, currentLead]);

  const summary = useMemo(
    () => computeSummary(currentLead, sessions, payments, brandOsRuns),
    [currentLead, sessions, payments, brandOsRuns],
  );

  const TABS = useMemo(() => [
    { key: "timeline", label: "Timeline", count: timelineEvents.length },
    { key: "messages", label: "Messages", count: messages.length },
    { key: "sessions", label: "Sessions", count: sessions.length },
  ], [timelineEvents.length, messages.length, sessions.length]);
```

- [ ] **Step 4: Add SummaryCard to the sidebar**

In the JSX return, find the `<aside>` element. Right after the opening `<aside>` tag and the name/edit header `<div>`, insert the SummaryCard before the SLA badge:

Find:
```tsx
        <div className="mt-2">
          <SlaBadge lead={lead} />
        </div>
```

Insert before it:
```tsx
        <SummaryCard summary={summary} />
```

- [ ] **Step 5: Add TabBar and wrap existing content in tab conditionals**

In the center `<section>` column, find where the message conversation currently starts. Add the TabBar right after the section opens, and wrap the existing message thread and compose box in a tab conditional.

Add right after `<section className="md:col-span-2 space-y-4">` (or wherever the main content section opens):

```tsx
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {activeTab === "timeline" && (
          <ContactTimeline events={timelineEvents} />
        )}

        {activeTab === "sessions" && (
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <div className="py-8 text-center text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
                No sessions yet.
              </div>
            ) : (
              sessions.map((s) => (
                <a
                  key={s.id}
                  href={`/sessions/${s.id}`}
                  className="block p-4 rounded-[var(--r-md)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] hover:border-[var(--border)] transition-colors"
                >
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-[length:var(--t-caption)] text-[color:var(--text)]">
                      {new Date(s.session_date).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                    {s.duration_minutes && (
                      <span className="text-[11px] text-[color:var(--text-faint)]">
                        {s.duration_minutes} min
                      </span>
                    )}
                  </div>
                  {s.ai_summary && (
                    <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 line-clamp-2">
                      {s.ai_summary}
                    </div>
                  )}
                </a>
              ))
            )}
          </div>
        )}

        {activeTab === "messages" && (
```

Then wrap the existing message thread / conversation UI and compose box with the conditional, and close it with `)}` after the compose box Card.

The existing conversation rendering + compose box becomes visible only when `activeTab === "messages"`. The ObjectionDeck, lead memory card, and "Turn into content" CTA stay outside any tab conditional (visible on all tabs).

- [ ] **Step 6: Verify the app compiles**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx next build 2>&1 | tail -20`

If there are type errors, fix them. Common issues:
- Missing import for `useMemo` (already imported in existing code)
- The `any[]` prop types — acceptable for now, matches the untyped Supabase response

- [ ] **Step 7: Commit**

```bash
git add components/LeadDetail.tsx
git commit -m "feat(timeline): wire TabBar, SummaryCard, ContactTimeline into LeadDetail"
```

---

### Task 7: Visual smoke test

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npm run dev`

- [ ] **Step 2: Navigate to a lead detail page**

Open `http://localhost:3000/leads/<any-lead-id>` in the browser.

Verify:
- TabBar renders with 3 tabs (Timeline, Messages, Sessions)
- Timeline tab is active by default
- SummaryCard appears in sidebar with session count, total paid, Brand OS status
- Existing messages appear under the Messages tab
- Filter chips work (clicking toggles event visibility)
- Event cards render with correct icons and accent colors
- Compose box is visible on all tabs
- FitCard, ObjectionDeck still render correctly

- [ ] **Step 3: Final commit with all verification**

```bash
git add -A
git commit -m "feat(timeline): contact timeline complete — unified event feed on lead detail page"
```
