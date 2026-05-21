# Tier 3 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Coach/Admin mode toggle to the command center and progressive nav unlock so new coaches see fewer tabs until milestones are hit.

**Architecture:** Fix 11 adds a localStorage-persisted pill toggle to `CommandCenterView` that conditionally renders daily-action vs. weekly-review sections. Fix 12 adds a `navUnlocks` prop threaded from each page's server component through `Header` and `MobileTabBar`, filtering `NAV_ITEMS` / `TAB_ITEMS` to only show unlocked tabs. Milestone state is derived server-side from existing Supabase data (lead count + voice profile existence) with a `cp_coaches.nav_show_all` override column.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS with CSS custom properties, Supabase (auth + DB), localStorage, Lucide icons

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/command-center/ModeToggle.tsx` | Create | Pill toggle component (Coach / Admin) |
| `components/command-center/CommandCenterView.tsx` | Modify | Wire toggle, conditionally render sections per mode |
| `lib/nav-unlocks.ts` | Create | Server helper: derive which tabs are unlocked from Supabase data |
| `components/Header.tsx` | Modify | Accept `navUnlocks` prop, filter `NAV_ITEMS`, render NEW badge |
| `components/MobileTabBar.tsx` | Modify | Accept `navUnlocks` prop, filter `TAB_ITEMS`, render NEW badge |
| `app/command-center/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header |
| `app/settings/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header, add Navigation section |
| `app/inbox/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header |
| `app/clients/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header |
| `app/voice/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header |
| `app/content/page.tsx` | Modify | Call `loadNavUnlocks`, pass to Header |
| `components/settings/NavigationSettingsPanel.tsx` | Create | Show all tabs toggle + milestone progress |

---

### Task 1: Coach/Admin Mode Toggle Component

**Files:**
- Create: `components/command-center/ModeToggle.tsx`

- [ ] **Step 1: Create ModeToggle component**

```tsx
// components/command-center/ModeToggle.tsx
"use client";

type Mode = "coach" | "admin";

type Props = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "coach", label: "Coach" },
  { id: "admin", label: "Admin" },
];

export type { Mode };

export default function ModeToggle({ mode, onModeChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-0 rounded-[var(--r-pill)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-0.5"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          type="button"
          onClick={() => onModeChange(m.id)}
          className={`px-3.5 py-1.5 rounded-[calc(var(--r-pill)-2px)] text-[length:var(--t-caption)] font-extrabold transition ${
            mode === m.id
              ? "bg-[var(--brand-strong)] text-[var(--surface)] shadow-[var(--shadow-sm)]"
              : "text-[color:var(--text-faint)] hover:text-[color:var(--text-muted)]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `cat components/command-center/ModeToggle.tsx | head -5`
Expected: Shows `"use client";` and the type declaration.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/ModeToggle.tsx
git commit -m "feat: add ModeToggle pill component for command center"
```

---

### Task 2: Wire Mode Toggle into Command Center

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx`

The command center currently renders these sections in order:
1. `<header>` greeting (lines 668-677)
2. `<CommandHero>` (lines 679-688)
3. `<InsightQueue>` (line 690)
4. `<LeadRescueCard>` (line 692)
5. `<JustLandedBand>` (lines 694-696)
6. Grid with left column (ContentPipeline + VoiceTrustCard) and right sidebar (StatsStrip + HonestQuestion/Billboard) (lines 698-733)

**Coach Mode** shows: CommandHero, LeadRescueCard, JustLandedBand, grid (ContentPipeline + VoiceTrustCard + sidebar). Hides: InsightQueue content (keep collapsed header), StatsStrip, HonestQuestion, BillboardCard.

**Admin Mode** shows: StatsStrip (full width, outside grid), InsightQueue (expanded), HonestQuestion, BillboardCard. Hides: CommandHero, LeadRescueCard, JustLandedBand, ContentPipeline, VoiceTrustCard.

- [ ] **Step 1: Add imports and state**

At the top of `CommandCenterView.tsx`, add import:

```tsx
import ModeToggle, { type Mode } from "@/components/command-center/ModeToggle";
```

Inside the component function, after the existing `sidebarExpanded` state (line 587), add:

```tsx
const [mode, setMode] = useState<Mode>(() => {
  if (typeof window === "undefined") return "coach";
  return (localStorage.getItem("command-center-mode") as Mode) ?? "coach";
});

function handleModeChange(m: Mode) {
  setMode(m);
  localStorage.setItem("command-center-mode", m);
}
```

- [ ] **Step 2: Add toggle to header section**

Find the `<header>` block (around lines 668-677). Replace it with a flex row containing the greeting on the left and the toggle on the right:

```tsx
<header className="flex items-start justify-between gap-4">
  <div>
    <h1
      className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]"
    >
      Hey, {coachFirstName}.
    </h1>
    <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
      {mode === "admin"
        ? "Time to check the numbers."
        : "Take a breath before you start.  In through the nose… slow exhale."}
    </p>
  </div>
  <ModeToggle mode={mode} onModeChange={handleModeChange} />
</header>
```

- [ ] **Step 3: Wrap Coach Mode sections in conditional**

Wrap the following sections with `{mode === "coach" && (<>...</>)}`:
- `<CommandHero ... />` (line ~679-688)
- `<LeadRescueCard ... />` (line ~692)
- `<JustLandedBand>` block (lines ~694-696)
- The entire grid `<div className="grid ...">` block (lines ~698-733)

```tsx
{mode === "coach" && (
  <>
    <CommandHero ... />
    <LeadRescueCard items={rescueItems} />
    {justLanded.length > 0 && <JustLandedBand ... />}
    <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-5 opacity-[0.85] hover:opacity-100 transition-opacity duration-300">
      {/* ... existing left column + right sidebar ... */}
    </div>
  </>
)}
```

- [ ] **Step 4: Add Admin Mode sections**

After the Coach Mode conditional block, add:

```tsx
{mode === "admin" && (
  <>
    <StatsStrip
      offerings={offeringRevenue}
      reachCount={reachCount}
      reachTarget={reachTarget}
      clientCount={summary.clientCount}
      pipelineValueCents={summary.pipelineValueCents}
    />
    <InsightQueue items={insightItems} defaultExpanded />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <HonestQuestion question={honestQuestion} />
      <BillboardCard now={now} />
    </div>
  </>
)}
```

Note: The `InsightQueue` component (defined locally around line 739) uses a `defaultOpen` state from localStorage. For Admin mode we want it expanded. Add an optional `defaultExpanded` prop:

Find the `InsightQueue` function definition (around line 739). It currently reads `cc-insights-expanded` from localStorage. Add a prop:

```tsx
function InsightQueue({ items, defaultExpanded }: { items: InsightItem[]; defaultExpanded?: boolean }) {
```

And update the useState initializer:

```tsx
const [open, setOpen] = useState(() => {
  if (defaultExpanded) return true;
  if (typeof window === "undefined") return false;
  return localStorage.getItem("cc-insights-expanded") === "1";
});
```

- [ ] **Step 5: Move the shared InsightQueue outside conditionals**

Actually, InsightQueue should show in both modes — collapsed in Coach, expanded in Admin. Instead of duplicating, keep it in the shared flow but pass the mode:

Remove InsightQueue from both conditional blocks. Place it once, right after the header, before the mode conditionals:

```tsx
<InsightQueue items={insightItems} defaultExpanded={mode === "admin"} />
```

The InsightQueue already has its own collapse/expand toggle. In Admin mode it just starts expanded.

- [ ] **Step 6: Verify the app compiles**

Run: `npx next build --no-lint 2>&1 | tail -20` (or use dev server)
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/command-center/CommandCenterView.tsx
git commit -m "feat: wire Coach/Admin mode toggle into command center"
```

---

### Task 3: Nav Unlocks Server Helper

**Files:**
- Create: `lib/nav-unlocks.ts`

This module queries Supabase to determine which nav tabs should be visible for a given coach.

- [ ] **Step 1: Create the nav-unlocks module**

```tsx
// lib/nav-unlocks.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type NavUnlocks = {
  voice: boolean;
  content: boolean;
};

export async function loadNavUnlocks(
  supabase: SupabaseClient,
  coachId: string,
): Promise<NavUnlocks> {
  const [{ count: leadCount }, { data: voiceProfile }, { data: coachRow }] =
    await Promise.all([
      supabase
        .from("cp_leads")
        .select("id", { count: "exact", head: true })
        .limit(1),
      supabase
        .from("cp_voice_profiles")
        .select("id")
        .eq("coach_id", coachId)
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cp_coaches")
        .select("nav_show_all")
        .eq("id", coachId)
        .maybeSingle(),
    ]);

  const showAll = (coachRow as { nav_show_all?: boolean } | null)?.nav_show_all === true;

  if (showAll) {
    return { voice: true, content: true };
  }

  const hasLead = (leadCount ?? 0) > 0;
  const hasVoice = voiceProfile !== null;

  return {
    voice: hasLead,
    content: hasLead && hasVoice,
  };
}
```

- [ ] **Step 2: Verify the file was created correctly**

Run: `npx tsc --noEmit lib/nav-unlocks.ts 2>&1 | head -10` (or just check dev server)
Expected: No errors (may need to check with full build since it imports SupabaseClient).

- [ ] **Step 3: Commit**

```bash
git add lib/nav-unlocks.ts
git commit -m "feat: add nav-unlocks server helper for progressive tab unlock"
```

---

### Task 4: Add `nav_show_all` Column to `cp_coaches`

**Files:**
- Modify: Supabase schema (SQL migration)

- [ ] **Step 1: Run migration via Supabase MCP or dashboard**

```sql
ALTER TABLE cp_coaches
ADD COLUMN IF NOT EXISTS nav_show_all BOOLEAN DEFAULT false;
```

- [ ] **Step 2: Verify column exists**

Run a test query: `SELECT nav_show_all FROM cp_coaches LIMIT 1;`
Expected: Returns `false` (the default).

- [ ] **Step 3: Commit a migration file (optional — if the project uses local migrations)**

If the project tracks migrations in a folder, create one. Otherwise this step is done via Supabase dashboard/MCP.

---

### Task 5: Thread `navUnlocks` Through Header

**Files:**
- Modify: `components/Header.tsx`
- Modify: `components/MobileTabBar.tsx`

- [ ] **Step 1: Update Header props and filter NAV_ITEMS**

In `components/Header.tsx`, update the Props type (around line 55):

```tsx
import type { NavUnlocks } from "@/lib/nav-unlocks";

type Props = {
  email: string;
  name?: string;
  avatarUrl?: string;
  emphasis?: { content?: boolean; leads?: boolean; clients?: boolean };
  navUnlocks?: NavUnlocks;
};
```

Update the component signature (line 66):

```tsx
export default function Header({ email, name, avatarUrl, emphasis, navUnlocks }: Props) {
```

Add a `visitedTabs` state for the NEW badge (inside the component, after existing state):

```tsx
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem("visited-tabs") ?? "[]"));
  } catch {
    return new Set();
  }
});

function markTabVisited(href: string) {
  setVisitedTabs((prev) => {
    const next = new Set(prev);
    next.add(href);
    localStorage.setItem("visited-tabs", JSON.stringify([...next]));
    return next;
  });
}
```

Filter NAV_ITEMS before rendering. Find the nav JSX (around line 144) and replace the `{NAV_ITEMS.map(...)` with:

```tsx
const visibleNavItems = NAV_ITEMS.filter((item) => {
  if (!navUnlocks) return true;
  if (item.href === "/voice") return navUnlocks.voice;
  if (item.href === "/content") return navUnlocks.content;
  return true;
});
```

Place this computation inside the component body (before the return). Then in the JSX:

```tsx
{visibleNavItems.map((item) => (
  <NavLink
    key={item.href}
    href={item.href}
    label={item.label}
    active={isActive(item.href)}
    quiet={isQuiet(item.href)}
    isNew={navUnlocks !== undefined && !visitedTabs.has(item.href) && (item.href === "/voice" || item.href === "/content")}
    onNavigate={() => markTabVisited(item.href)}
  />
))}
```

- [ ] **Step 2: Update NavLink to support NEW badge**

Update the `NavLink` function (around line 285):

```tsx
function NavLink({
  href,
  label,
  active,
  quiet = false,
  isNew = false,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  quiet?: boolean;
  isNew?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className={`flex h-10 items-center gap-1.5 px-4 rounded-[var(--r-pill)] text-[length:var(--t-caption)] font-bold transition ${
        active
          ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
          : "text-[color:var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] hover:text-[color:var(--text)]"
      } ${quiet && !active ? "opacity-50 hover:opacity-100" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {isNew && (
        <span className="inline-flex items-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[length:var(--t-micro)] font-extrabold text-[var(--brand-strong)]">
          NEW
        </span>
      )}
    </a>
  );
}
```

- [ ] **Step 3: Update MobileTabBar**

In `components/MobileTabBar.tsx`, add the same filtering. Update the component:

```tsx
import type { NavUnlocks } from "@/lib/nav-unlocks";
```

Update the props and component:

```tsx
export default function MobileTabBar({ navUnlocks }: { navUnlocks?: NavUnlocks }) {
```

Filter TAB_ITEMS before rendering:

```tsx
const visibleTabs = TAB_ITEMS.filter((item) => {
  if (!navUnlocks) return true;
  if (item.href === "/voice") return navUnlocks.voice;
  if (item.href === "/content") return navUnlocks.content;
  return true;
});
```

Update the grid class to be dynamic:

```tsx
<nav className={`grid grid-cols-${visibleTabs.length} h-14`}>
```

Wait — Tailwind needs static classes. Use a mapping instead:

```tsx
const gridClass = visibleTabs.length === 3
  ? "grid-cols-3"
  : visibleTabs.length === 4
    ? "grid-cols-4"
    : "grid-cols-5";
```

Then: `<nav className={`grid ${gridClass} h-14`}>`

Replace `{TAB_ITEMS.map(...)}` with `{visibleTabs.map(...)}`.

- [ ] **Step 4: Verify build**

Run: `npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/Header.tsx components/MobileTabBar.tsx
git commit -m "feat: filter nav items based on navUnlocks prop + NEW badge"
```

---

### Task 6: Thread `navUnlocks` From Every Page

**Files:**
- Modify: `app/command-center/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/inbox/page.tsx`
- Modify: `app/clients/page.tsx`
- Modify: `app/voice/page.tsx`
- Modify: `app/content/page.tsx`

Each page server component already calls `supabase.auth.getUser()` and passes props to `<Header>`. We need to add `loadNavUnlocks` and pass the result.

- [ ] **Step 1: Update command-center/page.tsx**

Add import at the top:

```tsx
import { loadNavUnlocks } from "@/lib/nav-unlocks";
```

After the existing `loadHeaderEmphasis` call (line 59), add:

```tsx
const navUnlocks = await loadNavUnlocks(supabase, user.id);
```

Find where `<Header>` is rendered and add the prop:

```tsx
<Header
  email={user?.email ?? ""}
  name={userDisplayName(user?.user_metadata)}
  avatarUrl={userAvatarUrl(user?.user_metadata)}
  emphasis={headerEmphasis}
  navUnlocks={navUnlocks}
/>
```

Also find where `<MobileTabBar />` is rendered (if in this file or layout) and pass `navUnlocks={navUnlocks}`.

- [ ] **Step 2: Update all other page files**

Repeat the same pattern for each page:

For `app/inbox/page.tsx`, `app/clients/page.tsx`, `app/voice/page.tsx`, `app/content/page.tsx`, and `app/settings/page.tsx`:

1. Add `import { loadNavUnlocks } from "@/lib/nav-unlocks";`
2. After getting `user`, call `const navUnlocks = await loadNavUnlocks(supabase, user.id);`
3. Pass `navUnlocks={navUnlocks}` to `<Header>`

For voice and content pages specifically: if `navUnlocks.voice === false` or `navUnlocks.content === false` respectively, redirect to `/command-center` (safety guard so coaches can't access locked pages via direct URL):

```tsx
// In app/voice/page.tsx, after loading navUnlocks:
if (!navUnlocks.voice) redirect("/command-center");

// In app/content/page.tsx:
if (!navUnlocks.content) redirect("/command-center");
```

- [ ] **Step 3: Handle MobileTabBar in layout.tsx**

MobileTabBar lives in `app/layout.tsx` (line 20) which is a server layout with no user context. Rather than adding auth to the layout, make each page server component write a lightweight `nav-unlocks` value to a cookie that MobileTabBar reads client-side.

In `lib/nav-unlocks.ts`, add a helper to serialize unlocks for the client:

```tsx
export function navUnlocksToJson(unlocks: NavUnlocks): string {
  return JSON.stringify(unlocks);
}
```

In each page server component (Task 6), after computing `navUnlocks`, set a cookie:

```tsx
import { cookies } from "next/headers";
// After loadNavUnlocks:
cookies().set("nav-unlocks", JSON.stringify(navUnlocks), { path: "/", sameSite: "lax", maxAge: 86400 });
```

In `components/MobileTabBar.tsx`, read the cookie client-side:

```tsx
function getNavUnlocks(): NavUnlocks | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/nav-unlocks=([^;]+)/);
  if (!match) return undefined;
  try { return JSON.parse(decodeURIComponent(match[1])); } catch { return undefined; }
}
```

Use this in a `useState` initializer to filter tabs on first render. This avoids hydration mismatch since the cookie is available during SSR too — but since layout.tsx is a server component and MobileTabBar is a client component, the cookie read happens client-side on mount.

- [ ] **Step 4: Verify build**

Run: `npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/command-center/page.tsx app/settings/page.tsx app/inbox/page.tsx app/clients/page.tsx app/voice/page.tsx app/content/page.tsx app/layout.tsx
git commit -m "feat: thread navUnlocks through all pages for progressive nav unlock"
```

---

### Task 7: Navigation Settings Panel

**Files:**
- Create: `components/settings/NavigationSettingsPanel.tsx`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Create NavigationSettingsPanel**

```tsx
// components/settings/NavigationSettingsPanel.tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Props = {
  showAll: boolean;
  hasLead: boolean;
  hasVoice: boolean;
};

const MILESTONES = [
  { key: "lead", label: "Add your first lead", unlocks: "Voice tab" },
  { key: "voice", label: "Complete voice setup", unlocks: "Content tab" },
] as const;

export default function NavigationSettingsPanel({ showAll: initialShowAll, hasLead, hasVoice }: Props) {
  const [showAll, setShowAll] = useState(initialShowAll);
  const [saving, setSaving] = useState(false);

  async function toggleShowAll() {
    const next = !showAll;
    setShowAll(next);
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("cp_coaches")
        .update({ nav_show_all: next })
        .eq("id", user.id);
    }
    setSaving(false);
  }

  const milestoneComplete = (key: string) => {
    if (key === "lead") return hasLead;
    if (key === "voice") return hasVoice;
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">Milestones</p>
        {MILESTONES.map((m) => (
          <div key={m.key} className="flex items-center gap-2 text-[length:var(--t-caption)]">
            <span className={milestoneComplete(m.key) ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}>
              {milestoneComplete(m.key) ? "✓" : "○"}
            </span>
            <span className={milestoneComplete(m.key) ? "text-[color:var(--text)]" : "text-[color:var(--text-muted)]"}>
              {m.label}
            </span>
            <span className="text-[color:var(--text-faint)]">→ unlocks {m.unlocks}</span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={showAll}
          onClick={toggleShowAll}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            showAll ? "bg-[var(--brand-strong)]" : "bg-[var(--border)]"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
              showAll ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
          Show all tabs
        </span>
      </label>
      {showAll && (
        <p className="text-[length:var(--t-micro)] text-[color:var(--text-faint)]">
          All navigation tabs are visible regardless of milestones.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into Settings page**

In `app/settings/page.tsx`, add imports:

```tsx
import NavigationSettingsPanel from "@/components/settings/NavigationSettingsPanel";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
```

After the existing parallel queries (around line 64-85), add nav unlock data fetching. Add to the `Promise.all`:

```tsx
const navUnlocks = await loadNavUnlocks(supabase, user!.id);
```

Also query the raw milestone data for the panel:

```tsx
const [{ count: leadCount }, { data: voiceProfile }] = await Promise.all([
  supabase.from("cp_leads").select("id", { count: "exact", head: true }).limit(1),
  supabase.from("cp_voice_profiles").select("id").eq("coach_id", user!.id).eq("active", true).limit(1).maybeSingle(),
]);
const hasLead = (leadCount ?? 0) > 0;
const hasVoice = voiceProfile !== null;
const showAllNav = (coachRow as { nav_show_all?: boolean } | null)?.nav_show_all === true;
```

Add the `nav_show_all` field to the existing `cp_coaches` select (line 74):

```tsx
.select("audience_self, audience_serves, voice_profile_slug, nav_show_all")
```

Add a new slot to `advancedSlots` array (before the "onboarding_reset" slot):

```tsx
{
  key: "navigation",
  title: "Navigation",
  status: hasLead && hasVoice ? "done" : "set_up",
  summary: hasLead && hasVoice
    ? "All tabs unlocked"
    : `${[hasLead && "Lead added", hasVoice && "Voice set up"].filter(Boolean).join(" · ") || "Getting started"} — ${showAllNav ? "showing all tabs" : "progressive unlock active"}`,
  panel: (
    <NavigationSettingsPanel
      showAll={showAllNav}
      hasLead={hasLead}
      hasVoice={hasVoice}
    />
  ),
},
```

- [ ] **Step 3: Pass navUnlocks to Header in Settings**

Find the `<Header>` JSX in Settings page and add:

```tsx
<Header
  email={user?.email ?? ""}
  name={userDisplayName(user?.user_metadata)}
  avatarUrl={userAvatarUrl(user?.user_metadata)}
  navUnlocks={navUnlocks}
/>
```

- [ ] **Step 4: Verify build**

Run: `npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/settings/NavigationSettingsPanel.tsx app/settings/page.tsx
git commit -m "feat: add Navigation settings panel with milestone progress + show all toggle"
```

---

### Task 8: Visual Verification + Edge Cases

**Files:**
- All modified files from previous tasks

- [ ] **Step 1: Test Coach/Admin toggle**

Start the dev server. Navigate to `/command-center`.
- Verify the toggle appears next to "Hey, Sunny."
- Click "Admin" — verify stats, insights, honest question, billboard are visible; hero card and session cards are hidden
- Click "Coach" — verify hero card and session cards return; stats/honest question/billboard hide
- Refresh page — verify mode persists via localStorage

- [ ] **Step 2: Test progressive nav unlock**

With a user who has leads and voice profile: all 5 tabs visible.

To test locked state: either use a fresh user OR temporarily modify `loadNavUnlocks` to return `{ voice: false, content: false }`.

- Verify only Home, Leads, Clients tabs show in header
- Verify mobile tab bar also shows only 3 tabs
- Verify direct URL to `/voice` redirects to `/command-center`
- Verify direct URL to `/content` redirects to `/command-center`

- [ ] **Step 3: Test Settings panel**

Navigate to `/settings`.
- Verify "Navigation" card appears in the Advanced section
- Verify milestone checkmarks reflect actual data
- Toggle "Show all tabs" on — verify all 5 tabs appear in header
- Toggle off — verify tabs hide again based on milestones

- [ ] **Step 4: Test NEW badge**

Clear `visited-tabs` from localStorage. If a tab is unlocked, verify "NEW" badge appears. Click the tab — badge should disappear on next load.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: edge case fixes from visual verification"
```
