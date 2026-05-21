# Coach App — 80/20 Audit Fixes

Four high-impact fixes identified from the full UI/UX audit. Each targets a real usability gap with minimal code change.

## Decisions

- **Leads search layout:** Stacked two-row (full-width search on top, filter pills below)
- **Mobile nav:** Full 5-tab bottom bar replacing hamburger entirely
- **Leads filtering:** Client-side (all leads already fetched in one query)

---

## Fix 1: Leads Search + Filter Bar

**Problem:** 329 leads, no way to search or filter. Users scroll endlessly.

**Solution:** Add a stacked two-row search/filter bar at the top of LeadsWorkspace.

### Search Row
- Full-width text input with search icon
- Debounced (300ms) client-side filtering
- Searches across `name`, `email`, and `notes` fields (case-insensitive)
- Reuses the search input pattern from `ClientSidebar.tsx`

### Filter Row
- Temperature pills: Hot, Warm, Cold, Burnout — toggleable chips
- Multi-select: click to activate, click again to deactivate
- Active pills use existing Badge color scheme (green for Warm, amber for Hot, gray for Cold/Burnout)
- Lead count displayed on the right side of the filter row
- Filters combine with search (AND logic)

### Files to modify
- `components/inbox/LeadsWorkspace.tsx` — add search/filter state and UI above lead list
- Possibly extract a `LeadSearchBar` component if the workspace file gets too large

---

## Fix 2: Clients Page Cleanup

**Problem:** Duplicated description text, dead whitespace, no "Add client" button.

### 2a: Remove duplicate current_focus
- `components/clients/ClientsWorkspace.tsx` ~line 194: remove the static text rendering of `selectedRoom.current_focus`
- Keep only the editable textarea at ~line 210
- One place to read, one place to edit

### 2b: Add "Add client" button
- Add a `+ Add client` button in the sidebar header area of `ClientSidebar.tsx`
- Follows the same pattern as the existing `+ Add offering` button in AddOfferingForm
- Links to the add-client flow

### 2c: Tighten detail pane whitespace
- Reduce excessive padding in the client detail pane to match sidebar density

### Files to modify
- `components/clients/ClientsWorkspace.tsx` — remove duplicate, tighten padding
- `components/clients/ClientSidebar.tsx` — add "Add client" button

---

## Fix 3: Mobile Bottom Tab Bar

**Problem:** Hamburger menu hides all navigation behind a tap + drawer animation. High friction on mobile.

**Solution:** Fixed bottom tab bar with all 5 nav items, replacing the hamburger entirely.

### Tab bar spec
- 5 tabs: Home, Leads, Clients, Voice, Content
- Each tab: icon + label (stacked vertically)
- Active state: green icon + green label (`--brand-strong` / `#00FF41`)
- Inactive state: muted gray icon + label
- Fixed to bottom of viewport
- `padding-bottom: env(safe-area-inset-bottom)` for notched phones
- Visible only below `md:` breakpoint (`md:hidden`)

### Header changes
- Remove hamburger button and mobile drawer on `< md:` screens
- Desktop pill nav (`hidden md:flex`) stays unchanged
- Add `pb-16 md:pb-0` to main content area to prevent tab bar overlap

### Files to modify
- New: `components/MobileTabBar.tsx`
- `components/Header.tsx` — remove hamburger button + drawer for mobile
- `app/layout.tsx` or root layout — render MobileTabBar, add bottom padding

---

## Fix 4: Empty State Fixes

### 4a: Offerings form always open
- `components/clients/OfferingsWorkspace.tsx` — change `<AddOfferingForm open />` to `<AddOfferingForm />`
- Empty state becomes prominent, form stays collapsed until user clicks "+ Add offering"

### 4b: 404 page missing nav + links
- `app/not-found.tsx` — add `<Header />` component at top
- Add missing quick links: Clients (`/clients`) and Content (`/content`)
- Full QUICK_LINKS array: Home, Leads, Clients, Voice, Content

### 4c: Revenue card
- Already has good empty states with CTAs. No changes needed.

### Files to modify
- `components/clients/OfferingsWorkspace.tsx` — remove `open` prop
- `app/not-found.tsx` — add Header, add missing links

---

## Out of scope
- Server-side search/pagination for leads (client-side is fine for current scale)
- Settings page in mobile nav (not in desktop nav, not adding to mobile)
- Leads page redesign beyond search/filter
- Any database schema changes
