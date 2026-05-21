# Tier 4: Daily Punch List + One-Tap Send — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact daily action list to the Coach mode home page and wire One-Tap Send so tapping any action navigates straight to compose with an AI draft pre-loaded.

**Architecture:** A new `buildPunchList()` server helper assembles items from 4 existing data sources (rescue, just-landed, content, reach gap), capped at 5. A new `PunchListCard` client component renders them as tappable rows with localStorage-based dismiss. The existing compose flow gets one new query param (`autoDraft=true`) that auto-triggers the `draft-message` edge function on mount.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS (design-system custom properties), Supabase Edge Functions, Vitest

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `lib/build-punch-list.ts` | Server-side: transforms 4 data sources → `PunchListItem[]` |
| CREATE | `lib/__tests__/build-punch-list.test.ts` | Unit tests for punch list assembly |
| CREATE | `components/command-center/PunchListCard.tsx` | Client component: compact list, dismiss, navigate |
| MODIFY | `components/command-center/CommandCenterView.tsx` | Accept `punchListItems` prop, render PunchListCard in Coach mode instead of CommandHero |
| MODIFY | `app/command-center/page.tsx` | Call `buildPunchList()`, pass result to CommandCenterView |
| MODIFY | `components/LeadsWorkspace.tsx` | Read `autoDraft` query param, pass to ComposeStudio |
| MODIFY | `components/ComposeStudio.tsx` | Accept `autoDraft` prop, auto-generate draft on mount when true |

---

### Task 1: buildPunchList helper

**Files:**
- Create: `lib/build-punch-list.ts`
- Create: `lib/__tests__/build-punch-list.test.ts`

This is a pure function with no I/O — easy to test. It transforms existing data into a flat array of punch list items, sorted by priority, capped at 5.

- [ ] **Step 1: Write the types and test file**

Create `lib/__tests__/build-punch-list.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildPunchList, type PunchListItem } from "@/lib/build-punch-list";
import { makeLead } from "./factories";
import type { Content } from "@/lib/types";

function makeRescueItem(leadId: string, name: string) {
  return {
    lead: makeLead({ id: leadId, full_name: name, status: "contacted" }),
    score: 80,
    sla: { state: "overdue" as const, label: "3d overdue", hoursElapsed: 72 },
    reason: "Conversation is going cold",
    action: "Draft follow-up",
  };
}

function makeContent(id: string, title: string): Content {
  return {
    id,
    coach_id: "c1",
    title,
    body: "",
    platform: "linkedin",
    status: "draft",
    scheduled_at: null,
    published_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    performance: null,
    brand_os_run_id: null,
  };
}

describe("buildPunchList", () => {
  it("returns empty array when no items", () => {
    const result = buildPunchList([], [], [], 5, 5);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("builds rescue items with correct id, type, label, and href", () => {
    const rescue = [makeRescueItem("lead1", "Marcus Rivera")];
    const result = buildPunchList(rescue, [], [], 5, 5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: "rescue:lead1",
      type: "rescue",
      label: "Marcus Rivera — Conversation is going cold",
      href: "/inbox?compose=open&ids=lead1&autoDraft=true",
    });
  });

  it("builds just-landed items with correct type and href", () => {
    const justLanded = [
      { draft_id: "d1", lead_id: "lead2", lead_name: "Jamie Chen", source: "ig" as const, source_detail: null, preview: "Hey!", created_at: new Date().toISOString() },
    ];
    const result = buildPunchList([], justLanded, [], 5, 5);
    expect(result.items[0]).toMatchObject({
      id: "new-lead:lead2",
      type: "new-lead",
      href: "/inbox?compose=open&ids=lead2&autoDraft=true",
    });
  });

  it("builds content items linking to /content", () => {
    const content = [makeContent("c1", "5 Keys to Clarity")];
    const result = buildPunchList([], [], content, 5, 5);
    expect(result.items[0]).toMatchObject({
      id: "content:c1",
      type: "content",
      href: "/content",
    });
  });

  it("builds reach gap item when reachCount < reachTarget", () => {
    const result = buildPunchList([], [], [], 3, 10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "reach:gap",
      type: "reach",
      label: "Send 7 more to hit 10/week goal",
    });
  });

  it("does NOT build reach item when reachCount >= reachTarget", () => {
    const result = buildPunchList([], [], [], 10, 10);
    expect(result.items).toHaveLength(0);
  });

  it("respects priority order: rescue > new-lead > content > reach", () => {
    const rescue = [makeRescueItem("r1", "Rescue Lead")];
    const justLanded = [
      { draft_id: "d1", lead_id: "jl1", lead_name: "New Lead", source: "ig" as const, source_detail: null, preview: "", created_at: new Date().toISOString() },
    ];
    const content = [makeContent("c1", "Draft Post")];
    const result = buildPunchList(rescue, justLanded, content, 3, 10);
    expect(result.items.map((i) => i.type)).toEqual([
      "rescue", "new-lead", "content", "reach",
    ]);
  });

  it("caps at 5 items and reports total", () => {
    const rescue = Array.from({ length: 4 }, (_, i) =>
      makeRescueItem(`r${i}`, `Rescue ${i}`)
    );
    const justLanded = [
      { draft_id: "d1", lead_id: "jl1", lead_name: "New1", source: "ig" as const, source_detail: null, preview: "", created_at: new Date().toISOString() },
      { draft_id: "d2", lead_id: "jl2", lead_name: "New2", source: "ig" as const, source_detail: null, preview: "", created_at: new Date().toISOString() },
    ];
    const content = [makeContent("c1", "Draft")];
    const result = buildPunchList(rescue, justLanded, content, 0, 10);
    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(8); // 4 rescue + 2 justLanded + 1 content + 1 reach
  });

  it("only includes draft content (not published/scheduled)", () => {
    const published = makeContent("c1", "Published Post");
    published.status = "published";
    const draft = makeContent("c2", "My Draft");
    draft.status = "draft";
    const result = buildPunchList([], [], [published, draft], 5, 5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("content:c2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx vitest run lib/__tests__/build-punch-list.test.ts`

Expected: FAIL — module `@/lib/build-punch-list` does not exist.

- [ ] **Step 3: Implement buildPunchList**

Create `lib/build-punch-list.ts`:

```typescript
import type { Content } from "@/lib/types";
import type { JustLandedItem } from "@/components/command-center/CommandCenterView";

export type PunchListItem = {
  id: string;
  type: "rescue" | "new-lead" | "content" | "reach";
  label: string;
  href: string;
};

type RescueItem = {
  lead: { id: string; full_name: string };
  reason: string;
};

const MAX_ITEMS = 5;

export function buildPunchList(
  rescueItems: RescueItem[],
  justLandedLeads: JustLandedItem[],
  contentPipeline: Content[],
  reachCount: number,
  reachTarget: number,
): { items: PunchListItem[]; total: number } {
  const all: PunchListItem[] = [];

  for (const r of rescueItems) {
    all.push({
      id: `rescue:${r.lead.id}`,
      type: "rescue",
      label: `${r.lead.full_name} — ${r.reason}`,
      href: `/inbox?compose=open&ids=${r.lead.id}&autoDraft=true`,
    });
  }

  for (const jl of justLandedLeads) {
    all.push({
      id: `new-lead:${jl.lead_id}`,
      type: "new-lead",
      label: `Welcome ${jl.lead_name} — new lead`,
      href: `/inbox?compose=open&ids=${jl.lead_id}&autoDraft=true`,
    });
  }

  for (const c of contentPipeline) {
    if (c.status !== "draft") continue;
    all.push({
      id: `content:${c.id}`,
      type: "content",
      label: `Finish draft: ${c.title}`,
      href: "/content",
    });
  }

  if (reachCount < reachTarget) {
    const gap = reachTarget - reachCount;
    all.push({
      id: "reach:gap",
      type: "reach",
      label: `Send ${gap} more to hit ${reachTarget}/week goal`,
      href: "/inbox?compose=open",
    });
  }

  return {
    items: all.slice(0, MAX_ITEMS),
    total: all.length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx vitest run lib/__tests__/build-punch-list.test.ts`

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/build-punch-list.ts lib/__tests__/build-punch-list.test.ts
git commit -m "feat: add buildPunchList helper with tests"
```

---

### Task 2: PunchListCard component

**Files:**
- Create: `components/command-center/PunchListCard.tsx`

Client component that renders the compact list, manages dismiss in localStorage, and handles tap navigation.

- [ ] **Step 1: Create PunchListCard**

Create `components/command-center/PunchListCard.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { PunchListItem } from "@/lib/build-punch-list";

type Props = {
  items: PunchListItem[];
  totalGenerated: number;
};

const DOT_COLOR: Record<PunchListItem["type"], string> = {
  rescue: "#ff6b6b",
  "new-lead": "#74c0fc",
  content: "#ffd43b",
  reach: "#69db7c",
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `punch-dismissed-${y}-${m}-${day}`;
}

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(todayKey(), JSON.stringify([...ids]));
  } catch {}
}

export default function PunchListCard({ items, totalGenerated }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const visible = items.filter((item) => !dismissed.has(item.id));
  const doneCount = totalGenerated - visible.length;

  const handleDismiss = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(id);
        saveDismissed(next);
        return next;
      });
    },
    [],
  );

  const handleTap = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  return (
    <Card variant="elevated" padding="none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-faint)]">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
          Today&rsquo;s Actions
        </span>
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          {doneCount} done &middot; {visible.length} left
        </span>
      </div>

      {/* Items or empty state */}
      {visible.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-5 py-8 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <span className="text-[color:var(--brand)]">✓</span>
          All caught up today
        </div>
      ) : (
        <ul>
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleTap(item.href)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-[var(--surface-deep)] border-b border-[var(--border-faint)] last:border-b-0"
              >
                {/* Color dot */}
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: DOT_COLOR[item.type] }}
                />
                {/* Label */}
                <span className="flex-1 text-[length:var(--t-caption)] font-medium text-[color:var(--text)] truncate">
                  {item.label}
                </span>
                {/* Dismiss button */}
                <button
                  type="button"
                  onClick={(e) => handleDismiss(e, item.id)}
                  className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-[color:var(--text-faint)] hover:text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] transition text-xs"
                  aria-label={`Dismiss: ${item.label}`}
                >
                  ✕
                </button>
                {/* Chevron */}
                <span className="shrink-0 text-[color:var(--text-faint)] text-sm">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Progress bar */}
      {totalGenerated > 0 && (
        <div className="px-5 py-2">
          <div className="h-1 w-full rounded-full bg-[var(--surface-deep)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand)] transition-all duration-300"
              style={{
                width: `${Math.round((doneCount / totalGenerated) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors related to PunchListCard.

- [ ] **Step 3: Commit**

```bash
git add components/command-center/PunchListCard.tsx
git commit -m "feat: add PunchListCard component"
```

---

### Task 3: Wire PunchListCard into CommandCenterView

**Files:**
- Modify: `components/command-center/CommandCenterView.tsx`

Add the `punchListItems` and `totalPunchListGenerated` props. In Coach mode, render PunchListCard where CommandHero currently is. Admin mode stays unchanged.

- [ ] **Step 1: Add imports and update Props type**

At the top of `components/command-center/CommandCenterView.tsx`, add the import:

```typescript
import PunchListCard from "@/components/command-center/PunchListCard";
import type { PunchListItem } from "@/lib/build-punch-list";
```

Update the `Props` type (around line 62) to add two new fields after `offeringRevenue`:

```typescript
type Props = {
  leads:          Lead[];
  content:        Content[];
  reachCount:     number;
  reachTarget:    number;
  dailyReach:     number[];
  honestQuestion: string;
  now:            number;
  justLanded:     JustLandedItem[];
  trustMessages:  LeadMessage[];
  voiceProfile:   VoiceProfile | null;
  coachFirstName: string;
  offeringRevenue: OfferingRevenueSummary[];
  punchListItems: PunchListItem[];
  totalPunchListGenerated: number;
};
```

- [ ] **Step 2: Destructure new props in the component function**

In the component function signature (around line 572), add the new props to the destructure:

```typescript
export default function CommandCenterView({
  leads,
  content,
  reachCount,
  reachTarget,
  dailyReach,
  honestQuestion,
  now,
  justLanded,
  trustMessages,
  voiceProfile,
  coachFirstName,
  offeringRevenue,
  punchListItems,
  totalPunchListGenerated,
}: Props) {
```

- [ ] **Step 3: Replace CommandHero with PunchListCard in Coach mode**

Find the Coach mode block (around line 697-716):

```tsx
{mode === "coach" && (
  <>
    <CommandHero
      summary={summary}
      rescueCount={rescueItems.length}
      draftCount={justLanded.length}
      reachCount={reachCount}
      reachTarget={reachTarget}
      voiceTrustPct={trust.asIsPct28}
      now={now}
      bookedCount={summary.bookedCount}
    />

    <LeadRescueCard items={rescueItems} />

    {justLanded.length > 0 && (
      <JustLandedBand items={justLanded} now={now} />
    )}
  </>
)}
```

Replace CommandHero with PunchListCard:

```tsx
{mode === "coach" && (
  <>
    <PunchListCard
      items={punchListItems}
      totalGenerated={totalPunchListGenerated}
    />

    <LeadRescueCard items={rescueItems} />

    {justLanded.length > 0 && (
      <JustLandedBand items={justLanded} now={now} />
    )}
  </>
)}
```

CommandHero is still imported and used in Admin mode (via InsightQueue or directly) — do NOT remove the import. If CommandHero is NOT rendered in Admin mode, check: it's only used in Coach mode currently. In that case the import becomes unused — remove it.

- [ ] **Step 4: Verify type-check passes**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: Type error in `app/command-center/page.tsx` because it doesn't pass the new props yet. That's expected and will be fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add components/command-center/CommandCenterView.tsx
git commit -m "feat: replace CommandHero with PunchListCard in Coach mode"
```

---

### Task 4: Wire buildPunchList into command-center/page.tsx

**Files:**
- Modify: `app/command-center/page.tsx`

Call `buildPunchList()` with existing data, pass results to CommandCenterView.

- [ ] **Step 1: Add import**

At the top of `app/command-center/page.tsx`, add:

```typescript
import { buildPunchList } from "@/lib/build-punch-list";
```

- [ ] **Step 2: Build the punch list and pass as props**

The `buildPunchList` function needs rescue items, but `buildRescueItems` currently lives in `CommandCenterView.tsx` (a client component). Since `buildPunchList` runs server-side in `page.tsx`, we need the rescue items computed server-side too.

**Import `buildRescueItems` from CommandCenterView is not possible** — it's not exported and it's a client component. Instead, we'll compute a lightweight rescue-like list directly in page.tsx using the same scoring logic.

Actually, looking at the data flow more carefully: `buildRescueItems` uses `computeLeadScore` and `assessSla` from `lib/`. Those are pure functions. The cleanest approach is to call them from page.tsx.

Add after `justLanded` is computed (around line 187), before the `return`:

```typescript
// Build rescue items server-side for punch list.
// Uses the same logic as CommandCenterView's buildRescueItems.
import { computeLeadScore } from "@/lib/lead-score";
import { assessSla } from "@/lib/lead-sla";
```

Wait — the import must be at the top of the file. Add these imports at the top:

```typescript
import { computeLeadScore } from "@/lib/lead-score";
import { assessSla } from "@/lib/lead-sla";
```

Then after the `justLanded` computation (after line 187), add:

```typescript
const rescueItems = leads
  .filter((l) => l.status !== "client" && l.status !== "closed_lost")
  .map((lead) => {
    const sla = assessSla(lead, now);
    const followupAt = lead.next_followup_at
      ? new Date(lead.next_followup_at).getTime()
      : null;
    const promisedFollowup = followupAt !== null && followupAt <= now;
    const needsRescue =
      sla.state === "overdue" ||
      sla.state === "warning" ||
      promisedFollowup ||
      lead.next_honest_action === "invite_to_call";
    if (!needsRescue) return null;
    const reason =
      promisedFollowup ? "Follow-up was promised"
      : lead.status === "new" && sla.state === "overdue" ? "No first touch yet"
      : sla.state === "overdue" ? "Conversation is going cold"
      : sla.state === "warning" ? "Needs a reply today"
      : lead.next_honest_action === "invite_to_call" ? "Ready for a call invite"
      : "Worth your next message";
    return { lead, score: computeLeadScore(lead, now), sla, reason, action: "" };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

const { items: punchListItems, total: totalPunchListGenerated } = buildPunchList(
  rescueItems,
  justLanded,
  content,
  reachCount,
  reachTarget,
);
```

- [ ] **Step 3: Pass punch list props to CommandCenterView**

In the JSX return, add the two new props to `<CommandCenterView>`:

```tsx
<CommandCenterView
  leads={leads}
  content={content}
  reachCount={reachCount}
  reachTarget={reachTarget}
  dailyReach={dailyReach}
  honestQuestion={pickHonestQuestion(now)}
  now={now}
  justLanded={justLanded}
  trustMessages={(trustMessagesRes.data ?? []) as LeadMessage[]}
  voiceProfile={(voiceRes.data as VoiceProfile | null) ?? null}
  coachFirstName={userFirstName(user.email, user.user_metadata)}
  offeringRevenue={offeringRevenue}
  punchListItems={punchListItems}
  totalPunchListGenerated={totalPunchListGenerated}
/>
```

- [ ] **Step 4: Verify type-check and tests pass**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx tsc --noEmit --pretty 2>&1 | head -30`

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx vitest run`

Expected: No type errors. All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/command-center/page.tsx
git commit -m "feat: wire buildPunchList into command-center page"
```

---

### Task 5: One-Tap Send — autoDraft support in compose flow

**Files:**
- Modify: `components/LeadsWorkspace.tsx`
- Modify: `components/ComposeStudio.tsx`

Add `autoDraft` query param reading and auto-draft generation on mount.

- [ ] **Step 1: Read autoDraft param in LeadsWorkspace**

In `components/LeadsWorkspace.tsx`, after `seedSource` is parsed (around line 63), add:

```typescript
const seedAutoDraft = searchParams?.get("autoDraft") === "true";
```

Then pass it to ComposeStudio (around line 193-199):

```tsx
<ComposeStudio
  leads={leads}
  coachId={coachId}
  seedPain={seedPain}
  seedTemp={seedTemp}
  seedIds={seedIds}
  seedSource={seedSource}
  autoDraft={seedAutoDraft}
/>
```

- [ ] **Step 2: Add autoDraft prop to ComposeStudio**

In `components/ComposeStudio.tsx`, update the props type (around line 40-53):

```typescript
export default function ComposeStudio({
  leads,
  coachId,
  seedPain,
  seedTemp,
  seedIds = [],
  seedSource = "",
  autoDraft = false,
}: {
  leads: Lead[];
  coachId: string;
  seedPain: string[];
  seedTemp: string[];
  seedIds?: string[];
  seedSource?: string;
  autoDraft?: boolean;
}) {
```

- [ ] **Step 3: Auto-trigger draft generation on mount when autoDraft is true**

Add a `useEffect` after the existing `voiceProfile` loading effect (after line 107). This triggers `generateDraft()` automatically when `autoDraft` is true and a lead is seeded:

```typescript
const [autoDraftFired, setAutoDraftFired] = useState(false);

useEffect(() => {
  if (!autoDraft || autoDraftFired || seedIds.length === 0) return;
  if (!voiceProfile) return; // wait for voice profile to load
  setAutoDraftFired(true);
  // Small delay to let matched leads resolve
  const timer = setTimeout(() => {
    generateDraft();
  }, 100);
  return () => clearTimeout(timer);
}, [autoDraft, autoDraftFired, seedIds, voiceProfile]);
```

Note: `generateDraft` is already defined in ComposeStudio (line 186). The effect calls it once after voiceProfile loads.

- [ ] **Step 4: Add "AI DRAFT" label and Regenerate button to the template area**

Find the template textarea area in ComposeStudio's JSX. It should have the `<textarea>` where `template` state is displayed. Above it, add a conditional label:

```tsx
{originalAiTemplate !== null && (
  <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
      AI Draft &middot; your voice
    </span>
    <button
      type="button"
      onClick={generateDraft}
      disabled={drafting}
      className="text-[length:var(--t-caption)] text-[color:var(--brand)] hover:underline disabled:opacity-50"
    >
      {drafting ? "Regenerating…" : "Regenerate"}
    </button>
  </div>
)}
```

- [ ] **Step 5: Strip autoDraft from URL on close**

In `components/LeadsWorkspace.tsx`, update the `closeCompose` function (around line 100-110) to also delete the `autoDraft` param:

```typescript
function closeCompose() {
  setDrawerOpen(false);
  const params = new URLSearchParams(searchParams?.toString() ?? "");
  params.delete("compose");
  params.delete("pain");
  params.delete("temp");
  params.delete("ids");
  params.delete("source");
  params.delete("autoDraft");
  const qs = params.toString();
  router.replace(qs ? `/inbox?${qs}` : "/inbox", { scroll: false });
}
```

- [ ] **Step 6: Forward autoDraft in /compose redirect**

In `app/compose/page.tsx`, add autoDraft param forwarding (around line 23-31):

```typescript
export default function ComposeRedirect({
  searchParams,
}: {
  searchParams: { pain?: string; temp?: string; ids?: string; source?: string; autoDraft?: string };
}) {
  const params = new URLSearchParams();
  params.set("compose", "open");
  if (searchParams.pain) params.set("pain", searchParams.pain);
  if (searchParams.temp) params.set("temp", searchParams.temp);
  if (searchParams.ids) params.set("ids", searchParams.ids);
  if (searchParams.source) params.set("source", searchParams.source);
  if (searchParams.autoDraft) params.set("autoDraft", searchParams.autoDraft);
  redirect(`/inbox?${params.toString()}`);
}
```

- [ ] **Step 7: Verify type-check and all tests pass**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx tsc --noEmit --pretty 2>&1 | head -30`

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npx vitest run`

Expected: No type errors. All tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/LeadsWorkspace.tsx components/ComposeStudio.tsx app/compose/page.tsx
git commit -m "feat: add One-Tap Send — autoDraft triggers AI draft in compose"
```

---

### Task 6: Manual verification

**Files:** None (read-only verification)

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app && npm run dev`

- [ ] **Step 2: Verify Coach mode punch list**

Open `http://localhost:3000/command-center` in a browser. Ensure:
- Coach mode shows PunchListCard (not CommandHero)
- Items appear with correct color dots
- Clicking an item navigates to `/inbox?compose=open&ids=...&autoDraft=true`
- Clicking ✕ dismisses the item (disappears, progress bar updates)
- Refresh — dismissed items stay dismissed
- Switch to Admin mode — CommandHero still renders (NOT PunchListCard)

- [ ] **Step 3: Verify One-Tap Send**

Navigate to `/inbox?compose=open&ids=<any-lead-id>&autoDraft=true`. Ensure:
- Compose drawer opens
- AI draft auto-generates (may take a few seconds)
- "AI DRAFT" label appears above the draft
- "Regenerate" button is visible
- Sending works normally
- Closing the drawer strips `autoDraft` from the URL

- [ ] **Step 4: Verify no regressions**

- `/inbox` without compose params → Lead list, no drawer
- `/inbox?compose=open` → Drawer opens, no auto-draft (no autoDraft param)
- Admin mode dashboard → All cards render (StatsStrip, ContentPipeline, etc.)
- Empty state (no leads) → FirstRunCommandCenter still shows
