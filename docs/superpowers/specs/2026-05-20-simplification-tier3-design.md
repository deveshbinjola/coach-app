# Tier 3 Simplification — Coach/Admin Mode + Progressive Nav Unlock

## Overview

Two features that reduce cognitive load for coaches by surfacing the right UI at the right time.

**Fix 11 — Coach Mode vs Admin Mode Toggle:** A manual pill switch on the command center that reshuffles which cards are prominent. Coach Mode (default) emphasizes daily actions; Admin Mode emphasizes weekly review metrics.

**Fix 12 — Progressive Nav Unlock:** New coaches see 3 header tabs (Home, Leads, Clients). Voice and Content appear silently as milestones are hit. The nav always looks complete — no locked states, no hints, no progression UI in the main app. Settings page shows milestone progress.

---

## Fix 11: Coach Mode vs Admin Mode Toggle

### Toggle Component

- **Location:** Command center header, right-aligned next to the greeting ("Hey, Sunny.")
- **Style:** Pill switch matching the header nav pill pattern
  - Container: white bg, `border border-[var(--border-faint)]`, `rounded-[var(--r-md)]`, `p-0.5`
  - Active pill: `bg-[var(--brand-strong)] text-[var(--surface)]` (navy bg, cream text), `rounded-[calc(var(--r-md)-2px)]`, `font-extrabold text-[length:var(--t-caption)]`
  - Inactive pill: `text-[color:var(--text-faint)]`, same font size, clickable
- **Default:** Coach Mode
- **Persistence:** `localStorage.getItem("command-center-mode")` — `"coach"` | `"admin"`
- **SSR guard:** `typeof window === "undefined"` returns `"coach"`

### Coach Mode (Daily Actions) — Default

Visible and prominent:
- Status bar (COACH OS LIVE + directive + stats summary)
- Session cards row (Rescue leads, Draft replies, Sharpen voice, Capture leads)
- Lead Rescue hero card (split dark/light layout)
- Pipeline section (if exists)

Hidden/collapsed:
- Insight queue — collapsed (existing collapse behavior from Tier 1)
- Stats strip — hidden (revenue, pipeline, clients, reach)
- Honest Question card — hidden
- Billboard card — hidden

### Admin Mode (Weekly Review)

Visible and prominent:
- Stats strip expanded at top (Enrolled, Pipeline, Clients, Reach) — full width
- Insight queue expanded with category chips (Investigate, Fix, Double down)
- Honest Question card
- Billboard card

Hidden/below fold:
- Session cards row — hidden
- Lead Rescue hero card — hidden
- Status bar — still visible (provides context in both modes)

### Subline Change

- Coach Mode subline: Keep existing italic breath line ("Take a breath before you start...")
- Admin Mode subline: Static review line — "Time to check the numbers."

### Implementation Approach

The `CommandCenterView.tsx` component already renders all these sections. The toggle controls a `mode` state that conditionally renders sections:

```tsx
const [mode, setMode] = useState<"coach" | "admin">(() => {
  if (typeof window === "undefined") return "coach";
  return (localStorage.getItem("command-center-mode") as "coach" | "admin") ?? "coach";
});
```

Sections wrapped in `{mode === "coach" && (...)}` or `{mode === "admin" && (...)}`. No new components needed beyond the toggle pill itself.

---

## Fix 12: Progressive Nav Unlock

### Milestone Progression

| Stage | Visible Tabs | Trigger to Next |
|-------|-------------|-----------------|
| Fresh signup | Home, Leads, Clients | Add first lead (any lead in DB) |
| Lead added | + Voice | Complete voice setup (`voice_setup_complete` flag) |
| Voice done | + Content | — (all unlocked) |

### Nav Behavior

- **Header nav** (horizontal pill tabs): Only renders unlocked tabs. Nav looks complete at every stage — 3 tabs looks like 3 is all there is.
- **Mobile bottom tab bar** (`MobileTabBar.tsx`): Same logic — only renders unlocked tabs (3 → 4 → 5).
- **No locked states:** No greyed-out tabs, no lock icons, no hint text, no progression messaging in the main UI.
- **"NEW" badge:** When a tab first unlocks, show a small green badge next to the tab label. Dismisses after first visit to that tab. Badge style: `bg-[var(--brand)] text-[var(--brand-strong)]` small pill, `text-[length:var(--t-micro)] font-extrabold`.

### Milestone Detection

Milestones are derived from existing data — no new database tables needed:

- **"Has lead"**: `leads` table has at least 1 row for this user
- **"Voice setup complete"**: Derived from existing voice/brand data in Supabase — check if user has completed the voice onboarding flow (specific table/field TBD during implementation based on actual schema)

Query these on app load (in the layout or a context provider). Cache the result for the session.

### Unlock State Storage

- **Primary:** Supabase user profile — add `nav_unlocks` JSONB column via migration: `{ "voice": true, "content": true }`
- **Migration:** `ALTER TABLE profiles ADD COLUMN nav_unlocks JSONB DEFAULT '{}'::jsonb;` (or equivalent Supabase migration)
- **Why Supabase, not localStorage:** Unlocks should persist across devices and survive cache clears
- **Fallback logic:** If `nav_unlocks` is null/missing, derive from milestone data (leads count, voice profile status). This means existing users with leads and voice already set up will see all 5 tabs immediately — no false regression.

### Settings Page — Milestone Progress

Add a section in Settings (under General or a new "Onboarding" group):

- **"Navigation"** section with:
  - A simple progress display showing which milestones are complete (checkmarks)
  - "Show all tabs" toggle — overrides progressive unlock, shows all 5 tabs regardless of milestones
  - When toggled on, stores `nav_show_all: true` in user profile

### Implementation Approach

1. **Nav unlock hook** (`useNavUnlocks`): Returns `{ home: true, leads: true, clients: true, voice: boolean, content: boolean, showAll: boolean }`. Reads from Supabase user profile on mount, falls back to milestone derivation.

2. **Header.tsx**: Filter the nav items array through `useNavUnlocks` before rendering. Current nav items are likely a static array — wrap in `useMemo` that filters based on unlock state.

3. **MobileTabBar.tsx**: Same filtering logic.

4. **"NEW" badge**: Track `visited_tabs` in localStorage. When a tab is unlocked but not in `visited_tabs`, show badge. On tab click, add to `visited_tabs`.

5. **Settings**: Add Navigation section with progress checkmarks and "Show all tabs" toggle.

---

## Shared Considerations

### No New Dependencies

Both features use existing patterns: `useState` + `localStorage` for the toggle, Supabase queries for nav unlocks, existing CSS custom properties for styling.

### Accessibility

- Toggle: `role="tablist"` container, `role="tab"` on each pill, `aria-selected` on active
- Nav filtering: Unlocked tabs are simply not rendered — no `aria-hidden` or disabled states needed

### Mobile

- Toggle: Same pill switch, sized appropriately for touch (min 44px tap targets)
- Nav unlock: Mobile tab bar follows exact same logic as header nav

### Testing

- Toggle: Verify mode switches, localStorage persists, correct sections show/hide per mode
- Nav unlock: Verify tabs appear/disappear based on milestone data, "NEW" badge shows and dismisses, Settings override works, existing users see all tabs
