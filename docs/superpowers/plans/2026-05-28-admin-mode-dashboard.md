# Admin Mode — Working Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Coach | Admin toggle to `/command-center` that flips the calm Coach view to a dense, calm "working dashboard" (4 vital tiles + Things to handle, Content pipeline, Revenue by offering, Lead pipeline, This week) — all from structured Supabase data, no AI.

**Architecture:** A new server function `getAdminDashboard(coachId, now)` in `lib/admin-dashboard.ts` runs one `Promise.all` of RLS-scoped queries and assembles a typed `AdminDashboard` object from small pure compute helpers (unit-tested). New presentational components in `components/command-center/admin/` render it. The command-center page reads a `cc-mode` cookie and renders either the existing `CommandCenterView` (Coach) or the new `AdminDashboardView` (Admin). The shared scorer `scoreRightNowItems` gains an optional `maxItems` param so Admin shows the full attention list while Coach stays capped at 6 — Coach view code is otherwise untouched.

**Tech Stack:** Next.js App Router (edge, server components), Supabase JS client, the coach-app CSS-variable design system, Vitest.

**Reference:** Spec `docs/superpowers/specs/2026-05-28-admin-mode-dashboard-design.md`. Visual source of truth: mockup `docs/superpowers/mockups/2026-05-28-admin-mode-dashboard.html`.

**Resolved schema facts (verified against code):**
- `cp_payments` has `offering_id`, `amount_cents`, `created_at`, `status` (only `"completed"` is ever written by the Stripe webhook). → Per-offering revenue attributes via `offering_id`. There is NO dunning/failed-payment data, so the "payment failure" attention item is **out of scope** (no data to fire on).
- `cp_leads.status`: `"new" | "contacted" | "qualified" | "booked" | "client" | "closed_lost"`.
- `cp_content.status`: `"draft" | "scheduled" | "published" | "failed"`; has `published_at`, `scheduled_at`.
- `cp_offering_members.status`: `"active" | "paused" | "completed" | "dropped"`.
- `cp_client_events`: `id, title, starts_at, meeting_url, client_room_id`.

---

## File Structure

```
Create:
  lib/admin-dashboard.ts                              # AdminDashboard type, pure helpers, getAdminDashboard()
  lib/__tests__/admin-dashboard.test.ts               # unit tests for pure helpers
  components/command-center/admin/AdminDashboardView.tsx
  components/command-center/admin/VitalTile.tsx
  components/command-center/admin/ThingsToHandle.tsx
  components/command-center/admin/ContentPipeline.tsx
  components/command-center/admin/RevenueByOffering.tsx
  components/command-center/admin/LeadPipeline.tsx
  components/command-center/admin/ThisWeek.tsx
Modify:
  lib/ambient.ts                       # add optional maxItems param to scoreRightNowItems (default unchanged)
  app/command-center/page.tsx          # read cc-mode cookie; conditionally fetch admin data; render Coach or Admin
  components/command-center/CommandCenterView.tsx   # accept + render the ModeToggle in the header
```

---

## Task 1: AdminDashboard type + revenue-vitals helper

**Files:**
- Create: `lib/admin-dashboard.ts`
- Test: `lib/__tests__/admin-dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/admin-dashboard.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-dashboard` / `computeRevenueVitals is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/admin-dashboard.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-dashboard.ts lib/__tests__/admin-dashboard.test.ts
git commit -m "feat: AdminDashboard type + revenue-vitals helper"
```

---

## Task 2: Lead-pipeline + content-pipeline helpers

**Files:**
- Modify: `lib/admin-dashboard.ts`
- Test: `lib/__tests__/admin-dashboard.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { computeLeadPipeline, computeContentPipeline } from "@/lib/admin-dashboard";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: FAIL — `computeLeadPipeline is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `lib/admin-dashboard.ts`)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-dashboard.ts lib/__tests__/admin-dashboard.test.ts
git commit -m "feat: lead-pipeline + content-pipeline helpers"
```

---

## Task 3: Revenue-by-offering + this-week helpers

**Files:**
- Modify: `lib/admin-dashboard.ts`
- Test: `lib/__tests__/admin-dashboard.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { computeRevenueByOffering, computeThisWeek } from "@/lib/admin-dashboard";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: FAIL — `computeRevenueByOffering is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `lib/admin-dashboard.ts`)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/admin-dashboard.ts lib/__tests__/admin-dashboard.test.ts
git commit -m "feat: revenue-by-offering + this-week helpers"
```

---

## Task 4: Uncap the scorer + new-lead attention items

**Files:**
- Modify: `lib/ambient.ts` (the `scoreRightNowItems` signature + final loop)
- Modify: `lib/admin-dashboard.ts` (add `computeNewLeadItems`)
- Test: `lib/__tests__/admin-dashboard.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { computeNewLeadItems } from "@/lib/admin-dashboard";

describe("computeNewLeadItems", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();
  it("emits triage items for new leads older than 24h, newest first, skips recent", () => {
    const leads = [
      { id: "l1", full_name: "Old Lead", status: "new", created_at: "2026-05-10T00:00:00Z" },
      { id: "l2", full_name: "Fresh Lead", status: "new", created_at: "2026-05-15T06:00:00Z" }, // < 24h
      { id: "l3", full_name: "Contacted", status: "contacted", created_at: "2026-05-01T00:00:00Z" },
    ];
    const items = computeNewLeadItems(leads, now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ leadId: "l1", priority: 5, source: "lead" });
    expect(items[0].action.href).toBe("/leads/l1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts`
Expected: FAIL — `computeNewLeadItems is not a function`.

- [ ] **Step 3a: Add optional `maxItems` param to `scoreRightNowItems`**

In `lib/ambient.ts`, change the signature and the final cap. Find:

```ts
export function scoreRightNowItems(data: RawPulseData): RightNowItem[] {
```

Replace with:

```ts
export function scoreRightNowItems(data: RawPulseData, maxItems: number = MAX_RIGHT_NOW): RightNowItem[] {
```

Then find the dedup/cap loop near the end of the function:

```ts
    deduplicated.push(item);
    if (deduplicated.length >= MAX_RIGHT_NOW) break;
```

Replace with:

```ts
    deduplicated.push(item);
    if (deduplicated.length >= maxItems) break;
```

(Coach mode calls `scoreRightNowItems(rawData)` with no second arg, so its behavior is unchanged.)

- [ ] **Step 3b: Add `computeNewLeadItems`** (append to `lib/admin-dashboard.ts`)

```ts
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
```

**Note:** `RightNowItem.source` is a string-literal union in `lib/ambient.ts`. Add `"lead"` to that union. Find:

```ts
  source: "session" | "sequence" | "message" | "overdue" | "content" | "content_suggestion";
```

Replace with:

```ts
  source: "session" | "sequence" | "message" | "overdue" | "content" | "content_suggestion" | "lead";
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run lib/__tests__/admin-dashboard.test.ts && npx tsc --noEmit`
Expected: PASS (11 tests). Typecheck clean. Also run `npx vitest run lib/__tests__/ambient.test.ts` to confirm Coach scorer tests still pass (21 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ambient.ts lib/admin-dashboard.ts lib/__tests__/admin-dashboard.test.ts
git commit -m "feat: uncap scorer via maxItems param + new-lead attention items"
```

---

## Task 5: `getAdminDashboard` orchestrator

**Files:**
- Modify: `lib/admin-dashboard.ts`

This task wires the pure helpers to live queries. It is verified by typecheck (DB orchestration is not unit-tested in this codebase, matching `getBusinessPulse`).

- [ ] **Step 1: Implement `getAdminDashboard`** (append to `lib/admin-dashboard.ts`)

```ts
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
    supabase.from("cp_offering_members").select("id, offering_id, status, joined_at").eq("coach_id", coachId),
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
```

**Note:** if `summarizeTrust` returns a different field than `asIsPct28`, match whatever `getBusinessPulse` uses for `trustRate` (it reads `trust.asIsPct28`). Verify against `lib/ambient.ts` line where `computeMetrics` is called.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `cp_offering_members` has no `joined_at` or `coach_id` column, adjust the select (check `lib/types.ts` `OfferingMember` — it has `joined_at`; confirm `coach_id` exists, else drop the `.eq("coach_id", coachId)` and rely on RLS like the offering-detail page does).

- [ ] **Step 3: Commit**

```bash
git add lib/admin-dashboard.ts
git commit -m "feat: getAdminDashboard orchestrator"
```

---

## Task 6: `VitalTile` component

**Files:**
- Create: `components/command-center/admin/VitalTile.tsx`

Presentational; verified by typecheck + visual check against the mockup's `.vital` tiles.

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/VitalTile.tsx
"use client";

type Props = {
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down" | "flat" };
  context: string;
  sparkline?: number[]; // raw values; rendered as a normalized polyline
  ringPct?: number;     // 0-100; renders a small progress ring
};

export default function VitalTile({ label, value, delta, context, sparkline, ringPct }: Props) {
  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] p-[18px]">
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-semibold">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-2 font-display text-[30px] font-bold tracking-[-0.03em] leading-none">
        {value}
        {delta && (
          <span className={`text-[length:var(--t-caption)] font-bold ${delta.dir === "up" ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}`}>
            {delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : ""} {delta.text}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{context}</div>
      {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
      {ringPct != null && <Ring pct={ringPct} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 64, h = 26;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="absolute right-3.5 bottom-3.5" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts} stroke="var(--brand-strong)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="absolute right-3.5 top-4" aria-hidden>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-deep)" strokeWidth="5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--brand-strong)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/admin/VitalTile.tsx
git commit -m "feat: VitalTile component"
```

---

## Task 7: `ThingsToHandle` component

**Files:**
- Create: `components/command-center/admin/ThingsToHandle.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/ThingsToHandle.tsx
"use client";

import type { RightNowItem } from "@/lib/ambient";
import PersonName from "@/components/ambient/PersonName";

const ALERT_SOURCES = new Set(["overdue", "message", "sequence"]);

export default function ThingsToHandle({ items }: { items: RightNowItem[] }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-[color:var(--text)]">Things to handle</span>
        <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 ${items.length > 0 ? "bg-[var(--danger-soft)] text-[color:var(--danger)]" : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"}`}>
          {items.length} open
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 px-[18px] py-4 border-t border-[var(--border-faint)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
          <span className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">You&apos;re all clear — nothing needs you.</span>
        </div>
      ) : (
        items.map((item) => {
          const dot = item.source === "content" || item.source === "content_suggestion"
            ? "bg-[var(--brand)]"
            : ALERT_SOURCES.has(item.source) ? "bg-[var(--danger)]" : "bg-[var(--border-strong)]";
          return (
            <div key={item.id} className="flex items-center gap-3 px-[18px] py-[11px] border-t border-[var(--border-faint)]">
              <span className={`h-[7px] w-[7px] rounded-full shrink-0 ${dot}`} aria-hidden />
              <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                {item.leadId && item.leadName ? (
                  <>
                    <PersonName leadId={item.leadId} name={item.leadName} />
                    <span className="text-[color:var(--text-muted)] text-[length:var(--t-caption)] truncate">— {item.reason}</span>
                  </>
                ) : (
                  <span className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] truncate">{item.reason}</span>
                )}
              </div>
              {item.action.href && (
                <a href={item.action.href} className="shrink-0 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-muted)] hover:text-[color:var(--text)] whitespace-nowrap">
                  {item.action.label} →
                </a>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/admin/ThingsToHandle.tsx
git commit -m "feat: ThingsToHandle component"
```

---

## Task 8: `ContentPipeline` component

**Files:**
- Create: `components/command-center/admin/ContentPipeline.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/ContentPipeline.tsx
"use client";

type Props = { content: { draft: number; scheduled: number; publishedThisWeek: number } };

export default function ContentPipeline({ content }: Props) {
  const stages = [
    { name: "Drafts ready", n: content.draft, soft: false },
    { name: "Scheduled", n: content.scheduled, soft: true },
    { name: "Published", n: content.publishedThisWeek, soft: false },
  ];
  const max = Math.max(content.draft, content.scheduled, content.publishedThisWeek, 1);
  return (
    <a href="/content" className="block rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden hover:border-[var(--border-strong)] transition">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Content pipeline</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">this week</span>
      </div>
      {stages.map((s) => (
        <div key={s.name} className="px-[18px] py-2.5 border-t border-[var(--border-faint)]">
          <div className="flex items-center justify-between text-[length:var(--t-caption)] mb-1.5">
            <span className="text-[color:var(--text-muted)] font-semibold">{s.name}</span>
            <span className="font-display font-bold">{s.n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${(s.n / max) * 100}%`, background: s.soft ? "var(--border-strong)" : "var(--brand-strong)" }} />
          </div>
        </div>
      ))}
    </a>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/command-center/admin/ContentPipeline.tsx
git commit -m "feat: ContentPipeline component"
```

---

## Task 9: `RevenueByOffering` component

**Files:**
- Create: `components/command-center/admin/RevenueByOffering.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/RevenueByOffering.tsx
"use client";

type Offering = {
  id: string; name: string; revenueCents: number; enrolled: number;
  capacity: number | null; priceCents: number | null; pctFull: number | null; projectedCents: number | null;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function RevenueByOffering({ offerings }: { offerings: Offering[] }) {
  const total = offerings.reduce((s, o) => s + o.revenueCents, 0);
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Revenue by offering</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{usd(total)}</span>
      </div>
      {offerings.length === 0 ? (
        <div className="px-[18px] py-4 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-faint)]">No active offerings yet.</div>
      ) : (
        offerings.map((o) => (
          <a key={o.id} href={`/clients/offerings/${o.id}`} className="block px-[18px] py-3.5 border-t border-[var(--border-faint)] hover:bg-[var(--surface-deep)] transition">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="font-extrabold text-[14px]">{o.name}</span>
              <span className="font-display font-bold text-[16px]">{usd(o.revenueCents)}</span>
            </div>
            {o.capacity != null && (
              <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden" role="img" aria-label={`${o.enrolled} of ${o.capacity} seats filled`}>
                <span className="block h-full rounded-full bg-[var(--brand-strong)]" style={{ width: `${o.pctFull ?? 0}%` }} />
              </div>
            )}
            <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">
              {o.capacity != null
                ? `${o.enrolled} of ${o.capacity} seats${o.priceCents ? ` · ${usd(o.priceCents)} / seat` : ""}${o.pctFull != null ? ` · ${o.pctFull}% full` : ""}`
                : `${o.enrolled} active${o.priceCents ? ` · ${usd(o.priceCents)}` : ""}`}
            </div>
          </a>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/command-center/admin/RevenueByOffering.tsx
git commit -m "feat: RevenueByOffering component"
```

---

## Task 10: `LeadPipeline` component

**Files:**
- Create: `components/command-center/admin/LeadPipeline.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/LeadPipeline.tsx
"use client";

type Props = { pipeline: { new: number; contacted: number; qualified: number; booked: number; won: number } };

export default function LeadPipeline({ pipeline }: Props) {
  const stages = [
    { name: "New", n: pipeline.new },
    { name: "Contacted", n: pipeline.contacted },
    { name: "Qualified", n: pipeline.qualified },
    { name: "Booked", n: pipeline.booked },
    { name: "Won this month", n: pipeline.won },
  ];
  const total = stages.reduce((s, x) => s + x.n, 0);
  const max = Math.max(...stages.map((s) => s.n), 1);
  return (
    <a href="/leads" className="block rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden hover:border-[var(--border-strong)] transition">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">Lead pipeline</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{total} leads</span>
      </div>
      {stages.map((s) => (
        <div key={s.name} className="px-[18px] py-2.5 border-t border-[var(--border-faint)]">
          <div className="flex items-center justify-between text-[length:var(--t-caption)] mb-1.5">
            <span className="text-[color:var(--text-muted)] font-semibold">{s.name}</span>
            <span className="font-display font-bold">{s.n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-deep)] overflow-hidden">
            <span className="block h-full rounded-full bg-[var(--brand-strong)]" style={{ width: `${(s.n / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </a>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/command-center/admin/LeadPipeline.tsx
git commit -m "feat: LeadPipeline component"
```

---

## Task 11: `ThisWeek` component

**Files:**
- Create: `components/command-center/admin/ThisWeek.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/ThisWeek.tsx
"use client";

type WeekEvent = { id: string; title: string; startsAt: string; clientName: string | null; meetingUrl: string | null };

function dayTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ThisWeek({ events }: { events: WeekEvent[] }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">This week</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <div className="px-[18px] py-4 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-faint)]">No sessions on the calendar this week.</div>
      ) : (
        events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-[18px] py-[11px] border-t border-[var(--border-faint)]">
            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] w-[78px] shrink-0 tabular-nums">{dayTime(e.startsAt)}</span>
            <span className="flex-1 min-w-0 truncate text-[length:var(--t-body)] font-semibold">{e.clientName ?? e.title}</span>
            <a href={e.meetingUrl ?? "/clients?tab=sessions"} className="shrink-0 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
              {e.meetingUrl ? "Join →" : "Prep →"}
            </a>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/command-center/admin/ThisWeek.tsx
git commit -m "feat: ThisWeek component"
```

---

## Task 12: `AdminDashboardView` container + first-run panel

**Files:**
- Create: `components/command-center/admin/AdminDashboardView.tsx`

- [ ] **Step 1: Implement**

```tsx
// components/command-center/admin/AdminDashboardView.tsx
"use client";

import type { AdminDashboard } from "@/lib/admin-dashboard";
import VitalTile from "@/components/command-center/admin/VitalTile";
import ThingsToHandle from "@/components/command-center/admin/ThingsToHandle";
import ContentPipeline from "@/components/command-center/admin/ContentPipeline";
import RevenueByOffering from "@/components/command-center/admin/RevenueByOffering";
import LeadPipeline from "@/components/command-center/admin/LeadPipeline";
import ThisWeek from "@/components/command-center/admin/ThisWeek";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Eyebrow({ children, count, alert }: { children: React.ReactNode; count?: number; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[color:var(--text-faint)] mb-3 mt-[34px] first:mt-0">
      {children}
      {count != null && (
        <span className={`rounded-full px-2 py-px text-[11px] tracking-normal ${alert ? "bg-[var(--danger-soft)] text-[color:var(--danger)]" : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"}`}>{count}</span>
      )}
    </div>
  );
}

export default function AdminDashboardView({ data, toggle }: { data: AdminDashboard; toggle: React.ReactNode }) {
  const v = data.vitals;
  const isEmptyBusiness =
    v.revenue.thisMonthCents === 0 && v.members.active === 0 &&
    v.sessions.thisMonth === 0 && data.attention.length === 0 &&
    data.leadPipeline.new + data.leadPipeline.contacted + data.leadPipeline.qualified + data.leadPipeline.booked + data.leadPipeline.won === 0;

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-[34px] font-bold tracking-[-0.02em] leading-[1.1] text-[color:var(--text)]">Your business.</h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">{data.monthLabel} · updated moments ago</p>
        </div>
        {toggle}
      </div>

      {isEmptyBusiness ? (
        <div className="mt-6 rounded-[var(--r-lg)] border-l-[3px] border-[var(--brand)] bg-[var(--surface-elevated)] shadow-[var(--shadow-sm)] p-5 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Your business dashboard fills in as you add clients, log sessions, and make sales. Nothing to show yet.
        </div>
      ) : (
        <>
          <Eyebrow>Vital signs</Eyebrow>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <VitalTile label="Revenue this month" value={usd(v.revenue.thisMonthCents)}
              delta={v.revenue.pctChange != null ? { text: `${Math.abs(v.revenue.pctChange)}%`, dir: v.revenue.trend } : undefined}
              context={v.revenue.lastMonthCents > 0 ? `vs ${usd(v.revenue.lastMonthCents)} last month` : "first month with revenue"}
              sparkline={v.revenue.sparkline} />
            <VitalTile label="Active members" value={`${v.members.active}`}
              delta={v.members.newThisMonth > 0 ? { text: `+${v.members.newThisMonth}`, dir: "up" } : undefined}
              context={`${v.members.newThisMonth} new this month · ${v.members.offeringCount} offering${v.members.offeringCount === 1 ? "" : "s"}`} />
            <VitalTile label="Sessions this month" value={`${v.sessions.thisMonth}`}
              context={`${v.sessions.upcomingThisWeek} coming up this week`} />
            <VitalTile label="Voice trust" value={v.trust.rate != null ? `${v.trust.rate}%` : "—"}
              context={v.trust.rate != null ? "how often you ship as-is" : "build your voice to unlock"}
              ringPct={v.trust.rate ?? undefined} />
          </div>

          <Eyebrow count={data.attention.length} alert={data.attention.length > 0}>Needs attention</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3">
            <ThingsToHandle items={data.attention} />
            <ContentPipeline content={data.content} />
          </div>

          <Eyebrow>Where the money is</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-3">
              <RevenueByOffering offerings={data.revenueByOffering} />
              <ThisWeek events={data.thisWeek} />
            </div>
            <LeadPipeline pipeline={data.leadPipeline} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/command-center/admin/AdminDashboardView.tsx
git commit -m "feat: AdminDashboardView container + first-run panel"
```

---

## Task 13: Wire the toggle + cookie + page render

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx` (accept + render a `toggle` slot in header)
- Modify: `app/command-center/page.tsx` (read cookie, conditional fetch, render Coach or Admin)
- Create (small client wrapper): `components/command-center/ModeToggleBar.tsx`

The toggle must set a cookie and refresh the route. Build a tiny client wrapper around the existing `ModeToggle` that writes `document.cookie` and calls `router.refresh()`.

- [ ] **Step 1: Create the toggle wrapper**

```tsx
// components/command-center/ModeToggleBar.tsx
"use client";

import { useRouter } from "next/navigation";
import ModeToggle, { type Mode } from "@/components/command-center/ModeToggle";

export default function ModeToggleBar({ mode }: { mode: Mode }) {
  const router = useRouter();
  function onModeChange(next: Mode) {
    if (next === mode) return;
    document.cookie = `cc-mode=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }
  return <ModeToggle mode={mode} onModeChange={onModeChange} />;
}
```

- [ ] **Step 2: Add a `toggle` slot to `CommandCenterView`**

In `components/command-center/CommandCenterView.tsx`, change the `Props` type and both header blocks (first-run AND normal) to accept and render a toggle node on the right of the header.

Change the props:

```tsx
type Props = {
  pulse: BusinessPulse;
  coachFirstName: string;
  toggle?: React.ReactNode;
};

export default function CommandCenterView({ pulse, coachFirstName, toggle }: Props) {
```

Then in BOTH `<header>` blocks, wrap the existing heading + breath line and add the toggle. Replace each:

```tsx
      <header>
        <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          Hey, {coachFirstName}.
        </h1>
        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
          Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.
        </p>
      </header>
```

with (use "Welcome, {coachFirstName}." in the first-run block, "Hey, {coachFirstName}." in the normal block — keep each block's existing wording):

```tsx
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Hey, {coachFirstName}.
          </h1>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
            Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.
          </p>
        </div>
        {toggle}
      </header>
```

- [ ] **Step 3: Rewire the page**

In `app/command-center/page.tsx`, add the cookie read + conditional admin fetch + render. Replace the imports + body:

```tsx
import { getBusinessPulse } from "@/lib/ambient";
import { getAdminDashboard } from "@/lib/admin-dashboard";
import AdminDashboardView from "@/components/command-center/admin/AdminDashboardView";
import ModeToggleBar from "@/components/command-center/ModeToggleBar";
import type { Mode } from "@/components/command-center/ModeToggle";
```

After `const navUnlocks` block and `cookies().set(...)`, read the mode and branch:

```tsx
  const mode: Mode = cookies().get("cc-mode")?.value === "admin" ? "admin" : "coach";
  const now = Date.now();
  const toggle = <ModeToggleBar mode={mode} />;

  if (mode === "admin") {
    const dashboard = await getAdminDashboard(user.id, now);
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
          <AdminDashboardView data={dashboard} toggle={toggle} />
        </main>
      </div>
    );
  }

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
          toggle={toggle}
        />
      </main>
    </div>
  );
```

Remove the old single `const now = Date.now();` / `const pulse = ...` / single return that this replaces (don't leave a duplicate `now` declaration).

- [ ] **Step 4: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; all tests pass (existing 150 + new admin-dashboard tests).

- [ ] **Step 5: Visual check**

Run `npm run dev`, open `/command-center`, click **Admin** in the toggle. Confirm: dashboard renders, vitals show, toggle flips back to Coach and the cookie persists across reload. Compare against `docs/superpowers/mockups/2026-05-28-admin-mode-dashboard.html`.

- [ ] **Step 6: Commit**

```bash
git add app/command-center/page.tsx components/command-center/CommandCenterView.tsx components/command-center/ModeToggleBar.tsx
git commit -m "feat: wire Coach|Admin toggle into command center with cookie persistence"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage:** Tasks 1–5 cover the data layer (vitals, attention, content, revenue-by-offering, lead pipeline, this-week). Tasks 6–12 cover all 5 boxes + 4 vitals + first-run panel. Task 13 covers the toggle + persistence + page wiring. Payment-failure attention item is intentionally dropped (no data) — documented in the spec's scope and the plan header.
- **Type consistency:** `AdminDashboard` is defined once (Task 1) and every later task references its sub-fields by the exact names declared there. `RightNowItem` source union gains `"lead"` in Task 4 before `computeNewLeadItems` uses it.
- **Coach view safety:** the only Coach-touching change is the optional `maxItems` param (default unchanged) and an additive `toggle` prop. The calm view's content is untouched.
- **Verify-at-runtime:** Task 5 notes two schema confirmations (`cp_offering_members.coach_id`/`joined_at`, `summarizeTrust` field name) — check against `lib/types.ts` and `getBusinessPulse` during implementation; fall back to RLS-only scoping if a `coach_id` column is absent (matches the offering-detail page pattern).
