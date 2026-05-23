# Onboarding v2 — Plan 3: Async Instagram Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a coach's Instagram voice without blocking the request for ~55s, so it can run during onboarding. Start the Apify scrape async, return immediately with an import id, and let the client poll a status endpoint that finalizes by reusing the existing extraction.

**Architecture:** A new `cp_imports` job-tracker table. Two new endpoints: `POST /api/onboarding/import/instagram` (validate handle → start Apify run async → create `cp_imports` row → return `{ importId }`) and `GET /api/onboarding/import/[id]/status` (read row → poll Apify run → on success, fetch dataset + run the SHARED extraction → mark complete). The post-scrape processing (transcript → Claude rules → voice profile + training source) is **moved** out of the existing sync route into a shared `lib/voice/instagram-import.ts` so both the old sync route and the new async status endpoint use one implementation (DRY, no behavior change to the existing route). A pure `mapApifyStatus()` (unit-tested) maps Apify run states to our import states.

**Tech Stack:** Next.js 14 (edge), Supabase, Apify API, Anthropic API, Vitest (node env). Builds on `main` at `ae89042`.

**Precondition:** Fresh worktree off `main` (`ae89042`, green: 112 tests + tsc). Symlink `node_modules` (`ln -s ../../node_modules node_modules`). **Subagent isolation:** prior plans had subagents commit to `main` despite a `cd` guard. For THIS plan, dispatch implementer subagents with the Agent tool's `isolation: "worktree"` mode (each gets its own isolated checkout), OR the controller applies edits inline. Do NOT rely on a `cd` instruction alone.

---

## Context: the existing sync route (reuse, don't rewrite)

`app/api/voice/import/instagram/route.ts` (≈666 lines) currently:
1. Auths the user; rate-limits (`5/min`); enforces a monthly free-import cap (1/mo free, paid unlimited) via `getMonthlyInstagramUsage` + `hasPaidImportAccess`.
2. `importInstagramCaptions(handle, limit)` — calls Apify `run-sync-get-dataset-items` (BLOCKS up to `APIFY_TIMEOUT_MS = 55_000`), returns captions.
3. Post-scrape processing: `buildInstagramTranscript` → `extractInstagramRules` (Anthropic) → `mergeInstagramSignal` → `createStarterProfile`/update `cp_voice_profiles` → insert `cp_voice_training_sources`.
4. Returns `{ profile, source, captions_used, handle, extracted_rules, learned_patterns, usage }`.

Module-private helpers we will MOVE to the shared lib: `normalizeInstagramHandle`, `normalizeLimit`, `normalizeApifyItems`, `buildInstagramTranscript`, `extractInstagramRules`, `createStarterProfile`, `mergeInstagramSignal`, `summarizeLearnedPatterns`, `fallbackInstagramRules`, `normalizeRules`, `normalizeCategory`, `topWords`, `extractCtas`, and the small value helpers (`recordValue`, `isRecord`, `stringValue`, `numberValue`, `numericSignal`, `ruleId`), plus the `InstagramCaption` / `ExtractedRule` types and the `APIFY_DEFAULT_ACTOR` / `ANTHROPIC_*` constants. `getMonthlyInstagramUsage` + `hasPaidImportAccess` stay route-level (they're entitlement checks).

**Apify async API** (replaces `run-sync-get-dataset-items`):
- Start: `POST https://api.apify.com/v2/acts/{actor}/runs?token=...` with the same input body → returns `{ data: { id, defaultDatasetId, status } }` immediately (status `READY`/`RUNNING`).
- Poll: `GET https://api.apify.com/v2/actor-runs/{runId}?token=...` → `{ data: { status, defaultDatasetId } }`.
- Fetch items: `GET https://api.apify.com/v2/datasets/{datasetId}/items?token=...&clean=true`.
- Run statuses: `READY`, `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED-OUT`, `ABORTED`.
- Actor id uses `~` not `/` (e.g. `apify~instagram-scraper`), matching the existing route's `.replace("/", "~")`.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `supabase/migrations/20260523_imports.sql` | `cp_imports` job tracker table + RLS | Create |
| `lib/voice/apify-status.ts` | Pure `mapApifyStatus()` + `ImportStatus` type | Create |
| `lib/__tests__/apify-status.test.ts` | Unit tests | Create |
| `lib/voice/instagram-import.ts` | Shared post-scrape processing + handle/limit helpers (moved from the route) | Create |
| `app/api/voice/import/instagram/route.ts` | Refactor to import the moved helpers (behavior-preserving) | Modify |
| `app/api/onboarding/import/instagram/route.ts` | Async start endpoint | Create |
| `app/api/onboarding/import/[id]/status/route.ts` | Poll + finalize endpoint | Create |

---

## Task 1: `cp_imports` migration

**Files:** Create `supabase/migrations/20260523_imports.sql`

- [ ] **Step 1: Write the migration** (file-only; do NOT apply to the DB — the controller applies it later, like Plan 1)

```sql
-- Import job tracker for async source imports (Onboarding v2, Plan 3).
--
-- One row per import attempt. For Instagram, external_run_id / external_dataset_id
-- hold the Apify run + dataset ids so the status endpoint can poll. Inserts/updates
-- happen server-side via the service-role admin client; coaches may read their own.

create table if not exists public.cp_imports (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references auth.users(id) on delete cascade,
  source               text not null,                       -- 'instagram' | 'website' | 'csv' | ...
  status               text not null default 'processing',  -- 'processing' | 'complete' | 'failed'
  source_ref           text,                                -- e.g. the instagram handle
  external_run_id      text,                                -- Apify run id
  external_dataset_id  text,                                -- Apify dataset id
  items_found          integer not null default 0,
  items_imported       integer not null default 0,
  error                text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

alter table public.cp_imports enable row level security;

drop policy if exists "coach reads own imports" on public.cp_imports;
create policy "coach reads own imports" on public.cp_imports
  for select using (auth.uid() = coach_id);

create index if not exists cp_imports_coach_created
  on public.cp_imports (coach_id, created_at desc);
```

- [ ] **Step 2: Commit** (no DB apply)

```bash
git add supabase/migrations/20260523_imports.sql
git commit -m "feat(import): add cp_imports job tracker table"
```

---

## Task 2: Pure `mapApifyStatus()` + tests (TDD)

**Files:** Create `lib/voice/apify-status.ts`, `lib/__tests__/apify-status.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mapApifyStatus, type ImportStatus } from "@/lib/voice/apify-status";

describe("mapApifyStatus", () => {
  it("maps terminal success to complete", () => {
    expect(mapApifyStatus("SUCCEEDED")).toBe<ImportStatus>("complete");
  });
  it("maps in-flight states to processing", () => {
    expect(mapApifyStatus("READY")).toBe("processing");
    expect(mapApifyStatus("RUNNING")).toBe("processing");
  });
  it("maps terminal failures to failed", () => {
    expect(mapApifyStatus("FAILED")).toBe("failed");
    expect(mapApifyStatus("TIMED-OUT")).toBe("failed");
    expect(mapApifyStatus("ABORTED")).toBe("failed");
  });
  it("treats unknown/missing status as processing (don't fail prematurely)", () => {
    expect(mapApifyStatus("SOMETHING_NEW")).toBe("processing");
    expect(mapApifyStatus(null)).toBe("processing");
    expect(mapApifyStatus(undefined)).toBe("processing");
  });
});
```

- [ ] **Step 2: Run → fails** — `npx vitest run lib/__tests__/apify-status.test.ts` (cannot resolve module).

- [ ] **Step 3: Implement** `lib/voice/apify-status.ts`

```typescript
// lib/voice/apify-status.ts
//
// Pure mapping from Apify actor-run status to our import status. Unknown or
// missing statuses map to "processing" so a transient/unexpected value never
// prematurely reports failure or success to the client.

export type ImportStatus = "processing" | "complete" | "failed";

export function mapApifyStatus(apifyStatus: string | null | undefined): ImportStatus {
  switch (apifyStatus) {
    case "SUCCEEDED":
      return "complete";
    case "FAILED":
    case "TIMED-OUT":
    case "ABORTED":
      return "failed";
    default:
      return "processing";
  }
}
```

- [ ] **Step 4: Run → passes.** `npx vitest run lib/__tests__/apify-status.test.ts` → all PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/voice/apify-status.ts lib/__tests__/apify-status.test.ts
git commit -m "feat(import): add pure mapApifyStatus + tests"
```

---

## Task 3: Extract shared `lib/voice/instagram-import.ts` (behavior-preserving move)

**Files:** Create `lib/voice/instagram-import.ts`; Modify `app/api/voice/import/instagram/route.ts`

**Goal:** Move the post-scrape processing + helpers out of the route into a shared module so the async status endpoint can reuse them. The existing sync route must behave identically (it has no unit tests; verify via tsc + the route still type-checks and returns the same shape).

- [ ] **Step 1: Create `lib/voice/instagram-import.ts`** exporting:
  - Types `InstagramCaption`, `ExtractedRule`.
  - Constants `APIFY_DEFAULT_ACTOR`, `ANTHROPIC_URL`, `ANTHROPIC_MODEL`.
  - `normalizeInstagramHandle(value): string`, `normalizeLimit(value): number`, `normalizeApifyItems(items): InstagramCaption[]`.
  - The processing helpers: `buildInstagramTranscript`, `extractInstagramRules`, `mergeInstagramSignal`, `createStarterProfile`, `summarizeLearnedPatterns`, `fallbackInstagramRules`, `normalizeRules`, `normalizeCategory`, `topWords`, `extractCtas`, and value helpers `recordValue`, `isRecord`, `stringValue`, `numberValue`, `numericSignal`, `ruleId`.
  - A NEW orchestration function that performs everything AFTER captions are in hand and persists the result:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceProfile, VoiceTrainingSource } from "@/lib/types";

export type ProcessResult = {
  profile: VoiceProfile;
  source: VoiceTrainingSource;
  captionsUsed: number;
  extractedRules: ExtractedRule[];
  learnedPatterns: Array<{ label: string; text: string }>;
};

/** Given scraped captions, run rule extraction, update the active voice
 *  profile, and write a training source. Shared by the sync route and the
 *  async status endpoint. Throws on unrecoverable DB errors; callers wrap. */
export async function processInstagramCaptions(
  supabase: SupabaseClient,
  coachId: string,
  handle: string,
  captions: InstagramCaption[],
): Promise<ProcessResult> {
  // ...moved verbatim from the route: load active profile, buildInstagramTranscript,
  // extractInstagramRules, mergeInstagramSignal, createStarterProfile if no active
  // profile, update cp_voice_profiles, insert cp_voice_training_sources, return shape.
}
```

  Move the bodies of these functions verbatim from the route (only changing `createClient()`-based access to use the passed `supabase` arg). Keep logic identical.

- [ ] **Step 2: Refactor the route** `app/api/voice/import/instagram/route.ts` to:
  - Import `normalizeInstagramHandle`, `normalizeLimit`, `normalizeApifyItems`, `APIFY_DEFAULT_ACTOR`, `processInstagramCaptions` from `@/lib/voice/instagram-import`.
  - Keep route-level: auth, rate-limit, `getMonthlyInstagramUsage`, `hasPaidImportAccess`, and the synchronous `importInstagramCaptions` (Apify `run-sync-get-dataset-items`) — but after it returns captions, call `processInstagramCaptions(supabase, user.id, handle, captions)` and return the same response shape as before (`{ profile, source, captions_used, handle, extracted_rules, learned_patterns, usage }`, mapping `ProcessResult` fields).
  - Delete the now-moved private helper definitions from the route.

- [ ] **Step 3: Verify behavior-preserving** — `npx tsc --noEmit` clean; `npm run test` still green (113 with Task 2's tests). There are no unit tests for this route; confirm the response shape is unchanged by reading the final return statement.

- [ ] **Step 4: Commit**

```bash
git add lib/voice/instagram-import.ts app/api/voice/import/instagram/route.ts
git commit -m "refactor(import): extract shared instagram-import processing from sync route"
```

---

## Task 4: Async start endpoint `POST /api/onboarding/import/instagram`

**Files:** Create `app/api/onboarding/import/instagram/route.ts`

- [ ] **Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { normalizeInstagramHandle, normalizeLimit, APIFY_DEFAULT_ACTOR } from "@/lib/voice/instagram-import";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "onboarding/import/instagram", 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const handle = normalizeInstagramHandle(body?.handle);
  const limit = normalizeLimit(body?.limit);
  if (!handle) return NextResponse.json({ error: "Instagram handle required." }, { status: 400 });

  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not configured." }, { status: 501 });

  const actor = (process.env.APIFY_INSTAGRAM_ACTOR ?? APIFY_DEFAULT_ACTOR).replace("/", "~");
  const startUrl = `https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(token)}`;

  let runId: string | null = null;
  let datasetId: string | null = null;
  try {
    const resp = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: limit,
      }),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: "Could not start Instagram import." }, { status: 502 });
    }
    const json = (await resp.json()) as { data?: { id?: string; defaultDatasetId?: string } };
    runId = json.data?.id ?? null;
    datasetId = json.data?.defaultDatasetId ?? null;
  } catch {
    return NextResponse.json({ error: "Could not reach Apify." }, { status: 504 });
  }
  if (!runId) return NextResponse.json({ error: "Apify did not return a run id." }, { status: 502 });

  // Track the job with the service-role client (RLS: no authed insert policy).
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("cp_imports")
    .insert({
      coach_id: user.id,
      source: "instagram",
      status: "processing",
      source_ref: handle,
      external_run_id: runId,
      external_dataset_id: datasetId,
    })
    .select("id")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Could not record import job." }, { status: 500 });
  }

  return NextResponse.json({ importId: row.id as string, status: "processing", handle });
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. Confirm `rateLimitByUser` signature matches the existing sync route's usage (`rateLimitByUser(user.id, key, 5, 60_000)`).

- [ ] **Step 3: Commit**

```bash
git add app/api/onboarding/import/instagram/route.ts
git commit -m "feat(import): async instagram import start endpoint"
```

---

## Task 5: Poll + finalize endpoint `GET /api/onboarding/import/[id]/status`

**Files:** Create `app/api/onboarding/import/[id]/status/route.ts`

- [ ] **Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { mapApifyStatus } from "@/lib/voice/apify-status";
import { normalizeApifyItems, processInstagramCaptions } from "@/lib/voice/instagram-import";

export const runtime = "edge";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS: coach can read own import rows.
  const { data: job } = await supabase
    .from("cp_imports")
    .select("id, coach_id, status, source, source_ref, external_run_id, external_dataset_id, items_imported, error")
    .eq("id", params.id)
    .maybeSingle();
  if (!job || job.coach_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already terminal — return as-is.
  if (job.status === "complete" || job.status === "failed") {
    return NextResponse.json({ status: job.status, itemsImported: job.items_imported, error: job.error });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ status: "processing" });

  // Poll the Apify run.
  let apifyStatus: string | null = null;
  let datasetId: string | null = (job.external_dataset_id as string | null) ?? null;
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(job.external_run_id as string)}?token=${encodeURIComponent(token)}`,
    );
    if (resp.ok) {
      const json = (await resp.json()) as { data?: { status?: string; defaultDatasetId?: string } };
      apifyStatus = json.data?.status ?? null;
      datasetId = datasetId ?? (json.data?.defaultDatasetId ?? null);
    }
  } catch {
    return NextResponse.json({ status: "processing" });
  }

  const mapped = mapApifyStatus(apifyStatus);
  const admin = createAdminClient();

  if (mapped === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  if (mapped === "failed") {
    await admin.from("cp_imports").update({
      status: "failed", error: `apify:${apifyStatus}`, completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({ status: "failed", error: `apify:${apifyStatus}` });
  }

  // SUCCEEDED → fetch dataset, process, persist.
  try {
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId ?? "")}/items?token=${encodeURIComponent(token)}&clean=true`,
    );
    const items = itemsResp.ok ? await itemsResp.json() : [];
    const captions = normalizeApifyItems(items);
    if (captions.length === 0) {
      await admin.from("cp_imports").update({
        status: "failed", error: "no_usable_captions", completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      return NextResponse.json({ status: "failed", error: "no_usable_captions" });
    }
    const result = await processInstagramCaptions(admin, job.coach_id as string, job.source_ref as string, captions);
    await admin.from("cp_imports").update({
      status: "complete",
      items_found: captions.length,
      items_imported: result.captionsUsed,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({
      status: "complete",
      itemsImported: result.captionsUsed,
      learnedPatterns: result.learnedPatterns,
    });
  } catch (err) {
    await admin.from("cp_imports").update({
      status: "failed", error: "processing_failed", completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({ status: "failed", error: "processing_failed" });
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. Confirm `processInstagramCaptions` accepts the admin `SupabaseClient` (it takes a `SupabaseClient` arg, so the service-role client works).

- [ ] **Step 3: Commit**

```bash
git add "app/api/onboarding/import/[id]/status/route.ts"
git commit -m "feat(import): async instagram import poll+finalize status endpoint"
```

---

## Task 6: Verification

- [ ] **Step 1: Full suite + typecheck** — `npm run test` (≈113 passing) and `npx tsc --noEmit` clean.
- [ ] **Step 2: Confirm no behavior change to the sync route** — read the final `return NextResponse.json({...})` of `app/api/voice/import/instagram/route.ts`; the keys must still be `profile, source, captions_used, handle, extracted_rules, learned_patterns, usage`.
- [ ] **Step 3: Reason through the async flow (document in report):** start → `cp_imports` row `processing` + Apify run id; client polls status → `processing` until `SUCCEEDED` → dataset fetched, `processInstagramCaptions` writes `cp_voice_profiles` + `cp_voice_training_sources`, row → `complete`. Failure/timeout → row `failed`. RLS blocks reading another coach's job.
- [ ] **Step 4: (Controller, post-merge)** apply `supabase/migrations/20260523_imports.sql` to the DB and smoke-test the two endpoints with a real handle.

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** Implements the spec's async Instagram import (`POST /api/onboarding/import/instagram` + `GET .../[id]/status` + `cp_imports` tracker), reusing the existing extraction. Pure target (`mapApifyStatus`) unit-tested. UI wiring is intentionally out of scope (Plan 5b).
- **Placeholder scan:** Task 3's "move bodies verbatim" is a mechanical move with the exact function list named; not a vague placeholder. Endpoints are fully written.
- **Type consistency:** `ImportStatus`, `InstagramCaption`, `ExtractedRule`, `ProcessResult`, `processInstagramCaptions`, `normalizeApifyItems`, `mapApifyStatus` names are consistent across the shared lib, the endpoints, and tests. `processInstagramCaptions` takes a `SupabaseClient` so the admin client is valid in the status endpoint.
- **Risk:** Task 3 (the move/refactor of the 666-line route) is the riskiest — it must be behavior-preserving. Verified via tsc + unchanged response shape; consider doing Task 3 inline (controller) rather than via subagent given the prior contamination + the precision required.

---

## Execution Handoff

Plan complete. Options: (1) Subagent-driven with `isolation: "worktree"` per subagent (recommended given prior contamination); (2) Inline controller execution with checkpoints (recommended for Task 3 specifically).

After this: Plan 5b (WelcomeFlow "pick one source" reframe — now unblocked, wires this async import + relocates the `onboarding_completed_at` marker, folding in the reality-questions replacement).
