# Tier 4: Daily Punch List + One-Tap Send — Design Spec

**Goal:** Give coaches a focused daily action list on their home page and a frictionless path from any action to a ready-to-send AI draft.

**Scope:** Two features added to the existing coach app. Nothing is removed — CommandHero stays in Admin mode, existing compose flow stays intact.

---

## Feature 1: Daily Punch List

### What It Is

A compact checklist card that replaces CommandHero in **Coach mode only**. Shows up to 5 auto-prioritized actions for today, drawn from four data sources. Each row is tappable (One-Tap Send) and dismissible.

### Data Sources (Priority Order)

| Priority | Source | Key | Item Type | Color Dot | Example Action |
|----------|--------|-----|-----------|-----------|----------------|
| 1 | Lead Rescue | `rescueItems` | `rescue` | Red `#ff6b6b` | "Re-engage Marcus — 5d silent" |
| 2 | Just Landed | `justLandedLeads` | `new-lead` | Blue `#74c0fc` | "Welcome Jamie — new lead today" |
| 3 | Content Pipeline | `contentPipeline` | `content` | Yellow `#ffd43b` | "Finish draft: 5 Keys to Clarity" |
| 4 | Reach Gap | `reachCount` < `reachTarget` | `reach` | Green `#69db7c` | "Send 2 more to hit 10/week goal" |

**Item cap:** 5 items maximum. If more than 5 exist across all sources, take top 5 by priority order (all rescue before any new-lead, etc.).

**Reach gap logic:** If `reachCount < reachTarget`, generate one reach item: "Send {reachTarget - reachCount} more to hit {reachTarget}/week goal". This is always at most 1 item.

### Layout: Compact List (Approach C)

```
┌─────────────────────────────────────────────┐
│  TODAY'S ACTIONS                 2 done · 3 left │
├─────────────────────────────────────────────┤
│  ● Re-engage Marcus — dropped off        ✕  › │
│  ● Finish draft: 5 Keys to Clarity       ✕  › │
│  ● Send 2 more to hit 10/week goal       ✕  › │
├─────────────────────────────────────────────┤
│  ████████░░░░░░░░░░░░  40%                    │
└─────────────────────────────────────────────┘
```

- **Header row:** "Today's Actions" (left) + "{done} done · {remaining} left" (right)
- **Item rows:** Color dot (8px circle, source color) + action text + dismiss button (✕) + chevron (›)
- **Progress bar:** Bottom of card. Width = completed / total. Green (`#00FF41`) fill.
- **Empty state:** "All caught up today" with a subtle checkmark icon.

### Interaction Model

| Action | Behavior |
|--------|----------|
| **Tap row** | Navigate to One-Tap Send destination (see Feature 2) |
| **Tap ✕** | Dismiss item — add item ID to localStorage, row animates out, progress bar updates |
| **Page load** | Re-fetch all sources, filter out dismissed IDs, render remaining |

### Dismiss Persistence

- **Storage:** `localStorage` key `punch-dismissed-YYYY-MM-DD` containing a JSON array of dismissed item IDs.
- **Item IDs:** Composite key of `{type}:{id}` — e.g., `rescue:lead_abc123`, `content:draft_xyz`, `reach:gap`.
- **Auto-clear:** On component mount, if the stored date key doesn't match today, ignore old dismissals (they naturally expire since the key includes the date).
- **No server persistence** — dismissals are ephemeral, per-device, per-day.

### Component: `PunchListCard`

- **Location:** `components/command-center/PunchListCard.tsx`
- **Type:** Client component (`"use client"`)
- **Props:**

```typescript
type PunchListItem = {
  id: string;           // composite: "{type}:{entityId}"
  type: "rescue" | "new-lead" | "content" | "reach";
  label: string;        // display text
  href: string;         // One-Tap Send destination URL
};

type PunchListCardProps = {
  items: PunchListItem[];  // pre-sorted by priority, capped at 5
  totalGenerated: number;  // total before cap (for "View all" link)
};
```

- **Responsibility:** Renders the compact list, manages dismiss state in localStorage, handles tap navigation.

### Data Assembly

Item assembly happens in `command-center/page.tsx` server component, which already fetches all four data sources. A new helper function `buildPunchList()` transforms them into `PunchListItem[]`:

```typescript
function buildPunchList(
  rescueItems: RescueItem[],
  justLandedLeads: Lead[],
  contentPipeline: ContentItem[],
  reachCount: number,
  reachTarget: number,
): PunchListItem[]
```

This runs server-side. The client component only handles rendering + dismiss filtering.

### Where It Renders

In `CommandCenterView.tsx`, Coach mode section:
- **Before:** `<CommandHero ... />` + `<LeadRescueCard ... />` + `<JustLandedBand ... />`
- **After:** `<PunchListCard ... />` + `<LeadRescueCard ... />` + `<JustLandedBand ... />`

CommandHero is replaced by PunchListCard in Coach mode. LeadRescueCard and JustLandedBand remain (they provide detail views; the punch list is the summary).

Admin mode is unchanged — CommandHero stays there.

---

## Feature 2: One-Tap Send

### What It Is

A URL-driven enhancement to the existing compose flow. When a coach taps a punch list item (or any lead action), they navigate to `/inbox` with query params that pre-select the lead and auto-generate an AI draft.

### URL Format

```
/inbox?compose=open&ids={leadId}&autoDraft=true
```

- `compose=open` — existing param, opens the compose drawer
- `ids={leadId}` — existing param, pre-selects the lead
- `autoDraft=true` — **NEW param**, triggers AI draft generation on mount

### Punch List Item → URL Mapping

| Item Type | Destination URL |
|-----------|----------------|
| `rescue` | `/inbox?compose=open&ids={leadId}&autoDraft=true` |
| `new-lead` | `/inbox?compose=open&ids={leadId}&autoDraft=true` |
| `content` | `/content` (existing content editor — no compose) |
| `reach` | `/inbox?compose=open` (no specific lead — coach picks) |

### Auto-Draft Behavior

When the compose drawer mounts with `autoDraft=true`:

1. **Check prerequisites:** Voice profile must exist and lead must be selected. If not, skip auto-draft — show empty compose as fallback.
2. **Generate draft:** Call the existing AI draft generation endpoint/function with:
   - Lead context (name, last interaction date, last message topic, SLA status)
   - Coach's active voice profile
   - Draft type hint based on item type (`rescue` = re-engagement, `new-lead` = welcome)
3. **Display draft:** Populate the compose editor with the generated text. Show "AI DRAFT" label above the editor.
4. **Actions available:**
   - **Send** — sends the message as-is
   - **Edit** — composer becomes editable (it already is, but this signals intent)
   - **Regenerate** — re-runs the AI draft with a fresh generation

### Changes to Existing Code

| File | Change |
|------|--------|
| `/inbox` page or compose component | Read `autoDraft` query param; if true + leadId present, trigger draft generation on mount |
| Compose drawer/editor | Add "AI DRAFT" label when draft was auto-generated; add Regenerate button |
| No new routes | Everything hooks into existing `/inbox` |

### Draft Generation Context

The AI draft prompt should include:
- Coach's voice profile (tone, vocabulary, style)
- Lead's name and basic info
- Last interaction date and topic (if available)
- Item type context:
  - `rescue` → "This lead has gone cold. Write a warm re-engagement message."
  - `new-lead` → "This is a new lead. Write a welcome/introduction message."

The exact prompt engineering is an implementation detail — the spec defines the inputs and the expected output (a ready-to-send message in the editor).

---

## Architecture

```
command-center/page.tsx (server)
  ├── fetches: rescueItems, justLandedLeads, contentPipeline, reach stats
  ├── calls: buildPunchList() → PunchListItem[]
  └── passes items to CommandCenterView

CommandCenterView.tsx (client)
  ├── Coach mode: renders PunchListCard (NEW) + LeadRescueCard + JustLandedBand
  └── Admin mode: renders CommandHero + StatsStrip + ... (unchanged)

PunchListCard.tsx (client, NEW)
  ├── filters dismissed items via localStorage
  ├── renders compact list rows
  ├── tap row → router.push(item.href) → One-Tap Send
  └── tap ✕ → dismiss to localStorage

/inbox page (existing, MODIFIED)
  └── compose drawer
        ├── existing: reads compose=open, ids params
        └── NEW: reads autoDraft param
              → triggers AI draft generation
              → populates editor
              → shows AI DRAFT label + Regenerate button
```

## Files Created or Modified

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `components/command-center/PunchListCard.tsx` | Compact list card component |
| CREATE | `lib/build-punch-list.ts` | Server-side helper: transforms data sources → PunchListItem[] |
| MODIFY | `components/command-center/CommandCenterView.tsx` | Swap CommandHero → PunchListCard in Coach mode |
| MODIFY | `app/command-center/page.tsx` | Call buildPunchList(), pass items as prop |
| MODIFY | Compose drawer component (exact file TBD during implementation) | Add autoDraft param handling, AI draft trigger, Regenerate button |

## Out of Scope

- **Notifications / push** — no morning push notification for the punch list (future consideration)
- **Server-side dismiss persistence** — dismissals are localStorage only, not synced across devices
- **Punch list in Admin mode** — Admin mode keeps CommandHero unchanged
- **Custom item ordering** — coach cannot reorder items; priority is fixed by source type
- **Content item auto-draft** — content items link to the content editor, not compose; no AI draft for content

## Success Criteria

1. Coach opens home page in Coach mode → sees 0-5 action items in a compact card
2. Tapping a lead-type item → lands on compose with AI draft loaded, ready to send
3. Tapping ✕ → item dismissed for today, reappears tomorrow if still relevant
4. Progress bar reflects dismissed items only (dismissed / total). Navigating to compose does not auto-dismiss.
5. No regression to Admin mode — CommandHero and all admin cards unchanged
6. No regression to existing compose flow — compose without autoDraft works exactly as before
