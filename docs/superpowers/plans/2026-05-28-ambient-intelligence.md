# Ambient Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every surface of the coach-app aware of every other surface — session data flows to client cards, client activity flows into session prep, revenue appears on Command Center — so the coach never mentally connects dots between features.

**Architecture:** Two layers, incrementally deployable. Layer 1 replaces the Command Center's separate card sections with a unified scoring system (RightNowList + BusinessPulse). Layer 2 adds PersonName/PersonPanel components that let any name in the app open a slide-over with full cross-feature context, plus inline enrichment on existing surfaces.

**Tech Stack:** Next.js App Router (server components + "use client"), Supabase (parallel queries, RLS), Anthropic Claude API (post-session draft generation), CSS variable design system, Vitest.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/ambient.ts` | Server-side data functions: `getBusinessPulse()`, `getPersonSignals()`, `getContentSignals()`, `generatePostSessionDraft()`. All cross-feature queries live here. |
| `lib/__tests__/ambient.test.ts` | Unit tests for scoring logic, metric computation, session rhythm detection, content signal extraction |
| `components/command-center/RightNowList.tsx` | Client component. Renders hero item + quiet list + day summary. Receives scored `RightNowItem[]` from server. |
| `components/command-center/BusinessPulseStrip.tsx` | Client component. Compact metrics strip with anomaly coloring (revenue, members, sessions, trust). |
| `components/ambient/PersonName.tsx` | Client component. Thin name wrapper — renders styled text, on click dispatches event to open PersonPanel. |
| `components/ambient/PersonPanel.tsx` | Client component. Right-edge slide-over (320px desktop, bottom-sheet mobile) showing full person signals. Fetches from `/api/leads/[id]/signals` on open. |
| `components/ambient/PersonPanelProvider.tsx` | Client component. Context provider mounted in layout. Manages open/close state, current lead ID, renders PersonPanel. |
| `app/api/leads/[id]/signals/route.ts` | API route. Returns `PersonSignals` for a lead. Auth-gated to the owning coach. |

### Modified files

| File | Change |
|------|--------|
| `app/command-center/page.tsx` | Replace 8-way Promise.all + rescue/content/reach/trust computation with single `getBusinessPulse()` call. Pass `BusinessPulse` to new components. Keep Honest Question. |
| `components/command-center/CommandCenterView.tsx` | Replace entire view: remove LeadRescueCard, JustLandedBand, ContentPipeline, ReachCard, InsightQueue, BillboardCard. Render RightNowList + BusinessPulseStrip + HonestQuestion. |
| `app/layout.tsx` | Add `PersonPanelProvider` wrapping children so PersonPanel is globally available. |
| `components/sessions/SessionCard.tsx` | Wrap client name `<span>` in `<PersonName>` component. |
| `app/content/page.tsx` | Add `getContentSignals()` call, pass `untappedTopics` to ContentWorkspace. |
| `components/content/ContentWorkspace.tsx` | Render content suggestion line above content list when untapped topics exist. |
| `app/api/sessions/route.ts` | After session analysis, call `generatePostSessionDraft()`, return `followUpDraft` in response. |
| `app/clients/offerings/[id]/page.tsx` | Add `cp_coaching_sessions` query to Promise.all for enrolled member session data. Pass to OfferingDetail. |

---

### Task 1: Data Layer — `lib/ambient.ts` Types and Scoring Logic

**Files:**
- Create: `lib/ambient.ts`
- Create: `lib/__tests__/ambient.test.ts`

This is the foundation. All cross-feature queries and scoring logic live here. No UI — just pure data functions.

- [ ] **Step 1: Write the failing test for `scoreRightNowItems`**

The scoring function takes raw data arrays and returns sorted `RightNowItem[]`. Test the priority ordering.

```typescript
// lib/__tests__/ambient.test.ts
import { describe, it, expect } from "vitest";
import { scoreRightNowItems, type RawPulseData } from "@/lib/ambient";

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
    const { computeMetrics } = require("@/lib/ambient");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ambient'`

- [ ] **Step 3: Write the types and scoring logic**

```typescript
// lib/ambient.ts
//
// Ambient Intelligence data layer. Cross-feature queries and scoring
// that powers the Command Center's unified priority list and the
// Person Panel's signal aggregation.

// ── Types ─────────────────────────────────────────────────────────────

export type RightNowItem = {
  id: string;
  leadId?: string;
  leadName?: string;
  priority: number; // 1-7
  reason: string;
  context?: string;
  action: { label: string; href?: string; type: "link" | "compose" | "capture" };
  source: "session" | "sequence" | "message" | "overdue" | "content" | "content_suggestion";
};

export type BusinessPulse = {
  heroItem: RightNowItem | null;
  quietList: RightNowItem[];
  daySummary: { sessions: number; draftsReady: number; leadsWaiting: number };
  metrics: {
    revenue: { amount: number; trend: "up" | "down" | "flat" };
    activeMembers: number;
    sessionsThisMonth: number;
    trustRate: number | null;
  };
  honestQuestion: string;
};

export type PersonSignals = {
  name: string;
  status: "lead" | "client";
  source: string | null;
  createdAt: string;
  lastMessage: { direction: "inbound" | "outbound"; date: string; channel: string } | null;
  lastSession: { date: string; keyTopics: string[]; daysSince: number } | null;
  totalSessions: number;
  sessionRhythm: string | null;
  offering: { name: string; monthsIn: number; totalMonths: number } | null;
  sequence: { name: string; currentStep: number; totalSteps: number } | null;
  lifetimePaid: number;
  flags: { sessionOverdue: boolean; messageWaiting: boolean };
};

export type ContentSignals = {
  untappedTopics: Array<{ topic: string; sessionCount: number }>;
};

// ── Raw data shapes for scoring ───────────────────────────────────────

export type RawPulseData = {
  calendarEvents: Array<{
    id: string;
    title: string;
    starts_at: string;
    meeting_url: string | null;
    client_room_id: string | null;
  }>;
  capturedToday: Array<{
    id: string;
    client_id: string;
    session_date: string;
    key_topics: string[];
  }>;
  sessionsThisMonth: Array<{
    client_id: string;
    session_date: string;
  }>;
  activeClients: Array<{
    id: string;
    full_name: string;
    status: string;
  }>;
  waitingMessages: Array<{
    id: string;
    lead_id: string;
    direction: string;
    sent_at: string | null;
    created_at: string;
  }>;
  failedEnrollments: Array<{
    id: string;
    lead_id: string;
    status: string;
    sequence_id: string;
  }>;
  paymentsWindow: Array<{
    amount_cents: number;
    created_at: string;
  }>;
  activeMembers: Array<{
    id: string;
    status: string;
  }>;
  draftContent: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  clientRooms: Array<{
    id: string;
    lead_id: string;
  }>;
  now: number;
};

// ── Scoring ───────────────────────────────────────────────────────────

const MAX_RIGHT_NOW = 6; // 1 hero + 5 quiet list

export function scoreRightNowItems(data: RawPulseData): RightNowItem[] {
  const items: RightNowItem[] = [];
  const clientMap = new Map(data.activeClients.map((c) => [c.id, c.full_name]));
  const roomToLead = new Map(data.clientRooms.map((r) => [r.id, r.lead_id]));

  // Priority 1 & 6: Sessions today (< 1hr = P1, later today = P6)
  const oneHourFromNow = data.now + 60 * 60_000;
  for (const ev of data.calendarEvents) {
    const startsAt = new Date(ev.starts_at).getTime();
    const leadId = ev.client_room_id ? roomToLead.get(ev.client_room_id) ?? null : null;
    const leadName = leadId ? clientMap.get(leadId) ?? null : null;
    const minutesUntil = Math.round((startsAt - data.now) / 60_000);

    if (startsAt > data.now && startsAt <= oneHourFromNow) {
      // Priority 1: session in < 1 hour
      items.push({
        id: `session-soon-${ev.id}`,
        leadId: leadId ?? undefined,
        leadName: leadName ?? ev.title,
        priority: 1,
        reason: `session in ${minutesUntil} min`,
        action: ev.meeting_url
          ? { label: "Join call", href: ev.meeting_url, type: "link" }
          : { label: "Prep", href: "/clients?tab=sessions", type: "link" },
        source: "session",
      });
    } else if (startsAt > oneHourFromNow) {
      // Priority 6: session later today
      const time = new Date(ev.starts_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      items.push({
        id: `session-later-${ev.id}`,
        leadId: leadId ?? undefined,
        leadName: leadName ?? ev.title,
        priority: 6,
        reason: `session at ${time}`,
        action: { label: "Prep", href: "/clients?tab=sessions", type: "link" },
        source: "session",
      });
    }
  }

  // Priority 2: Sequence failures
  for (const enr of data.failedEnrollments) {
    const leadName = clientMap.get(enr.lead_id);
    items.push({
      id: `seq-fail-${enr.id}`,
      leadId: enr.lead_id,
      leadName: leadName ?? "Unknown",
      priority: 2,
      reason: "follow-up sequence failed",
      action: { label: "View", href: `/leads/${enr.lead_id}`, type: "link" },
      source: "sequence",
    });
  }

  // Priority 3: Inbound messages waiting > 48h
  const fortyEightHoursAgo = data.now - 48 * 3600_000;
  for (const msg of data.waitingMessages) {
    const sentAt = new Date(msg.sent_at ?? msg.created_at).getTime();
    if (sentAt < fortyEightHoursAgo && msg.direction === "inbound") {
      const leadName = clientMap.get(msg.lead_id);
      const daysAgo = Math.round((data.now - sentAt) / 86_400_000);
      items.push({
        id: `msg-wait-${msg.id}`,
        leadId: msg.lead_id,
        leadName: leadName ?? "Unknown",
        priority: 3,
        reason: `replied ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago, waiting on you`,
        action: { label: "Reply", href: `/inbox?compose=open&ids=${msg.lead_id}`, type: "compose" },
        source: "message",
      });
    }
  }

  // Priority 4: No session in 14+ days (active clients only)
  const fourteenDaysAgo = data.now - 14 * 86_400_000;
  const lastSessionByClient = new Map<string, number>();
  for (const s of data.sessionsThisMonth) {
    const d = new Date(s.session_date).getTime();
    const prev = lastSessionByClient.get(s.client_id) ?? 0;
    if (d > prev) lastSessionByClient.set(s.client_id, d);
  }
  for (const client of data.activeClients) {
    if (client.status !== "client") continue;
    const lastSession = lastSessionByClient.get(client.id);
    if (!lastSession || lastSession < fourteenDaysAgo) {
      const weeksSince = lastSession
        ? Math.round((data.now - lastSession) / (7 * 86_400_000))
        : null;
      items.push({
        id: `overdue-${client.id}`,
        leadId: client.id,
        leadName: client.full_name,
        priority: 4,
        reason: weeksSince
          ? `no session in ${weeksSince} week${weeksSince === 1 ? "" : "s"}`
          : "no sessions recorded",
        action: { label: "Capture", href: "/sessions/new", type: "capture" },
        source: "overdue",
      });
    }
  }

  // Priority 5: Content drafts ready
  for (const c of data.draftContent) {
    items.push({
      id: `content-${c.id}`,
      leadName: undefined,
      priority: 5,
      reason: `Content draft ready: "${c.title}"`,
      action: { label: "Review", href: "/content", type: "link" },
      source: "content",
    });
  }

  // Sort by priority (lower = more urgent), then deduplicate by leadId
  items.sort((a, b) => a.priority - b.priority);

  // Deduplicate: if the same lead appears in multiple items, keep the
  // highest priority one. Content items (no leadId) always pass through.
  const seenLeads = new Set<string>();
  const deduplicated: RightNowItem[] = [];
  for (const item of items) {
    if (item.leadId) {
      if (seenLeads.has(item.leadId)) continue;
      seenLeads.add(item.leadId);
    }
    deduplicated.push(item);
    if (deduplicated.length >= MAX_RIGHT_NOW) break;
  }

  return deduplicated;
}

// ── Metrics computation ───────────────────────────────────────────────

export function computeMetrics(data: {
  paymentsWindow: Array<{ amount_cents: number; created_at: string }>;
  activeMembers: Array<{ id: string; status: string }>;
  sessionsThisMonth: Array<{ client_id: string; session_date: string }>;
  trustRate: number | null;
  now: number;
}): BusinessPulse["metrics"] {
  const thisMonthStart = new Date(data.now);
  thisMonthStart.setUTCDate(1);
  thisMonthStart.setUTCHours(0, 0, 0, 0);

  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  let thisMonthRevenue = 0;
  let lastMonthRevenue = 0;

  for (const p of data.paymentsWindow) {
    const d = new Date(p.created_at);
    if (d >= thisMonthStart) {
      thisMonthRevenue += p.amount_cents;
    } else if (d >= lastMonthStart) {
      lastMonthRevenue += p.amount_cents;
    }
  }

  const trend: "up" | "down" | "flat" =
    thisMonthRevenue > lastMonthRevenue
      ? "up"
      : thisMonthRevenue < lastMonthRevenue
        ? "down"
        : "flat";

  return {
    revenue: { amount: thisMonthRevenue, trend },
    activeMembers: data.activeMembers.filter((m) => m.status === "active").length,
    sessionsThisMonth: data.sessionsThisMonth.length,
    trustRate: data.trustRate,
  };
}

// ── Day summary ───────────────────────────────────────────────────────

export function computeDaySummary(
  items: RightNowItem[],
  capturedToday: number,
  draftContent: number,
): BusinessPulse["daySummary"] {
  const leadsWaiting = items.filter(
    (i) => i.source === "message" || i.source === "sequence",
  ).length;
  return {
    sessions: capturedToday,
    draftsReady: draftContent,
    leadsWaiting,
  };
}

// ── Session rhythm detection ──────────────────────────────────────────

export function detectSessionRhythm(
  sessionDates: string[],
): string | null {
  if (sessionDates.length < 2) return null;

  // Sort descending
  const sorted = [...sessionDates]
    .map((d) => new Date(d).getTime())
    .sort((a, b) => b - a);

  // Check for consecutive weekly sessions (5-9 day gaps)
  let consecutiveWeeks = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapDays = (sorted[i] - sorted[i + 1]) / 86_400_000;
    if (gapDays >= 5 && gapDays <= 9) {
      consecutiveWeeks++;
    } else {
      break;
    }
  }

  if (consecutiveWeeks >= 2) {
    return `${ordinal(consecutiveWeeks)} consecutive week`;
  }
  return null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Honest questions ──────────────────────────────────────────────────

const HONEST_QUESTIONS = [
  "Who's been on your list 14+ days without a real reply from you?",
  "If you got one new coach this week, what would change in your calendar?",
  "What's the conversation you're avoiding right now?",
  "Which lead on your list do you already know won't buy, and why haven't you closed the loop?",
  "When was the last time you sent a message without asking for anything back?",
  "Who's the one person you'd work with for free if they said yes today?",
  "What message have you been drafting in your head but not sending?",
  "If your reach number stayed flat for a month, what would you do differently?",
  "Which lead did you promise to follow up with, and when?",
  "What's one assumption about your ICP you haven't actually tested with a human this week?",
  "Who on your list is outgrowing the version of you they first met?",
  "If you had to cut your list in half today, who goes first?",
  "What's a lead telling you that you don't want to hear?",
  "Where's the friction in your own pipeline, and is it yours to fix or theirs?",
];

export function pickHonestQuestion(now: number): string {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000);
  return HONEST_QUESTIONS[dayOfYear % HONEST_QUESTIONS.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/ambient.ts lib/__tests__/ambient.test.ts
git commit -m "feat: add ambient intelligence data layer with scoring and metrics"
```

---

### Task 2: Data Layer — Server-Side Query Functions

**Files:**
- Modify: `lib/ambient.ts`
- Modify: `lib/__tests__/ambient.test.ts`

Add the actual Supabase query functions that call the scoring logic from Task 1. These are server-side only.

- [ ] **Step 1: Write the failing test for `getContentSignals`**

The content signals function cross-references session topics against content titles. We can test the extraction logic without Supabase.

```typescript
// Add to lib/__tests__/ambient.test.ts

import { extractUntappedTopics } from "@/lib/ambient";

describe("extractUntappedTopics", () => {
  it("finds topics in 3+ sessions not covered by content", () => {
    const sessionTopics = [
      ["boundaries", "leadership"],
      ["boundaries", "vulnerability"],
      ["boundaries", "anger"],
      ["leadership", "communication"],
    ];
    const contentTitles = ["Leadership in coaching", "Finding your voice"];

    const result = extractUntappedTopics(sessionTopics, contentTitles);

    expect(result).toEqual([
      { topic: "boundaries", sessionCount: 3 },
    ]);
  });

  it("returns empty when all frequent topics are covered", () => {
    const sessionTopics = [
      ["boundaries"],
      ["boundaries"],
      ["boundaries"],
    ];
    const contentTitles = ["Setting boundaries with clients"];

    const result = extractUntappedTopics(sessionTopics, contentTitles);
    expect(result).toEqual([]);
  });

  it("returns empty when no topic appears 3+ times", () => {
    const sessionTopics = [["a"], ["b"], ["c"]];
    const contentTitles: string[] = [];

    const result = extractUntappedTopics(sessionTopics, contentTitles);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: FAIL — `extractUntappedTopics is not exported`

- [ ] **Step 3: Add `extractUntappedTopics` and server-side query functions**

Append to `lib/ambient.ts`:

```typescript
// ── Content signal extraction ─────────────────────────────────────────

export function extractUntappedTopics(
  sessionTopicSets: string[][],
  contentTitles: string[],
): ContentSignals["untappedTopics"] {
  // Count topic frequency across all sessions
  const counts = new Map<string, number>();
  for (const topics of sessionTopicSets) {
    for (const topic of topics) {
      const normalized = topic.toLowerCase().trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  // Filter to topics appearing in 3+ sessions
  const frequent = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  // Subtract topics that appear in content titles (case-insensitive substring match)
  const lowerTitles = contentTitles.map((t) => t.toLowerCase());
  const untapped = frequent.filter(
    ([topic]) => !lowerTitles.some((title) => title.includes(topic)),
  );

  return untapped.map(([topic, sessionCount]) => ({ topic, sessionCount }));
}

// ── Server-side Supabase query functions ──────────────────────────────
// These import supabase-server and run parallel queries.
// Only called from server components and API routes.

import { createClient } from "@/lib/supabase-server";
import { summarizeTrust } from "@/lib/voice-trust";

export async function getBusinessPulse(coachId: string, now: number): Promise<BusinessPulse> {
  const supabase = createClient();

  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  // Revenue window: from start of last month to now
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  // Trust window: 28 days
  const trustWindowStart = new Date(now - 28 * 86_400_000).toISOString();

  const [
    eventsRes, capturedRes, monthSessionsRes, clientsRes,
    messagesRes, enrollmentsRes, paymentsRes, membersRes,
    contentRes, roomsRes, trustRes,
  ] = await Promise.all([
    supabase.from("cp_client_events")
      .select("id, title, starts_at, meeting_url, client_room_id")
      .eq("coach_id", coachId)
      .gte("starts_at", todayStart.toISOString())
      .lte("starts_at", todayEnd.toISOString()),
    supabase.from("cp_coaching_sessions")
      .select("id, client_id, session_date, key_topics")
      .eq("coach_id", coachId)
      .gte("session_date", todayStart.toISOString()),
    supabase.from("cp_coaching_sessions")
      .select("client_id, session_date")
      .eq("coach_id", coachId)
      .gte("session_date", monthStart.toISOString()),
    supabase.from("cp_leads")
      .select("id, full_name, status")
      .eq("coach_id", coachId)
      .eq("status", "client"),
    supabase.from("cp_lead_messages")
      .select("id, lead_id, direction, sent_at, created_at")
      .eq("coach_id", coachId)
      .eq("direction", "inbound")
      .gte("sent_at", new Date(now - 7 * 86_400_000).toISOString()),
    supabase.from("cp_sequence_enrollments")
      .select("id, lead_id, status, sequence_id")
      .eq("coach_id", coachId)
      .eq("status", "failed"),
    supabase.from("cp_payments")
      .select("amount_cents, created_at")
      .eq("coach_id", coachId)
      .gte("created_at", lastMonthStart.toISOString()),
    supabase.from("cp_offering_members")
      .select("id, status")
      .eq("status", "active"),
    supabase.from("cp_content")
      .select("id, title, status")
      .eq("coach_id", coachId)
      .eq("status", "draft"),
    supabase.from("cp_client_rooms")
      .select("id, lead_id")
      .eq("coach_id", coachId),
    supabase.from("cp_lead_messages")
      .select("id, lead_id, coach_id, channel, direction, content, ai_drafted, sent_at, purpose, external_id, synced_from, original_draft, was_edited, created_at")
      .eq("coach_id", coachId)
      .eq("ai_drafted", true)
      .not("sent_at", "is", null)
      .gte("sent_at", trustWindowStart),
  ]);

  const rawData: RawPulseData = {
    calendarEvents: eventsRes.data ?? [],
    capturedToday: capturedRes.data ?? [],
    sessionsThisMonth: monthSessionsRes.data ?? [],
    activeClients: clientsRes.data ?? [],
    waitingMessages: messagesRes.data ?? [],
    failedEnrollments: enrollmentsRes.data ?? [],
    paymentsWindow: paymentsRes.data ?? [],
    activeMembers: membersRes.data ?? [],
    draftContent: contentRes.data ?? [],
    clientRooms: roomsRes.data ?? [],
    now,
  };

  const items = scoreRightNowItems(rawData);
  const trustMessages = trustRes.data ?? [];
  const trust = summarizeTrust(trustMessages as any, now);

  const metrics = computeMetrics({
    paymentsWindow: rawData.paymentsWindow,
    activeMembers: rawData.activeMembers,
    sessionsThisMonth: rawData.sessionsThisMonth,
    trustRate: trust.asIsPct28,
    now,
  });

  const daySummary = computeDaySummary(
    items,
    rawData.capturedToday.length,
    rawData.draftContent.length,
  );

  return {
    heroItem: items[0] ?? null,
    quietList: items.slice(1, 6),
    daySummary,
    metrics,
    honestQuestion: pickHonestQuestion(now),
  };
}

export async function getPersonSignals(leadId: string): Promise<PersonSignals> {
  const supabase = createClient();

  const [leadRes, messageRes, sessionsRes, offeringRes, enrollmentRes, paymentsRes] =
    await Promise.all([
      supabase.from("cp_leads")
        .select("id, full_name, status, source, created_at, email")
        .eq("id", leadId)
        .single(),
      supabase.from("cp_lead_messages")
        .select("direction, sent_at, channel")
        .eq("lead_id", leadId)
        .order("sent_at", { ascending: false })
        .limit(1),
      supabase.from("cp_coaching_sessions")
        .select("session_date, key_topics, commitments")
        .eq("client_id", leadId)
        .order("session_date", { ascending: false })
        .limit(10),
      supabase.from("cp_offering_members")
        .select("offering_id, status, created_at, cp_offerings(name, duration_months)")
        .eq("lead_id", leadId)
        .eq("status", "active"),
      supabase.from("cp_sequence_enrollments")
        .select("sequence_id, status, current_step_id, cp_sequences(name)")
        .eq("lead_id", leadId)
        .in("status", ["active", "paused"]),
      supabase.from("cp_payments")
        .select("amount_cents")
        .eq("lead_id", leadId),
    ]);

  const lead = leadRes.data;
  if (!lead) throw new Error("Lead not found");

  const now = Date.now();

  // Last message
  const lastMsg = (messageRes.data ?? [])[0] ?? null;
  const lastMessage = lastMsg
    ? {
        direction: lastMsg.direction as "inbound" | "outbound",
        date: lastMsg.sent_at,
        channel: lastMsg.channel,
      }
    : null;

  // Sessions
  const sessions = sessionsRes.data ?? [];
  const totalSessions = sessions.length;
  const lastSession = sessions[0]
    ? {
        date: sessions[0].session_date,
        keyTopics: sessions[0].key_topics ?? [],
        daysSince: Math.round(
          (now - new Date(sessions[0].session_date).getTime()) / 86_400_000,
        ),
      }
    : null;
  const rhythm = detectSessionRhythm(sessions.map((s) => s.session_date));

  // Offering
  const offeringRow = (offeringRes.data ?? [])[0] as any;
  const offering = offeringRow
    ? {
        name: offeringRow.cp_offerings?.name ?? "Program",
        monthsIn: Math.max(
          1,
          Math.ceil(
            (now - new Date(offeringRow.created_at).getTime()) / (30 * 86_400_000),
          ),
        ),
        totalMonths: offeringRow.cp_offerings?.duration_months ?? 0,
      }
    : null;

  // Sequence
  const enrollRow = (enrollmentRes.data ?? [])[0] as any;
  const sequence = enrollRow
    ? {
        name: enrollRow.cp_sequences?.name ?? "Sequence",
        currentStep: 0, // Would need step counting query — simplified
        totalSteps: 0,
      }
    : null;

  // Lifetime paid
  const lifetimePaid = (paymentsRes.data ?? []).reduce(
    (sum: number, p: { amount_cents: number }) => sum + p.amount_cents,
    0,
  );

  // Flags
  const sessionOverdue = lastSession ? lastSession.daysSince > 14 : false;
  const messageWaiting = lastMessage
    ? lastMessage.direction === "inbound" &&
      (now - new Date(lastMessage.date).getTime()) > 48 * 3600_000
    : false;

  return {
    name: lead.full_name,
    status: lead.status as "lead" | "client",
    source: lead.source,
    createdAt: lead.created_at,
    lastMessage,
    lastSession,
    totalSessions,
    sessionRhythm: rhythm,
    offering,
    sequence,
    lifetimePaid,
    flags: { sessionOverdue, messageWaiting },
  };
}

export async function getContentSignals(coachId: string): Promise<ContentSignals> {
  const supabase = createClient();

  const [sessionsRes, contentRes] = await Promise.all([
    supabase.from("cp_coaching_sessions")
      .select("key_topics")
      .eq("coach_id", coachId),
    supabase.from("cp_content")
      .select("title")
      .eq("coach_id", coachId),
  ]);

  const sessionTopics = (sessionsRes.data ?? []).map(
    (s: { key_topics: string[] }) => s.key_topics ?? [],
  );
  const contentTitles = (contentRes.data ?? []).map(
    (c: { title: string }) => c.title,
  );

  return { untappedTopics: extractUntappedTopics(sessionTopics, contentTitles) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/ambient.ts lib/__tests__/ambient.test.ts
git commit -m "feat: add server-side query functions and content signal extraction"
```

---

### Task 3: Post-Session Draft Generation

**Files:**
- Modify: `lib/ambient.ts`
- Modify: `app/api/sessions/route.ts`

Add `generatePostSessionDraft()` AI function and wire it into the sessions API route.

- [ ] **Step 1: Write the failing test for draft generation fallback**

```typescript
// Add to lib/__tests__/ambient.test.ts

import { generatePostSessionDraft } from "@/lib/ambient";

describe("generatePostSessionDraft", () => {
  it("returns null when no API key is set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generatePostSessionDraft({
      clientName: "Marcus",
      aiSummary: "Discussed boundaries with COO",
      commitments: ["Set boundary with COO this week"],
      keyTopics: ["boundaries", "leadership"],
      voiceProfile: null,
    });

    expect(result).toBeNull();
    process.env.ANTHROPIC_API_KEY = original;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: FAIL — `generatePostSessionDraft is not exported`

- [ ] **Step 3: Add `generatePostSessionDraft` to `lib/ambient.ts`**

Append to `lib/ambient.ts`:

```typescript
// ── Post-session draft generation (AI) ────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function generatePostSessionDraft(params: {
  clientName: string;
  aiSummary: string;
  commitments: string[];
  keyTopics: string[];
  voiceProfile: { voice_json: Record<string, unknown>; sample_messages: string[] } | null;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!params.aiSummary) return null;

  const system = [
    "You write 2-3 sentence follow-up messages from a coach to their client after a session.",
    "Be warm, specific, direct. Reference one concrete commitment or topic from the session.",
    "Match the coach's voice style if provided. No em dashes. No generic encouragement.",
    "Return only the message text, no quotes, no greeting header.",
  ].join(" ");

  const voiceContext = params.voiceProfile
    ? `COACH VOICE:\n${JSON.stringify(params.voiceProfile.voice_json, null, 2).slice(0, 400)}\n\nSAMPLE MESSAGES:\n${params.voiceProfile.sample_messages.slice(0, 2).join("\n")}`
    : "(No voice profile available. Use a warm, direct tone.)";

  const prompt = [
    `Write a follow-up message to ${params.clientName} after today's coaching session.`,
    "",
    "SESSION SUMMARY:",
    params.aiSummary,
    "",
    "KEY TOPICS:",
    params.keyTopics.join(", ") || "(none)",
    "",
    "COMMITMENTS:",
    params.commitments.length > 0 ? params.commitments.join("\n") : "(none stated)",
    "",
    voiceContext,
  ].join("\n");

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    const text = String(result?.content?.[0]?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/ambient.test.ts`
Expected: PASS

- [ ] **Step 5: Wire draft generation into `POST /api/sessions`**

In `app/api/sessions/route.ts`, after the `analysis` is computed and the session is inserted, add the draft generation call:

Replace the existing return statement at line 163:

```typescript
  // Generate follow-up draft (non-blocking — null on failure)
  const followUpDraft = await generatePostSessionDraft({
    clientName: clientLead.full_name || "the client",
    aiSummary: analysis.ai_summary,
    commitments: analysis.commitments,
    keyTopics: analysis.key_topics,
    voiceProfile: profile,
  });

  return NextResponse.json({ session, analysis, followUpDraft }, { status: 201 });
```

Also add the import at the top of `app/api/sessions/route.ts`:

```typescript
import { generatePostSessionDraft } from "@/lib/ambient";
```

- [ ] **Step 6: Run the sessions API test if it exists, or verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 7: Commit**

```bash
git add lib/ambient.ts lib/__tests__/ambient.test.ts app/api/sessions/route.ts
git commit -m "feat: add post-session follow-up draft generation"
```

---

### Task 4: Person Signals API Route

**Files:**
- Create: `app/api/leads/[id]/signals/route.ts`

API endpoint that returns `PersonSignals` for a lead, called client-side by the PersonPanel.

- [ ] **Step 1: Create the directory**

Run: `mkdir -p app/api/leads/\[id\]/signals`

- [ ] **Step 2: Write the API route**

```typescript
// app/api/leads/[id]/signals/route.ts
//
// GET /api/leads/[id]/signals — returns PersonSignals for a lead.
// Auth-gated: only the coach who owns this lead can access.
// Called client-side by PersonPanel on demand.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getPersonSignals } from "@/lib/ambient";

export const runtime = "edge";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the lead belongs to this coach
  const { data: lead } = await supabase
    .from("cp_leads")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const signals = await getPersonSignals(params.id);
    return NextResponse.json(signals, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/\[id\]/signals/route.ts
git commit -m "feat: add person signals API route for PersonPanel"
```

---

### Task 5: Command Center Redesign — RightNowList Component

**Files:**
- Create: `components/command-center/RightNowList.tsx`

The unified hero + quiet list + day summary that replaces separate card sections.

- [ ] **Step 1: Write the RightNowList component**

```typescript
// components/command-center/RightNowList.tsx
"use client";

import type { RightNowItem, BusinessPulse } from "@/lib/ambient";
import PersonName from "@/components/ambient/PersonName";
import { Card } from "@/components/ui";

type Props = {
  heroItem: RightNowItem | null;
  quietList: RightNowItem[];
  daySummary: BusinessPulse["daySummary"];
};

export default function RightNowList({ heroItem, quietList, daySummary }: Props) {
  if (!heroItem) {
    return (
      <section aria-label="Right now">
        <Card variant="elevated" padding="md">
          <p className="text-center text-[length:var(--t-body)] text-[color:var(--text-muted)] py-4">
            Nothing needs you right now.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Right now" className="space-y-3">
      {/* Hero item */}
      <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border-l-[3px] border-l-[var(--brand)] shadow-[var(--shadow-sm)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              {heroItem.leadId && heroItem.leadName ? (
                <PersonName leadId={heroItem.leadId} name={heroItem.leadName} />
              ) : (
                <span className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                  {heroItem.leadName ?? heroItem.reason}
                </span>
              )}
              <span className="text-[length:var(--t-body)] text-[color:var(--text)]">
                {heroItem.leadName ? `· ${heroItem.reason}` : ""}
              </span>
            </div>
            {heroItem.context && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
                {heroItem.context}
              </p>
            )}
          </div>
          <ActionButton action={heroItem.action} />
        </div>
      </div>

      {/* Quiet list */}
      {quietList.length > 0 && (
        <div className="space-y-0.5">
          {quietList.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--surface-elevated)] transition"
            >
              <div className="flex items-baseline gap-2 min-w-0 flex-1 text-[length:var(--t-caption)]">
                {item.leadId && item.leadName ? (
                  <>
                    <PersonName leadId={item.leadId} name={item.leadName} />
                    <span className="text-[color:var(--text-muted)] truncate">
                      — {item.reason}
                    </span>
                  </>
                ) : (
                  <span className="text-[color:var(--text)] truncate">{item.reason}</span>
                )}
              </div>
              <ActionLink action={item.action} />
            </div>
          ))}
        </div>
      )}

      {/* Day summary */}
      {(daySummary.sessions > 0 || daySummary.draftsReady > 0 || daySummary.leadsWaiting > 0) && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] px-3">
          Your day:{" "}
          {[
            daySummary.sessions > 0 && `${daySummary.sessions} session${daySummary.sessions === 1 ? "" : "s"}`,
            daySummary.draftsReady > 0 && `${daySummary.draftsReady} draft${daySummary.draftsReady === 1 ? "" : "s"} ready`,
            daySummary.leadsWaiting > 0 && `${daySummary.leadsWaiting} lead${daySummary.leadsWaiting === 1 ? "" : "s"} waiting`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function ActionButton({ action }: { action: RightNowItem["action"] }) {
  if (action.href) {
    return (
      <a
        href={action.href}
        className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
      >
        {action.label}
      </a>
    );
  }
  return (
    <span className="shrink-0 text-[length:var(--t-caption)] font-bold text-[color:var(--brand)]">
      {action.label}
    </span>
  );
}

function ActionLink({ action }: { action: RightNowItem["action"] }) {
  if (action.href) {
    return (
      <a
        href={action.href}
        className="shrink-0 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition whitespace-nowrap"
      >
        {action.label} →
      </a>
    );
  }
  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

Note: This will fail until PersonName exists (Task 7). If working sequentially, create a stub PersonName first — or skip this check and verify after Task 7.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/RightNowList.tsx
git commit -m "feat: add RightNowList component for unified priority display"
```

---

### Task 6: Command Center Redesign — BusinessPulseStrip Component

**Files:**
- Create: `components/command-center/BusinessPulseStrip.tsx`

Compact metrics strip with anomaly coloring.

- [ ] **Step 1: Write the BusinessPulseStrip component**

```typescript
// components/command-center/BusinessPulseStrip.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";

type Props = {
  metrics: BusinessPulse["metrics"];
};

export default function BusinessPulseStrip({ metrics }: Props) {
  const items: Array<{ label: string; value: string; warning: boolean } | null> = [
    metrics.revenue.amount > 0 || metrics.revenue.trend !== "flat"
      ? {
          label: "This Month",
          value: `$${(metrics.revenue.amount / 100).toLocaleString()}${
            metrics.revenue.trend === "up" ? " ↑" : metrics.revenue.trend === "down" ? " ↓" : ""
          }`,
          warning: metrics.revenue.trend === "down",
        }
      : null,
    metrics.activeMembers > 0
      ? {
          label: "",
          value: `${metrics.activeMembers} member${metrics.activeMembers === 1 ? "" : "s"}`,
          warning: false,
        }
      : null,
    metrics.sessionsThisMonth > 0
      ? {
          label: "",
          value: `${metrics.sessionsThisMonth} session${metrics.sessionsThisMonth === 1 ? "" : "s"}`,
          warning: metrics.sessionsThisMonth === 0,
        }
      : null,
    metrics.trustRate !== null
      ? {
          label: "",
          value: `${metrics.trustRate}% trust`,
          warning: metrics.trustRate < 60,
        }
      : null,
  ];

  const visible = items.filter((i): i is NonNullable<typeof i> => i !== null);
  if (visible.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-[var(--r-md)] bg-[var(--surface-deep)] px-4 py-2.5"
      aria-label="Business pulse"
    >
      {visible.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && item.label === "" && (
            <span className="text-[color:var(--text-faint)]">·</span>
          )}
          {item.label && (
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-bold">
              {item.label}
            </span>
          )}
          <span
            className={`text-[length:var(--t-caption)] font-bold tabular-nums ${
              item.warning
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--text)]"
            }`}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add components/command-center/BusinessPulseStrip.tsx
git commit -m "feat: add BusinessPulseStrip for compact metrics display"
```

---

### Task 7: PersonName + PersonPanel + Provider

**Files:**
- Create: `components/ambient/PersonName.tsx`
- Create: `components/ambient/PersonPanel.tsx`
- Create: `components/ambient/PersonPanelProvider.tsx`
- Modify: `app/layout.tsx`

The global person-context system: click any name → slide-over with full signals.

- [ ] **Step 1: Create the PersonPanelProvider (context + state management)**

```typescript
// components/ambient/PersonPanelProvider.tsx
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import PersonPanel from "@/components/ambient/PersonPanel";

type PersonPanelContextValue = {
  openPanel: (leadId: string) => void;
  closePanel: () => void;
  activeLeadId: string | null;
};

const PersonPanelContext = createContext<PersonPanelContextValue>({
  openPanel: () => {},
  closePanel: () => {},
  activeLeadId: null,
});

export function usePersonPanel() {
  return useContext(PersonPanelContext);
}

export default function PersonPanelProvider({ children }: { children: ReactNode }) {
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const openPanel = useCallback((leadId: string) => {
    setActiveLeadId(leadId);
  }, []);

  const closePanel = useCallback(() => {
    setActiveLeadId(null);
  }, []);

  return (
    <PersonPanelContext value={{ openPanel, closePanel, activeLeadId }}>
      {children}
      <PersonPanel leadId={activeLeadId} onClose={closePanel} />
    </PersonPanelContext>
  );
}
```

- [ ] **Step 2: Create the PersonName component**

```typescript
// components/ambient/PersonName.tsx
"use client";

import { usePersonPanel } from "@/components/ambient/PersonPanelProvider";

type Props = {
  leadId: string;
  name: string;
  context?: string;
};

export default function PersonName({ leadId, name, context }: Props) {
  const { openPanel } = usePersonPanel();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        openPanel(leadId);
      }}
      className="inline-flex items-center gap-1.5 text-left font-bold text-[color:var(--text)] hover:underline hover:decoration-dashed hover:underline-offset-2 transition-colors cursor-pointer"
    >
      {name}
      {context && (
        <span className="text-[length:var(--t-micro)] font-normal text-[color:var(--text-faint)]">
          ({context})
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Create the PersonPanel component**

```typescript
// components/ambient/PersonPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { PersonSignals } from "@/lib/ambient";

type Props = {
  leadId: string | null;
  onClose: () => void;
};

export default function PersonPanel({ leadId, onClose }: Props) {
  const [signals, setSignals] = useState<PersonSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setSignals(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/leads/${leadId}/signals`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSignals(data as PersonSignals);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (!leadId) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/8 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — desktop: right slide-over, mobile: bottom sheet */}
      <div
        className={`fixed z-50 bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] transition-transform duration-200 ease-out overflow-y-auto
          /* Desktop */
          right-0 top-0 bottom-0 w-[320px]
          /* Mobile override */
          max-md:top-auto max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-full max-md:max-h-[70vh] max-md:rounded-t-2xl
          ${leadId ? "translate-x-0 max-md:translate-y-0" : "translate-x-full max-md:translate-y-full"}
        `}
        role="dialog"
        aria-label="Person details"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface-deep)] transition text-[color:var(--text-muted)]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-5 pt-4">
          {loading && (
            <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Loading...
            </div>
          )}

          {error && (
            <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--danger)]">
              {error}
            </div>
          )}

          {signals && !loading && (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)] truncate flex-1">
                  {signals.name}
                </h2>
                <Badge tone={signals.status === "client" ? "brand" : "neutral"} size="xs">
                  {signals.status === "client" ? "Client" : "Lead"}
                </Badge>
              </div>

              {/* Journey line */}
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-4">
                {signals.status === "client" ? "Client" : "Lead"} since{" "}
                {new Date(signals.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
                {signals.source ? ` · via ${signals.source}` : ""}
              </p>

              {/* Signal lines */}
              <div className="space-y-3">
                {/* Last message */}
                {signals.lastMessage && (
                  <SignalLine
                    icon="💬"
                    warning={signals.flags.messageWaiting}
                    text={`${signals.lastMessage.direction === "outbound" ? "You sent" : "They sent"} a message · ${formatDaysAgo(signals.lastMessage.date)}`}
                  />
                )}

                {/* Last session */}
                {signals.lastSession && (
                  <div>
                    <SignalLine
                      icon="🎯"
                      warning={signals.flags.sessionOverdue}
                      text={`Last session ${formatDaysAgo(signals.lastSession.date)} · ${signals.lastSession.keyTopics.slice(0, 2).join(", ") || "no topics"}`}
                    />
                    <p className="ml-8 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                      {signals.totalSessions} session{signals.totalSessions === 1 ? "" : "s"} total
                      {signals.sessionRhythm ? ` · ${signals.sessionRhythm}` : ""}
                    </p>
                  </div>
                )}

                {/* Offering */}
                {signals.offering && (
                  <SignalLine
                    icon="📦"
                    text={`${signals.offering.name} · month ${signals.offering.monthsIn}${signals.offering.totalMonths ? ` of ${signals.offering.totalMonths}` : ""}`}
                  />
                )}

                {/* Sequence */}
                {signals.sequence && (
                  <SignalLine
                    icon="🔄"
                    text={`${signals.sequence.name}${signals.sequence.totalSteps > 0 ? ` · step ${signals.sequence.currentStep} of ${signals.sequence.totalSteps}` : ""}`}
                  />
                )}

                {/* Lifetime paid */}
                {signals.lifetimePaid > 0 && (
                  <SignalLine
                    icon="💰"
                    text={`$${(signals.lifetimePaid / 100).toLocaleString()} lifetime`}
                  />
                )}
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--border-faint)]">
                <a
                  href={`/inbox?compose=open&ids=${leadId}`}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
                >
                  Message
                </a>
                {signals.status === "client" && (
                  <a
                    href="/sessions/new"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] border border-[var(--border)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
                  >
                    Capture session
                  </a>
                )}
                <a
                  href={`/leads/${leadId}`}
                  className="ml-auto text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
                >
                  Full profile →
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SignalLine({
  icon,
  text,
  warning = false,
}: {
  icon: string;
  text: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[14px] shrink-0 mt-0.5">{icon}</span>
      <span
        className={`text-[length:var(--t-caption)] ${
          warning ? "text-[color:var(--warning)]" : "text-[color:var(--text)]"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

function formatDaysAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const days = Math.round((now - d) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
```

- [ ] **Step 4: Mount PersonPanelProvider in root layout**

In `app/layout.tsx`, wrap children with the provider:

```typescript
import type { Metadata } from "next";
import MobileTabBar from "@/components/MobileTabBar";
import CommandPalette from "@/components/CommandPalette";
import PersonPanelProvider from "@/components/ambient/PersonPanelProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElevateAI Coach Platform",
  description: "Your leads. Your voice. AI does the writing.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PersonPanelProvider>
          <div className="pb-16 md:pb-0">
            {children}
          </div>
          <MobileTabBar />
          <CommandPalette />
        </PersonPanelProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean compile

- [ ] **Step 6: Commit**

```bash
git add components/ambient/PersonName.tsx components/ambient/PersonPanel.tsx components/ambient/PersonPanelProvider.tsx app/layout.tsx
git commit -m "feat: add PersonName, PersonPanel, and provider for cross-surface person context"
```

---

### Task 8: Command Center Page Rewire

**Files:**
- Modify: `app/command-center/page.tsx`
- Modify: `components/command-center/CommandCenterView.tsx`

Replace the existing 8-way query + rescue/content/reach computation with `getBusinessPulse()`. Render `RightNowList` + `BusinessPulseStrip` + Honest Question.

- [ ] **Step 1: Rewrite the server component**

Replace `app/command-center/page.tsx` entirely. The new version calls `getBusinessPulse()` from `lib/ambient.ts` instead of doing all the queries inline.

```typescript
// app/command-center/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName, userFirstName } from "@/lib/user-display";
import Header from "@/components/Header";
import ClaimVoiceProfile from "@/components/ClaimVoiceProfile";
import CommandCenterView from "@/components/command-center/CommandCenterView";
import { getBusinessPulse } from "@/lib/ambient";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);
  const [headerEmphasis, navUnlocks] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
  ]);
  try { cookies().set("nav-unlocks", JSON.stringify(navUnlocks), { path: "/", sameSite: "lax", maxAge: 86400 }); } catch {}

  const now = Date.now();
  const pulse = await getBusinessPulse(user.id, now);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <ClaimVoiceProfile />
        <CommandCenterView
          pulse={pulse}
          coachFirstName={userFirstName(user.email, user.user_metadata)}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the client component**

Replace `components/command-center/CommandCenterView.tsx` entirely. The new version is dramatically simpler — it renders three components instead of the current ~1400 lines.

```typescript
// components/command-center/CommandCenterView.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";
import RightNowList from "@/components/command-center/RightNowList";
import BusinessPulseStrip from "@/components/command-center/BusinessPulseStrip";

type Props = {
  pulse: BusinessPulse;
  coachFirstName: string;
};

export default function CommandCenterView({ pulse, coachFirstName }: Props) {
  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          Hey, {coachFirstName}.
        </h1>
        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
          Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.
        </p>
      </header>

      <RightNowList
        heroItem={pulse.heroItem}
        quietList={pulse.quietList}
        daySummary={pulse.daySummary}
      />

      <BusinessPulseStrip metrics={pulse.metrics} />

      {/* Honest Question */}
      <section
        className="border-l-2 border-[var(--brand)] pl-5 py-1"
        aria-label="Today's coaching prompt"
      >
        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
          Today's prompt
        </div>
        <p className="text-[length:var(--t-h3)] italic text-[color:var(--text)] mt-1.5 leading-[var(--leading-relaxed)] max-w-2xl">
          {pulse.honestQuestion}
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update the barrel re-export**

The file `components/CommandCenterView.tsx` re-exports from `components/command-center/CommandCenterView.tsx`. It also exports `JustLandedItem` which other files might import. Check if `JustLandedItem` is imported anywhere else:

Run: `grep -rn "JustLandedItem" --include="*.ts" --include="*.tsx" | grep -v node_modules`

If only `components/CommandCenterView.tsx` and `lib/build-punch-list.ts` reference it, update both. The `JustLandedItem` type is no longer needed since the punch list is absorbed into RightNowList. Update the barrel:

```typescript
// components/CommandCenterView.tsx
export { default } from "@/components/command-center/CommandCenterView";
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

There will likely be errors in files that import `JustLandedItem` or old `CommandCenterView` props. Fix each import error:
- If `lib/build-punch-list.ts` still imports `JustLandedItem`, the file is no longer used by the new Command Center. Keep it for now — it can be removed in a cleanup pass.

- [ ] **Step 5: Commit**

```bash
git add app/command-center/page.tsx components/command-center/CommandCenterView.tsx components/CommandCenterView.tsx
git commit -m "feat: redesign Command Center with unified RightNowList and BusinessPulse"
```

---

### Task 9: Wire PersonName into SessionCard

**Files:**
- Modify: `components/sessions/SessionCard.tsx`

Wrap the client name span in a PersonName component so clicking a client name in the sessions list opens the Person Panel.

- [ ] **Step 1: Add PersonName import and wrap the name span**

In `components/sessions/SessionCard.tsx`, the client name is rendered at line 39 as a plain `<span>`. Wrap it in `PersonName`. The component also needs the `leadId` — which is `session.client_id`.

Note: The entire card is wrapped in a `<Link>` to the session detail. The `PersonName` click handler uses `e.stopPropagation()` and `e.preventDefault()` to prevent navigation.

Replace the name span (lines 38-41):

```typescript
// Before:
<span className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] truncate">
  {clientName}
</span>

// After:
<PersonName
  leadId={session.client_id}
  name={clientName}
/>
```

Add the import at the top:

```typescript
import PersonName from "@/components/ambient/PersonName";
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add components/sessions/SessionCard.tsx
git commit -m "feat: wrap session card client name in PersonName for cross-surface context"
```

---

### Task 10: Content Suggestion Line

**Files:**
- Modify: `app/content/page.tsx`
- Modify: `components/content/ContentWorkspace.tsx`

Add content signals query and render the untapped topic suggestion line.

- [ ] **Step 1: Add `getContentSignals` call to the content page server component**

In `app/content/page.tsx`, add `getContentSignals` to the imports and call it alongside existing queries:

Add import:

```typescript
import { getContentSignals } from "@/lib/ambient";
```

After the existing 7-way `Promise.all` (around line 45), add a content signals fetch. Since `getContentSignals` runs its own Supabase queries, call it in parallel with the existing block:

```typescript
  // Add alongside the existing Promise.all
  const contentSignals = await getContentSignals(user.id);
```

Then pass `untappedTopics` to ContentWorkspace:

```typescript
  <ContentWorkspace
    // ... existing props ...
    untappedTopics={contentSignals.untappedTopics}
  />
```

- [ ] **Step 2: Add the suggestion line to ContentWorkspace**

In `components/content/ContentWorkspace.tsx`, add the `untappedTopics` prop and render the suggestion line above the content list.

Add to the Props type:

```typescript
untappedTopics?: Array<{ topic: string; sessionCount: number }>;
```

Render the suggestion line at the top of the component's return, before any existing content:

```typescript
{untappedTopics && untappedTopics.length > 0 && (
  <div className="mb-5 px-4 py-3 rounded-[var(--r-md)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
    {untappedTopics.length === 1 ? (
      <>
        Your clients keep discussing{" "}
        <strong className="text-[color:var(--brand-strong)]">{untappedTopics[0].topic}</strong>
        {" — "}
        <a href={`/content?seed_topic=${encodeURIComponent(untappedTopics[0].topic)}`} className="font-bold text-[color:var(--text)] hover:underline">
          write about it →
        </a>
      </>
    ) : (
      <>
        <strong className="text-[color:var(--brand-strong)]">
          {untappedTopics.slice(0, 2).map((t) => t.topic).join("</strong> and <strong>")}
        </strong>
        {" keep coming up in sessions — "}
        <a href="/content" className="font-bold text-[color:var(--text)] hover:underline">
          write about them →
        </a>
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add app/content/page.tsx components/content/ContentWorkspace.tsx
git commit -m "feat: add content suggestion line from session topic analysis"
```

---

### Task 11: Offering Roster Inline Enrichment

**Files:**
- Modify: `app/clients/offerings/[id]/page.tsx`
- Modify: `components/clients/OfferingDetail.tsx`

Add session count and last session date to the offering roster for enrolled members.

- [ ] **Step 1: Add session query to the offering detail page**

In `app/clients/offerings/[id]/page.tsx`, after the existing 5-way `Promise.all`, add a coaching sessions query for all enrolled member IDs:

Add this query inside the existing Promise.all (extend the destructured array):

```typescript
  const [membersRes, roomsRes, leadsRes, { data: stripeRow }, { data: linkRow }, sessionsRes] = await Promise.all([
    // ... existing 5 queries unchanged ...
    // Add 6th:
    supabase
      .from("cp_coaching_sessions")
      .select("client_id, session_date")
      .eq("coach_id", user.id)
      .order("session_date", { ascending: false }),
  ]);
```

Then compute session counts per member and add to roster:

```typescript
  // Session data per client
  const sessionsByClient = new Map<string, { count: number; lastDate: string }>();
  for (const s of (sessionsRes.data ?? []) as Array<{ client_id: string; session_date: string }>) {
    const existing = sessionsByClient.get(s.client_id);
    if (!existing) {
      sessionsByClient.set(s.client_id, { count: 1, lastDate: s.session_date });
    } else {
      existing.count++;
      if (s.session_date > existing.lastDate) existing.lastDate = s.session_date;
    }
  }
```

Extend the `RosterRow` type to include session data. In the roster building loop, add:

```typescript
    // Inside the roster .map():
    const leadId = room ? room.lead_id : null;
    const sessions = leadId ? sessionsByClient.get(leadId) ?? null : null;

    return {
      // ... existing fields ...
      session_count: sessions?.count ?? 0,
      last_session_date: sessions?.lastDate ?? null,
    } satisfies RosterRow;
```

- [ ] **Step 2: Update the RosterRow type in OfferingDetail**

In `components/clients/OfferingDetail.tsx`, add `session_count` and `last_session_date` to the `RosterRow` type export:

```typescript
export type RosterRow = {
  // ... existing fields ...
  session_count: number;
  last_session_date: string | null;
};
```

Then render the session info in each roster row. Add after the existing fields in each member row:

```typescript
{row.session_count > 0 && (
  <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
    {row.session_count} session{row.session_count === 1 ? "" : "s"}
    {row.last_session_date && (
      <>
        {" · "}
        {(() => {
          const days = Math.round((Date.now() - new Date(row.last_session_date).getTime()) / 86_400_000);
          if (days > 14) return <span className="text-[color:var(--warning)]">last {days}d ago</span>;
          return `last ${days}d ago`;
        })()}
      </>
    )}
  </span>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add app/clients/offerings/\[id\]/page.tsx components/clients/OfferingDetail.tsx
git commit -m "feat: add session count and last session to offering roster"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] `lib/ambient.ts` data layer (Task 1-3)
- [x] Command Center redesign — hero + quiet list + business pulse (Tasks 5, 6, 8)
- [x] PersonName + PersonPanel — clickable names + slide-over (Task 7)
- [x] API route for person signals (Task 4)
- [x] Content suggestion line (Task 10)
- [x] Post-session auto-draft (Task 3)
- [x] Inline enrichment: offering roster sessions (Task 11)
- [x] Inline enrichment: SessionCard PersonName (Task 9)
- [x] Honest Question preserved (Task 8)
- [x] Layout modification for global PersonPanel (Task 7)

**2. Placeholder scan:** No TBD, TODO, or "implement later" found.

**3. Type consistency:** `RightNowItem`, `BusinessPulse`, `PersonSignals`, `ContentSignals` types are defined in Task 1 and used consistently in Tasks 4-11.

**4. Not in scope (deferred to sessions spec or future):**
- TodayPrepCard inline enrichment (offering + sequence context when expanded) — depends on sessions spec TodayPrepCard being built first
- NeedsAttentionStrip PersonName wrapping — depends on sessions spec NeedsAttentionStrip being built first
- Post-session draft display in TodayPrepCard — depends on sessions spec capture flow
- Client sidebar session pulse — covered by sessions spec Phase 1b
- Mobile bottom sheet swipe-to-dismiss — basic implementation provided, swipe gesture can be added later
