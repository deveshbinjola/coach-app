# Admin Mode — Working Dashboard Design

**Goal:** Give the coach a second face of the command center — a dense, calm "working dashboard" that answers *"how is my business doing, and what needs me?"* — reachable by a Coach | Admin toggle, without touching the calm Coach view.

**Architecture:** A `mode` toggle on `/command-center` flips between two client views fed by one server page. Coach mode = the existing `CommandCenterView` (calm Right Now list). Admin mode = a new `AdminDashboardView` composed of small, single-responsibility box components. A new server function `getAdminDashboard(coachId, now)` returns one structured object; all numbers are computed from Supabase rows — **no AI, no narrative generation** (structured data for display, per house rule).

**Tech Stack:** Next.js App Router (edge, server component page), Supabase (parallel `Promise.all` queries, RLS-scoped by `coach_id`), the coach-app CSS-variable design system, Vitest for the data layer.

**Reference mockup:** `docs/superpowers/mockups/2026-05-28-admin-mode-dashboard.html` (open in a browser — this spec describes how to turn that mockup into production components).

---

## 1. Scope

**In scope (this spec — Admin Mode v1):**
- Coach | Admin toggle on `/command-center`, persisted.
- Admin dashboard: 4 vital tiles + 5 boxes (Things to handle, Content pipeline, Revenue by offering, Lead pipeline, This week).
- `getAdminDashboard()` data layer + types + tests.

**Out of scope (separate work):**
- **Platform cockpit `/admin` polish** — the existing founder-facing page (all coaches, platform revenue, Squad, SOPs). Its own spec later.
- **Client health / at-risk box** — agreed v1.1, built immediately after.
- MRR-over-time charts, churn %, referral tree, testimonials (parked; too little data to be meaningful).

---

## 2. UX Principles (the non-negotiables)

These are what make it "sophisticated but easy," not "busy." Every component decision serves one of these:

1. **Three altitudes, top to bottom.** Visual weight *decreases* as the eye travels down:
   - **Glance** (Vital signs) — biggest type, top.
   - **Act** (Needs attention) — medium, the working zone.
   - **Explore** (Money & pipeline) — quietest, bottom.
2. **One accent, not ten.** Brand green (`--brand`) = good / primary action. A single red (`--danger`) dot = "this needs you." Everything else is grayscale (`--text`, `--text-muted`, `--text-faint`). This is the explicit antidote to the current `/admin` page's purple/blue/amber/red rainbow.
3. **Every number carries its comparison.** Never a naked figure. `$14,000 ↑18% vs last month`, `12 active · 2 new`, `8 sessions · 3 this week`. A number with context is understood in a beat; a naked number forces interpretation.
4. **Same design language as Coach mode.** Admin mode is denser, not different. Same tokens, same `Card`/`Badge`/`PersonName` primitives. Coach and Admin must feel like one product, two zoom levels.
5. **Every box answers one question and offers one action.** If a box has no action and no comparison, it's a scoreboard tile, not a working box — demote it to Vitals or cut it.

---

## 3. Information Architecture & Layout

Content column is `max-w-5xl` (wider than Coach's `max-w-3xl` — a dashboard wants grid room, a reading list wants a column). Centered, generous vertical rhythm (`space-y` at the section level, `--s5`/`--s6`).

```
┌───────────────────────────────────────────────┐
│  Your business.                  [ Coach |Admin]│  header + toggle
│  May 2026 · updated moments ago                 │
├───────────────────────────────────────────────┤
│  VITAL SIGNS                                    │  eyebrow
│  [Revenue] [Members] [Sessions] [Voice trust]   │  4-col grid (2-col mobile)
├───────────────────────────────────────────────┤
│  NEEDS ATTENTION  (4)                           │  eyebrow + count
│  ┌─ Things to handle ────┐ ┌─ Content ───────┐  │  1.4fr / 1fr grid
│  │ • Ronnie — overdue    │ │ Drafts    11    │  │
│  │ • Marcus — waiting    │ │ Scheduled  2    │  │
│  │ • Sequence failed     │ │ Published  5    │  │
│  │ • 11 drafts → Review  │ │                 │  │
│  └───────────────────────┘ └─────────────────┘  │
├───────────────────────────────────────────────┤
│  WHERE THE MONEY IS                             │  eyebrow
│  ┌─ Revenue by offering ─┐ ┌─ Lead pipeline ─┐  │  1fr / 1fr grid
│  │ Cohort   6/10  $12,000│ │ New        14   │  │
│  │ BYB      1/—   $12,000│ │ Contacted   8   │  │
│  └───────────────────────┘ │ Qualified   3   │  │
│  ┌─ This week ───────────┐ │ Booked      2   │  │
│  │ Tue 2pm · Marcus call │ │ Won         1   │  │
│  │ Thu 10a · Cohort group│ └─────────────────┘  │
│  └───────────────────────┘                      │
└───────────────────────────────────────────────┘
```

Responsive: at `<880px` vitals collapse 4→2 cols and all `.work`/grid rows stack to single column. Boxes never shrink below readable; they reflow.

---

## 4. Component Breakdown

All live in `components/command-center/admin/`. Each is a pure presentational component receiving typed props (no data fetching inside).

### 4.1 `AdminDashboardView` (container)
- **Props:** `data: AdminDashboard`, `coachFirstName: string`.
- Renders header ("Your business." + month label + updated note), the three eyebrow'd sections, and the box grid. Owns no state except layout.

### 4.2 Vital tile — `VitalTile`
- **Props:** `label`, `value` (string), `delta?` ({ text, dir: "up"|"down"|"flat" }), `context`, `accessory?` ("sparkline" | "ring" | none with the numeric input).
- Anatomy: label (faint) → big display number + delta → context line. Optional sparkline (bottom-right) or progress ring (top-right).
- Used 4×: Revenue, Members, Sessions, Voice trust.

### 4.3 `ThingsToHandle` (the soul)
- **Purpose:** one place for everything needing action so nothing slips.
- **Contents:** the **full** scored attention list (NOT capped at 6 like Coach mode). Rows = `dot` (red = alert, brand = content, gray = neutral) · `PersonName`/label · reason · action (`primary` pill when href, text link otherwise). Header shows open count.
- **Sources it unifies:** overdue clients, messages waiting >48h, failed sequences, content drafts, **payment failures (dunning)**, **new leads to triage**.
- **Empty state:** "You're all clear — nothing needs you." (brand dot, warm, mirrors Coach all-clear).

### 4.4 `ContentPipeline`
- **Purpose:** "Is my marketing engine moving?"
- **Contents:** three stages with count + bar — Drafts (`draft`), Scheduled (`scheduled`), Published (`published`, this week). Bar width = stage count / max stage count. Header pill = "this week".
- **Action:** whole card links to `/content`.

### 4.5 `RevenueByOffering`
- **Purpose:** "Where's my money, and where's the headroom?"
- **Contents:** per active offering — name, revenue this month, capacity bar (`enrolled/capacity`), meta line (`6 of 10 seats · $2,000/seat · 60% full`). Header pill = total. If `capacity` null, show enrolled count only (no bar). Projected-at-capacity shown when capacity exists and not full.
- **Action:** each offering row links to `/clients/offerings/[id]`.

### 4.6 `LeadPipeline`
- **Purpose:** "Is future revenue healthy?"
- **Contents:** stages New → Contacted → Qualified → Booked → Won, count + bar each (`closed_lost` excluded). Header pill = total active leads. Conversion note: Won / total %.
- **Action:** whole card links to `/leads`.

### 4.7 `ThisWeek`
- **Purpose:** "What's on my plate?"
- **Contents:** upcoming `cp_client_events` from now → +7 days, sorted ascending. Each row: day+time, title/client name, Join (if `meeting_url`) or Prep link. Empty state: "No sessions on the calendar this week."
- **Action:** Join (meeting_url) / Prep (`/clients?tab=sessions`).

---

## 5. Data Layer — `getAdminDashboard(coachId, now)`

New function in `lib/ambient.ts` (or `lib/admin-dashboard.ts` if `ambient.ts` grows past ~600 lines — split by responsibility). Returns one object. Reuses the existing scorer and pulse queries where possible; adds aggregations. One `Promise.all` of RLS-scoped queries.

```ts
export type AdminDashboard = {
  monthLabel: string;                       // "May 2026"
  vitals: {
    revenue: { thisMonthCents: number; lastMonthCents: number;
               trend: "up" | "down" | "flat"; pctChange: number | null;
               sparkline: number[] };       // last 6 months, cents
    members: { active: number; newThisMonth: number; offeringCount: number };
    sessions: { thisMonth: number; upcomingThisWeek: number };
    trust: { rate: number | null };
  };
  attention: RightNowItem[];                // full list (reuses scoreRightNowItems, uncapped)
  content: { draft: number; scheduled: number; publishedThisWeek: number };
  revenueByOffering: Array<{
    id: string; name: string; revenueCents: number;
    enrolled: number; capacity: number | null; priceCents: number | null;
    pctFull: number | null; projectedCents: number | null;
  }>;
  leadPipeline: { new: number; contacted: number; qualified: number;
                  booked: number; won: number };
  thisWeek: Array<{ id: string; title: string; startsAt: string;
                    clientName: string | null; meetingUrl: string | null }>;
};
```

**Computation notes (all structured, no AI):**
- **Revenue this/last month + sparkline:** sum `cp_payments.amount_cents` bucketed by month over the last 6 months. `trend`/`pctChange` from this vs last. Reuses the month logic already in `computeMetrics`.
- **Members:** `cp_offering_members` where `status='active'`; `newThisMonth` = members joined since month start; `offeringCount` = distinct active offerings with ≥1 active member.
- **Sessions:** `cp_coaching_sessions` this month count; `upcomingThisWeek` = `cp_client_events` now→+7d count.
- **Trust:** reuse `summarizeTrust` (already imported in ambient.ts).
- **attention:** call `scoreRightNowItems` and return the full array; **extend the scorer** to also emit payment-failure items (from `cp_payments.status` failed/dunning) and new-lead-triage items (`cp_leads.status='new'` past N hours). Coach mode keeps its `slice(0,6)`; Admin shows all.
- **content:** `cp_content` grouped by `status`; `publishedThisWeek` filtered by published timestamp ≥ 7d ago.
- **revenueByOffering:** join `cp_offerings` (status='active') × `cp_offering_members` (active count) × `cp_payments` attributed to offering. `pctFull = enrolled/capacity`; `projectedCents = capacity*price` when capacity set and enrolled<capacity.
- **leadPipeline:** `cp_leads` grouped by `status` into the 5 buckets; `closed_lost` excluded.

The page `app/command-center/page.tsx` calls `getAdminDashboard()` **only when needed** (see §6) to avoid doubling query cost on every load.

---

## 6. Toggle Behavior & Data Fetching

- Reuse the existing `components/command-center/ModeToggle.tsx` (`"coach" | "admin"`), placed top-right of the header in both views.
- **Persistence:** last-selected mode stored in a cookie `cc-mode` (read server-side) so the page renders the right view on first paint — no flash. Toggling updates the cookie and swaps the view.
- **Fetching strategy (decision):** the page fetches Coach pulse always (cheap, already built); it fetches `getAdminDashboard()` **only when `mode==='admin'`**. Implementation: the page reads the `cc-mode` cookie, and conditionally awaits the admin query. Switching modes is a client navigation that re-requests with the new cookie (or a lightweight client fetch to an `/api/admin-dashboard` route). **Chosen:** server-driven — toggling sets the cookie and refreshes the route; keeps both views server-rendered and avoids a client data-fetching layer. (If perceived latency is bad in testing, add the API route as a fast-follow.)

---

## 7. Visual Design Spec

Tokens (from `app/globals.css`):
- **Surfaces:** cards `--surface-elevated` + `1px --border-faint` + `--shadow-sm`; page uses the existing body gradient.
- **Radii:** tiles/cards `--r-lg` (14px); inner pills `9999px`; action buttons `--r-md`.
- **Type:** big numbers in `--font-display` (Fraunces) at ~30px for vitals, ~16px for offering revenue; labels/eyebrows at `--t-caption` (13px) / 11px uppercase; body rows at `--t-body`.
- **Color discipline:** green `--brand`/`--brand-strong` for positive deltas, primary actions, "good" bars; `--danger` ONLY for the alert dot and dunning. All other text grayscale. Soft bars use `--border-strong` on `--surface-deep` track.
- **Eyebrow section labels:** 11px, `--text-faint`, uppercase, letter-spacing 0.08em, with an optional count pill (`--surface-deep`, or `--danger-soft` when it's an alert count).
- **Anatomy of a working row:** `dot · who(bold) · reason(muted, truncates) · action(right, primary pill or text link)`. Matches the Coach quiet-list row we just shipped — deliberate reuse.

Match the reference mockup pixel-for-pixel in spacing and hierarchy; the mockup is the source of truth for look.

---

## 8. States

- **Loading:** server-rendered, so no spinner; the page awaits data. (No skeleton needed for v1.)
- **First-run / empty business:** if the coach has no revenue, no members, no sessions, and no leads → Admin mode shows a single calm panel: "Your business dashboard fills in as you add clients, log sessions, and make sales." + a link back to Coach mode. (Do not show empty zero-everything boxes — that reads as broken, the same lesson from the Coach first-run fix.)
- **Per-box empty:** each box has its own empty line (e.g. "No offerings yet", "No sessions on the calendar this week") rather than disappearing, so the grid stays stable — EXCEPT in the whole-business first-run case above.
- **Error:** if `getAdminDashboard` throws, render Coach mode with a non-blocking toast "Couldn't load the dashboard." (Admin is additive; never block the calm view.)

---

## 9. Accessibility
- Toggle is a `role="tablist"` with `aria-selected` (already in `ModeToggle`).
- Each section wrapped in `<section aria-label>`.
- Bars get `role="img"` + `aria-label` (e.g. "6 of 10 seats filled").
- Color is never the only signal: the alert dot pairs with text ("overdue"), deltas pair with ↑/↓ glyphs + text.

---

## 10. Testing

Vitest, data layer only (presentational components verified visually against the mockup):
- `getAdminDashboard` returns correct buckets for a seeded fixture (revenue this/last month, member counts, lead pipeline buckets, content counts, this-week filtering).
- Lead pipeline excludes `closed_lost`.
- Revenue trend up/down/flat + pctChange null when last month is 0.
- `projectedCents` null when capacity null; computed when capacity set and not full.
- attention list is uncapped (returns >6 when >6 items exist) while Coach mode still slices to 6.
- First-run detection: all-zero business → `attention` empty, vitals zeroed (drives the empty panel).

---

## 11. File Structure

```
Create:
  lib/admin-dashboard.ts                              # getAdminDashboard + AdminDashboard type (or in ambient.ts if small)
  components/command-center/admin/AdminDashboardView.tsx
  components/command-center/admin/VitalTile.tsx
  components/command-center/admin/ThingsToHandle.tsx
  components/command-center/admin/ContentPipeline.tsx
  components/command-center/admin/RevenueByOffering.tsx
  components/command-center/admin/LeadPipeline.tsx
  components/command-center/admin/ThisWeek.tsx
  lib/__tests__/admin-dashboard.test.ts
Modify:
  lib/ambient.ts                # extend scoreRightNowItems: payment-failure + new-lead items; export uncapped variant
  app/command-center/page.tsx   # read cc-mode cookie; conditionally fetch admin data; render Coach or Admin view
  components/command-center/ModeToggle.tsx   # re-home into header (currently orphaned)
```

---

## 12. Open Questions (resolve in planning, not blocking design)
- Does `cp_payments` carry an offering attribution column for per-offering revenue, or must we attribute via `cp_offering_members` → payment join? (Verify schema; fall back to offering-member-count × price if no direct link.)
- Confirm `cp_payments.status` values for dunning/failed so the new attention item fires correctly.
