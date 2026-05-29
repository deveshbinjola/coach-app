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

The card face is compact — three lines max:

| Line | Content | Source |
|------|---------|--------|
| Line 1 | Meeting time | `cp_client_events.starts_at` — format: "2:00 PM". Omit if no calendar event |
| Line 2 | Client name | Join `cp_leads.full_name` via `client_id` or `cp_client_rooms.lead_id` |
| Line 3 | Context line | Last session's `key_topics` (first 2-3, comma-joined) + "X days ago". Or "First session" if none exist |

**Tap/click to expand:** The card expands inline to reveal:
- AI pre-brief (2-3 bullet points from `generatePreSessionBrief()` — only if previous sessions exist)
- "Join call" link (if `cp_client_events.meeting_url` present)
- "Capture notes" button

**First session distinction:** If a client has no prior sessions, the card gets a different visual treatment — a subtle accent change (e.g. `var(--brand)` left border becomes dashed or uses a different tone) and the context line reads "First session with [name]." No pre-brief is shown (there's nothing to brief on). This signals to the coach: approach with curiosity, not continuity.

**Session rhythm acknowledgment:** If a client has 4+ consecutive weekly sessions (sessions within 7-10 day intervals), the context line includes a rhythm note: "6th consecutive week" appended after the topics. This rewards consistency without being loud.

**Inline capture — card transforms, not appends:**

When "Capture notes" is clicked, the prep card content fades out and the capture form fades in *within the same card boundary*. The card doesn't grow a textarea underneath — it becomes the form.

**Capture form fields:**
- Last-session context line (read-only, above textarea): "Last session (May 15): boundaries, leadership transition" — grounding the coach in continuity
- Notes textarea (required, 8 rows)
- Transcript toggle ("+ Paste a transcript") → reveals second textarea
- Duration in minutes (optional number input, compact)
- "Capture" button + "Cancel" link

Client selector is hidden (pre-filled from card context). Date defaults to today.

**Post-capture — progressive AI reveal:**

After saving, the card doesn't show a spinner. The POST to `/api/sessions` returns the full analysis synchronously (summary, topics, commitments, patterns). Once the response arrives, insights appear progressively via staggered CSS animations — summary fades in first (0ms), then topics appear as badges (200ms), then commitments (400ms), then patterns if any (600ms). Each element animates in with a subtle fade+slide. This makes the AI feel alive and considered, not dumped.

Implementation: POST to `/api/sessions` (existing route, unchanged). On success, call `onSaved` with the new session. The parent component transitions the card to "captured" state. During the ~3-5 second API wait, the card shows a subtle pulsing state (not a spinner). The staggered reveal happens after the data arrives.

**Captured vs. upcoming:** Cards for sessions already captured today show the AI summary + extracted topics (captured state). Cards for upcoming/uncaptured sessions show the compact 3-line face with expand-to-brief.

**Matching calendar events to clients:** `cp_client_events` has `client_room_id` which links to `cp_client_rooms.lead_id` which links to `cp_leads`. If a calendar event has no matching client room, show the event title but no pre-brief. Offer "Capture as session" action.

**Empty state (no sessions today):**
```
Your coaching notebook starts here.
No sessions on the calendar today — capture one when you're ready.
[+ Capture a session]  — opens inline capture with client selector
```
Warm, coaching-voiced. Compact. No illustration.

### Zone 2: Needs Attention (Single Line)

A single contextual line below Today's Prep. Not an alert system — a gentle nudge.

**Content:** Overdue clients only. Query `cp_leads` with `status = 'client'`. For each, find the most recent `cp_coaching_sessions.session_date`. Clients with no session in 14+ days (or no session ever) are "overdue."

Display format uses names, not counts:
- 1 client: "**Marcus** hasn't had a session in 3 weeks"
- 2 clients: "**Marcus** and **Elena** haven't had a session in 2+ weeks"
- 3+ clients: "**Marcus**, **Elena**, and 2 others haven't had a session in 2+ weeks"

Clickable — expands to show all overdue clients with "last seen X days ago" and a "Capture session" action per client.

**No alerts state:** This line simply doesn't render. No "All clients are on cadence" message — absence of the nudge IS the good state.

**CUT: Open commitments alert.** Commitments belong inside the capture flow (see below), not as a separate alert strip. They're context for the next conversation, not a dashboard metric.

**Implementation:** Server component. Queries run in the `SessionsTab` async function in `app/clients/page.tsx` and pass data to a `NeedsAttentionStrip` client component.

### Zone 3: Recent Sessions (Archive)

The existing session list, enhanced with smart search.

**CUT: Stats strip.** Session counts and averages are vanity metrics that don't help a coach prepare. If stats are wanted later, they belong in a reporting/analytics view, not above the session archive.

**Smart search (replaces separate client filter):** The existing search bar is enhanced to handle both text search AND client filtering in a single input. Typing a client name filters to that client. Typing a topic searches across topics and summaries. No separate dropdown needed.

Implementation: The `SessionsListClient` component's filter function checks the search term against client name first (exact-ish match), then falls back to searching across topics, summary, and notes. This feels like one smart search rather than two separate controls.

**Session list:** Existing `SessionCard` components, unchanged. They already show client name, date, AI summary, topics, duration, somatic badge, commitment count.

### Removed: InsightPanel Sidebar

The global InsightPanel sidebar is removed from the Sessions tab. Its functionality is redistributed:
- Per-client pre-briefs → Zone 1 TodayPrepCards
- Cross-client patterns → Zone 2 NeedsAttentionStrip
- Open commitments → Inside capture form as follow-up context

The `InsightPanel` component and `/api/sessions/insights` route remain — they're used by the standalone `/sessions` page and by `SessionBrief` on the detail/new pages.

### Inline Capture Component

`InlineCaptureForm` is used both inside TodayPrepCards (with pre-filled client) and from the empty state / standalone "Capture a session" action (with client selector).

**Props:**
- `clientId?: string` — pre-selected client (from TodayPrepCard context)
- `clientName?: string` — display name
- `lastSessionContext?: string` — e.g. "Last session (May 15): boundaries, leadership transition"
- `clients: Array<{ id: string; full_name: string }>` — for client selector (shown only when `clientId` is not provided)
- `onSaved: (session: CoachingSession) => void` — callback to update parent state
- `onCancel: () => void` — callback to collapse the form

**Fields:**
- Client selector (dropdown, only if `clientId` not pre-filled)
- Last-session context line (read-only, shown when available)
- Date (defaults to today, editable)
- Duration in minutes (optional number input)
- Notes textarea (required, 8 rows)
- Transcript toggle ("+ Paste a transcript") → reveals second textarea
- "Capture" button → "Analyzing..." state during save (but parent handles progressive reveal)

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
- Last session's `key_topics` per client from `cp_coaching_sessions` (most recent before today)

**Display:**
```
Sessions Today
━━━━━━━━━━━━━━
2:00 PM — Marcus Rivera
  boundaries, leadership transition

4:30 PM — Elena Park
  First session

→ View all sessions
```

Each entry: time (from `starts_at` or `session_date`), client name, context line (first 2-3 `key_topics` from last session, comma-joined — or "First session" if no prior sessions).

**No Claude API calls.** Context lines use stored `key_topics` from the most recent prior session, not `generatePreSessionBrief()`. The Command Center loads fast because everything is database reads. The full pre-brief is available when the coach clicks through to the Sessions tab.

**If 0 sessions today:** Do not render the card at all. No empty state on Command Center — it's already information-dense.

**Placement:** After the Lead Rescue section, before the Honest Question. It's the second most actionable thing after "who needs a reply."

**Overdue nudge:** Below the session list, if any clients are overdue (14+ days): "Marcus and Elena haven't had a session in 2+ weeks →" linking to `/clients?tab=sessions`. Same name-based format as Zone 2.

---

## File Plan

### New files

| File | Type | Purpose |
|------|------|---------|
| `components/sessions/TodayPrepCard.tsx` | Client component | Individual prep card — compact 3-line face, expand for brief, transforms into capture form, progressive AI reveal post-capture |
| `components/sessions/TodayPrepSection.tsx` | Client component | Container for all today's prep cards + empty state |
| `components/sessions/NeedsAttentionStrip.tsx` | Client component | Single-line nudge for overdue clients, expandable |
| `components/sessions/InlineCaptureForm.tsx` | Client component | Inline session capture form with last-session context |
| `components/command-center/SessionsTodayCard.tsx` | Client component | Command Center widget showing today's sessions with stored context |

### Modified files

| File | Change |
|------|--------|
| `app/clients/page.tsx` | `SessionsTab` — restructure queries (add calendar events + client rooms fetch), pass data to new zone components, remove InsightPanel import |
| `components/sessions/SessionsListClient.tsx` | Enhance search to handle client name filtering (smart search, no separate dropdown) |
| `app/command-center/page.tsx` | Add today's sessions query + last session topics per client, render `SessionsTodayCard` |

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
- For each today's client: find most recent prior session → extract `key_topics`, `session_date`, `commitments`
- Compute overdue clients (clients with no session in 14+ days)
- Detect session rhythm (4+ sessions within 7-10 day intervals per client)

### Pre-session briefs

Pre-briefs are fetched client-side by each `TodayPrepCard` when expanded, via `GET /api/sessions/insights?client_id=X`. This is the existing endpoint. Each card fetches independently on expand, so they load only when needed.

This keeps the server render fast and avoids blocking on Claude API calls. The compact card face uses server-side data (stored `key_topics` from last session) — no API call needed for the default collapsed view.

### Command Center data flow

Server-side only. No client-side fetches. Query today's events + today's sessions + last session per client (for `key_topics`). All database reads, zero Claude API calls. The card renders instantly with the page.

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

TodayPrepCards use `var(--surface-elevated)` background with a left border accent in `var(--brand)` to visually distinguish prep cards from archive cards. First-session cards use a dashed left border to signal "new relationship."

NeedsAttentionStrip uses `var(--text-muted)` color, no background — it's a line of text, not a banner.

**Transitions:**
- Card expand/collapse: `max-height` transition with `ease-out`, ~200ms
- Capture form transform: prep content fades out (opacity 0, 150ms), form fades in (opacity 1, 150ms, 50ms delay)
- Progressive AI reveal: each insight element fades in with `opacity` + `translateY(4px)` transition, staggered 200ms apart

---

## Edge Cases

| Case | Behavior |
|------|----------|
| 0 sessions ever, 0 events today | Show empty state: "Your coaching notebook starts here..." + no attention strip + empty archive with "No sessions yet" |
| Calendar events but no matching client room | Show event title + time, but no pre-brief or context line. Offer "Capture as session" |
| 10+ sessions today | Show first 5 TodayPrepCards, "+5 more" expand button. Unlikely but handled |
| Pre-brief API is slow (Claude call) | Only fetched on card expand. Card face uses stored `key_topics` (always fast). Brief area shows skeleton when loading |
| Coach captures a session inline, then reloads | Session appears in both Zone 1 (as captured, showing summary) and Zone 3 (in the archive list). This is correct — Zone 1 shows "today," Zone 3 shows "all recent" |
| Client has sessions but is no longer status='client' | Sessions still show in archive. TodayPrepCards only show for active clients |
| First session with a client | Card shows "First session with [name]" context line, dashed left border, no pre-brief on expand (just "No prior sessions — approach with curiosity") |
| Client with 4+ consecutive weekly sessions | Context line appends rhythm note: "boundaries, leadership · 6th consecutive week" |
| Search for client name in archive | Smart search matches client name first, shows that client's sessions. No separate dropdown needed |
| Overdue client count is 0 | NeedsAttentionStrip doesn't render at all. No "all good" message |
| Command Center with 0 sessions today | SessionsTodayCard doesn't render at all |
