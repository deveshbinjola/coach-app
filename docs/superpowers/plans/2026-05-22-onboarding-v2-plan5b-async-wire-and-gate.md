# Onboarding v2 — Plan 5b: Async IG Wire-up + Reality-Questions Replacement

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`).

**Goal:** (5b-i) Make onboarding's Instagram import non-blocking by wiring the existing welcome-flow importer to Plan 3's async endpoints. (5b-ii) Stop forcing the 4-card reality-questions step — make `/welcome` the single onboarding — and relocate the load-bearing `onboarding_completed_at` marker so trial-expiry protection still works.

**Architecture:** 5b-i is a client-only change to `OnboardingInstagramImport.importVoice()` inside `components/WelcomeFlow.tsx` (Instagram branch → POST start + poll status; LinkedIn/text unchanged). 5b-ii removes `realityQuestionsComplete` from the pure `decideGatePath`, and `enforceOnboardingGate` sets `onboarding_completed_at` the first time any coach is allowed to proceed.

**Tech Stack:** Next.js 14 (edge), Vitest (node). Builds on `main` at `0ae2fc6`. Execute INLINE (controller) — no subagents (prior contamination).

**Precondition:** Worktree off `main` (`0ae2fc6`, green: 116 tests + tsc), `node_modules` symlinked.

**Reviewability note:** 5b-i changes the core onboarding UX (a 55s wait becomes a poll with a "scanning posts…" state). The repo doesn't unit-test UI, so verification is tsc + the user previewing the flow before the final merge.

---

## Context (verified)

- `decideGatePath` (lib/onboarding-gate.ts) currently: trial-scoped → Brand OS; else `!realityQuestionsComplete → "/onboarding"`; else `null`.
- `onboarding_completed_at` is load-bearing: `isTrialScoped = (plan==='trial' || trialExpired) && !onboardingCompletedAt`. It protects a standard coach from being re-scoped to Brand OS when their trial window later expires. Only `saveOnboardingAnswers` (the reality-questions POST) sets it today — so removing that step requires a new setter.
- `OnboardingInstagramImport.importVoice()` (WelcomeFlow.tsx ~line 543) does ONE blocking `fetch("/api/voice/import/instagram")` (~55s) for the Instagram branch, then builds `ImportedVoiceSignal { source, label, units, patterns }` from `{ handle, captions_used, learned_patterns }`.
- Plan 3's async endpoints: `POST /api/onboarding/import/instagram` → `{ importId }`; `GET /api/onboarding/import/[id]/status` → `{ status: "processing"|"complete"|"failed", itemsImported?, learnedPatterns?, error? }`. The `complete` response supplies `units = itemsImported`, `patterns = learnedPatterns`; `label` = the normalized handle the coach typed.

---

## Task 1: Simplify `decideGatePath` — Brand OS already gone, now reality questions too (TDD)

**Files:** Modify `lib/onboarding-gate.ts`, `lib/__tests__/onboarding-gate.test.ts`

- [ ] **Step 1: Update the tests** — replace the `realityQuestionsComplete` cases. The standard-coach branch now always proceeds. Edit `lib/__tests__/onboarding-gate.test.ts`:
  - Remove `realityQuestionsComplete` from the `input()` helper's defaults.
  - Replace the "standard coach" describe block with:

```typescript
describe("decideGatePath — standard coach proceeds (no reality-questions gate)", () => {
  it("returns null for a standard coach (Brand OS and reality questions no longer gate)", () => {
    expect(decideGatePath(input({ brandOsRunState: NONE }))).toBeNull();
  });
});
```
  - In the trial-scoping describe block, delete the two assertions that reference `realityQuestionsComplete` in their `input(...)` (the "trial but ALREADY onboarded" and "expired ... ALREADY onboarded" cases keep `onboardingCompletedAt` but drop `realityQuestionsComplete`). Their expectations (`toBeNull()`) stay.

- [ ] **Step 2: Run → fails** — `npx vitest run lib/__tests__/onboarding-gate.test.ts` (type error: `realityQuestionsComplete` removed from type but still referenced, or assertion mismatch).

- [ ] **Step 3: Implement** — edit `lib/onboarding-gate.ts`. Remove `realityQuestionsComplete` from `GateDecisionInput` and the trailing branch:

```typescript
export type GateDecisionInput = {
  plan: string | null;
  trialExpired: boolean;
  onboardingCompletedAt: string | null;
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

  // Standard / full coach. Neither Brand OS nor reality questions gate.
  return null;
}
```

- [ ] **Step 4: Run → passes.** `npx vitest run lib/__tests__/onboarding-gate.test.ts` PASS. `npx tsc --noEmit` will FAIL in `lib/onboarding.ts` (still passes `realityQuestionsComplete`) — fixed in Task 2.

- [ ] **Step 5: Commit** (after Task 2 makes tsc green — commit Tasks 1+2 together, since the type change spans both).

---

## Task 2: Relocate the `onboarding_completed_at` marker into `enforceOnboardingGate`

**Files:** Modify `lib/onboarding.ts`

- [ ] **Step 1: Remove the reality-questions load + `decideGatePath` arg; add the marker-set.** In `enforceOnboardingGate`, the current body loads `realityQuestionsComplete` (via `loadOnboardingState`) for the non-trial branch and passes it to `decideGatePath`. Replace the relevant section so it no longer computes/needs `realityQuestionsComplete`, and sets the marker when proceeding:

```typescript
  const isTrialScoped = (plan === "trial" || trialExpired) && !onboardingCompletedAt;

  // Only the trial-scoped branch needs the Brand OS run state (to choose
  // the right Brand OS URL).
  let brandOsRunState: BrandOsRunState = { kind: "none" };
  if (isTrialScoped) {
    const { resolveBrandOsRunState } = await import("@/lib/brand-os/run-state");
    brandOsRunState = await resolveBrandOsRunState(supabase, coachId);
  }

  const path = decideGatePath({
    plan,
    trialExpired,
    onboardingCompletedAt,
    brandOsRunState,
  });

  if (path === null) {
    void logFunnelEvent(coachId, "app_opened");
    // Reality-questions replacement: the welcome flow is now the only
    // onboarding. The first time a coach is allowed to proceed, stamp
    // onboarding_completed_at so a later trial-expiry doesn't re-scope
    // them to Brand OS. Fire-and-forget; idempotent (guarded on null).
    if (!onboardingCompletedAt) {
      void supabase
        .from("cp_coaches")
        .update({ onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", coachId);
    }
  }
  return path;
```

  Remove the now-unused `loadOnboardingState` call inside `enforceOnboardingGate` (keep the import — `resolveOnboardingGate` and other code still use `loadOnboardingState`). Confirm no other reference to `realityQuestionsComplete` remains in the function.

- [ ] **Step 2: Typecheck + tests** — `npx tsc --noEmit` clean; `npm run test` green (116). `resolveOnboardingGate` is unchanged (still returns `reality_questions | complete` for the now-optional `/onboarding` page).

- [ ] **Step 3: Commit Tasks 1+2**

```bash
git add lib/onboarding-gate.ts lib/__tests__/onboarding-gate.test.ts lib/onboarding.ts
git commit -m "feat(onboarding): remove reality-questions gate; relocate onboarding_completed_at to gate proceed"
```

---

## Task 3: Wire the Instagram branch of the welcome importer to the async endpoints

**Files:** Modify `components/WelcomeFlow.tsx`

- [ ] **Step 1: Add a polling helper** near the top of the file (module scope, after imports):

```typescript
async function pollInstagramImport(
  importId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<{ ok: true; units: number; patterns: Array<{ label: string; text: string }> } | { ok: false; error: string }> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 30; // ~90s ceiling
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let json: { status?: string; itemsImported?: number; learnedPatterns?: Array<{ label: string; text: string }>; error?: string };
    try {
      const res = await fetch(`/api/onboarding/import/${encodeURIComponent(importId)}/status`);
      json = await res.json();
    } catch {
      continue; // transient — keep polling
    }
    if (json.status === "complete") {
      return { ok: true, units: Number(json.itemsImported ?? 0), patterns: Array.isArray(json.learnedPatterns) ? json.learnedPatterns : [] };
    }
    if (json.status === "failed") {
      return { ok: false, error: String(json.error ?? "Instagram import failed.") };
    }
    // status === "processing" → keep polling
  }
  return { ok: false, error: "Instagram import is taking longer than expected. Try again in a moment." };
}
```

- [ ] **Step 2: Branch the Instagram path in `importVoice()`.** Inside `importVoice` (in `OnboardingInstagramImport`), BEFORE the existing `const response = await fetch(...)` block, add an early async path for Instagram, and leave the existing sync block to handle linkedin/text:

```typescript
    setLoading(true);
    try {
      // Instagram → async start + poll (non-blocking; ~55s scrape runs on Apify).
      if (sourceType === "instagram") {
        const startRes = await fetch("/api/onboarding/import/instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, limit: limitValue }),
        });
        const startPayload = await startRes.json();
        if (!startRes.ok || !startPayload?.importId) {
          setUpgradeRequired(Boolean(startPayload?.upgrade_required));
          setError(String(startPayload?.error ?? "Could not start Instagram import."));
          return;
        }
        const polled = await pollInstagramImport(String(startPayload.importId));
        if (!polled.ok) {
          setError(polled.error);
          return;
        }
        const igHandle = String(startPayload.handle ?? normalizeInstagramHandleForWelcome(handle));
        const next = { handle: igHandle, captions: polled.units, patterns: polled.patterns };
        setResult(next);
        onImported({ source: "instagram", label: igHandle, units: polled.units, patterns: polled.patterns });
        return;
      }

      // LinkedIn / text → existing synchronous routes (unchanged).
      const response = await fetch(
        sourceType === "linkedin" && linkedinMode === "handle"
          ? "/api/voice/import/linkedin"
          : "/api/voice/import/text",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            sourceType === "linkedin" && linkedinMode === "handle"
              ? { handle, limit: limitValue }
              : {
                  source_type: sourceType,
                  title: title.trim(),
                  url: sourceType === "newsletter" && newsletterMode === "url" ? newsletterUrl.trim() : undefined,
                  text: textImport.trim(),
                }
          ),
        });
      const payload = await response.json();
      if (!response.ok) {
        setUpgradeRequired(Boolean(payload?.upgrade_required));
        setError(String(payload?.error ?? "Could not import voice."));
        return;
      }
      const next = {
        handle:
          sourceType === "linkedin" && linkedinMode === "handle"
            ? String(payload.handle ?? normalizeLinkedInHandleForWelcome(handle))
            : onboardingImportLabel(sourceType),
        captions: Number(payload.captions_used ?? payload.imported_units ?? 0),
        patterns: Array.isArray(payload.learned_patterns) ? payload.learned_patterns : [],
      };
      setResult(next);
      onImported({
        source: sourceType,
        label: next.handle,
        units: next.captions,
        patterns: next.patterns,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
```

  This preserves linkedin/text behavior exactly; only Instagram switches to start+poll. The existing `loading` spinner now covers the poll window. (Optional polish: a "Scanning your recent posts…" message while `loading && sourceType==='instagram'` — only if trivial; not required.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` clean. Confirm `normalizeInstagramHandleForWelcome`, `onboardingImportLabel`, `normalizeLinkedInHandleForWelcome` are still referenced/defined (they were used by the original block).

- [ ] **Step 4: Commit**

```bash
git add components/WelcomeFlow.tsx
git commit -m "feat(onboarding): wire welcome IG import to async endpoints (non-blocking)"
```

---

## Task 4: Verification

- [ ] **Step 1:** `npm run test` → green; `npx tsc --noEmit` → clean.
- [ ] **Step 2: Grep** no `realityQuestionsComplete` remains: `grep -rn "realityQuestionsComplete" lib/ app/` → none.
- [ ] **Step 3: Reason through flows (document):**
  - New standard coach: middleware → `/welcome`; finishes voice+magic; first app page → `enforceOnboardingGate` returns null → `onboarding_completed_at` stamped + `app_opened` logged. Never forced to `/onboarding`. ✅
  - IG import in welcome: POST start → poll → complete → `onImported` fires; no 55s blocking request. LinkedIn/text unchanged. ✅
  - Trial buyer: still scoped to Brand OS (decideGatePath trial branch). On upgrade → proceeds → marker stamped. ✅
  - Standard coach, trial later expires: marker already set → not re-scoped. ✅
- [ ] **Step 4 (user review):** preview the welcome IG import flow (paste a real public handle) — confirm it shows progress and completes without the long hang, before the final merge.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** Implements 5b-i (async IG wire-up — the Plan 3 payoff) and 5b-ii (reality-questions replacement + marker relocation, resolving the documented landmine). The `/onboarding` page + `resolveOnboardingGate` + `saveOnboardingAnswers` remain as an optional/legacy surface (nothing forces them) — intentionally left to keep blast radius small.
- **Placeholder scan:** No TBD. Exact code for the gate change, marker relocation, polling helper, and the branched `importVoice`.
- **Type consistency:** `GateDecisionInput` loses `realityQuestionsComplete` consistently across `onboarding-gate.ts`, `onboarding.ts`, and the test. `pollInstagramImport` returns `{ units, patterns }` matching `ImportedVoiceSignal` fields. The async `complete` response keys (`itemsImported`, `learnedPatterns`) match Plan 3's status endpoint.
- **Risk:** Task 3 edits the 1,420-line WelcomeFlow — but only `importVoice` + one module-scope helper; behavior for non-Instagram sources is preserved verbatim. UI verification is manual (repo convention).

---

## Execution Handoff

Execute inline. After Tasks 1–2 (gate) and Task 3 (UI), verify, then **pause for user UI preview before merge** (per the reviewability note). This is the last planned slice of Onboarding v2; remaining spec items (website import, SEO/GEO scoring, newsletter OAuth) were explicitly deferred.
