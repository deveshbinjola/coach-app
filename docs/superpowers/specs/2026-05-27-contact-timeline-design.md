# Contact Timeline — Design Spec

## Overview

Add a unified timeline to the lead detail page (`/leads/[id]`) that shows every interaction with a contact in one chronological feed: messages, coaching sessions, payments, Brand OS runs, quiz completions, and status changes. Replace the current messages-only center column with a tabbed view where Timeline is the default tab.

## Goals

- Coach sees full client context in 10 seconds instead of 3-5 minutes across 4 screens
- Every future feature (automation sequences, scheduling, etc.) automatically surfaces in the timeline
- No new database tables, migrations, or API routes required

## Approach

**Client-side merge (Approach A).** Server page fires 8 parallel Supabase queries via `Promise.all`, passes typed arrays to a client component that normalizes, sorts by date, groups by day, and renders event cards. Matches the existing `LeadDetail` pattern.

---

## Layout Changes

### Current state
- 3-column grid: sidebar (contact info, FitCard, ObjectionDeck) + center (messages only + compose box)
- No tab navigation
- No cross-feature visibility

### New state
- Same 3-column grid, sidebar gains a **SummaryCard** at the top
- Center column gains a **TabBar** with 3 tabs: Timeline (default), Messages, Sessions
- Timeline tab has **FilterChips** (All, Messages, Sessions, Payments, Brand OS) + chronological event feed
- Messages tab renders the existing conversation thread unchanged
- Sessions tab shows coaching sessions filtered to this client
- Compose box renders below all tabs (always visible)
- All existing components (FitCard, ObjectionDeck, lead memory, sticky CTA bar, "Turn into content") remain unchanged

### SummaryCard (sidebar addition)
Displays computed aggregates above contact info:
- Total sessions count
- Total amount paid (sum of `cp_payments` where status = paid)
- Brand OS completion status (complete/in-progress/not started)
- "Client since" date (when status changed to client) or lead age
- Next session date (if available from `cp_coaching_sessions`)

---

## Unified Type

```typescript
type TimelineEventKind =
  | "message"
  | "session"
  | "payment"
  | "brand_os"
  | "quiz"
  | "status_change"
  | "lead_created";

type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  timestamp: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string | number | boolean>;
  accent: "green" | "indigo" | "amber" | "blue" | "none";
  linkTo?: string;
};
```

---

## Data Sources

8 parallel Supabase queries, each with its own normalizer function:

| # | Table | Filter | Event kind | Key fields |
|---|-------|--------|------------|------------|
| 1 | `cp_lead_messages` | `lead_id = id` | `message` | direction, body preview, sent_at |
| 2 | `cp_coaching_sessions` | `client_id = lead.id, coach_id` | `session` | ai_summary, commitments, somatic_observations, session_date |
| 3 | `cp_payments` | `customer_email = lead.email` | `payment` | amount_cents, status, created_at |
| 4 | `cp_brand_os_runs` | `coach_id` + match lead name/email against run's `audience` or `label` field | `brand_os` | current_module, completed_at, started_at |
| 5 | `cp_funnel_events` | `email or lead match` | `quiz` | name, meta (contains answers), created_at |
| 6 | `cp_subscriptions` | `customer_email = lead.email` | `payment` | amount, status, interval, created_at |
| 7 | `cp_tripwire_purchases` | `email = lead.email` | `payment` | amount, created_at |
| 8 | `cp_leads` (self) | Already loaded | `lead_created` + `status_change` | created_at, status |

The `mergeTimeline()` function takes all 8 normalized arrays, concatenates, and sorts by `timestamp` descending (newest first).

---

## Event Card Designs

### Session card (richest)
- Green left border (`rgba(0,255,65,0.35)`)
- Icon: 🧠 in green-tinted circle
- Title: "Session #N completed"
- Subtitle: AI summary snippet (first ~150 chars)
- Badges: commitment count, somatic observation count
- Link: "→ View full session" to `/sessions/[id]`

### Payment card
- No border accent
- Icon: 💳 in emerald-tinted circle
- Title: "Payment received — $AMOUNT" (amount in green)
- Subtitle: offering name + frequency
- Failed payments: amount in red, "Failed" badge

### Brand OS card
- Indigo left border (`rgba(99,102,241,0.3)`)
- Icon: 📊 in indigo-tinted circle
- Title: "Brand OS — Step N Complete"
- Subtitle: what was generated
- Progress dots (4 dots, filled = completed steps)
- Link: "→ View Brand OS output"

### Message card
- No border accent
- Icon: ↑ (outbound, green) or ↓ (inbound, blue) in tinted circle
- Title: "You sent a message" or "Sarah replied"
- Subtitle: message body preview (truncated, single line)

### Quiz card
- Amber left border (`rgba(251,191,36,0.3)`)
- Icon: 📝 in amber-tinted circle
- Title: "Quiz completed"
- 2x2 grid of key answers (pain, revenue, AI readiness, score)
- Link: "→ View full answers"

### Status change (minimal)
- No card background, inline row
- Icon: ⟳ in neutral circle
- Text: "Status changed: old → new"

### Lead created (minimal)
- No card background, inline row
- Icon: + in neutral circle
- Text: "Lead created via [source]"

---

## Component Tree

```
page.tsx (server)
  ├── Promise.all([existing 3 queries + 5 new queries])
  └── <LeadDetail lead messages sessions payments brandOsRuns funnelEvents subscriptions tripwires>
        ├── <aside>
        │     ├── <SummaryCard>          ← NEW
        │     ├── name, email, phone     (existing)
        │     ├── <SlaBadge>             (existing)
        │     ├── status dropdown        (existing)
        │     └── <FitCard>              (existing)
        └── <section>
              ├── <TabBar active={tab} onChange={setTab} tabs={["Timeline","Messages","Sessions"]} />  ← NEW
              ├── {tab === "timeline" && (
              │     <>
              │       <FilterChips active={filter} onChange={setFilter} />  ← NEW
              │       <ContactTimeline events={merged} filter={filter} />   ← NEW
              │     </>
              │   )}
              ├── {tab === "messages" && (
              │     /* existing message thread — zero changes */
              │   )}
              ├── {tab === "sessions" && (
              │     <SessionsList sessions={sessions} />  ← NEW (simple list for this client)
              │   )}
              ├── <ObjectionDeck>        (existing, renders on all tabs)
              ├── <LeadMemoryCard>       (existing)
              ├── <ComposeBox>           (existing, renders on all tabs)
              └── <StickyCTABar>         (existing)
```

---

## New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `lib/timeline.ts` | `TimelineEvent` type, 8 normalizer functions, `mergeTimeline()` sort, `computeSummary()` | ~180 |
| `components/ContactTimeline.tsx` | Timeline renderer: day groups, event cards by kind, filter chips | ~250 |
| `components/SummaryCard.tsx` | Sidebar summary: sessions count, total paid, Brand OS status | ~60 |
| `components/TabBar.tsx` | Generic reusable tab bar | ~40 |

## Modified Files

| File | Change |
|------|--------|
| `app/leads/[id]/page.tsx` | Add 5 new parallel queries (sessions, payments, brand_os_runs, funnel_events, subscriptions/tripwires), pass as props |
| `components/LeadDetail.tsx` | Add tab state (`useState`), render TabBar, conditionally render ContactTimeline vs existing messages, add SummaryCard to sidebar |

---

## Filter Behavior

- **All** (default): shows every event type
- **Messages**: shows only `message` events
- **Sessions**: shows only `session` events
- **Payments**: shows only `payment` events
- **Brand OS**: shows only `brand_os` + `quiz` events

Filter is client-side only — all events are already loaded, filter just toggles visibility. Status change and lead created events always show (they're structural context, not filterable).

---

## Edge Cases

- **No events**: show empty state "No activity yet. Events will appear here as you interact with this lead."
- **Lead with no email**: payment/subscription queries skip (match on email). Messages and sessions still load (match on lead ID).
- **Brand OS not started**: Brand OS section in SummaryCard shows "Not started". No Brand OS events in timeline.
- **Failed payments**: render with red amount and "Failed" badge instead of green.
- **Long AI summaries**: truncate to ~150 chars with "..." in timeline card. Full summary accessible via session link.

---

## What This Does NOT Include

- No new database tables or migrations
- No new API routes
- No real-time updates (page refresh to see new events)
- No pagination (loads all events; sufficient for <500 events per contact)
- No status change audit log table (inferred from current status + created_at only; full audit trail is a future enhancement)
- No automation sequence events (will be added when sequences are built)

---

## Performance

- 8 parallel queries add ~50-100ms total (Supabase edge, parallel execution)
- Current page does 3 queries; adding 5 more parallel queries is negligible
- All data cached in React state; tab switching is instant (no re-fetch)
- Filter is pure client-side array filter; no network calls
