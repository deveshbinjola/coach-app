# Sessions Intelligence — "Coaching Notebook" Redesign

## Summary

Redesign the Clients Sessions tab from a flat session log into a **coaching notebook** that prepares coaches for their day. Integrate session intelligence into the Command Center as a compact widget.

Two phases:
- **Phase 1:** Rebuild the Sessions tab with three zones (Today's Prep, Needs Attention, Recent Sessions) + inline session capture.
- **Phase 2:** Add a "Sessions Today" card to Command Center.

## Core Feeling

**"I'm ready for today."** The coach opens this tab 10 minutes before their first call and walks away grounded, briefed, and aware of what matters for each client.

---

## Phase 1: Sessions Tab Redesign

The Sessions tab (`/clients?tab=sessions`) is restructured into three vertical zones.

### Zone 1: Today's Prep (Hero Section)

**Data sources:**
- `cp_coaching_sessions` where `session_date::date = today` — sessions already captured today
- `cp_client_events` where `starts_at::date = today` — scheduled events (Cal.com, Calendly, manual)

**For each upcoming/today session, render a TodayPrepCard:**

| Field | Source | Notes |
|-------|--------|-------|
| Client name | Join `cp_leads.full_name` via `client_id` or `cp_client_rooms.lead_id` | Required |
| Days since last session | `cp_coaching_sessions` most recent for this client | e.g. "Last session: 12 days ago" or "First session" |
| AI pre-brief | `generatePreSessionBrief()` from `lib/session-intelligence.ts` | 2-3 bullet points. Only shown if previous sessions exist |
| Open commitments | Last session's `commitments` array for this client | Show as a checklist. Max 3 items visible, "+N more" if longer |
| Meeting time | `cp_client_events.starts_at` | Only if sourced from calendar event. Format: "2:00 PM" |
| Meeting URL | `cp_client_events.meeting_url` | Show as "Join call" link if present |

**Inline capture:** Each TodayPrepCard has a "Capture notes" button. Clicking it expands a textarea inline (no page navigation). Coach writes notes, optionally toggles a transcript field, and clicks "Save." The card transitions to a "captured" state showing the AI summary once analysis completes.

**Captured vs. upcoming:** Cards for sessions already captured today show the AI summary + extracted topics instead of the pre-brief. Cards for upcoming/uncaptured sessions show the pre-brief + capture button.

**Matching calendar events to clients:** `cp_client_events` has `client_room_id` which links to `cp_client_rooms.lead_id` which links to `cp_leads`. If a calendar event has no matching client room, show the event title but no pre-brief.

**Empty state (no sessions today):**
```
No sessions on the calendar today.
[+ Capture a session]  — opens inline capture with client selector
```
Keep it compact. Don't waste vertical space on illustration or long copy.

### Zone 2: Needs Attention (Alert Strip)

A horizontal band below Today's Prep. Shows coaching cadence intelligence:

**Alert 1 — Overdue clients:**
Query `cp_leads` with `status = 'client'`. For each, find the most recent `cp_coaching_sessions.session_date`. Clients with no session in 14+ days (or no session ever) are "overdue."

Display: "**3 clients** haven't had a session in 2+ weeks" — clickable, expands to show client names with "last seen X days ago" and a "Capture session" action per client.

**Alert 2 — Open commitments:**
From the 3 most recent sessions across all clients, count total commitments.

Display: "**5 open commitments** from recent sessions" — clickable, expands to show commitment text with client name.

**No alerts state:** "All clients are on cadence." — single line, muted text. Takes minimal space.

**Implementation:** This is a server component. The queries run in the `SessionsTab` async function in `app/clients/page.tsx` and pass data to a `NeedsAttentionStrip` client component.

### Zone 3: Recent Sessions (Archive)

The existing session list, enhanced:

**Stats strip** (compact, single line above the list):
```
14 sessions  ·  7 clients  ·  52 avg min  ·  4 this week
```
Computed server-side from the sessions array. No API call needed.

**Client filter dropdown:** Added next to the search bar. Dropdown of all clients who have at least one session. Selecting a client filters the list. "All clients" default.

**Session list:** Existing `SessionCard` components, unchanged. They already show client name, date, AI summary, topics, duration, somatic badge, commitment count.

**Search:** Existing search bar, unchanged. Searches across client name, topics, and summary.

### Removed: InsightPanel Sidebar

The global InsightPanel sidebar is removed from the Sessions tab. Its functionality is redistributed:
- Per-client pre-briefs → Zone 1 TodayPrepCards
- Cross-client patterns → Zone 2 NeedsAttentionStrip
- Open commitments → Zone 2 NeedsAttentionStrip

The `InsightPanel` component and `/api/sessions/insights` route remain — they're used by the standalone `/sessions` page and by `SessionBrief` on the detail/new pages.

### Inline Capture Component

`InlineCaptureForm` replaces navigation to `/sessions/new` for the common case.

**Props:**
- `clientId?: string` — pre-selected client (from TodayPrepCard context)
- `clientName?: string` — display name
- `clients: Array<{ id: string; full_name: string }>` — for client selector (shown only when `clientId` is not provided)
- `onSaved: (session: CoachingSession) => void` — callback to update parent state
- `onCancel: () => void` — callback to collapse the form

**Fields:**
- Client selector (dropdown, only if `clientId` not pre-filled)
- Date (defaults to today, editable)
- Duration in minutes (optional number input)
- Notes textarea (required, 8 rows)
- Transcript toggle ("+ Paste a transcript") → reveals second textarea
- Save button ("Capture session" → "Analyzing..." during save)

**Behavior:**
- POST to `/api/sessions` (existing route, unchanged)
- On success: call `onSaved` with the new session, parent transitions the card to "captured" state
- On error: show inline error message, keep form open

**The standalone `/sessions/new` page stays.** It's still useful for direct URL access and bookmarks. It is not removed, just no longer the primary path from the Sessions tab.

---

## Phase 2: Command Center "Sessions Today" Card

A new `SessionsTodayCard` component on the Command Center page.

**Data:** Server-side query in `app/command-center/page.tsx`:
- `cp_client_events` where `starts_at::date = today` for this coach
- `cp_coaching_sessions` where `session_date::date = today` for this coach
- Join client names via `cp_client_rooms.lead_id → cp_leads.full_name` (for events) and `cp_coaching_sessions.client_id → cp_leads.full_name` (for sessions)

**Display:**
```
Sessions Today
━━━━━━━━━━━━━━
2:00 PM — Marcus Rivera
  "Check in on boundary commitment from last week"

4:30 PM — Elena Park
  "First session — no prior context"

→ View all sessions
```

Each entry: time (from `starts_at` or `session_date`), client name, one-line brief (first sentence of `generatePreSessionBrief()` or "First session" if no prior sessions).

**If 0 sessions today:** Do not render the card at all. No empty state on Command Center — it's already information-dense.

**Placement:** After the Lead Rescue section, before the Honest Question. It's the second most actionable thing after "who needs a reply."

**Overdue nudge:** Below the session list, if any clients are overdue (14+ days): "2 clients haven't had a session in 2+ weeks →" linking to `/clients?tab=sessions`.

---

## File Plan

### New files

| File | Type | Purpose |
|------|------|---------|
| `components/sessions/TodayPrepCard.tsx` | Client component | Individual prep card with pre-brief, commitments, inline capture |
| `components/sessions/TodayPrepSection.tsx` | Client component | Container for all today's prep cards + empty state |
| `components/sessions/NeedsAttentionStrip.tsx` | Client component | Expandable alert strip for overdue clients + open commitments |
| `components/sessions/InlineCaptureForm.tsx` | Client component | Inline session capture form (replaces navigate-to-new-page flow) |
| `components/sessions/SessionStatsStrip.tsx` | Client component | Compact stats line above archive list |
| `components/command-center/SessionsTodayCard.tsx` | Client component | Command Center widget showing today's sessions |

### Modified files

| File | Change |
|------|--------|
| `app/clients/page.tsx` | `SessionsTab` — restructure queries, add calendar event fetch, pass data to new components, add client filter data, remove InsightPanel import |
| `components/sessions/SessionsListClient.tsx` | Add client filter dropdown prop + filtering logic |
| `app/command-center/page.tsx` | Add today's sessions query, render `SessionsTodayCard` |

### Unchanged files

| File | Why |
|------|-----|
| `app/sessions/new/page.tsx` | Standalone page stays as fallback |
| `app/sessions/page.tsx` | Standalone list page stays (keeps InsightPanel sidebar) |
| `app/api/sessions/route.ts` | POST endpoint unchanged, InlineCaptureForm uses it |
| `app/api/sessions/insights/route.ts` | Used by SessionBrief and standalone pages |
| `lib/session-intelligence.ts` | No changes — `analyzeSession` and `generatePreSessionBrief` already do what's needed |
| `components/sessions/SessionCard.tsx` | Archive cards stay as-is |
| `components/sessions/InsightPanel.tsx` | Stays for standalone `/sessions` page |
| `components/sessions/SessionBrief.tsx` | Stays for `/sessions/new` and `/sessions/[id]` |

---

## Data Flow

### SessionsTab server component queries (Phase 1)

```
Promise.all([
  // 1. All sessions for this coach (existing)
  supabase.from("cp_coaching_sessions").select("*").eq("coach_id", coachId)
    .order("session_date", { ascending: false }).limit(50),

  // 2. All clients (existing)
  supabase.from("cp_leads").select("id, full_name")
    .eq("coach_id", coachId).eq("status", "client")
    .order("full_name", { ascending: true }),

  // 3. Today's calendar events (NEW)
  supabase.from("cp_client_events").select("id, title, starts_at, meeting_url, client_room_id")
    .eq("coach_id", coachId)
    .gte("starts_at", todayStart).lte("starts_at", todayEnd)
    .order("starts_at", { ascending: true }),

  // 4. Client rooms for event→lead mapping (NEW)
  supabase.from("cp_client_rooms").select("id, lead_id")
    .eq("coach_id", coachId),
])
```

Server-side computation before rendering:
- Build `clientMap: Record<string, string>` (leadId → name)
- Build `roomToLeadMap: Record<string, string>` (roomId → leadId)
- Identify today's sessions vs. upcoming events
- Compute overdue clients (clients with no session in 14+ days)
- Compute open commitments from last 3 sessions
- Compute stats (total sessions, unique clients, avg duration, this week count)

### Pre-session briefs

Pre-briefs are fetched client-side by each `TodayPrepCard` via `GET /api/sessions/insights?client_id=X`. This is the existing endpoint. Each card fetches independently, so they load progressively (skeleton → brief appears).

This keeps the server render fast and avoids blocking on Claude API calls.

---

## Styling

All components use the existing CSS variable system:
- `var(--surface)`, `var(--surface-elevated)`, `var(--surface-deep)`
- `var(--brand)`, `var(--brand-strong)`
- `var(--text)`, `var(--text-muted)`, `var(--text-faint)`
- `var(--border)`, `var(--border-faint)`
- `var(--r-md)`, `var(--r-lg)`, `var(--r-pill)`
- `var(--t-body)`, `var(--t-caption)`, `var(--t-h3)`, `var(--t-micro)`
- `var(--shadow-sm)`, `var(--shadow-md)`

TodayPrepCards use `var(--surface-elevated)` background with a left border accent in `var(--brand)` to visually distinguish prep cards from archive cards.

NeedsAttentionStrip uses `var(--surface-deep)` background with `var(--warning)` accent for alerts.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| 0 sessions ever, 0 events today | Show empty state: "No sessions on the calendar today. [+ Capture a session]" + no attention strip + empty archive with "No sessions yet" |
| Calendar events but no matching client room | Show event title + time, but no pre-brief. Offer "Link to client" or "Capture as session" |
| 10+ sessions today | Show first 5 TodayPrepCards, "+5 more" expand button. Unlikely but handled |
| Pre-brief API is slow (Claude call) | TodayPrepCard shows skeleton loading for brief area. Card is usable without brief (commitments from last session are server-side data, always fast) |
| Coach captures a session inline, then reloads | Session appears in both Zone 1 (as captured, showing summary) and Zone 3 (in the archive list). This is correct — Zone 1 shows "today," Zone 3 shows "all recent" |
| Client has sessions but is no longer status='client' | Sessions still show in archive. TodayPrepCards only show for active clients |
