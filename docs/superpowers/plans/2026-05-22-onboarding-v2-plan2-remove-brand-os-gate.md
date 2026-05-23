# Onboarding v2 — Plan 2: Remove the Brand OS Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brand OS no longer blocks a standard coach from using the app. It becomes optional. Trial-tier ($7) scoping and the reality-questions step are preserved unchanged.

**Architecture:** Extract the gate's redirect decision into a pure function `decideGatePath()` (unit-tested, matching this repo's pure-function vitest convention). The async `enforceOnboardingGate()` loads data and calls it. The `brand_os_mvp` blocking phase is removed from `resolveOnboardingGate()` and the `OnboardingGate` type. `app/onboarding/page.tsx`'s `brand_os_mvp` redirect branch is deleted.

**Tech Stack:** Next.js 14 (edge), Supabase, Vitest (node env). Builds on Plan 1 (funnel instrumentation) which is already merged to `main`.

**Precondition:** Work in a fresh worktree off `main` (which is now at `51e4e3a`, green: 97 tests + tsc). Do NOT work in the main checkout. (Plan 1 was contaminated once because a subagent ran in the main repo — every subagent in this plan MUST `cd` into the worktree and confirm `git branch --show-current` before editing.)

---

## Context: how gating works today (read this first)

There are TWO independent gates:

1. **`middleware.ts`** — redirects a signed-in coach with NO voice profile AND NO leads to `/welcome` (the voice + "magic moment" activation). Brand OS is not involved. **This plan does NOT touch middleware.**
2. **`lib/onboarding.ts` `enforceOnboardingGate()`** — called by page loaders (`app/page.tsx`, `command-center`, `content`, `clients`, `clients/offerings/[id]`, `leads/resonance`). Today it:
   - Scopes trial ($7) buyers to Brand OS surfaces only (until they complete onboarding).
   - Otherwise redirects to `/brand-os` if no completed Brand OS run (**the gate we are removing**).
   - Then redirects to `/onboarding` for the 4-card reality questions.
   - Returns `null` (proceed) when complete, firing the `app_opened` funnel event.

After this plan, a new standard coach's flow is: middleware → `/welcome` (voice+magic) → page loader → `/onboarding` (reality questions) → app. Brand OS is fully optional. The reality-questions step stays for now — Plan 5 replaces the whole welcome/onboarding UI.

**No migration needed.** Existing coaches: those already complete stay complete; those mid-Brand-OS are simply no longer forced through it. The "mark existing coaches complete" migration belongs to Plan 5 (when reality questions are replaced), not here.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `lib/onboarding-gate.ts` | Pure `decideGatePath()` redirect decision (no I/O) | Create |
| `lib/__tests__/onboarding-gate.test.ts` | Unit tests for `decideGatePath()` | Create |
| `lib/onboarding.ts` | Remove `brand_os_mvp` from type + `resolveOnboardingGate`; rewrite `enforceOnboardingGate` to call `decideGatePath` | Modify |
| `app/onboarding/page.tsx` | Delete the `brand_os_mvp` redirect branch | Modify |

---

## Task 1: Pure `decideGatePath()` + tests (TDD)

**Files:**
- Create: `lib/onboarding-gate.ts`
- Test: `lib/__tests__/onboarding-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Tests for lib/onboarding-gate.ts
//
// decideGatePath is the redirect decision for enforceOnboardingGate.
// The whole point of Plan 2: Brand OS must NOT gate standard coaches,
// but trial ($7) buyers stay scoped to Brand OS until onboarded. Pin
// both behaviors so a regression is loud.

import { describe, it, expect } from "vitest";
import { decideGatePath, type GateDecisionInput } from "@/lib/onboarding-gate";
import type { BrandOsRunState } from "@/lib/brand-os/run-state";

const NONE: BrandOsRunState = { kind: "none" };

function input(overrides: Partial<GateDecisionInput> = {}): GateDecisionInput {
  return {
    plan: "standard",
    trialExpired: false,
    onboardingCompletedAt: null,
    realityQuestionsComplete: false,
    brandOsRunState: NONE,
    ...overrides,
  };
}

describe("decideGatePath — standard coach (Brand OS no longer gates)", () => {
  it("does NOT redirect to /brand-os when standard coach has no Brand OS run", () => {
    const path = decideGatePath(input({ realityQuestionsComplete: true, brandOsRunState: NONE }));
    expect(path).toBeNull();
  });

  it("redirects to /onboarding when reality questions not complete", () => {
    expect(decideGatePath(input({ realityQuestionsComplete: false }))).toBe("/onboarding");
  });

  it("returns null (proceed) when reality questions complete", () => {
    expect(decideGatePath(input({ realityQuestionsComplete: true }))).toBeNull();
  });
});

describe("decideGatePath — trial ($7) scoping preserved", () => {
  it("trial + not onboarded + no run → /brand-os", () => {
    expect(
      decideGatePath(input({ plan: "trial", brandOsRunState: { kind: "none" } }))
    ).toBe("/brand-os");
  });

  it("trial + not onboarded + in_progress → /brand-os/run/{id}", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "in_progress", runId: "R1", variant: "mvp", currentQuestionId: null },
        })
      )
    ).toBe("/brand-os/run/R1");
  });

  it("trial + not onboarded + complete → /brand-os/run/{id}/output", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "complete", runId: "R2", variant: "mvp", synthesizedAt: null },
        })
      )
    ).toBe("/brand-os/run/R2/output");
  });

  it("trial + not onboarded + complete_no_synthesis → /brand-os/run/{id}/output", () => {
    expect(
      decideGatePath(
        input({
          plan: "trial",
          brandOsRunState: { kind: "complete_no_synthesis", runId: "R3", variant: "mvp" },
        })
      )
    ).toBe("/brand-os/run/R3/output");
  });

  it("trial but ALREADY onboarded → treated as full coach (not scoped)", () => {
    const path = decideGatePath(
      input({ plan: "trial", onboardingCompletedAt: "2026-05-01T00:00:00Z", realityQuestionsComplete: true })
    );
    expect(path).toBeNull();
  });

  it("expired standard trial + not onboarded → scoped to Brand OS", () => {
    expect(
      decideGatePath(input({ plan: "standard", trialExpired: true, brandOsRunState: { kind: "none" } }))
    ).toBe("/brand-os");
  });

  it("expired standard trial but ALREADY onboarded → full access", () => {
    expect(
      decideGatePath(
        input({ plan: "standard", trialExpired: true, onboardingCompletedAt: "2026-05-01T00:00:00Z", realityQuestionsComplete: true })
      )
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/onboarding-gate.test.ts`
Expected: FAIL — cannot resolve `@/lib/onboarding-gate`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/onboarding-gate.ts
//
// Pure gate-decision logic for enforceOnboardingGate. No I/O — the async
// wrapper in lib/onboarding.ts loads the data and calls this.
//
// Plan 2 change: Brand OS is NO LONGER a gate for standard coaches. It is
// optional (prompted later). Trial ($7) buyers remain scoped to Brand OS
// surfaces until they complete onboarding (or upgrade). The reality-
// questions step is unchanged.

import type { BrandOsRunState } from "@/lib/brand-os/run-state";

export type GateDecisionInput = {
  plan: string | null;
  trialExpired: boolean;
  onboardingCompletedAt: string | null;
  realityQuestionsComplete: boolean;
  /** Only consulted for trial-scoped coaches (to pick the Brand OS URL). */
  brandOsRunState: BrandOsRunState;
};

/** Returns the path to redirect to, or null if the coach may proceed. */
export function decideGatePath(input: GateDecisionInput): string | null {
  const isTrialScoped =
    (input.plan === "trial" || input.trialExpired) && !input.onboardingCompletedAt;

  if (isTrialScoped) {
    const rs = input.brandOsRunState;
    if (rs.kind === "complete")              return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "complete_no_synthesis") return `/brand-os/run/${rs.runId}/output`;
    if (rs.kind === "in_progress")           return `/brand-os/run/${rs.runId}`;
    return "/brand-os";
  }

  // Standard / full coach. Brand OS does not gate. Only the reality-
  // questions step remains before full access.
  if (!input.realityQuestionsComplete) return "/onboarding";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/onboarding-gate.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The `import type { BrandOsRunState }` is erased at runtime, so the test can build `BrandOsRunState` literals without pulling in Supabase.)

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding-gate.ts lib/__tests__/onboarding-gate.test.ts
git commit -m "feat(onboarding): add pure decideGatePath — Brand OS no longer gates standard coaches"
```

---

## Task 2: Refactor `lib/onboarding.ts` to use `decideGatePath`

**Files:**
- Modify: `lib/onboarding.ts`

This task: (a) removes the `brand_os_mvp` variant from `OnboardingGate`, (b) simplifies `resolveOnboardingGate` to drop Brand OS, (c) rewrites `enforceOnboardingGate` to call `decideGatePath`. Preserve the `logFunnelEvent` calls and the lazy trial-downgrade side effect.

- [ ] **Step 1: Add the import**

At the top of `lib/onboarding.ts`, near the existing imports (`import { logFunnelEvent } from "@/lib/funnel-log";`), add:

```typescript
import { decideGatePath } from "@/lib/onboarding-gate";
import type { BrandOsRunState } from "@/lib/brand-os/run-state";
```

- [ ] **Step 2: Remove `brand_os_mvp` from the `OnboardingGate` type**

Replace:

```typescript
export type OnboardingGate =
  | { phase: "brand_os_mvp"; reason: "never_started" | "in_progress" | "no_synthesis"; runId?: string }
  | { phase: "reality_questions" }
  | { phase: "complete"; state: OnboardingState };
```

with:

```typescript
export type OnboardingGate =
  | { phase: "reality_questions" }
  | { phase: "complete"; state: OnboardingState };
```

- [ ] **Step 3: Simplify `resolveOnboardingGate` (drop Brand OS)**

Replace the entire body of `resolveOnboardingGate` (the version that imports `resolveBrandOsRunState` and returns `brand_os_mvp` phases) with:

```typescript
/** Single-source resolver for "where should this coach be right now?"
 *  Brand OS no longer gates (Plan 2) — this only distinguishes the
 *  reality-questions step from a fully onboarded coach. */
export async function resolveOnboardingGate(
  supabase: SupabaseClient,
  coachId: string,
): Promise<OnboardingGate> {
  const state = await loadOnboardingState(supabase, coachId);
  if (!state || !state.completed_at) {
    return { phase: "reality_questions" };
  }
  return { phase: "complete", state };
}
```

- [ ] **Step 4: Rewrite `enforceOnboardingGate` to call `decideGatePath`**

Replace the entire `enforceOnboardingGate` function body with:

```typescript
export async function enforceOnboardingGate(
  supabase: SupabaseClient,
  coachId: string,
): Promise<string | null> {
  // Plan / trial state first. An expired 10-day free trial gets lazily
  // downgraded back to trial-tier on this page load.
  const { data: planRow } = await supabase
    .from("cp_coaches")
    .select("plan, trial_ends_at, onboarding_completed_at")
    .eq("id", coachId)
    .maybeSingle();

  const plan = (planRow?.plan as string | null) ?? null;
  const onboardingCompletedAt = (planRow?.onboarding_completed_at as string | null) ?? null;
  const trialExpired =
    plan === "standard" &&
    !!planRow?.trial_ends_at &&
    new Date(planRow.trial_ends_at as string).getTime() < Date.now();

  if (trialExpired) {
    // Fire-and-forget downgrade; we treat the coach as trial-tier for
    // this request either way.
    void supabase
      .from("cp_coaches")
      .update({ plan: "trial", updated_at: new Date().toISOString() })
      .eq("id", coachId);
  }

  const isTrialScoped = (plan === "trial" || trialExpired) && !onboardingCompletedAt;

  // Only the trial-scoped branch needs the Brand OS run state (to choose
  // the right Brand OS URL). Standard coaches skip that query.
  let brandOsRunState: BrandOsRunState = { kind: "none" };
  let realityQuestionsComplete = false;
  if (isTrialScoped) {
    const { resolveBrandOsRunState } = await import("@/lib/brand-os/run-state");
    brandOsRunState = await resolveBrandOsRunState(supabase, coachId);
  } else {
    const state = await loadOnboardingState(supabase, coachId);
    realityQuestionsComplete = !!state?.completed_at;
  }

  const path = decideGatePath({
    plan,
    trialExpired,
    onboardingCompletedAt,
    realityQuestionsComplete,
    brandOsRunState,
  });

  if (path === null) {
    void logFunnelEvent(coachId, "app_opened");
  }
  return path;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `resolveOnboardingGate` is now unused by `enforceOnboardingGate`, that's fine — it's still exported and used by `app/onboarding/page.tsx` and `app/api/coach/onboarding/route.ts`.

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test`
Expected: PASS (97 from before + new onboarding-gate tests). No regressions.

- [ ] **Step 7: Commit**

```bash
git add lib/onboarding.ts
git commit -m "refactor(onboarding): remove Brand OS gate; enforceGate uses decideGatePath"
```

---

## Task 3: Delete the `brand_os_mvp` redirect in `app/onboarding/page.tsx`

**Files:**
- Modify: `app/onboarding/page.tsx`

- [ ] **Step 1: Remove the dead branch**

Find this block:

```typescript
  const gate = await resolveOnboardingGate(supabase, user.id);

  // Brand OS isn't done — send them there first.
  if (gate.phase === "brand_os_mvp") {
    if (gate.reason === "never_started")  redirect("/brand-os");
    if (gate.runId)                       redirect(`/brand-os/run/${gate.runId}${gate.reason === "no_synthesis" ? "/output" : ""}`);
    redirect("/brand-os");
  }

  // Already done — go home.
  if (gate.phase === "complete") {
    redirect("/content");
  }
```

Replace it with:

```typescript
  const gate = await resolveOnboardingGate(supabase, user.id);

  // Already done — go home.
  if (gate.phase === "complete") {
    redirect("/content");
  }
```

(The `brand_os_mvp` phase no longer exists, so its branch is dead. The remaining `reality_questions` case falls through to rendering `OnboardingFlow`, unchanged.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (TypeScript will confirm `gate.phase` can only be `"reality_questions" | "complete"` now; referencing `"brand_os_mvp"` would be a type error — which is why we removed it.)

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "refactor(onboarding): drop dead brand_os_mvp redirect from onboarding page"
```

---

## Task 4: Verification

- [ ] **Step 1: No stray `brand_os_mvp` *gate* references remain**

Run: `grep -rn "brand_os_mvp" app/ lib/ --include="*.ts" --include="*.tsx"`
Expected: the ONLY remaining matches are the unrelated Stripe product strings:
- `app/api/billing/brand-os-tripwire/checkout/route.ts` → `"brand_os_mvp_tripwire"`
- `lib/brand-os/tripwire-provision.ts` → `"brand_os_mvp_tripwire"` and `product: "brand_os_mvp"`

There must be NO remaining `phase: "brand_os_mvp"` or `gate.phase === "brand_os_mvp"`.

- [ ] **Step 2: Full unit suite + typecheck**

Run: `npm run test` → all pass.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Reason through the flows (manual, documented)**

Confirm by reading the code, and note in the task report:
- **New standard coach** (no profile, no leads, no Brand OS): middleware → `/welcome`; after voice+magic, page loaders → `/onboarding` (reality questions); then app. **Never forced to `/brand-os`.** ✅
- **Trial ($7) buyer, not onboarded:** still scoped to Brand OS surfaces (the `decideGatePath` trial branch). ✅
- **Existing fully-onboarded coach:** `decideGatePath` returns null → proceeds; `app_opened` still logged. ✅
- **`/api/coach/onboarding` GET** returns `{ gate, state }` where `gate.phase` is now only `reality_questions | complete`. Any client reading `brand_os_mvp` simply never receives it (harmless dead branch). Note if a consumer needs follow-up.

- [ ] **Step 4: Manual smoke (preview/local, if available)**

With a standard test account that has a voice profile + a lead but NO Brand OS run, load `/command-center`. Expected: it renders (no redirect to `/brand-os`). With a `plan='trial'` account that hasn't onboarded, load `/command-center`. Expected: redirect into Brand OS.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** Implements "Onboarding Gate Changes" from `onboarding-v2-spec.md` (Brand OS removed from the gate; `brand_os_mvp` blocking state deleted; trial flow unchanged). The "mark existing coaches complete" migration is intentionally deferred to Plan 5 (it pairs with replacing the reality-questions step) — noted in Context.
- **Placeholder scan:** No TBD/TODO. Every code block is complete; grep targets and expected matches are explicit.
- **Type consistency:** `decideGatePath`, `GateDecisionInput`, `BrandOsRunState`, `OnboardingGate` names match across `lib/onboarding-gate.ts`, its test, and `lib/onboarding.ts`. `BrandOsRunState` literal shapes in the test (`in_progress` needs `variant` + `currentQuestionId`; `complete` needs `variant` + `synthesizedAt`; `complete_no_synthesis` needs `variant`) match `lib/brand-os/run-state.ts`.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review. Reuse the existing worktree workflow; every subagent must `cd` into the worktree and confirm the branch first.
2. **Inline Execution** — execute here with checkpoints.

Remaining Phase 1 plans after this: **Plan 3** (async Instagram import), **Plan 4** (Brand OS auto-import + Start-Fresh), **Plan 5** (screen reframe + Home activation + reality-questions replacement + "mark existing complete" migration).
