# Tier 2 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the content page, voice page, and all workspace pages calmer by showing one thing at a time and enforcing a max-3-visible-cards rule per viewport.

**Architecture:** Content page gets a tab switcher ("Create" vs "Library") that conditionally renders existing sections — no file extraction needed since the JSX is already cleanly divided by `EditorialSectionHeader` markers. Voice page gets one prop change. Command center body grid gets a "show more" collapse on the sidebar column.

**Tech Stack:** React 18, Next.js 14 App Router, Tailwind CSS with CSS custom properties, localStorage for tab persistence.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/content/ContentWorkspace.tsx` | Modify | Add tab state + conditional rendering around existing Desk/Library sections |
| `components/content/ContentTabBar.tsx` | Create | Reusable tab bar for Create/Library switching |
| `components/voice/VoiceHomePanel.tsx` | Modify | Change Voice workbench defaultOpen from true to false |
| `components/command-center/CommandCenterView.tsx` | Modify | Collapse sidebar extras behind "show more" |

---

### Task 1: Content Page — Add Tab Switcher

The content page has two clear sections: "The Desk" (creation, lines 696-1052) and "The Library" (drafts, lines 1054-1221). We wrap each in a conditional based on a new `contentTab` state and add a tab bar at the top.

**Files:**
- Create: `components/content/ContentTabBar.tsx`
- Modify: `components/content/ContentWorkspace.tsx`

- [ ] **Step 1: Create ContentTabBar component**

Create `components/content/ContentTabBar.tsx`:

```tsx
"use client";

type ContentTab = "create" | "library";

type Props = {
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
  draftCount: number;
};

const TABS: Array<{ id: ContentTab; label: string }> = [
  { id: "create", label: "Create" },
  { id: "library", label: "Library" },
];

export type { ContentTab };

export default function ContentTabBar({ activeTab, onTabChange, draftCount }: Props) {
  return (
    <div className="flex items-center gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`min-h-9 rounded-[var(--r-md)] border px-4 text-[length:var(--t-caption)] font-extrabold transition ${
            activeTab === tab.id
              ? "border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-[var(--brand-soft)] text-[color:var(--text)]"
              : "border-[var(--border-faint)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[color:var(--text)]"
          }`}
        >
          {tab.label}
          {tab.id === "library" && (
            <span className="ml-1.5 text-[color:var(--text-faint)]">{draftCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add tab state and import to ContentWorkspace**

In `components/content/ContentWorkspace.tsx`, add the import near the top (after existing content imports around line 43):

```tsx
import ContentTabBar from "@/components/content/ContentTabBar";
import type { ContentTab } from "@/components/content/ContentTabBar";
```

Add the tab state near the other useState hooks (after `contentView` at line 345):

```tsx
const [contentTab, setContentTab] = useState<ContentTab>(() => {
  if (typeof window === "undefined") return "library";
  return (localStorage.getItem("content-tab") as ContentTab) ?? "library";
});
```

Add a handler right after (to persist to localStorage):

```tsx
function handleTabChange(tab: ContentTab) {
  setContentTab(tab);
  localStorage.setItem("content-tab", tab);
}
```

- [ ] **Step 3: Render the tab bar and wrap sections in conditionals**

In the JSX return (line 683), after the `EditorialMasthead` block (line 694), insert the tab bar:

```tsx
      <ContentTabBar
        activeTab={contentTab}
        onTabChange={handleTabChange}
        draftCount={items.filter((item) => !isContentArchived(item)).length}
      />
```

Then wrap "The Desk" section (from the `<EditorialSectionHeader number={1}` at line 696 through `<SacredZonesInline />` at line 1052) in a conditional:

```tsx
      {contentTab === "create" && (
        <>
          <EditorialSectionHeader ... />
          {/* ... all existing Desk content stays unchanged ... */}
          <SacredZonesInline />
        </>
      )}
```

And wrap "The Library" section (from `<EditorialSectionHeader number={2}` at line 1054 through the closing `</Card>` at line 1221) in a conditional:

```tsx
      {contentTab === "library" && (
        <>
          <EditorialSectionHeader ... />
          {/* ... all existing Library content stays unchanged ... */}
        </>
      )}
```

The `VoiceRetuneBanner` (line 685), `EditorialMasthead` (line 688), `ContentTabBar` (new), and `VoiceLearnedToast` (line 1223) stay outside both conditionals — they're always visible.

- [ ] **Step 4: Update library empty state CTA**

In the library's empty state (around line 1107), the "Go to The Desk" button uses `scrollIntoView` which won't work when The Desk is hidden. Change it to switch tabs:

Find (around line 1105-1112):
```tsx
                <button
                  type="button"
                  onClick={() => document.getElementById("draft-room")?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--brand)] px-4 py-2 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
                >
                  <ArrowRight size={14} className="rotate-[-90deg]" aria-hidden />
                  Go to The Desk
                </button>
```

Replace with:
```tsx
                <button
                  type="button"
                  onClick={() => handleTabChange("create")}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--brand)] px-4 py-2 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
                >
                  <ArrowRight size={14} className="rotate-[-90deg]" aria-hidden />
                  Go to Create
                </button>
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add components/content/ContentTabBar.tsx components/content/ContentWorkspace.tsx
git commit -m "feat: add Create/Library tabs to content page for progressive disclosure"
```

---

### Task 2: Voice Page — Collapse Workbench by Default

The Voice page already uses `DisclosureSection` components with 4 collapsible sections. Currently "Voice workbench" defaults open, which dumps import UI on the coach immediately after setup. The spec wants only the voice summary + refine CTA to be prominent.

**Files:**
- Modify: `components/voice/VoiceHomePanel.tsx:155`

- [ ] **Step 1: Change Voice workbench defaultOpen**

In `components/voice/VoiceHomePanel.tsx`, find the first `DisclosureSection` (around line 155):

```tsx
        <DisclosureSection
          id="workbench"
          title="Voice workbench"
          description={`Import writing or add transcripts to sharpen your voice · ${sources.length} source(s) saved`}
          defaultOpen
        >
```

Change `defaultOpen` to `defaultOpen={false}`:

```tsx
        <DisclosureSection
          id="workbench"
          title="Voice workbench"
          description={`Import writing or add transcripts to sharpen your voice · ${sources.length} source(s) saved`}
          defaultOpen={false}
        >
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add components/voice/VoiceHomePanel.tsx
git commit -m "fix: collapse voice workbench by default for calmer post-setup view"
```

---

### Task 3: Command Center — Collapse Sidebar Extras

After Tier 1, the command center body grid still shows 5+ card areas simultaneously. The hero is already prominent and the insight queue is collapsed — but the sidebar (340px right column) shows StatsStrip + HonestQuestion + BillboardCard all at once. The fix: show only StatsStrip in the sidebar by default, collapse HonestQuestion and BillboardCard behind a "More" toggle.

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx`

- [ ] **Step 1: Find the sidebar column**

In `components/command-center/CommandCenterView.tsx`, find the right sidebar column inside the body grid (around line 697). It's the second child of the `grid grid-cols-1 lg:grid-cols-[1fr_340px]` div. Look for the `<div className="space-y-5 min-w-0">` that contains `StatsStrip`, `HonestQuestion`, and `BillboardCard`.

The sidebar structure looks like:

```tsx
        {/* Right sidebar */}
        <div className="space-y-5">
          <StatsStrip ... />
          {honestQuestion && <HonestQuestion ... />}
          <BillboardCard />
        </div>
```

- [ ] **Step 2: Add sidebar collapse state**

Add a new state near the other collapse states (near the insight queue collapsed state):

```tsx
const [sidebarExpanded, setSidebarExpanded] = useState(false);
```

- [ ] **Step 3: Wrap sidebar extras in conditional**

Replace the sidebar column content:

```tsx
        {/* Right sidebar */}
        <div className="space-y-5">
          <StatsStrip
            offerings={offeringRevenue}
            reachCount={reachCount}
            reachTarget={reachTarget}
            clientCount={summary.clientCount}
            pipelineValueCents={summary.pipelineValueCents}
          />

          {sidebarExpanded ? (
            <>
              {honestQuestion && (
                <HonestQuestion question={honestQuestion} />
              )}
              <BillboardCard />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarExpanded(true)}
              className="w-full rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border)] hover:text-[color:var(--text)] transition"
            >
              More details →
            </button>
          )}
        </div>
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add components/command-center/CommandCenterView.tsx
git commit -m "feat: collapse command center sidebar extras behind 'More details' toggle"
```

---

### Task 4: Visual Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify content page**

Navigate to `/content`. Confirm:
- Tab bar shows "Create" and "Library" tabs with draft count
- Default tab is "Library" (returning user behavior)
- Switching to "Create" shows The Desk, hides Library
- Switching to "Library" shows draft list, hides The Desk
- Empty library state shows "Go to Create" button that switches tabs
- Tab persists across page navigation (localStorage)

- [ ] **Step 3: Verify voice page**

Navigate to `/voice`. Confirm:
- Voice workbench section is collapsed by default
- All 4 sections are collapsible, can be expanded
- Voice status hero + Brand OS CTA + refine button are always visible
- Expanding/collapsing works correctly

- [ ] **Step 4: Verify command center**

Navigate to `/command-center`. Confirm:
- Sidebar shows StatsStrip + "More details →" button
- Clicking "More details" reveals HonestQuestion + BillboardCard
- Hero, insight queue (collapsed), and main grid all render correctly

- [ ] **Step 5: Verify no regressions**

- Check that mobile tab bar still works on all pages
- Check that leads search/filter still works
- Check that clients page is unchanged
- Run `npm run build` one final time

- [ ] **Step 6: Commit any fixes**

If visual verification reveals issues, fix and commit them before proceeding.
