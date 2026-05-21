# Simplification Tier 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 fixes that make the coach app calmer and more focused — simplified command center, leads search/filter, clients cleanup, mobile tab bar, and empty state fixes.

**Architecture:** All changes are UI-layer only. No database changes, no new API routes, no new dependencies. Every fix modifies existing components or adds small new ones following established patterns (design system tokens, Card/Badge primitives, CSS variables).

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS with CSS custom properties, Lucide icons, Supabase auth (unchanged).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `components/command-center/CommandCenterView.tsx` | Wrap InsightQueue in collapsible, replace RevenueCard+ReachCard with StatsStrip |
| Modify | `components/command-center/RevenueCard.tsx` | Add compact `mode` prop for inline stats strip |
| Create | `components/command-center/StatsStrip.tsx` | Combined revenue + reach compact strip |
| Modify | `components/LeadsWorkspace.tsx` | Add search/filter bar above LeadList |
| Create | `components/inbox/LeadSearchBar.tsx` | Search input + filter pills for leads page |
| Modify | `components/clients/ClientsWorkspace.tsx` | Remove duplicate current_focus, tighten padding |
| Modify | `components/clients/ClientSidebar.tsx` | Add "+ Add client" button |
| Create | `components/MobileTabBar.tsx` | Fixed bottom tab bar for mobile |
| Modify | `components/Header.tsx` | Remove hamburger button + mobile drawer |
| Modify | `app/layout.tsx` | Render MobileTabBar |
| Modify | `components/clients/OfferingsWorkspace.tsx` | Remove `open` prop from AddOfferingForm |
| Modify | `app/not-found.tsx` | Add Header, add missing quick links |

---

### Task 1: Empty State Fixes (Quick Wins)

**Files:**
- Modify: `components/clients/OfferingsWorkspace.tsx:26`
- Modify: `app/not-found.tsx`

These are the simplest changes — warm up on them first.

- [ ] **Step 1: Fix offerings form — remove `open` prop**

In `components/clients/OfferingsWorkspace.tsx`, change line 26 from:

```tsx
        <AddOfferingForm open />
```

to:

```tsx
        <AddOfferingForm />
```

This lets the empty state be prominent while the form stays collapsed.

- [ ] **Step 2: Fix 404 page — add Header and missing quick links**

Replace the entire content of `app/not-found.tsx` with:

```tsx
import Link from "next/link";
import Header from "@/components/Header";

const QUICK_LINKS: Array<{ href: string; label: string; helper: string }> = [
  {
    href:   "/command-center",
    label:  "Home",
    helper: "Today's pipeline, drafts, and rescue queue.",
  },
  {
    href:   "/inbox",
    label:  "Leads",
    helper: "Every conversation in one ranked list.",
  },
  {
    href:   "/clients",
    label:  "Clients",
    helper: "Active clients, sessions, and tasks.",
  },
  {
    href:   "/voice",
    label:  "Voice",
    helper: "The voice profile every AI draft runs through.",
  },
  {
    href:   "/content",
    label:  "Content",
    helper: "Drafts, scheduled posts, and the content pipeline.",
  },
];

export default function NotFound() {
  return (
    <>
      <Header email="" />
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--brand-strong)]">
            404 · Not found
          </div>
          <h1 className="font-display mt-3 text-4xl sm:text-5xl font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            That page isn't here.
          </h1>
          <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] max-w-xl">
            The link you followed is wrong, broken, or pointing at something that
            no longer exists. Try one of the rooms below, or head back home.
          </p>

          <ul className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group block h-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 hover:border-[var(--brand)] hover:shadow-[var(--shadow-sm)] transition"
                >
                  <div className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                    {link.label}
                  </div>
                  <div className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
                    {link.helper}
                  </div>
                  <div className="mt-3 inline-flex items-center text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand-strong)] group-hover:text-[color:var(--text)] transition">
                    Open →
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
```

Note: Header requires `email` prop. On 404 pages the user may not be authenticated. Passing empty string falls back to initials display which is acceptable. If Header errors without auth, wrap in a try/catch or conditionally render — check during testing.

- [ ] **Step 3: Verify both fixes build**

Run: `npm run build 2>&1 | tail -30`
Expected: No type errors related to OfferingsWorkspace or not-found.

- [ ] **Step 4: Commit**

```bash
git add components/clients/OfferingsWorkspace.tsx app/not-found.tsx
git commit -m "fix: offerings empty state + 404 page nav and links"
```

---

### Task 2: Clients Page Cleanup

**Files:**
- Modify: `components/clients/ClientsWorkspace.tsx:193-194`
- Modify: `components/clients/ClientSidebar.tsx:33-39`

- [ ] **Step 1: Remove duplicate current_focus display**

In `components/clients/ClientsWorkspace.tsx`, find this block around line 193:

```tsx
                    <p className="mt-2 max-w-2xl text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                      {selectedRoom.current_focus || "Set the current focus before the next session."}
                    </p>
```

Replace with:

```tsx
                    <p className="mt-2 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                      {selectedLead.email || "No email on file"}
                    </p>
```

This removes the duplicate current_focus (the editable textarea at line 209 is the single source of truth now) and replaces it with the client's email — useful context that wasn't shown before.

- [ ] **Step 2: Tighten detail pane padding**

In `components/clients/ClientsWorkspace.tsx`, find the outer Card around line 184:

```tsx
              <Card className="space-y-4">
```

Change to:

```tsx
              <Card className="space-y-3">
```

And find the grid gap at line 229:

```tsx
              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
```

Change to:

```tsx
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
```

- [ ] **Step 3: Add "+ Add client" button to sidebar**

In `components/clients/ClientSidebar.tsx`, find the header section (around line 33-39):

```tsx
      <div className="border-b border-[var(--border-faint)] px-4 py-4 space-y-3">
        <div>
          <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Clients</h2>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            People who crossed from lead to client.
          </p>
        </div>
```

Replace with:

```tsx
      <div className="border-b border-[var(--border-faint)] px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Clients</h2>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              People who crossed from lead to client.
            </p>
          </div>
          <a
            href="/inbox"
            className="shrink-0 inline-flex items-center h-8 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--brand)] transition"
          >
            + Add client
          </a>
        </div>
```

Note: The "Add client" button links to `/inbox` since clients come from converting leads. The coach promotes a lead to client status from the lead detail page. This is the correct flow — there's no standalone "create client" form.

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build, no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/clients/ClientsWorkspace.tsx components/clients/ClientSidebar.tsx
git commit -m "fix: remove duplicate focus text, add client button, tighten spacing"
```

---

### Task 3: Leads Search + Filter Bar

**Files:**
- Create: `components/inbox/LeadSearchBar.tsx`
- Modify: `components/LeadsWorkspace.tsx`

- [ ] **Step 1: Create the LeadSearchBar component**

Create `components/inbox/LeadSearchBar.tsx`:

```tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { Lead, LeadTemperature } from "@/lib/types";

const TEMP_FILTERS: Array<{
  value: LeadTemperature;
  label: string;
  activeTone: "danger" | "warning" | "brand" | "info";
}> = [
  { value: "on_fire", label: "Hot", activeTone: "danger" },
  { value: "hot",     label: "Warm", activeTone: "warning" },
  { value: "warm",    label: "Warm+", activeTone: "brand" },
  { value: "cold",    label: "Cold", activeTone: "info" },
  { value: "dormant", label: "Dormant", activeTone: "info" },
];

type Props = {
  leads: Lead[];
  onFiltered: (filtered: Lead[]) => void;
};

export default function LeadSearchBar({ leads, onFiltered }: Props) {
  const [query, setQuery] = useState("");
  const [activeTemps, setActiveTemps] = useState<Set<LeadTemperature>>(new Set());

  const toggleTemp = useCallback((temp: LeadTemperature) => {
    setActiveTemps((prev) => {
      const next = new Set(prev);
      if (next.has(temp)) next.delete(temp);
      else next.add(temp);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = leads;
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (lead) =>
          lead.full_name.toLowerCase().includes(q) ||
          (lead.email ?? "").toLowerCase().includes(q) ||
          (lead.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (activeTemps.size > 0) {
      result = result.filter((lead) => activeTemps.has(lead.temperature));
    }
    return result;
  }, [leads, query, activeTemps]);

  useMemo(() => {
    onFiltered(filtered);
  }, [filtered, onFiltered]);

  return (
    <div className="space-y-2">
      {/* Search row */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search leads by name, email, or notes…"
          className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-9 text-[length:var(--t-caption)] text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)] focus:border-[var(--brand-strong)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)] hover:text-[color:var(--text)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          Filter
        </span>
        {TEMP_FILTERS.map((filter) => {
          const isActive = activeTemps.has(filter.value);
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => toggleTemp(filter.value)}
              className="transition"
            >
              <Badge
                tone={isActive ? filter.activeTone : "neutral"}
                size="xs"
                uppercase
              >
                {filter.label}
              </Badge>
            </button>
          );
        })}
        {(query || activeTemps.size > 0) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTemps(new Set());
            }}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[length:var(--t-caption)] text-[color:var(--text-muted)] tabular-nums">
          {filtered.length} lead{filtered.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the Badge component supports `neutral` tone**

Check `components/ui/Badge.tsx` for the tone prop. If `neutral` isn't defined, use the closest equivalent (likely the default unstyled state or `"info"`). Adjust `LeadSearchBar` accordingly.

Run: `grep -n "neutral\|tone" components/ui/Badge.tsx | head -20`

- [ ] **Step 3: Integrate LeadSearchBar into LeadsWorkspace**

In `components/LeadsWorkspace.tsx`, add the import at the top (after existing imports):

```tsx
import LeadSearchBar from "@/components/inbox/LeadSearchBar";
```

Add state for filtered leads inside the component (after the existing `const activeLeads` block around line 63):

```tsx
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>(leads);
  const handleFiltered = useCallback((filtered: Lead[]) => {
    setFilteredLeads(filtered);
  }, []);
```

Add `useCallback` to the import from React at line 18:

```tsx
import { useCallback, useEffect, useState } from "react";
```

Add the search bar JSX right before the `<LeadList>` at line 172. Find:

```tsx
      <LeadList leads={leads} now={now} />
```

Replace with:

```tsx
      <div className="mb-5">
        <LeadSearchBar leads={leads} onFiltered={handleFiltered} />
      </div>

      <LeadList leads={filteredLeads} now={now} />
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build. If Badge doesn't support `neutral`, fix the tone value.

- [ ] **Step 5: Commit**

```bash
git add components/inbox/LeadSearchBar.tsx components/LeadsWorkspace.tsx
git commit -m "feat: add search + filter bar to leads page"
```

---

### Task 4: Command Center — Collapse Insight Queue

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx`

- [ ] **Step 1: Add collapsed state to InsightQueue**

In `components/command-center/CommandCenterView.tsx`, find the `InsightQueue` component (around line 719):

```tsx
function InsightQueue({ items }: { items: InsightItem[] }) {
  return (
    <section aria-label="Insight queue" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Insight queue
          </div>
          <h2 className="mt-1 text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
            What to do, what to skip.
          </h2>
        </div>
        <p className="max-w-xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
          Four decisions from the live board. Each one turns a signal into a next move.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map((item) => (
          <InsightQueueCard key={item.lane} item={item} />
        ))}
      </div>
    </section>
  );
}
```

Replace with:

```tsx
function InsightQueue({ items }: { items: InsightItem[] }) {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cc-insights-expanded") === "true";
  });

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("cc-insights-expanded", String(next));
      return next;
    });
  }

  const actionableCount = items.filter(
    (item) => item.lane !== "ignore" && item.confidence !== "New"
  ).length;

  return (
    <section aria-label="Insight queue">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--border)] transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            Insight queue
          </div>
          {actionableCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-[var(--brand)] text-[color:var(--navy)] text-[10px] font-extrabold">
              {actionableCount}
            </span>
          )}
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            What to do, what to skip.
          </span>
        </div>
        <span
          className={`text-[color:var(--text-faint)] transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {items.map((item) => (
            <InsightQueueCard key={item.lane} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
```

Note: `useState` is already imported at the top of the file.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/CommandCenterView.tsx
git commit -m "feat: collapse insight queue by default with localStorage memory"
```

---

### Task 5: Command Center — Merge Reach + Revenue into Stats Strip

**Files:**
- Create: `components/command-center/StatsStrip.tsx`
- Modify: `components/command-center/CommandCenterView.tsx`

- [ ] **Step 1: Create StatsStrip component**

Create `components/command-center/StatsStrip.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";
import type { OfferingRevenueSummary } from "./RevenueCard";

type Props = {
  offerings: OfferingRevenueSummary[];
  reachCount: number;
  reachTarget: number;
  clientCount: number;
  pipelineValueCents: number;
};

function fmtUSD(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return "$" + Math.round(dollars).toLocaleString();
}

export default function StatsStrip({
  offerings,
  reachCount,
  reachTarget,
  clientCount,
  pipelineValueCents,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const priced = offerings.filter((o) => o.price_cents != null && o.price_cents > 0);
  const enrolledRevenue = priced.reduce(
    (sum, o) => sum + (o.enrolled * o.price_cents!) / 100,
    0
  );
  const hasRevenue = enrolledRevenue > 0 || pipelineValueCents > 0;
  const reachHit = reachCount >= reachTarget;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--border)] transition"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5 text-[length:var(--t-caption)]">
            {hasRevenue && (
              <span>
                <b className="font-extrabold text-[color:var(--text)]">
                  {enrolledRevenue > 0 ? `$${Math.round(enrolledRevenue).toLocaleString()}` : fmtUSD(pipelineValueCents)}
                </b>
                <span className="text-[color:var(--text-muted)]">
                  {" "}{enrolledRevenue > 0 ? "enrolled" : "pipeline"}
                </span>
              </span>
            )}
            <span>
              <b className="font-extrabold text-[color:var(--text)]">{clientCount}</b>
              <span className="text-[color:var(--text-muted)]"> client{clientCount === 1 ? "" : "s"}</span>
            </span>
            <span>
              <b className={`font-extrabold ${reachHit ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text)]"}`}>
                {reachCount}/{reachTarget}
              </b>
              <span className="text-[color:var(--text-muted)]"> reach</span>
            </span>
          </div>
          <ChevronDown
            size={14}
            className={`text-[color:var(--text-faint)] transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Revenue detail */}
          <Card padding="md">
            <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
              Revenue
            </div>
            {priced.length === 0 ? (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                Add offerings with pricing to track revenue.
              </p>
            ) : (
              <div className="space-y-1.5">
                {priced.map((o) => {
                  const rev = (o.enrolled * o.price_cents!) / 100;
                  return (
                    <div key={o.name} className="flex items-baseline justify-between gap-2">
                      <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
                        {o.name}
                      </span>
                      <span className="font-mono text-[length:var(--t-caption)] font-bold text-[color:var(--text)] whitespace-nowrap">
                        {o.enrolled} × ${Math.round(o.price_cents! / 100).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <a
              href="/clients?tab=offerings"
              className="block mt-3 text-[length:var(--t-caption)] text-[color:var(--brand-strong)] font-bold hover:underline"
            >
              Manage offerings →
            </a>
          </Card>

          {/* Reach detail */}
          <Card padding="md">
            <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
              Weekly reach
            </div>
            <p className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] tabular-nums">
              {reachCount}
              <span className="text-[length:var(--t-caption)] font-normal text-[color:var(--text-faint)]">
                {" "}/ {reachTarget}
              </span>
            </p>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {reachHit
                ? "Target hit. Keep going."
                : `${reachTarget - reachCount} more to hit ${reachTarget}.`}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace RevenueCard + ReachCard with StatsStrip in CommandCenterView**

In `components/command-center/CommandCenterView.tsx`, add the import at the top (near the other command-center imports):

```tsx
import StatsStrip from "@/components/command-center/StatsStrip";
```

Find the right-column section (around line 708-714):

```tsx
        <div className="space-y-5">
          <RevenueCard offerings={offeringRevenue} />
          <ReachCard count={reachCount} target={reachTarget} dailyReach={dailyReach} now={now} />
          <HonestQuestion question={honestQuestion} />
          <BillboardCard now={now} />
        </div>
```

Replace with:

```tsx
        <div className="space-y-5">
          <StatsStrip
            offerings={offeringRevenue}
            reachCount={reachCount}
            reachTarget={reachTarget}
            clientCount={summary.clientCount}
            pipelineValueCents={summary.pipelineValueCents}
          />
          <HonestQuestion question={honestQuestion} />
          <BillboardCard now={now} />
        </div>
```

The `ReachCard` local function (lines 1223-1307) and `DAY_LETTERS` constant (line 1221) can stay in the file — they're unused but removing them is optional cleanup. The `RevenueCard` import at line 45 can also stay since the type `OfferingRevenueSummary` is still used by StatsStrip.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add components/command-center/StatsStrip.tsx components/command-center/CommandCenterView.tsx
git commit -m "feat: merge revenue + reach into compact expandable stats strip"
```

---

### Task 6: Mobile Bottom Tab Bar

**Files:**
- Create: `components/MobileTabBar.tsx`
- Modify: `components/Header.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create MobileTabBar component**

Create `components/MobileTabBar.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Home, Inbox, Users, Mic, PenTool } from "lucide-react";

const TAB_ITEMS = [
  { href: "/command-center", label: "Home",    icon: Home },
  { href: "/inbox",          label: "Leads",   icon: Inbox },
  { href: "/clients",        label: "Clients", icon: Users },
  { href: "/voice",          label: "Voice",   icon: Mic },
  { href: "/content",        label: "Content", icon: PenTool },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/inbox" && pathname.startsWith("/leads")) return true;
    return pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5 h-14">
        {TAB_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition ${
                active
                  ? "text-[color:var(--brand-strong)]"
                  : "text-[color:var(--text-muted)] active:text-[color:var(--text)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              <span className={`text-[10px] ${active ? "font-extrabold" : "font-bold"}`}>
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Remove hamburger button and mobile drawer from Header**

In `components/Header.tsx`, remove the mobile nav toggle button (lines 168-176):

Find:
```tsx
          {/* Mobile nav toggle (hamburger): 44px tap target */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] transition"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
          </button>
```

Replace with nothing (delete the entire block).

Also remove the mobile nav drawer at the bottom of the header (lines 298-320):

Find:
```tsx
      {/* Mobile nav drawer: opens below the header bar.
          Each link is 44px tall for proper tap targets. */}
      {mobileNavOpen && (
        <nav
          className="md:hidden border-t border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] px-3 py-2 space-y-1"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 h-11 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold transition ${
                isActive(item.href)
                  ? "bg-[var(--brand-soft)] text-[color:var(--text)] ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                  : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
              }`}
            >
              <span>{item.label}</span>
              {isActive(item.href) ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-strong)]" aria-hidden />
              ) : null}
            </a>
          ))}
        </nav>
      )}
```

Replace with nothing (delete the entire block).

Clean up now-unused imports and state. Remove `Menu` from the lucide-react import (line 19). Remove `mobileNavOpen` state (line 79):

Find: `const [mobileNavOpen, setMobileNavOpen] = useState(false);`
Delete this line.

Remove the useEffect that closes mobile nav on route change (lines 103-105):

Find:
```tsx
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);
```
Delete this block.

If `X` icon is still used elsewhere in the file, keep its import. If `X` is only used in the hamburger toggle, remove it from the import too.

- [ ] **Step 3: Update root layout to render MobileTabBar and add bottom padding**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import MobileTabBar from "@/components/MobileTabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElevateAI Coach Platform",
  description: "Your leads. Your voice. AI does the writing.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="pb-16 md:pb-0">
          {children}
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
```

Note: `MobileTabBar` is a client component rendered in a server component layout — this is fine in Next.js App Router. The `pb-16 md:pb-0` prevents content from being hidden behind the fixed tab bar on mobile.

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build. Check that `Menu` and `X` are not imported if unused.

- [ ] **Step 5: Commit**

```bash
git add components/MobileTabBar.tsx components/Header.tsx app/layout.tsx
git commit -m "feat: replace hamburger menu with fixed bottom tab bar on mobile"
```

---

### Task 7: Command Center — Reduce Visual Weight Below Hero

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx`

This is the final polish: make the below-the-fold content clearly secondary to the hero + rescue band.

- [ ] **Step 1: Add subtle opacity reduction to the lower content grid**

In `components/command-center/CommandCenterView.tsx`, find the two-column body grid (around line 696):

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
```

Replace with:

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 opacity-[0.85] hover:opacity-100 transition-opacity duration-300">
```

This makes the content pipeline, voice trust, stats strip, honest question, and billboard card subtly quieter. On hover the full opacity returns. The hero (CommandHero), InsightQueue (now collapsed), LeadRescueCard, and JustLandedBand stay at full opacity since they're above this grid.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -30`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/CommandCenterView.tsx
git commit -m "style: reduce visual weight of below-fold command center sections"
```

---

### Task 8: Visual Verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Check command center**

Navigate to the app. Verify:
- Hero section is prominent with session cards + focus CTA
- Insight queue shows as a collapsed bar with count badge
- Clicking the insight bar expands the 4-lane grid
- Stats strip shows revenue + clients + reach in one line
- Clicking stats strip expands revenue and reach details
- Below-fold content is subtly quieter

- [ ] **Step 3: Check leads page**

Navigate to /inbox. Verify:
- Search bar appears above the lead list
- Typing filters leads by name/email/notes
- Temperature pills toggle on/off
- Lead count updates in real-time
- "Clear all" resets search and filters

- [ ] **Step 4: Check clients page**

Navigate to /clients. Verify:
- "+ Add client" button in sidebar header
- No duplicate current_focus text in detail pane
- Tighter spacing in detail cards

- [ ] **Step 5: Check mobile**

Resize browser to mobile width. Verify:
- Bottom tab bar with 5 icons + labels
- No hamburger button in header
- Active tab shows green
- Bottom padding prevents content overlap

- [ ] **Step 6: Check empty states**

Navigate to /clients?tab=offerings (if no offerings exist). Verify:
- Form is collapsed, empty state is prominent
- Clicking "+ Add offering" opens the form

Navigate to a non-existent URL. Verify:
- Header renders at top
- All 5 quick links shown (Home, Leads, Clients, Voice, Content)

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: visual verification fixes"
```
