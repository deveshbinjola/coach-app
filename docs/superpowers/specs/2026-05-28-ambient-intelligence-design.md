# Ambient Intelligence — App-Wide Cross-Surface Connectivity

## Summary

Make every surface of the coach-app aware of every other surface. Session data flows to client cards. Client activity flows into session prep. Revenue appears on Command Center. Automations surface real people, not aggregate stats. The coach never mentally connects dots between features — the app does it.

**Design principle: Google's connectivity + Apple's invisibility.** Data flows between features without configuration. The coach doesn't know "sessions are talking to offerings" — she just sees the context she needs, where she needs it.

**AI philosophy: structured data for display, AI for synthesis and generation.** Numbers with anomaly highlighting are clearer than AI paragraphs. AI earns its place only when it does work the coach can't: synthesizing 3 past sessions into a pre-brief, drafting a follow-up message in the coach's voice.

Two layers, incrementally deployable:
- **Layer 1: The Morning Briefing** — Command Center becomes the all-knowing nerve center with a unified priority list and business pulse.
- **Layer 2: The Person's Story** — a contextual mini-profile that appears wherever a person's name shows up, plus inline enrichment on every surface.

---

## The Problem

The app has 15 features. Each one works. None of them talk to each other. The coach is the integration layer.

| Gap | What's Blind | What It Should Know |
|-----|-------------|---------------------|
| Command Center → Sessions | No session awareness | Today's sessions, overdue clients |
| Command Center → Automations | No sequence health | Failing sequences, stuck enrollments |
| Command Center → Revenue | No payment pulse | Revenue this month, offering enrollment |
| Client Cards → Lead History | Messages/score vanish at conversion | Lead journey persists after client status |
| Lead Detail → Offerings | No program enrollment | "Marcus is in Build Your Brand (month 2)" |
| Sessions → Content | Topics don't flow to content | "Boundaries keeps coming up — write about it?" |
| Automations → People | Aggregate stats only | Which specific leads are stuck/failed |
| Offerings → Sessions | No session history for members | "Marcus has had 6 sessions since joining" |
| Post-Session → Follow-Up | Coach manually writes follow-up | AI drafts follow-up message from session |

---

## Layer 1: The Morning Briefing (Command Center Redesign)

Command Center currently has ~6 separate card sections. This redesign collapses them into three zones: Hero Item, Quiet List + Business Pulse, and Honest Question.

### Zone 1: Hero Item

The single most urgent thing across ALL features. One structured card at the top of the page. Changes throughout the day based on time and urgency.

**Priority ranking (highest → lowest):**

| Priority | Source Feature | Example |
|----------|---------------|---------|
| 1 | Session in < 1 hour | "Marcus Rivera · session in 45 min · boundaries, leadership · 6th consecutive week" |
| 2 | Sequence failure | "Elena Park · follow-up sequence failed · email bounced" |
| 3 | Inbound message > 48h | "Aisha Coleman · replied 2 days ago, waiting on you" |
| 4 | No session in 14+ days | "James Wu · no session in 3 weeks" |
| 5 | Content/AI draft ready | "Content draft ready: 'The Mirror Principle'" |
| 6 | Session later today | "Elena Park · session at 4:30 PM · first session" |
| 7 | Untapped content topic | "Your clients keep discussing boundaries · write about it?" |

**Card format:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Marcus Rivera · session in 45 min
boundaries, leadership · 6th consecutive week
[Join call]  [Prep →]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Line 1: Person name (wrapped in `PersonName`) + urgency reason. Line 2: context. Line 3: quick action(s).

**Quick actions by item type:**
- Session soon → "Join call" (if URL exists) / "Prep →" (links to sessions tab)
- Sequence failed → "View →" (links to lead detail)
- Message waiting → "Reply →" (opens compose)
- Overdue session → "Capture session" (inline capture)
- Content ready → "Review →" (links to content)
- Content suggestion → "Write about it →" (pre-seeds content creation)

**Time-based hero selection:** The server component runs `getBusinessPulse()`, scores all items by the priority table above, and passes the top item as the hero. When a session is < 60 minutes away, it overrides all other priorities. End-of-day: hero becomes a summary — "2 sessions captured today · 1 follow-up draft ready."

**Visual treatment:** `var(--surface-elevated)` background, `var(--brand)` left border, slightly larger than quiet list items. Not dramatically different — just the visual anchor.

### Zone 2: Quiet List + Business Pulse

**Quiet List:** Max 5 secondary items below the hero. Same priority ranking, items 2-6 from the scored list. Each item is one line: `PersonName` + reason + quick action link.

Format:
```
Elena Park — follow-up sequence failed · email bounced          View →
Aisha Coleman — replied 2 days ago, waiting on you              Reply →
James Wu — no session in 3 weeks                               Capture →
Content draft ready: "The Mirror Principle"                     Review →
Clients discussing "boundaries" — write about it?               Write →
```

If fewer than 5 items: list is shorter. If zero items (everything is healthy): show "Nothing needs you right now." — single muted line.

**Summary line** below the quiet list:
```
Your day: 2 sessions · 1 draft ready · 3 leads waiting
```
Computed from the scored items. Shows the shape of the day in one glance.

**Business Pulse** — a compact metrics strip below the summary:
```
This Month   $4,200 ↑   ·   3 members   ·   14 sessions   ·   82% trust
```

- Revenue: `cp_payments` sum this calendar month. ↑/↓ arrow vs. last month. Arrow color: `var(--brand)` if up, `var(--warning)` if down.
- Active members: `cp_offering_members` where status = 'active'.
- Sessions: `cp_coaching_sessions` count this month.
- Trust: existing voice trust rate (AI drafts sent without heavy edits).

**Anomaly highlighting:** If any metric has a negative signal (revenue down, trust below 60%, 0 sessions this week), that specific number renders in `var(--warning)`. No label, no explanation — the color IS the signal.

**Progressive rendering:** Metrics only appear for features the coach has used. Zero offerings? "Members" metric doesn't render. Zero sessions? "Sessions" metric doesn't render. The strip grows organically.

### Zone 3: Honest Question

Stays exactly as-is. Always last. The grounding moment.

### What Happens to Existing Command Center Cards

| Current Card | Becomes |
|-------------|---------|
| Lead Rescue punch list | → Hero item + Quiet List items (rescue items scored into the priority system) |
| Content Pipeline | → Quiet List items (drafts ready = priority 5) |
| AI drafts "just landed" | → Quiet List items (scored appropriately) |
| Reach count + sparkline | → Business Pulse strip ("leads reached" metric). Sparkline removed — the strip is enough |
| Voice trust rate | → Business Pulse strip ("trust" metric) |
| Offering revenue summary | → Business Pulse strip ("revenue" + "members" metrics) |
| Honest Question | → Stays |
| Sessions Today (from sessions spec) | → Hero item + Quiet List items (sessions scored into priority system) |

**The existing content pipeline, rescue list, and sessions today card are NOT rendered as separate components.** They're all inputs to the unified scoring system. The `RightNowList` component receives scored items and renders them — it doesn't know or care which feature produced each item.

---

## Layer 2: The Person's Story

Two parts: the **Person Panel** (slide-over with full signals) and **inline enrichment** (1-2 signals visible next to names on each surface).

### PersonName Component

A thin wrapper for name renders across the app.

**Props:**
- `leadId: string` — used to fetch signals on click
- `name: string` — display text
- `context?: string` — optional badge text ("client", "lead")

**Behavior:**
- Renders name as styled text with subtle underline on hover (`var(--text)` color, dashed underline)
- On click: opens Person Panel for this lead
- Non-disruptive — does not navigate away

**Deployed on these surfaces:**
- Command Center: hero item + quiet list person names
- Sessions tab: TodayPrepCard client names, SessionCard client names, NeedsAttentionStrip client names
- Offerings: member roster names
- Sequences/Automations: when enrollment names are shown

**NOT deployed on:**
- Inbox lead list — click already navigates to lead detail
- Client sidebar — click already selects client in workspace
- Lead detail page — already on the full profile

### Person Panel (Slide-Over)

**Trigger:** Click any `PersonName` component.

**Desktop:** Right-edge panel, 320px wide. Content behind stays visible, slightly dimmed (overlay at 10% opacity). Non-modal.

**Mobile:** Bottom sheet, 70% screen height. Swipe down to dismiss.

**Behavior:**
- Click another `PersonName` while open → panel updates in place (no close/reopen animation)
- Click X or click outside → panel closes
- Transition: 200ms ease-out slide from right

**Content (from `getPersonSignals()`):**

```
Marcus Rivera                      Client    ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Client since March · via quiz funnel

💬  You sent a message · 2 days ago
🎯  Last session May 20 · boundaries, leadership
    12 sessions total · 6th consecutive week
📦  Build Your Brand · month 2 of 3
🔄  Post-session follow-up · step 2 of 4
💰  $4,200 lifetime

[Message]  [Capture session]  [Full profile →]
```

**Section rendering rules:**
- Each line only renders if data exists. A fresh lead shows: name, status, source, last message, [Message] [Full profile →].
- Overdue signals: session line gets `var(--warning)` if > 14 days since last session. Message line gets `var(--warning)` if inbound message waiting > 48h.
- Status badge: "Lead" in neutral tone, "Client" in brand tone.
- Journey line: "Client since [month] · via [source]" or "Lead since [month] · referred by [name]."
- "Full profile →" links to `/leads/[id]`.

**Quick actions:**
- "Message" — always shown. Opens compose drawer for this lead.
- "Capture session" — only for leads with status = 'client'.
- "Full profile →" — always shown. Links to `/leads/[id]`.

**Contextual pre-brief:** When the Person Panel is opened from a session-related surface (TodayPrepCard, SessionCard, NeedsAttentionStrip), the panel shows the AI pre-session brief above the structured fields. This uses the existing `generatePreSessionBrief()` — no new AI. In non-session contexts, the brief section doesn't render.

### Inline Enrichment

Each surface that shows a person's name already shows the 1-2 signals most relevant to THAT context. No click needed.

| Surface | Inline signal | Source |
|---------|--------------|--------|
| TodayPrepCard (expanded) | Offering enrollment + active sequence | `cp_offering_members`, `cp_sequence_enrollments` |
| SessionCard (archive) | Offering badge if enrolled | `cp_offering_members` |
| Offering roster (member list) | Session count + last session since enrollment. ⚠️ if > 14 days | `cp_coaching_sessions` |
| NeedsAttentionStrip (expanded) | Last session date, next event | Already designed in sessions spec |
| Client Sidebar | "Last session: X days ago" | Already designed in sessions spec (Phase 1b) |
| Right Now list items | Urgency reason | Built into the item by the scoring system |

**Implementation:** Most inline data comes from queries already in scope on each page. The exception is the offering roster needing session data — this requires the offering detail page to add a `cp_coaching_sessions` query to its `Promise.all` for enrolled member IDs.

### Content Suggestion Line

On the Content page (`/content`), above the content list. One contextual line.

**Logic:** `getContentSignals(coachId)` cross-references `key_topics` from `cp_coaching_sessions` (topics appearing in 3+ sessions across all clients) against `cp_content` titles/topics. Topics discussed repeatedly but never written about are "untapped."

**Display:**
- 1 untapped topic: "Your clients keep discussing **boundaries** — [write about it →]"
- 2+ topics: "**Boundaries** and **leadership transition** keep coming up in sessions — [write about them →]"
- 0 untapped topics: line doesn't render

Clicking "write about it" pre-seeds the content generation flow with that topic.

### Post-Session Auto-Draft

After the coach captures session notes and the AI analysis completes, the captured TodayPrepCard (or standalone capture confirmation) shows a follow-up message draft.

**Display (within the captured card, below the progressive AI reveal):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow-up draft for Marcus:

"Hey Marcus — great session today. That boundary you
want to set with your COO — specific, kind, firm. Let
me know how it goes this week."

[Edit & send]  [Dismiss]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**How it works:**
- New function `generatePostSessionDraft()` in `lib/ambient.ts`
- Input: session `ai_summary`, `commitments`, `key_topics`, coach's active `cp_voice_profiles` (for tone matching)
- Output: 2-3 sentence follow-up message in the coach's voice
- Generated server-side after the session POST completes, returned alongside the session analysis
- "Edit & send" opens the compose drawer pre-filled with this draft, addressed to the client
- "Dismiss" collapses the draft section

**Fallback:** If voice profile doesn't exist or AI generation fails, the draft section simply doesn't appear. The capture still works perfectly without it.

---

## Data Layer: `lib/ambient.ts`

Three data functions (no AI) + two AI functions.

### `getBusinessPulse(coachId): BusinessPulse`

Server-side only. Called by Command Center's server component.

**Queries (parallel):**
```
Promise.all([
  // 1. Today's calendar events
  supabase.from("cp_client_events").select("id, title, starts_at, meeting_url, client_room_id")
    .eq("coach_id", coachId).gte("starts_at", todayStart).lte("starts_at", todayEnd),

  // 2. Today's captured sessions
  supabase.from("cp_coaching_sessions").select("id, client_id, session_date, key_topics")
    .eq("coach_id", coachId).gte("session_date", todayStart),

  // 3. All sessions this month (for count + overdue detection)
  supabase.from("cp_coaching_sessions").select("client_id, session_date")
    .eq("coach_id", coachId).gte("session_date", monthStart),

  // 4. Active clients (for overdue detection)
  supabase.from("cp_leads").select("id, full_name, status")
    .eq("coach_id", coachId).eq("status", "client"),

  // 5. Recent inbound messages waiting > 48h
  supabase.from("cp_lead_messages").select("id, lead_id, direction, sent_at, created_at")
    .eq("coach_id", coachId).eq("direction", "inbound")
    .gte("sent_at", fortyEightHoursAgo),

  // 6. Failed sequence enrollments
  supabase.from("cp_sequence_enrollments").select("id, lead_id, status, sequence_id")
    .eq("coach_id", coachId).eq("status", "failed"),

  // 7. Revenue this month + last month
  supabase.from("cp_payments").select("amount_cents, created_at")
    .eq("coach_id", coachId).gte("created_at", lastMonthStart),

  // 8. Active offering members
  supabase.from("cp_offering_members").select("id, status")
    .eq("status", "active"),

  // 9. Content drafts ready for review
  supabase.from("cp_content").select("id, title, status")
    .eq("coach_id", coachId).eq("status", "draft"),

  // 10. Client rooms for event→lead mapping
  supabase.from("cp_client_rooms").select("id, lead_id")
    .eq("coach_id", coachId),

  // 11. Voice trust rate (existing computation)
  // ... existing trust rate query
])
```

**Returns:**
```typescript
type BusinessPulse = {
  heroItem: RightNowItem;
  quietList: RightNowItem[]; // max 5, sorted by priority
  daySummary: { sessions: number; draftsReady: number; leadsWaiting: number };
  metrics: {
    revenue: { amount: number; trend: "up" | "down" | "flat" };
    activeMembers: number;
    sessionsThisMonth: number;
    trustRate: number | null; // null if no voice profile
  };
};

type RightNowItem = {
  id: string;
  leadId?: string;
  leadName?: string;
  priority: number; // 1-7
  reason: string; // "session in 45 min"
  context?: string; // "boundaries, leadership · 6th consecutive week"
  action: { label: string; href?: string; type: "link" | "compose" | "capture" };
  source: "session" | "sequence" | "message" | "overdue" | "content" | "content_suggestion";
};
```

### `getPersonSignals(leadId): PersonSignals`

Called client-side by the Person Panel on click.

**Queries (parallel):**
```
Promise.all([
  // 1. Lead info
  supabase.from("cp_leads").select("id, full_name, status, source, created_at, referrer_id, email"),

  // 2. Most recent message
  supabase.from("cp_lead_messages").select("direction, sent_at, channel")
    .eq("lead_id", leadId).order("sent_at", { ascending: false }).limit(1),

  // 3. Most recent session + total count
  supabase.from("cp_coaching_sessions").select("session_date, key_topics, commitments")
    .eq("client_id", leadId).order("session_date", { ascending: false }).limit(10),

  // 4. Offering enrollment
  supabase.from("cp_offering_members").select("offering_id, status, created_at, cp_offerings(name, duration_months)")
    .eq("lead_id", leadId).eq("status", "active"),

  // 5. Active sequence enrollment
  supabase.from("cp_sequence_enrollments").select("sequence_id, status, current_step, cp_sequences(name, cp_sequence_steps(count))")
    .eq("lead_id", leadId).in("status", ["active", "paused"]),

  // 6. Lifetime payments
  supabase.from("cp_payments").select("amount_cents")
    .eq("lead_id", leadId),
])
```

**Returns:**
```typescript
type PersonSignals = {
  name: string;
  status: "lead" | "client";
  source: string | null;
  createdAt: string;
  lastMessage: { direction: "inbound" | "outbound"; date: string; channel: string } | null;
  lastSession: { date: string; keyTopics: string[]; daysSince: number } | null;
  totalSessions: number;
  sessionRhythm: string | null; // "6th consecutive week" or null
  offering: { name: string; monthsIn: number; totalMonths: number } | null;
  sequence: { name: string; currentStep: number; totalSteps: number } | null;
  lifetimePaid: number; // cents
  flags: { sessionOverdue: boolean; messageWaiting: boolean };
};
```

### `getContentSignals(coachId): ContentSignals`

Server-side. Called by Content page server component.

**Logic:**
1. Query all `cp_coaching_sessions` for this coach, extract `key_topics`, count frequency across sessions.
2. Filter to topics appearing in 3+ sessions.
3. Query `cp_content` titles and topics for this coach.
4. Subtract: topics in sessions but NOT in content = "untapped."

**Returns:**
```typescript
type ContentSignals = {
  untappedTopics: Array<{ topic: string; sessionCount: number }>;
};
```

### `generatePostSessionDraft(params): string | null` (AI)

Called after session capture, server-side.

**Input:**
```typescript
{
  clientName: string;
  aiSummary: string;
  commitments: string[];
  keyTopics: string[];
  voiceProfile: VoiceProfile | null; // for tone matching
}
```

**Output:** A 2-3 sentence follow-up message string, or `null` if generation fails.

**Implementation:** Claude API call with a focused prompt. Uses `voiceProfile` to match the coach's communication style. Deterministic fallback: if AI fails, return `null` and don't show the draft section.

### `generatePreSessionBrief()` (AI — already exists)

No changes. Already in `lib/session-intelligence.ts`. Used by the Person Panel when opened from session context.

---

## API Routes

### New: `GET /api/leads/[id]/signals`

Returns `PersonSignals` for the given lead. Auth-gated to the coach who owns the lead.

Called client-side by the `PersonPanel` component on demand (when a name is clicked). Response cached with `stale-while-revalidate: 60` — signals don't change mid-conversation.

### Modified: `POST /api/sessions`

After the existing session creation and AI analysis, additionally call `generatePostSessionDraft()` and include the draft in the response:

```typescript
return NextResponse.json({
  session,
  analysis,
  followUpDraft: draft, // string | null (NEW)
}, { status: 201 });
```

No other API changes. The Business Pulse and Content Signals are server-side only — no API route needed.

---

## File Plan

### New files

| File | Type | Purpose |
|------|------|---------|
| `lib/ambient.ts` | Server utility | `getBusinessPulse()`, `getPersonSignals()`, `getContentSignals()`, `generatePostSessionDraft()` |
| `components/ambient/PersonName.tsx` | Client component | Clickable name wrapper, triggers Person Panel |
| `components/ambient/PersonPanel.tsx` | Client component | Slide-over panel showing full person signals |
| `components/command-center/RightNowList.tsx` | Client component | Hero item + quiet list + day summary |
| `components/command-center/BusinessPulse.tsx` | Client component | Compact metrics strip with anomaly coloring |
| `app/api/leads/[id]/signals/route.ts` | API route | Returns PersonSignals for a lead |

### Modified files

| File | Change |
|------|--------|
| `app/command-center/page.tsx` | Replace existing card sections with `getBusinessPulse()` call → `RightNowList` + `BusinessPulse`. Keep Honest Question. Remove separate LeadRescue, ContentPipeline, ReachCounter, TrustRate, OfferingRevenue components from this page |
| `app/content/page.tsx` (or equivalent) | Add `getContentSignals()` call, render suggestion line above content list |
| `app/api/sessions/route.ts` | After session analysis, call `generatePostSessionDraft()`, include draft in response |
| `components/sessions/TodayPrepCard.tsx` | Show offering + sequence inline context when expanded. Show follow-up draft after capture |
| `components/sessions/SessionCard.tsx` | Wrap client name in `PersonName`. Show offering badge if enrolled |
| `components/sessions/NeedsAttentionStrip.tsx` | Wrap client names in `PersonName` |
| `app/clients/offerings/[id]/page.tsx` | Add `cp_coaching_sessions` query for enrolled members, show session count + last session in roster |
| `app/layout.tsx` (or root client wrapper) | Add `PersonPanel` as a global component (portal-based, renders at root level) |

### Unchanged files

| File | Why |
|------|-----|
| `lib/session-intelligence.ts` | Existing `analyzeSession` and `generatePreSessionBrief` unchanged |
| `components/sessions/InsightPanel.tsx` | Stays for standalone `/sessions` page |
| `components/sessions/SessionBrief.tsx` | Stays for `/sessions/new` and `/sessions/[id]` |
| `components/LeadList.tsx` | Inbox doesn't get PersonName (click navigates to lead detail already) |
| `components/clients/ClientSidebar.tsx` | Doesn't get PersonName (click selects client already). Gets session pulse from sessions spec |

### Removed from Command Center (absorbed into RightNowList/BusinessPulse)

These components may still exist for other pages but are no longer rendered on Command Center:

| Component | Was | Now |
|-----------|-----|-----|
| Lead Rescue section | Separate card | Items scored into RightNowList |
| Content Pipeline section | Separate card | Draft-ready items scored into RightNowList |
| Reach Counter + Sparkline | Separate card | "Leads reached" metric in BusinessPulse strip |
| Voice Trust section | Separate card | "Trust" metric in BusinessPulse strip |
| Offering Revenue section | Separate card | "Revenue" + "Members" in BusinessPulse strip |

---

## Styling

All components use the existing CSS variable system.

**Hero Item:** `var(--surface-elevated)` background, `var(--brand)` left border (3px), `var(--shadow-sm)`. Slightly larger padding than quiet list items.

**Quiet List:** `var(--surface)` background, no border, compact. Each item is one line with `var(--text)` for name/reason and `var(--text-muted)` for the action link.

**Business Pulse:** `var(--surface-deep)` background, `var(--t-caption)` size, `var(--text-muted)` for labels, `var(--text)` for numbers. Anomaly numbers use `var(--warning)`. Trend arrows use `var(--brand)` for up, `var(--warning)` for down.

**PersonName:** `var(--text)` color, dashed underline on hover. No color change — it looks like text until you hover.

**Person Panel:** `var(--surface-elevated)` background, `var(--shadow-md)`, full height of viewport. Overlay behind at `rgba(0,0,0,0.08)`. Close button (×) top-right. Transition: `transform` 200ms ease-out.

**Content suggestion line:** `var(--text-muted)` for the copy, `var(--brand-strong)` for the topic name (bold), `var(--text)` for the action link.

**Post-session draft:** `var(--surface-deep)` background within the captured card, `var(--t-body)` for the draft text (italic), `var(--border)` top separator.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Coach has zero leads, zero sessions, zero content | Command Center shows: empty hero ("Nothing needs you right now"), no quiet list, no business pulse. Honest Question still renders |
| Coach has leads but no clients | No session-related items in Right Now. No "sessions" metric in pulse. Everything else works |
| Coach has no voice profile | Trust metric doesn't render in pulse. Post-session draft returns null (draft section hidden). Pre-session briefs still work |
| Coach has no offerings | "Members" and "Revenue" metrics don't render in pulse. Offering line doesn't appear in Person Panel |
| Person Panel opened, then same name clicked | Panel stays open, no flicker. Data already loaded |
| Person Panel open, different name clicked | Panel content updates with fade transition (150ms). No close/reopen |
| Person Panel for a lead with zero data | Shows: name, status, created date, [Message] [Full profile →]. Minimal but functional |
| Post-session draft generation fails | Draft section simply doesn't appear. Session capture works perfectly without it |
| Content suggestion with 0 sessions | Content suggestion line doesn't render. Content page works as before |
| All Right Now items are resolved (nothing urgent) | Hero shows "Nothing needs you right now." with a muted, warm tone. No quiet list renders |
| 20+ Right Now items (very busy coach) | Hero shows #1. Quiet list shows #2-6. "+14 more →" link expands the full list |
| Business pulse revenue is $0 this month but $5,000 last month | Revenue shows "$0 ↓" in `var(--warning)` color. The arrow tells the story |
| Click PersonName while already on /leads/[id] for that person | Panel doesn't open (you're already on the full profile). PersonName renders as plain text on the lead's own detail page |
| Sequence enrollment names not currently shown | Automations page currently shows aggregate stats. Inline enrichment only applies where names already render. Future: add name list to sequence detail page |
| Mobile: Person Panel | Renders as bottom sheet (70% height), swipe-down to dismiss. Same content, responsive layout |
| `getBusinessPulse` is slow (many queries) | All queries run in parallel. Server component — no loading spinner, page renders when complete. Supabase queries are fast (all indexed by coach_id) |
| Coach opens app at 11pm (no sessions today) | Hero item shows the next most urgent thing (message waiting, overdue session, etc.) or "Nothing needs you right now" |

---

## Relationship to Sessions Intelligence Spec

The Sessions Intelligence spec (`2026-05-29-sessions-intelligence-design.md`) designs the Sessions tab redesign (TodayPrepSection, TodayPrepCard, InlineCaptureForm, NeedsAttentionStrip, smart search). That spec is unchanged — it ships as designed.

This spec **extends** the sessions spec in three ways:
1. The sessions spec's `SessionsTodayCard` for Command Center is replaced by the unified Right Now list (sessions today become scored items, not a separate card).
2. TodayPrepCard's expanded view gains offering + sequence inline enrichment (from this spec's Layer 2).
3. TodayPrepCard's post-capture state gains the follow-up draft (from this spec's `generatePostSessionDraft`).

The sessions spec's Phase 1b (client sidebar session pulse, post-capture ripple) is complementary — it ships alongside this spec's Layer 2 inline enrichment.

---

## Implementation Order

Each piece ships independently and adds value on its own:

1. **`lib/ambient.ts`** — data layer. No UI yet, but powers everything.
2. **Command Center redesign** — hero item + quiet list + business pulse. Biggest immediate impact.
3. **PersonName + PersonPanel** — clickable names + slide-over. Works on every surface that deploys PersonName.
4. **Inline enrichment** — offering/session context on existing surfaces. Small per-file changes.
5. **Content suggestion line** — one line on the content page.
6. **Post-session auto-draft** — AI-generated follow-up after session capture.

Each step is independently deployable. Step 1 is invisible to the coach. Steps 2-6 each deliver visible value.
