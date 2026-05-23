# Onboarding v2 — Phase 0: Funnel Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log where coaches drop off in the *current* onboarding funnel so the v2 rebuild has a measurable baseline.

**Architecture:** A single append-only `cp_funnel_events` table. A pure-logic module (`lib/funnel.ts`) defines the event vocabulary and computes a drop-off report from raw event rows — this is the only unit-tested piece, matching the repo's "pure functions in `lib/`" test convention. A fire-and-forget logger (`lib/funnel-log.ts`) writes events via the service-role admin client. Six existing code paths get a one-line `void logFunnelEvent(...)`. A node report script prints the baseline table.

**Tech Stack:** Next.js 14 (edge runtime), Supabase (Postgres + RLS), `@supabase/supabase-js`, Vitest (node env), `createAdminClient` from `lib/supabase-admin`.

**Precondition:** main is green (typecheck + `npm run qa:daily` pass) and you are on a clean `feat/onboarding-v2` branch off main. Do NOT start on the current dirty tree.

---

## Why this is its own plan

The full Onboarding v2 spec (`elevate-ai-project/deliverables/onboarding-v2-spec.md`) spans several independent subsystems (instrumentation, gate removal, async Instagram import, Audience model, Home activation). Per the writing-plans scope rule, each ships as its own plan. This is plan 1 of 5 — the prerequisite. The Phase 1 sub-plan map is at the bottom.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `supabase/migrations/20260522_funnel_events.sql` | `cp_funnel_events` table + RLS + indexes | Create |
| `lib/funnel.ts` | Event vocabulary + `computeFunnel()` report logic (pure) | Create |
| `lib/__tests__/funnel.test.ts` | Unit tests for `lib/funnel.ts` | Create |
| `lib/funnel-log.ts` | Fire-and-forget `logFunnelEvent()` (I/O) | Create |
| `app/api/coach/start-free-trial/route.ts` | emit `signup_completed` (free path) | Modify |
| `lib/brand-os/tripwire-provision.ts` | emit `signup_completed` ($7 path) | Modify |
| `app/brand-os/start/route.ts` | emit `brand_os_started` | Modify |
| `app/api/brand-os/synthesize/route.ts` | emit `brand_os_completed` | Modify |
| `lib/onboarding.ts` | emit `reality_questions_completed` + `app_opened` | Modify |
| `app/api/content/draft/route.ts` | emit `content_created` | Modify |
| `scripts/funnel-baseline.mjs` | print baseline drop-off table | Create |

---

## Event vocabulary (the contract)

Logged events (milestones + one repeatable):
1. `signup_completed`
2. `brand_os_started`
3. `brand_os_completed`
4. `reality_questions_completed`
5. `content_created`
6. `app_opened` (repeatable — used for retention)

Derived in the report (NOT logged):
- `brand_os_abandoned` = started ∧ ¬completed
- `returned_day_7` = any `app_opened` on/after signup + 7 days

Stage counts use **distinct coach_id**, so duplicate milestone rows are harmless.

---

## Task 1: Create the `cp_funnel_events` table

**Files:**
- Create: `supabase/migrations/20260522_funnel_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Funnel instrumentation — baseline drop-off measurement for Onboarding v2.
--
-- Append-only event log. Inserts happen server-side via the service-role
-- admin client (lib/funnel-log.ts), so there is no INSERT policy for the
-- authenticated role — only a SELECT policy so a coach could read their own
-- events if ever surfaced in-app. Stage counts use DISTINCT coach_id, so
-- duplicate milestone rows do not distort the report.

create table if not exists public.cp_funnel_events (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table public.cp_funnel_events enable row level security;

drop policy if exists "coach reads own funnel events" on public.cp_funnel_events;
create policy "coach reads own funnel events" on public.cp_funnel_events
  for select using (auth.uid() = coach_id);

create index if not exists cp_funnel_events_coach_name
  on public.cp_funnel_events (coach_id, name);

create index if not exists cp_funnel_events_name_created
  on public.cp_funnel_events (name, created_at);
```

- [ ] **Step 2: Apply the migration**

Apply via your normal Supabase migration path (Supabase MCP `apply_migration`, or `supabase db push`). Verify the table exists:

Run (psql or Supabase SQL editor):
```sql
select count(*) from public.cp_funnel_events;
```
Expected: `0` (table exists, empty).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522_funnel_events.sql
git commit -m "feat(funnel): add cp_funnel_events table for onboarding baseline"
```

---

## Task 2: Pure-logic module `lib/funnel.ts` (TDD)

**Files:**
- Create: `lib/funnel.ts`
- Test: `lib/__tests__/funnel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Tests for lib/funnel.ts
//
// computeFunnel is what the baseline report depends on. If stage ordering
// or distinct-coach counting regresses, the baseline we measure v2 against
// is wrong. Pin the contract.

import { describe, it, expect } from "vitest";
import {
  FUNNEL_STAGES,
  isFunnelEvent,
  computeFunnel,
  type FunnelEventRow,
} from "@/lib/funnel";

const NOW = new Date("2026-05-22T00:00:00.000Z");

function ev(coach_id: string, name: string, created_at = "2026-05-01T00:00:00.000Z"): FunnelEventRow {
  return { coach_id, name, created_at };
}

describe("isFunnelEvent", () => {
  it("accepts known event names", () => {
    expect(isFunnelEvent("signup_completed")).toBe(true);
    expect(isFunnelEvent("app_opened")).toBe(true);
  });
  it("rejects unknown names", () => {
    expect(isFunnelEvent("nope")).toBe(false);
    expect(isFunnelEvent("")).toBe(false);
  });
});

describe("computeFunnel — stage counts", () => {
  it("counts distinct coaches per stage, ignoring duplicate milestone rows", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed"),
      ev("a", "signup_completed"), // duplicate — must not double-count
      ev("b", "signup_completed"),
      ev("a", "brand_os_started"),
      ev("a", "brand_os_completed"),
    ];
    const report = computeFunnel(events, NOW);
    const signup = report.stages.find((s) => s.stage === "signup_completed")!;
    const started = report.stages.find((s) => s.stage === "brand_os_started")!;
    expect(signup.coaches).toBe(2);
    expect(started.coaches).toBe(1);
    expect(report.totalCoaches).toBe(2);
  });

  it("orders stages per FUNNEL_STAGES", () => {
    const report = computeFunnel([], NOW);
    expect(report.stages.map((s) => s.stage)).toEqual([...FUNNEL_STAGES]);
  });

  it("computes drop-off from previous stage", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed"),
      ev("b", "signup_completed"),
      ev("c", "signup_completed"),
      ev("d", "signup_completed"),
      ev("a", "brand_os_started"),
      ev("b", "brand_os_started"),
    ];
    const report = computeFunnel(events, NOW);
    const started = report.stages.find((s) => s.stage === "brand_os_started")!;
    expect(started.coaches).toBe(2);
    expect(started.dropFromPrev).toBe(50); // 4 -> 2 = 50% drop
  });
});

describe("computeFunnel — derived metrics", () => {
  it("brandOsAbandoned = started and not completed", () => {
    const events: FunnelEventRow[] = [
      ev("a", "brand_os_started"),
      ev("a", "brand_os_completed"),
      ev("b", "brand_os_started"), // abandoned
    ];
    expect(computeFunnel(events, NOW).brandOsAbandoned).toBe(1);
  });

  it("returnedDay7 = app_opened on/after signup + 7 days", () => {
    const events: FunnelEventRow[] = [
      ev("a", "signup_completed", "2026-05-01T00:00:00.000Z"),
      ev("a", "app_opened", "2026-05-09T00:00:00.000Z"), // +8d -> counts
      ev("b", "signup_completed", "2026-05-01T00:00:00.000Z"),
      ev("b", "app_opened", "2026-05-03T00:00:00.000Z"), // +2d -> no
    ];
    expect(computeFunnel(events, NOW).returnedDay7).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/funnel.test.ts`
Expected: FAIL — cannot resolve `@/lib/funnel` (module not created yet).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/funnel.ts
//
// Pure logic for onboarding-funnel measurement. No I/O. The logger
// (lib/funnel-log.ts) and report script (scripts/funnel-baseline.mjs)
// import from here so the event vocabulary has one source of truth.

/** Ordered funnel stages. The report renders them in this order and
 *  computes drop-off between consecutive stages. */
export const FUNNEL_STAGES = [
  "signup_completed",
  "brand_os_started",
  "brand_os_completed",
  "reality_questions_completed",
  "content_created",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** All loggable event names = the ordered stages plus the repeatable
 *  retention ping. */
export const FUNNEL_EVENTS = [...FUNNEL_STAGES, "app_opened"] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENTS as readonly string[]).includes(name);
}

export type FunnelEventRow = {
  coach_id: string;
  name: string;
  created_at: string; // ISO timestamp
};

export type FunnelStageStat = {
  stage: FunnelStage;
  coaches: number;     // distinct coaches who hit this stage
  pctOfStart: number;  // % of stage[0] coaches (0-100, rounded)
  dropFromPrev: number; // % drop from the previous stage (0-100, rounded)
};

export type FunnelReport = {
  stages: FunnelStageStat[];
  brandOsAbandoned: number; // started, never completed
  returnedDay7: number;     // app_opened on/after signup + 7 days
  totalCoaches: number;     // distinct coaches at stage[0]
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the set of distinct coach_ids that fired a given event name. */
function coachesWith(events: FunnelEventRow[], name: string): Set<string> {
  const set = new Set<string>();
  for (const e of events) if (e.name === name) set.add(e.coach_id);
  return set;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function computeFunnel(events: FunnelEventRow[], now: Date = new Date()): FunnelReport {
  const perStage = FUNNEL_STAGES.map((stage) => coachesWith(events, stage));
  const startCount = perStage[0]?.size ?? 0;

  const stages: FunnelStageStat[] = FUNNEL_STAGES.map((stage, i) => {
    const coaches = perStage[i].size;
    const prev = i === 0 ? coaches : perStage[i - 1].size;
    return {
      stage,
      coaches,
      pctOfStart: pct(coaches, startCount),
      dropFromPrev: i === 0 ? 0 : pct(prev - coaches, prev),
    };
  });

  // brand_os_abandoned: started minus those who also completed.
  const started = coachesWith(events, "brand_os_started");
  const completed = coachesWith(events, "brand_os_completed");
  let brandOsAbandoned = 0;
  for (const c of started) if (!completed.has(c)) brandOsAbandoned += 1;

  // returned_day_7: first signup time per coach; any app_opened >= +7d.
  const signupAt = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "signup_completed") continue;
    const t = Date.parse(e.created_at);
    const cur = signupAt.get(e.coach_id);
    if (cur === undefined || t < cur) signupAt.set(e.coach_id, t);
  }
  const returned = new Set<string>();
  for (const e of events) {
    if (e.name !== "app_opened") continue;
    const s = signupAt.get(e.coach_id);
    if (s === undefined) continue;
    if (Date.parse(e.created_at) - s >= 7 * DAY_MS) returned.add(e.coach_id);
  }

  void now; // reserved for future windowing; keeps signature stable
  return {
    stages,
    brandOsAbandoned,
    returnedDay7: returned.size,
    totalCoaches: startCount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/funnel.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `lib/funnel.ts` or its test.

- [ ] **Step 6: Commit**

```bash
git add lib/funnel.ts lib/__tests__/funnel.test.ts
git commit -m "feat(funnel): add pure computeFunnel report logic + tests"
```

---

## Task 3: Fire-and-forget logger `lib/funnel-log.ts`

**Files:**
- Create: `lib/funnel-log.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// lib/funnel-log.ts
//
// Server-side, fire-and-forget funnel event logger. Callers use:
//   void logFunnelEvent(coachId, "signup_completed");
// Never await it in the request path and never let it throw — telemetry
// must not break a user flow. Writes via the service-role admin client
// (the table has no authenticated INSERT policy by design).

import { createAdminClient } from "@/lib/supabase-admin";
import { isFunnelEvent, type FunnelEventName } from "@/lib/funnel";

export async function logFunnelEvent(
  coachId: string | null | undefined,
  name: FunnelEventName,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!coachId || !isFunnelEvent(name)) return;
  try {
    const admin = createAdminClient();
    await admin.from("cp_funnel_events").insert({ coach_id: coachId, name, meta });
  } catch (err) {
    console.warn("[funnel] log failed:", name, err);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/funnel-log.ts
git commit -m "feat(funnel): add fire-and-forget logFunnelEvent helper"
```

---

## Task 4: Emit `signup_completed` (both signup paths)

**Files:**
- Modify: `app/api/coach/start-free-trial/route.ts` (free-trial path)
- Modify: `lib/brand-os/tripwire-provision.ts` ($7 path)

- [ ] **Step 1: Add import + emit in start-free-trial**

In `app/api/coach/start-free-trial/route.ts`, add the import near the other imports:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

Find the success path after the coach update (around line 66-69):

```typescript
  .from("cp_coaches")
  .update(patch)
```
…and the `if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });` guard that follows it.

Immediately AFTER that `if (upErr) ...` guard (i.e., once the update is known to have succeeded), add:

```typescript
  void logFunnelEvent(user.id, "signup_completed", { path: "free_trial" });
```

- [ ] **Step 2: Add import + emit in tripwire-provision**

In `lib/brand-os/tripwire-provision.ts`, add the import near the top imports:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

Find the first-provision block guarded by `if (!existing?.user_provisioned_at) {` (the same block that calls `subscribeToBeehiiv`). Inside that block, after the `void subscribeToBeehiiv(email, displayName);` line, add:

```typescript
    void logFunnelEvent(coachId, "signup_completed", { path: "tripwire" });
```

(`coachId` is in scope and guaranteed non-null at this point.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/coach/start-free-trial/route.ts lib/brand-os/tripwire-provision.ts
git commit -m "feat(funnel): emit signup_completed on free-trial and tripwire paths"
```

---

## Task 5: Emit `brand_os_started`

**Files:**
- Modify: `app/brand-os/start/route.ts`

- [ ] **Step 1: Add import + emit after run insert**

Add the import near the top:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

Find the insert into `cp_brand_os_runs` (around line 39). After the insert succeeds and you have the authenticated coach/user id in scope (the same id used as `coach_id` on the insert), add immediately after the insert's error guard:

```typescript
  void logFunnelEvent(user.id, "brand_os_started", { variant });
```

If the local variable for the user id is not named `user.id` in this file, use whatever id was passed as `coach_id` to the insert. If `variant` is not in scope, drop the meta object: `void logFunnelEvent(user.id, "brand_os_started");`

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/brand-os/start/route.ts
git commit -m "feat(funnel): emit brand_os_started on run creation"
```

---

## Task 6: Emit `brand_os_completed`

**Files:**
- Modify: `app/api/brand-os/synthesize/route.ts`

- [ ] **Step 1: Add import + emit after synthesis persist**

Add the import near the top:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

Find the persist block (around line 222-229):

```typescript
  // Persist the synthesis on the run.
  await dbClient
    .from("cp_brand_os_runs")
    .update({
      synthesis_json: synthesis,
      synthesized_at: new Date().toISOString(),
    })
    .eq("id", runId);
```

Immediately AFTER that block, add:

```typescript
  void logFunnelEvent(coachId, "brand_os_completed", { runId });
```

(`coachId` and `runId` are both in scope here.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/brand-os/synthesize/route.ts
git commit -m "feat(funnel): emit brand_os_completed after synthesis persist"
```

---

## Task 7: Emit `reality_questions_completed` and `app_opened`

**Files:**
- Modify: `lib/onboarding.ts`

- [ ] **Step 1: Add import**

At the top of `lib/onboarding.ts`, add:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

- [ ] **Step 2: Emit reality_questions_completed in saveOnboardingAnswers**

In `saveOnboardingAnswers`, find the re-load comment and call near the end:

```typescript
  // Re-load to return canonical state.
  const next = await loadOnboardingState(supabase, coachId);
  if (!next) throw new Error("Failed to reload onboarding state after save.");
  return next;
```

Immediately BEFORE `return next;`, add:

```typescript
  void logFunnelEvent(coachId, "reality_questions_completed");
```

- [ ] **Step 3: Emit app_opened in enforceOnboardingGate (completed case)**

In `enforceOnboardingGate`, find the resolved-complete return:

```typescript
  const gate = await resolveOnboardingGate(supabase, coachId);
  if (gate.phase === "complete") return null;
```

Change it to log before returning:

```typescript
  const gate = await resolveOnboardingGate(supabase, coachId);
  if (gate.phase === "complete") {
    void logFunnelEvent(coachId, "app_opened");
    return null;
  }
```

(This is the single chokepoint every authenticated app surface calls, so it captures returning sessions. Volume is acceptable for a one-week baseline; the report counts distinct coaches.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding.ts
git commit -m "feat(funnel): emit reality_questions_completed + app_opened"
```

---

## Task 8: Emit `content_created`

**Files:**
- Modify: `app/api/content/draft/route.ts`

- [ ] **Step 1: Add import + emit after content insert**

Add the import near the top:

```typescript
import { logFunnelEvent } from "@/lib/funnel-log";
```

Find the insert + error guard (around line 235-263):

```typescript
  const { data: inserted, error } = await supabase
    .from("cp_content")
    .insert({
```
…followed by:
```typescript
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
```

Immediately AFTER that `if (error) { ... }` guard (insert succeeded), add — using the authenticated user id already resolved at the top of this handler:

```typescript
  void logFunnelEvent(user.id, "content_created", { contentType: inserted?.content_type ?? null });
```

If `user` is named differently in this handler, use the same id used as the auth subject at the top. If `inserted` has no `content_type`, drop the meta: `void logFunnelEvent(user.id, "content_created");`

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/content/draft/route.ts
git commit -m "feat(funnel): emit content_created on first draft insert"
```

---

## Task 9: Baseline report script

**Files:**
- Create: `scripts/funnel-baseline.mjs`

- [ ] **Step 1: Write the script**

```javascript
// scripts/funnel-baseline.mjs
//
// Prints the current onboarding funnel drop-off table from cp_funnel_events.
// Run after at least one week of data:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/funnel-baseline.mjs
//
// Reuses lib/funnel.ts via a tiny inline import of the compiled logic is not
// possible from .mjs without a build step, so this script re-implements the
// SAME ordered stages. Keep FUNNEL_STAGES in sync with lib/funnel.ts.

import { createClient } from "@supabase/supabase-js";

const FUNNEL_STAGES = [
  "signup_completed",
  "brand_os_started",
  "brand_os_completed",
  "reality_questions_completed",
  "content_created",
];

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("cp_funnel_events")
  .select("coach_id, name, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const events = data ?? [];
const DAY_MS = 24 * 60 * 60 * 1000;
const coachesWith = (name) => new Set(events.filter((e) => e.name === name).map((e) => e.coach_id));

const perStage = FUNNEL_STAGES.map((s) => coachesWith(s));
const start = perStage[0].size || 0;
const pct = (p, w) => (w <= 0 ? 0 : Math.round((p / w) * 100));

console.log("\n=== Onboarding Funnel Baseline ===");
console.log(`Total signups: ${start}\n`);
console.log("Stage".padEnd(30), "Coaches".padEnd(9), "%Start".padEnd(8), "DropFromPrev");
FUNNEL_STAGES.forEach((stage, i) => {
  const coaches = perStage[i].size;
  const prev = i === 0 ? coaches : perStage[i - 1].size;
  const drop = i === 0 ? 0 : pct(prev - coaches, prev);
  console.log(stage.padEnd(30), String(coaches).padEnd(9), `${pct(coaches, start)}%`.padEnd(8), `${drop}%`);
});

// Derived
const started = coachesWith("brand_os_started");
const completed = coachesWith("brand_os_completed");
let abandoned = 0;
for (const c of started) if (!completed.has(c)) abandoned += 1;

const signupAt = new Map();
for (const e of events) {
  if (e.name !== "signup_completed") continue;
  const t = Date.parse(e.created_at);
  const cur = signupAt.get(e.coach_id);
  if (cur === undefined || t < cur) signupAt.set(e.coach_id, t);
}
const returned = new Set();
for (const e of events) {
  if (e.name !== "app_opened") continue;
  const s = signupAt.get(e.coach_id);
  if (s !== undefined && Date.parse(e.created_at) - s >= 7 * DAY_MS) returned.add(e.coach_id);
}

console.log(`\nBrand OS abandoned (started, never completed): ${abandoned}`);
console.log(`Returned day 7+: ${returned.size} / ${start} (${pct(returned.size, start)}%)`);
console.log("");
```

- [ ] **Step 2: Smoke-run the script**

Run: `SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY node scripts/funnel-baseline.mjs`
Expected: prints the table with all-zero counts (no events logged yet). No crash.

- [ ] **Step 3: Commit**

```bash
git add scripts/funnel-baseline.mjs
git commit -m "feat(funnel): add baseline drop-off report script"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the whole unit suite**

Run: `npm run test`
Expected: PASS, including `lib/__tests__/funnel.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the daily QA gate**

Run: `npm run qa:daily`
Expected: typecheck + smoke pass (no new RED items from this work).

- [ ] **Step 4: Manual end-to-end smoke (local or preview)**

In a local/preview environment, exercise each path once and confirm a row lands in `cp_funnel_events`:
- Start a free trial → expect `signup_completed`
- Start a Brand OS run → expect `brand_os_started`
- Complete synthesis → expect `brand_os_completed`
- Finish onboarding reality questions → expect `reality_questions_completed`
- Create a content draft → expect `content_created`
- Reload an app page when fully onboarded → expect `app_opened`

Query: `select name, count(*) from public.cp_funnel_events group by name order by name;`
Expected: a row per fired event.

- [ ] **Step 5: Let it collect ~1 week, then run the report**

After data accumulates:
Run: `node scripts/funnel-baseline.mjs` (with env vars)
Expected: the baseline drop-off table. Save the output into the spec's Success Metrics "Baseline" column.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** Implements the entire "Phase 0 — Instrument the Current Funnel" section of `onboarding-v2-spec.md`, including all six listed events. `brand_os_abandoned` and `returned_day_7` are derived in `computeFunnel` + the report, matching the spec's intent.
- **Placeholder scan:** No TBD/TODO. Wiring steps give exact files, exact anchor strings, and the exact line to insert. Where a local variable name might differ, the fallback instruction is concrete (drop the meta object).
- **Type consistency:** `FunnelEventName`, `FunnelEventRow`, `FunnelStage`, `FunnelReport`, `computeFunnel`, `isFunnelEvent`, `logFunnelEvent` names are identical across `lib/funnel.ts`, the test, and `lib/funnel-log.ts`. The `.mjs` report re-declares `FUNNEL_STAGES` (documented why — node `.mjs` can't import the TS module without a build step) and is flagged to keep in sync.

---

## Phase 1 Sub-Plan Map (next plans, not this one)

Each is its own plan, written after Phase 0 lands. Suggested order:

1. **Plan 2 — Remove the Brand OS gate.** Rewrite `resolveOnboardingGate` / `enforceOnboardingGate` in `lib/onboarding.ts`, update `middleware.ts` first-login redirect, retire the `brand_os_mvp` blocking phase. Migration marks existing coaches complete. Highest-leverage behavioral change. Pure-function targets: a new gate-decision function that's unit-testable.
2. **Plan 3 — Async Instagram import.** New architecture: `POST /api/onboarding/import/instagram` starts an Apify run async (returns immediately with a run id), `cp_imports` row tracks status, `GET /api/onboarding/import/[id]/status` polls Apify + finalizes by reusing the existing extraction in `app/api/voice/import/instagram/route.ts`. Pure-function targets: handle normalization, status mapping.
3. **Plan 4 — Brand OS auto-import + Start-Fresh path.** Email-match query against `cp_brand_os_runs`/`cp_tripwire_purchases`; 3-question fresh-start → starter voice profile + first draft.
4. **Plan 5 — Screen reframe + Home activation.** Refactor `WelcomeFlow` to "pick one source" + "first version" review; add the "Do this first" action on `/command-center`; Audience vs Leads split (default imports to Audience, promote warm to Leads).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-onboarding-v2-phase0-funnel-instrumentation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
