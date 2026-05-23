# Onboarding v2 — Plan 5a: Empty-State "Do This First" Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a brand-new / empty coach a useful "Do this first" on the Command Center — activation steps (set up your voice, create your first post, add your first lead) — instead of the current useless "send 15 more messages" at zero leads.

**Architecture:** The Command Center already renders a prioritized action list via the pure, tested `buildPunchList()` (`lib/build-punch-list.ts` → `PunchListCard`). It serves the *active* coach (overdue leads, new leads, draft content, reach gap) but produces nothing useful for an empty coach. We extend `buildPunchList` with an optional early-state branch (pure, TDD), add the new `"activation"` item type's color in the view, and pass the signals at the call site. Backward-compatible: omitting the new arg preserves today's behavior exactly.

**Tech Stack:** Next.js 14 (edge), Vitest (node env). Builds on `main` at `105cfd7`.

**Precondition:** Fresh worktree off `main` (`105cfd7`, green). Symlink `node_modules` from the main checkout (`ln -s ../../node_modules node_modules`) to skip reinstall. Every subagent MUST `cd` into the worktree and confirm `git branch --show-current` before editing (Plan 1 contamination lesson).

---

## Why this slice (context for the implementer)

Most of the v2 onboarding spec is already shipped: Brand OS voice is wired into content gen via `cp_coaches.brand_voice_overlay`; `WelcomeFlow` already produces a first draft in the coach's voice; the punch list already answers "what next" for active coaches. The genuine gap is the **empty/early coach**: someone who just finished `/welcome` with a voice profile but no leads and no content. For them the punch list currently emits only the reach-gap item ("Send 15 more to hit 15/week") — nonsensical at zero leads. This plan fixes exactly that, delivering the spec's "populated ≠ activated" insight where it's actually missing.

Out of scope (other Plan 5 slices / other plans): the `WelcomeFlow` "pick one source" reframe (1,420-line component; best after Plan 3 async Instagram), Start-Fresh form, reality-questions replacement, mark-existing migration.

---

## Current behavior (read before editing)

`lib/build-punch-list.ts` — `buildPunchList(rescueItems, justLandedLeads, contentPipeline, reachCount, reachTarget)` returns `{ items: PunchListItem[]; total }`. `PunchListItem.type` is `"rescue" | "new-lead" | "content" | "reach"`. It pushes: up to 3 rescue, all just-landed, draft content ("Finish draft: …"), and a reach-gap item when `reachCount < reachTarget`. Caps at 5 items.

`components/command-center/PunchListCard.tsx` has `const TYPE_COLORS: Record<PunchListItem["type"], string>` — **exhaustive** over the union, so a new type requires a color here or tsc fails.

`app/command-center/page.tsx` calls `buildPunchList(rescueItems, justLanded, content, reachCount, reachTarget)` (~line 240). In scope at that point: `leads` (array), `content` (array), and `voiceRes` (the active voice profile, or null).

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `lib/build-punch-list.ts` | Add `"activation"` type + optional early-state branch | Modify |
| `lib/__tests__/build-punch-list.test.ts` | Add early-state tests; keep existing 9 green | Modify |
| `components/command-center/PunchListCard.tsx` | Add `activation` color to `TYPE_COLORS` | Modify |
| `app/command-center/page.tsx` | Compute + pass `activation` signals | Modify |

---

## Task 1: Extend `buildPunchList` with the early-state branch (TDD)

**Files:**
- Modify: `lib/build-punch-list.ts`
- Modify: `lib/__tests__/build-punch-list.test.ts`

- [ ] **Step 1: Add failing tests** (append to `lib/__tests__/build-punch-list.test.ts`)

First, open the existing test file and confirm how it imports and calls `buildPunchList` (so the new tests match the existing style). Then append:

```typescript
describe("buildPunchList — empty/early coach activation", () => {
  const NO_RESCUE: never[] = [];
  const NO_LANDED: never[] = [];
  const NO_CONTENT: never[] = [];

  it("emits activation items for an empty coach (no leads, no content)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: false,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("activation:voice");
    expect(ids).toContain("activation:first-content");
    expect(ids).toContain("activation:first-lead");
    // every activation item is typed "activation"
    expect(items.filter((i) => i.id.startsWith("activation:")).every((i) => i.type === "activation")).toBe(true);
  });

  it("does NOT emit the reach-gap item for an empty coach (nonsensical at 0 leads)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.type === "reach")).toBeUndefined();
  });

  it("omits the voice activation item when the coach already has a voice profile", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15, {
      totalLeads: 0,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.id === "activation:voice")).toBeUndefined();
  });

  it("is backward-compatible: omitting the activation arg preserves prior behavior (reach gap shows)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 0, 15);
    expect(items.find((i) => i.type === "reach")).toBeDefined();
    expect(items.find((i) => i.type === "activation")).toBeUndefined();
  });

  it("does NOT treat a coach with leads as early (no activation items)", () => {
    const { items } = buildPunchList(NO_RESCUE, NO_LANDED, NO_CONTENT, 3, 15, {
      totalLeads: 4,
      hasContent: false,
      hasVoiceProfile: true,
    });
    expect(items.find((i) => i.type === "activation")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test → confirm new ones fail**

Run: `npx vitest run lib/__tests__/build-punch-list.test.ts`
Expected: the 5 new tests FAIL (activation type/branch not implemented); the original 9 still PASS.

- [ ] **Step 3: Implement** — edit `lib/build-punch-list.ts`

Change the `PunchListItem` type to add `"activation"`:

```typescript
export type PunchListItem = {
  id: string;
  type: "rescue" | "new-lead" | "content" | "reach" | "activation";
  label: string;
  href: string;
};
```

Add an activation-state type near the top (after the imports):

```typescript
export type ActivationState = {
  totalLeads: number;
  hasContent: boolean;
  hasVoiceProfile: boolean;
};
```

Add an optional 6th parameter and the early-state branch. Replace the function signature and body so it reads:

```typescript
export function buildPunchList(
  rescueItems: RescueItem[],
  justLandedLeads: JustLandedItem[],
  contentPipeline: Content[],
  reachCount: number,
  reachTarget: number,
  activation?: ActivationState,
): { items: PunchListItem[]; total: number } {
  const all: PunchListItem[] = [];

  // Empty/early coach: no leads AND no content yet. Lead with activation
  // steps instead of the steady-state rescue/reach items (which are
  // meaningless before there's anything to act on).
  const isEarly = !!activation && activation.totalLeads === 0 && !activation.hasContent;

  if (isEarly) {
    if (!activation!.hasVoiceProfile) {
      all.push({
        id: "activation:voice",
        type: "activation",
        label: "Set up your voice so drafts sound like you",
        href: "/voice",
      });
    }
    all.push({
      id: "activation:first-content",
      type: "activation",
      label: "Create your first piece of content",
      href: "/content",
    });
    all.push({
      id: "activation:first-lead",
      type: "activation",
      label: "Add your first lead",
      href: "/leads",
    });
    return { items: all.slice(0, MAX_ITEMS), total: all.length };
  }

  for (const r of rescueItems.slice(0, MAX_RESCUE)) {
    all.push({
      id:    `rescue:${r.lead.id}`,
      type:  "rescue",
      label: `${r.lead.full_name} — ${r.reason}`,
      href:  `/inbox?compose=open&ids=${r.lead.id}&autoDraft=true`,
    });
  }

  for (const jl of justLandedLeads) {
    all.push({
      id:    `new-lead:${jl.lead_id}`,
      type:  "new-lead",
      label: `Welcome ${jl.lead_name} — new lead`,
      href:  `/inbox?compose=open&ids=${jl.lead_id}&autoDraft=true`,
    });
  }

  for (const c of contentPipeline) {
    if (c.status !== "draft") continue;
    all.push({
      id:    `content:${c.id}`,
      type:  "content",
      label: `Finish draft: ${c.title}`,
      href:  "/content",
    });
  }

  if (reachCount < reachTarget) {
    const gap = reachTarget - reachCount;
    all.push({
      id:    "reach:gap",
      type:  "reach",
      label: `Send ${gap} more to hit ${reachTarget}/week goal`,
      href:  "/inbox?compose=open",
    });
  }

  return {
    items: all.slice(0, MAX_ITEMS),
    total: all.length,
  };
}
```

(Keep the existing `RescueItem` type, `MAX_ITEMS`, `MAX_RESCUE` constants and imports unchanged.)

- [ ] **Step 4: Run tests → all pass**

Run: `npx vitest run lib/__tests__/build-punch-list.test.ts`
Expected: all PASS (original 9 + 5 new = 14).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: ONE expected error in `components/command-center/PunchListCard.tsx` — `TYPE_COLORS` is missing the `activation` key (the Record is exhaustive). That is fixed in Task 2. If you see ONLY that error, proceed. If you see others, fix them.

- [ ] **Step 6: Commit**

```bash
git add lib/build-punch-list.ts lib/__tests__/build-punch-list.test.ts
git commit -m "feat(activation): early-state punch list — activation items for empty coaches"
```

---

## Task 2: Add the `activation` color in `PunchListCard`

**Files:**
- Modify: `components/command-center/PunchListCard.tsx`

- [ ] **Step 1: Add the color**

Find:

```typescript
const TYPE_COLORS: Record<PunchListItem["type"], string> = {
  rescue: "#ff6b6b",
  "new-lead": "#74c0fc",
  content: "#ffd43b",
  reach: "#69db7c",
};
```

Add the `activation` entry:

```typescript
const TYPE_COLORS: Record<PunchListItem["type"], string> = {
  rescue: "#ff6b6b",
  "new-lead": "#74c0fc",
  content: "#ffd43b",
  reach: "#69db7c",
  activation: "#b197fc",
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the Task 1 exhaustiveness error is now resolved).

- [ ] **Step 3: Commit**

```bash
git add components/command-center/PunchListCard.tsx
git commit -m "feat(activation): add activation type color to punch list card"
```

---

## Task 3: Pass activation signals at the Command Center call site

**Files:**
- Modify: `app/command-center/page.tsx`

- [ ] **Step 1: Update the `buildPunchList` call**

Find (around line 240):

```typescript
  const { items: punchListItems, total: totalPunchListGenerated } = buildPunchList(
    rescueItems,
    justLanded,
    content,
    reachCount,
    reachTarget,
  );
```

Replace with (adds the 6th arg from data already loaded in this function — `leads`, `content`, and `voiceRes`):

```typescript
  const { items: punchListItems, total: totalPunchListGenerated } = buildPunchList(
    rescueItems,
    justLanded,
    content,
    reachCount,
    reachTarget,
    {
      totalLeads: leads.length,
      hasContent: content.length > 0,
      hasVoiceProfile: !!voiceRes.data,
    },
  );
```

(`leads`, `content`, and `voiceRes` are all already in scope above this line — no new queries needed.)

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit` → clean.
Run: `npm run test` → all pass (107 prior + the new build-punch-list tests).

- [ ] **Step 3: Commit**

```bash
git add app/command-center/page.tsx
git commit -m "feat(activation): feed empty-state signals into command center punch list"
```

---

## Task 4: Verification

- [ ] **Step 1: Full suite + typecheck**

Run: `npm run test` → all pass.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 2: Reason through the states (document in report)**

- **Empty coach** (0 leads, 0 content, no voice profile): punch list = "Set up your voice", "Create your first piece of content", "Add your first lead". No reach-gap noise. ✅
- **Empty coach with voice already set** (did `/welcome` voice step): voice item omitted; first-content + first-lead shown. ✅
- **Active coach** (has leads/content): identical to today — rescue/new-lead/content/reach, no activation items. ✅ (the `isEarly` guard requires `totalLeads === 0 && !hasContent`).

- [ ] **Step 3: Manual smoke (preview/local, if available)**

Load `/command-center` as a coach with no leads and no content. Expect the three activation items to render in `PunchListCard` (purple dot), each linking to `/voice`, `/content`, `/leads`. Confirm an active coach's Command Center is unchanged.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** Implements the spec's "Do this first" / "populated ≠ activated" for the empty-state, which the existing punch list did not cover. Active-coach behavior is intentionally unchanged.
- **Placeholder scan:** No TBD/TODO. All code blocks complete; exact anchors given.
- **Type consistency:** `ActivationState` (`totalLeads`, `hasContent`, `hasVoiceProfile`) is used identically in `build-punch-list.ts`, the tests, and the call site. New `"activation"` type added to both the `PunchListItem` union and the exhaustive `TYPE_COLORS` record. Backward-compatible optional 6th param keeps the 9 existing tests green.
- **Scope:** 4 files, no new queries, no WelcomeFlow/onboarding-flow changes, no Plan 3 dependency.

---

## Execution Handoff

Plan complete. Options: (1) Subagent-driven (recommended) — fresh worktree off `main`, subagent per task, two-stage review; (2) Inline with checkpoints.

Remaining Plan 5 slices after this: 5b (WelcomeFlow "pick one source" reframe — best after Plan 3 async Instagram), 5c (reality-questions replacement + mark-existing-complete migration), plus the Start-Fresh form. And Plan 3 (async Instagram import) whenever you want the richest source wired.
