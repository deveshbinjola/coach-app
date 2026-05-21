# Coach App — Simplification & 80/20 Audit Fixes

13 changes across 3 tiers to make the app calmer, more focused, and easier for coaches. Tier 1 ships now, Tier 2 next sprint, Tier 3 is a strategic rethink.

## Decisions

- **Leads search layout:** Stacked two-row (full-width search on top, filter pills below)
- **Mobile nav:** Full 5-tab bottom bar replacing hamburger entirely
- **Leads filtering:** Client-side (all leads already fetched in one query)
- **Command center philosophy:** One clear action at top, everything else secondary
- **Content page philosophy:** Progressive disclosure — create, library, schedule as separate views
- **Global rule:** Max 3 visible cards per viewport, rest behind tabs/accordions/"show more"

---

# Tier 1: Ship Now (7 fixes)

## Fix 1: Command Center — Prioritize ONE Action

**Problem:** 7 cards compete equally for attention. Coach opens the app and doesn't know where to start.

**Solution:** Make the hero section louder and everything below it clearly secondary.

- Hero becomes a single prominent action card: "Reply to Sarah — she's been waiting 2 days" or "Review 3 fresh drafts in your voice" or "Quiet board — send reach or sharpen voice"
- Style: larger text, full-width, clear CTA button
- Below-the-fold cards get reduced visual weight (lighter borders, smaller headings)
- Remove redundant summary text from hero subline when dedicated cards exist below

### Files to modify
- `components/command-center/CommandCenterView.tsx` — restructure hero, adjust card styling
- `components/command-center/CommandHero.tsx` — add CTA button, increase prominence

---

## Fix 2: Command Center — Collapse Insight Queue

**Problem:** 4-lane insight band (investigate / fix / double down / ignore) is powerful but dense. Overwhelms new coaches.

**Solution:** Collapsed by default, expand on tap.

- Show a compact bar: "3 insights for you" with a chevron
- Click to expand the full 4-lane view
- Remember expanded/collapsed state in localStorage
- Coaches who want it find it; new coaches don't drown in it

### Files to modify
- `components/command-center/CommandCenterView.tsx` — wrap InsightQueue in collapsible, add count badge

---

## Fix 3: Command Center — Merge Reach + Revenue

**Problem:** Two separate cards for metrics coaches glance at but don't act on. Takes a full card slot each.

**Solution:** Merge into one compact stats strip.

- Single horizontal bar: "$2.4K pipeline · 3 clients · 12/20 reach this week"
- Sparkline stays but smaller, inline
- Click the strip to expand full details if needed
- Frees up a full card slot, reducing visual noise

### Files to modify
- `components/command-center/CommandCenterView.tsx` — replace two cards with stats strip
- `components/command-center/RevenueCard.tsx` — refactor to compact mode
- `components/command-center/ReachCard.tsx` — refactor to compact inline

---

## Fix 4: Leads Search + Filter Bar

**Problem:** 329 leads, no way to search or filter. Users scroll endlessly.

**Solution:** Stacked two-row search/filter bar at the top of LeadsWorkspace.

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

## Fix 5: Clients Page Cleanup

**Problem:** Duplicated description text, dead whitespace, no "Add client" button.

### 5a: Remove duplicate current_focus
- `components/clients/ClientsWorkspace.tsx` ~line 194: remove the static text rendering of `selectedRoom.current_focus`
- Keep only the editable textarea at ~line 210

### 5b: Add "Add client" button
- `+ Add client` button in the sidebar header area of `ClientSidebar.tsx`

### 5c: Tighten detail pane whitespace
- Reduce excessive padding in the client detail pane to match sidebar density

### Files to modify
- `components/clients/ClientsWorkspace.tsx` — remove duplicate, tighten padding
- `components/clients/ClientSidebar.tsx` — add "Add client" button

---

## Fix 6: Mobile Bottom Tab Bar

**Problem:** Hamburger menu hides all navigation behind a tap + drawer. High friction on mobile.

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
- `app/layout.tsx` — render MobileTabBar, add bottom padding

---

## Fix 7: Empty State Fixes

### 7a: Offerings form always open
- `components/clients/OfferingsWorkspace.tsx` — change `<AddOfferingForm open />` to `<AddOfferingForm />`

### 7b: 404 page missing nav + links
- `app/not-found.tsx` — add `<Header />` component at top
- Add missing quick links: Clients (`/clients`) and Content (`/content`)

### Files to modify
- `components/clients/OfferingsWorkspace.tsx` — remove `open` prop
- `app/not-found.tsx` — add Header, add missing links

---

# Tier 2: Next Sprint (3 fixes)

## Fix 8: Content Page — Progressive Disclosure

**Problem:** 4,337 lines, 50 components, 89 functions on one page. Carousel builder, style picker, AND draft library shown simultaneously. Most overwhelming page in the app.

**Solution:** Break into 3 views via tabs or sub-routes.

- **Create** — focused single-draft creation (carousel builder, style picker)
- **Library** — all drafts with status filters (drafted, scheduled, published)
- **Schedule** — calendar view of upcoming content
- Only one view visible at a time. Default to Library for returning users, Create for first-timers.

### Files to modify
- `components/content/ContentWorkspace.tsx` — split into 3 sub-components
- Possibly extract to `components/content/CreateView.tsx`, `LibraryView.tsx`, `ScheduleView.tsx`

---

## Fix 9: Voice Page — Hide Advanced Sections

**Problem:** After the 5-question setup, the page dumps learning panel, training history, captions import, Brand OS CTA all at once.

**Solution:** Post-setup view shows only voice summary + "Refine" button. Advanced sections behind expandable accordions.

- Default view: voice profile card (name, tone, key phrases) + one "Refine your voice" CTA
- Expandable sections: Learning panel, Training history, Captions import
- Brand OS CTA stays visible (it's a growth path, not admin noise)

### Files to modify
- `components/voice/VoiceWorkspace.tsx` — restructure post-setup layout with accordions

---

## Fix 10: Global Card Density Rule

**Problem:** Every page uses 5-7 cards with equal visual weight. Nothing stands out.

**Solution:** Enforce a max-3-visible-cards rule per viewport.

- Audit each page: what are the 3 most important things a coach needs to see?
- Everything else: tabs, accordions, "show more" links, or moved below the fold
- Applies retroactively to command center, clients, content, voice pages

### Files to modify
- All workspace components — progressive disclosure audit

---

# Tier 3: Strategic Rethink (future)

## Fix 11: Command Center — Coach Mode vs Admin Mode

Daily workflow (reply to leads, draft content) vs weekly review (revenue, reach, insights). Consider a toggle or time-based switch. Morning = action mode, Friday = review mode.

## Fix 12: Progressive Nav Unlock for New Coaches

New coaches see 3 tabs (Home, Leads, Clients). Voice and Content unlock after onboarding milestones. Reduces initial cognitive load from 5 pages to 3.

## Fix 13: Content — Separate "Create" from "Manage"

Carousel builder is a creative tool. Draft library is an admin tool. Mixing them creates context-switching fatigue. May warrant separate routes entirely.

---

## Out of scope (all tiers)
- Server-side search/pagination for leads (client-side is fine for current scale)
- Settings page in mobile nav (not in desktop nav, not adding to mobile)
- Database schema changes
- New features or functionality — this is purely simplification
