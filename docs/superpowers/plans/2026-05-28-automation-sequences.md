# Automation Sequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trigger-based email automation so coaches can build sequences (trigger -> delay -> email chains) that fire automatically when leads complete quizzes or change status.

**Architecture:** Supabase pg_cron + database state machine. Trigger detection in existing API routes creates enrollment rows. pg_cron calls a Supabase Edge Function every 5 minutes to process due enrollments — resolve content, send via Resend, log results, advance to next step or mark complete.

**Tech Stack:** Next.js 14 (App Router), Supabase (pg_cron, pg_net, Edge Functions, RLS), Resend API, Zod, Vitest, TypeScript

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260528_automation_sequences.sql` | 4 tables, indexes, RLS, updated_at trigger, pg_cron job |
| `lib/types.ts` | Add Sequence, SequenceStep, SequenceEnrollment, SequenceStepLog types |
| `lib/sequence-merge.ts` | Pure function: merge tag resolution for email templates |
| `lib/sequence-triggers.ts` | `checkSequenceTriggers()` — enrollment logic |
| `lib/funnel-log.ts` | Add `checkSequenceTriggers()` call after funnel event insert |
| `app/api/v1/leads/[id]/route.ts` | Add `checkSequenceTriggers()` call on status change |
| `app/api/v1/sequences/route.ts` | GET list, POST create |
| `app/api/v1/sequences/[id]/route.ts` | GET, PATCH, DELETE single sequence |
| `app/api/v1/sequences/[id]/steps/route.ts` | GET, PUT batch replace |
| `app/api/v1/sequences/[id]/activate/route.ts` | POST activate/deactivate |
| `supabase/functions/process-sequences/index.ts` | Edge function: process due enrollments |
| `lib/timeline.ts` | Add `normalizeAutomationLogs()` + `automation_email` event kind |
| `app/sequences/page.tsx` | Server component: sequence list page |
| `components/SequenceList.tsx` | Client component: list + stats + create |
| `app/sequences/[id]/page.tsx` | Server component: sequence builder page |
| `components/SequenceBuilder.tsx` | Client component: step builder UI |
| `components/SequenceStepEditor.tsx` | Client component: single step editor |
| `components/Header.tsx` | Add "Sequences" nav link |
| `components/LeadDetail.tsx` | Add active sequences sidebar section |
| `components/ContactTimeline.tsx` | Add automation_email card rendering |
| `app/leads/[id]/page.tsx` | Add enrollment + step log queries |
| `lib/__tests__/sequence-merge.test.ts` | Tests for merge tag resolution |
| `lib/__tests__/sequence-triggers.test.ts` | Tests for trigger matching logic |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260528_automation_sequences.sql`

**Context:** This codebase uses lowercase SQL, `gen_random_uuid()` PKs, `text` columns (no Postgres enums), `timestamptz DEFAULT now()`, `jsonb DEFAULT '{}'::jsonb`, and `auth.uid() = coach_id` RLS policies. FKs reference `auth.users(id)` with `ON DELETE CASCADE`. The `cp_set_updated_at()` trigger function already exists and is reused across 13+ tables. Migrations go in `supabase/migrations/` with `YYYYMMDD_description.sql` naming. Apply via Supabase SQL editor or MCP `apply_migration`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260528_automation_sequences.sql`:

```sql
-- Automation Sequences — 4 tables for trigger-based email automation.
--
-- Tables:
--   1. cp_sequences        — the recipe (trigger + metadata)
--   2. cp_sequence_steps    — each step (position, delay, content)
--   3. cp_sequence_enrollments — lead progress through a sequence
--   4. cp_sequence_step_logs  — audit trail per step execution
--
-- Apply via Supabase SQL editor or MCP apply_migration.

-- ---------------------------------------------------------------------------
-- 1. cp_sequences — sequence definitions
-- ---------------------------------------------------------------------------

create table if not exists public.cp_sequences (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  trigger_type  text not null
                  check (trigger_type in ('quiz_completed', 'status_change')),
  trigger_config jsonb not null default '{}'::jsonb,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cp_sequences_coach_idx
  on public.cp_sequences (coach_id);

create index if not exists cp_sequences_coach_active_idx
  on public.cp_sequences (coach_id, is_active);

alter table public.cp_sequences enable row level security;

drop policy if exists "coach owns sequences" on public.cp_sequences;
create policy "coach owns sequences" on public.cp_sequences
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- Reuse existing updated_at trigger function
drop trigger if exists trg_cp_sequences_updated_at on public.cp_sequences;
create trigger trg_cp_sequences_updated_at
  before update on public.cp_sequences
  for each row execute function public.cp_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. cp_sequence_steps — step definitions (position, delay, content)
-- ---------------------------------------------------------------------------

create table if not exists public.cp_sequence_steps (
  id            uuid primary key default gen_random_uuid(),
  sequence_id   uuid not null references public.cp_sequences(id) on delete cascade,
  coach_id      uuid not null references auth.users(id) on delete cascade,
  position      int not null,
  delay_minutes int not null default 0,
  action_type   text not null default 'send_email',
  content_mode  text not null
                  check (content_mode in ('template', 'ai_draft')),
  action_config jsonb not null default '{}'::jsonb,
  ai_prompt     text,
  created_at    timestamptz not null default now()
);

create index if not exists cp_sequence_steps_seq_pos_idx
  on public.cp_sequence_steps (sequence_id, position);

create index if not exists cp_sequence_steps_coach_idx
  on public.cp_sequence_steps (coach_id);

alter table public.cp_sequence_steps enable row level security;

drop policy if exists "coach owns sequence steps" on public.cp_sequence_steps;
create policy "coach owns sequence steps" on public.cp_sequence_steps
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- No updated_at — steps are rewritten through the builder, not independently
-- updated (matches cp_brand_os_answers, cp_lead_tags pattern).

-- ---------------------------------------------------------------------------
-- 3. cp_sequence_enrollments — lead progress through a sequence
-- ---------------------------------------------------------------------------

create table if not exists public.cp_sequence_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  sequence_id           uuid not null references public.cp_sequences(id) on delete cascade,
  lead_id               uuid not null references public.cp_leads(id) on delete cascade,
  coach_id              uuid not null references auth.users(id) on delete cascade,
  current_step_id       uuid references public.cp_sequence_steps(id) on delete set null,
  status                text not null default 'active'
                          check (status in ('active', 'completed', 'cancelled', 'failed')),
  execute_at            timestamptz,
  enrolled_at           timestamptz not null default now(),
  completed_at          timestamptz,
  last_step_executed_at timestamptz,
  error                 text,
  retry_count           int not null default 0,
  created_at            timestamptz not null default now()
);

-- Partial unique: one active enrollment per lead per sequence.
-- Allows re-enrollment after completion/cancellation.
create unique index if not exists cp_sequence_enrollments_active_uq
  on public.cp_sequence_enrollments (sequence_id, lead_id)
  where status = 'active';

-- pg_cron hot-path: find enrollments due for processing
create index if not exists cp_sequence_enrollments_due_idx
  on public.cp_sequence_enrollments (execute_at)
  where status = 'active';

create index if not exists cp_sequence_enrollments_coach_idx
  on public.cp_sequence_enrollments (coach_id);

create index if not exists cp_sequence_enrollments_lead_idx
  on public.cp_sequence_enrollments (lead_id);

alter table public.cp_sequence_enrollments enable row level security;

drop policy if exists "coach owns enrollments" on public.cp_sequence_enrollments;
create policy "coach owns enrollments" on public.cp_sequence_enrollments
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- 4. cp_sequence_step_logs — audit trail per step execution
-- ---------------------------------------------------------------------------

create table if not exists public.cp_sequence_step_logs (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.cp_sequence_enrollments(id) on delete cascade,
  step_id           uuid references public.cp_sequence_steps(id) on delete set null,
  coach_id          uuid not null,
  lead_id           uuid not null,
  status            text not null
                      check (status in ('sent', 'failed', 'skipped')),
  error             text,
  resend_message_id text,
  executed_at       timestamptz not null default now()
);

create index if not exists cp_sequence_step_logs_enrollment_idx
  on public.cp_sequence_step_logs (enrollment_id);

create index if not exists cp_sequence_step_logs_lead_timeline_idx
  on public.cp_sequence_step_logs (lead_id, executed_at desc);

create index if not exists cp_sequence_step_logs_coach_idx
  on public.cp_sequence_step_logs (coach_id);

alter table public.cp_sequence_step_logs enable row level security;

-- Logs are append-only from the system (edge function uses service role).
-- Coach can only SELECT their own.
drop policy if exists "coach reads own step logs" on public.cp_sequence_step_logs;
create policy "coach reads own step logs" on public.cp_sequence_step_logs
  for select using (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- 5. Verification queries (run manually after applying)
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('cp_sequences', 'cp_sequence_steps',
--                        'cp_sequence_enrollments', 'cp_sequence_step_logs');
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_sequences' order by ordinal_position;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` tool or paste into the SQL editor at https://supabase.com/dashboard.

Run the verification queries from section 5 to confirm all 4 tables exist with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528_automation_sequences.sql
git commit -m "feat(db): add automation sequences tables

4 tables: cp_sequences, cp_sequence_steps, cp_sequence_enrollments,
cp_sequence_step_logs. Partial unique index on active enrollments,
hot-path index on execute_at for pg_cron processing."
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `lib/types.ts` (append after `SessionWebhookProvider` types, around line 607)

**Context:** Types are hand-rolled (not auto-generated) in `lib/types.ts`. Each DB table has a corresponding TypeScript type. The codebase uses `string` for uuid fields, `string` for timestamptz, `string` for text enum columns, and `Record<string, unknown>` for jsonb. Nullable columns use `| null`.

- [ ] **Step 1: Add sequence types to lib/types.ts**

Append after the `SESSION_WEBHOOK_PROVIDER_LABEL` block (around line 612):

```typescript
// ── Automation Sequences ─────────────────────────────────────────────────

export type SequenceTriggerType = "quiz_completed" | "status_change";
export type SequenceStepContentMode = "template" | "ai_draft";
export type SequenceEnrollmentStatus = "active" | "completed" | "cancelled" | "failed";
export type SequenceStepLogStatus = "sent" | "failed" | "skipped";

export type Sequence = {
  id: string;
  coach_id: string;
  name: string;
  trigger_type: SequenceTriggerType;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SequenceStep = {
  id: string;
  sequence_id: string;
  coach_id: string;
  position: number;
  delay_minutes: number;
  action_type: string;
  content_mode: SequenceStepContentMode;
  action_config: Record<string, unknown>;
  ai_prompt: string | null;
  created_at: string;
};

export type SequenceEnrollment = {
  id: string;
  sequence_id: string;
  lead_id: string;
  coach_id: string;
  current_step_id: string | null;
  status: SequenceEnrollmentStatus;
  execute_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_step_executed_at: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
};

export type SequenceStepLog = {
  id: string;
  enrollment_id: string;
  step_id: string | null;
  coach_id: string;
  lead_id: string;
  status: SequenceStepLogStatus;
  error: string | null;
  resend_message_id: string | null;
  executed_at: string;
};

/** Template merge tag action_config shape. */
export type SequenceTemplateConfig = {
  subject: string;
  body_html: string;
  reply_to?: string;
};
```

- [ ] **Step 2: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add automation sequence types

Sequence, SequenceStep, SequenceEnrollment, SequenceStepLog,
and SequenceTemplateConfig types."
```

---

### Task 3: Merge Tag Resolution

**Files:**
- Create: `lib/sequence-merge.ts`
- Create: `lib/__tests__/sequence-merge.test.ts`

**Context:** Merge tags replace `{{first_name}}`, `{{full_name}}`, `{{email}}`, `{{coach_name}}`, `{{status}}` in email templates. This is a pure function — no Supabase, no side effects. The test infrastructure uses vitest in `lib/__tests__/` with `@/` path alias.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/sequence-merge.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveMergeTags } from "@/lib/sequence-merge";

describe("resolveMergeTags", () => {
  const lead = {
    full_name: "Marcus Chen",
    email: "marcus@example.com",
    status: "qualified",
  };
  const coachName = "Sunny Binjola";

  it("replaces all known merge tags", () => {
    const template = "Hi {{first_name}}, your status is {{status}}.";
    const result = resolveMergeTags(template, lead, coachName);
    expect(result).toBe("Hi Marcus, your status is qualified.");
  });

  it("replaces {{full_name}}", () => {
    const result = resolveMergeTags("Hello {{full_name}}", lead, coachName);
    expect(result).toBe("Hello Marcus Chen");
  });

  it("replaces {{email}}", () => {
    const result = resolveMergeTags("Reply to {{email}}", lead, coachName);
    expect(result).toBe("Reply to marcus@example.com");
  });

  it("replaces {{coach_name}}", () => {
    const result = resolveMergeTags("From {{coach_name}}", lead, coachName);
    expect(result).toBe("From Sunny Binjola");
  });

  it("handles missing email gracefully", () => {
    const noEmailLead = { full_name: "Test", email: null, status: "new" };
    const result = resolveMergeTags("Email: {{email}}", noEmailLead, coachName);
    expect(result).toBe("Email: ");
  });

  it("handles single-name leads", () => {
    const singleName = { full_name: "Prince", email: null, status: "new" };
    const result = resolveMergeTags("Hi {{first_name}}", singleName, coachName);
    expect(result).toBe("Hi Prince");
  });

  it("leaves unknown tags untouched", () => {
    const result = resolveMergeTags("Hi {{unknown_tag}}", lead, coachName);
    expect(result).toBe("Hi {{unknown_tag}}");
  });

  it("handles multiple occurrences of the same tag", () => {
    const result = resolveMergeTags(
      "{{first_name}}, hey {{first_name}}!",
      lead,
      coachName
    );
    expect(result).toBe("Marcus, hey Marcus!");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/sequence-merge.test.ts 2>&1 | tail -10`
Expected: FAIL — `Cannot find module '@/lib/sequence-merge'`

- [ ] **Step 3: Write the implementation**

Create `lib/sequence-merge.ts`:

```typescript
// lib/sequence-merge.ts
//
// Pure merge-tag resolution for sequence email templates.
// No side effects, no Supabase, no network calls.
//
// Supported tags: {{first_name}}, {{full_name}}, {{email}},
// {{coach_name}}, {{status}}. Unknown tags pass through unchanged.

type MergeableLead = {
  full_name: string;
  email: string | null;
  status: string;
};

const TAG_REGEX = /\{\{(\w+)\}\}/g;

export function resolveMergeTags(
  template: string,
  lead: MergeableLead,
  coachName: string,
): string {
  const firstName = lead.full_name.split(" ")[0] ?? lead.full_name;

  const values: Record<string, string> = {
    first_name: firstName,
    full_name: lead.full_name,
    email: lead.email ?? "",
    coach_name: coachName,
    status: lead.status,
  };

  return template.replace(TAG_REGEX, (match, tag: string) => {
    return tag in values ? values[tag]! : match;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/sequence-merge.test.ts 2>&1 | tail -10`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sequence-merge.ts lib/__tests__/sequence-merge.test.ts
git commit -m "feat: add merge tag resolution for sequence templates

Replaces {{first_name}}, {{full_name}}, {{email}}, {{coach_name}},
{{status}} in email templates. 8 unit tests."
```

---

### Task 4: Trigger Detection — checkSequenceTriggers()

**Files:**
- Create: `lib/sequence-triggers.ts`
- Create: `lib/__tests__/sequence-triggers.test.ts`

**Context:** `checkSequenceTriggers()` is called from existing API routes after a quiz completion or status change. It queries active sequences matching the trigger type, guards against duplicate enrollment and missing email, then inserts an enrollment row with `execute_at` set to `now() + first_step.delay_minutes`. Uses the admin client (service role) because it runs in API routes that may not have user auth context.

The function signature: `checkSequenceTriggers(coachId, triggerType, lead, triggerMeta?)`. It's fire-and-forget — callers call it with `void` and never await.

- [ ] **Step 1: Write the test file with core logic tests**

Create `lib/__tests__/sequence-triggers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchesTriggerConfig } from "@/lib/sequence-triggers";

describe("matchesTriggerConfig", () => {
  it("quiz_completed always matches (empty config)", () => {
    expect(matchesTriggerConfig("quiz_completed", {}, {})).toBe(true);
  });

  it("status_change matches when to_status matches", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        { to_status: "qualified" },
        { to_status: "qualified" }
      )
    ).toBe(true);
  });

  it("status_change rejects when to_status differs", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        { to_status: "qualified" },
        { to_status: "booked" }
      )
    ).toBe(false);
  });

  it("status_change with empty config matches any status change", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        {},
        { to_status: "client" }
      )
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/sequence-triggers.test.ts 2>&1 | tail -10`
Expected: FAIL — `Cannot find module '@/lib/sequence-triggers'`

- [ ] **Step 3: Write the implementation**

Create `lib/sequence-triggers.ts`:

```typescript
// lib/sequence-triggers.ts
//
// Trigger detection + enrollment for automation sequences.
//
// Called fire-and-forget from existing API routes:
//   - lib/funnel-log.ts (quiz_completed)
//   - app/api/v1/leads/[id]/route.ts (status_change)
//
// Uses the admin client (service role) because it runs in contexts
// that may not have a user JWT (e.g., webhook routes).

import { createAdminClient } from "@/lib/supabase-admin";

type TriggerType = "quiz_completed" | "status_change";

type LeadContext = {
  id: string;
  coach_id: string;
  email: string | null;
};

type TriggerMeta = Record<string, unknown>;

/**
 * Check active sequences for a coach, match against the trigger event,
 * and enroll the lead if guards pass.
 *
 * Designed to be called fire-and-forget: `void checkSequenceTriggers(...)`.
 * Never throws — errors are logged and swallowed.
 */
export async function checkSequenceTriggers(
  coachId: string,
  triggerType: TriggerType,
  lead: LeadContext,
  triggerMeta: TriggerMeta = {},
): Promise<void> {
  // Guard: lead must have an email for send_email actions.
  if (!lead.email) return;

  try {
    const admin = createAdminClient();

    // 1. Find active sequences matching this trigger type for this coach.
    const { data: sequences, error: seqErr } = await admin
      .from("cp_sequences")
      .select("id, trigger_config")
      .eq("coach_id", coachId)
      .eq("trigger_type", triggerType)
      .eq("is_active", true);

    if (seqErr || !sequences || sequences.length === 0) return;

    for (const seq of sequences) {
      // 2. Match trigger_config against the event metadata.
      const config = (seq.trigger_config ?? {}) as Record<string, unknown>;
      if (!matchesTriggerConfig(triggerType, config, triggerMeta)) continue;

      // 3. Check if lead is already actively enrolled in this sequence.
      //    The partial unique index also enforces this, but checking first
      //    avoids a noisy constraint violation error in logs.
      const { data: existing } = await admin
        .from("cp_sequence_enrollments")
        .select("id")
        .eq("sequence_id", seq.id)
        .eq("lead_id", lead.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) continue;

      // 4. Get the first step (position = 1) and its delay.
      const { data: firstStep } = await admin
        .from("cp_sequence_steps")
        .select("id, delay_minutes")
        .eq("sequence_id", seq.id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstStep) continue; // Sequence has no steps — skip.

      // 5. Enroll: insert with execute_at = now() + delay.
      const delayMs = (firstStep.delay_minutes ?? 0) * 60 * 1000;
      const executeAt = new Date(Date.now() + delayMs).toISOString();

      await admin.from("cp_sequence_enrollments").insert({
        sequence_id: seq.id,
        lead_id: lead.id,
        coach_id: coachId,
        current_step_id: firstStep.id,
        status: "active",
        execute_at: executeAt,
      });
    }
  } catch (err) {
    // Fire-and-forget: never throw. Log for debugging.
    console.warn("[sequence-triggers] enrollment failed:", err);
  }
}

/**
 * Pure function: does the sequence's trigger_config match the event metadata?
 *
 * Exported for unit testing.
 */
export function matchesTriggerConfig(
  triggerType: TriggerType,
  config: Record<string, unknown>,
  meta: TriggerMeta,
): boolean {
  if (triggerType === "quiz_completed") {
    // quiz_completed fires on any quiz completion — config is always {}.
    return true;
  }

  if (triggerType === "status_change") {
    // If config specifies a to_status, it must match the event's to_status.
    // If config is empty, any status change matches.
    if (config.to_status && config.to_status !== meta.to_status) {
      return false;
    }
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/sequence-triggers.test.ts 2>&1 | tail -10`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sequence-triggers.ts lib/__tests__/sequence-triggers.test.ts
git commit -m "feat: add sequence trigger detection and enrollment

checkSequenceTriggers() queries active sequences, matches trigger
config, guards against duplicate enrollment and missing email,
inserts enrollment with execute_at delay. 4 unit tests."
```

---

### Task 5: Wire Triggers Into Existing Routes

**Files:**
- Modify: `lib/funnel-log.ts`
- Modify: `app/api/v1/leads/[id]/route.ts`

**Context:**

`lib/funnel-log.ts` currently has one function `logFunnelEvent()` that fire-and-forget inserts into `cp_funnel_events`. We add a call to `checkSequenceTriggers()` after the insert. The tricky part: `logFunnelEvent` doesn't receive the full lead — it only gets `coachId` and `name`. We need to also accept an optional `lead` parameter for the cases where the caller has one (quiz completion paths).

`app/api/v1/leads/[id]/route.ts` PATCH handler updates lead fields. When `status` changes, we call `checkSequenceTriggers()`. The current code at line 93-100 does the update and returns. We add the trigger call between the update succeeding and the response.

- [ ] **Step 1: Modify lib/funnel-log.ts**

Current file (25 lines). Replace the entire file with:

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
import { checkSequenceTriggers } from "@/lib/sequence-triggers";

type LeadContext = {
  id: string;
  coach_id: string;
  email: string | null;
};

export async function logFunnelEvent(
  coachId: string | null | undefined,
  name: FunnelEventName,
  meta: Record<string, unknown> = {},
  /** Optional lead context for sequence trigger detection. */
  lead?: LeadContext,
): Promise<void> {
  if (!coachId || !isFunnelEvent(name)) return;
  try {
    const admin = createAdminClient();
    await admin.from("cp_funnel_events").insert({ coach_id: coachId, name, meta });

    // Fire sequence triggers for quiz completion events.
    if (name === "quiz_completed" && lead) {
      void checkSequenceTriggers(coachId, "quiz_completed", lead);
    }
  } catch (err) {
    console.warn("[funnel] log failed:", name, err);
  }
}
```

- [ ] **Step 2: Modify the PATCH handler in app/api/v1/leads/[id]/route.ts**

Add the import at the top of the file (after existing imports, around line 6):

```typescript
import { checkSequenceTriggers } from "@/lib/sequence-triggers";
```

Add the trigger call in the PATCH function, between the successful update check and the return (after line 104 `if (!data) return apiError("Lead not found", 404);`):

```typescript
  // Fire sequence triggers when status changes.
  if (patch.status && data.status === patch.status) {
    void checkSequenceTriggers(auth.coachId, "status_change", {
      id: data.id,
      coach_id: data.coach_id,
      email: data.email,
    }, { to_status: patch.status });
  }
```

The full PATCH function return section becomes:

```typescript
  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Lead not found", 404);

  // Fire sequence triggers when status changes.
  if (patch.status && data.status === patch.status) {
    void checkSequenceTriggers(auth.coachId, "status_change", {
      id: data.id,
      coach_id: data.coach_id,
      email: data.email,
    }, { to_status: patch.status });
  }

  return apiOk({ lead: data });
```

- [ ] **Step 3: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/funnel-log.ts app/api/v1/leads/\[id\]/route.ts
git commit -m "feat: wire sequence triggers into funnel log and lead status change

logFunnelEvent() now accepts optional lead context and fires
checkSequenceTriggers on quiz_completed. PATCH /api/v1/leads/[id]
fires triggers on status change."
```

---

### Task 6: Sequence CRUD API Routes

**Files:**
- Create: `app/api/v1/sequences/route.ts`
- Create: `app/api/v1/sequences/[id]/route.ts`
- Create: `app/api/v1/sequences/[id]/steps/route.ts`
- Create: `app/api/v1/sequences/[id]/activate/route.ts`

**Context:** All v1 API routes follow the same pattern:
- `export const runtime = 'edge';`
- Import `validateApiKey, apiError, apiOk` from `@/lib/api-auth`
- Import `createAdminClient` from `@/lib/supabase-admin`
- Import `parseBody` + Zod schemas from `@/lib/api-validation`
- Auth: `const auth = await validateApiKey(request); if (!auth) return apiError("Unauthorized", 401);`
- Write ops: check `auth.scopes.includes("write")`
- All queries scope by `.eq("coach_id", auth.coachId)`

- [ ] **Step 1: Create app/api/v1/sequences/route.ts**

```typescript
// GET  /api/v1/sequences     — list coach's sequences with stats
// POST /api/v1/sequences     — create a new draft sequence

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const CreateSequenceSchema = z.object({
  name: z.string().min(1).max(200),
  trigger_type: z.enum(["quiz_completed", "status_change"]),
  trigger_config: z.record(z.unknown()).optional().default({}),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();

  // Fetch sequences with step count.
  const { data: sequences, error } = await admin
    .from("cp_sequences")
    .select("*")
    .eq("coach_id", auth.coachId)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  // Fetch step counts per sequence.
  const seqIds = (sequences ?? []).map((s: { id: string }) => s.id);
  let stepCounts: Record<string, number> = {};
  if (seqIds.length > 0) {
    const { data: steps } = await admin
      .from("cp_sequence_steps")
      .select("sequence_id")
      .in("sequence_id", seqIds);

    stepCounts = (steps ?? []).reduce(
      (acc: Record<string, number>, s: { sequence_id: string }) => {
        acc[s.sequence_id] = (acc[s.sequence_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  // Fetch enrollment stats per sequence.
  let enrollmentStats: Record<string, { enrolled: number; completed: number; failed: number }> = {};
  if (seqIds.length > 0) {
    const { data: enrollments } = await admin
      .from("cp_sequence_enrollments")
      .select("sequence_id, status")
      .in("sequence_id", seqIds);

    enrollmentStats = (enrollments ?? []).reduce(
      (acc: Record<string, { enrolled: number; completed: number; failed: number }>, e: { sequence_id: string; status: string }) => {
        if (!acc[e.sequence_id]) acc[e.sequence_id] = { enrolled: 0, completed: 0, failed: 0 };
        acc[e.sequence_id]!.enrolled++;
        if (e.status === "completed") acc[e.sequence_id]!.completed++;
        if (e.status === "failed") acc[e.sequence_id]!.failed++;
        return acc;
      },
      {} as Record<string, { enrolled: number; completed: number; failed: number }>
    );
  }

  const enriched = (sequences ?? []).map((seq: Record<string, unknown>) => ({
    ...seq,
    step_count: stepCounts[seq.id as string] ?? 0,
    stats: enrollmentStats[seq.id as string] ?? { enrolled: 0, completed: 0, failed: 0 },
  }));

  return apiOk({ sequences: enriched });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, CreateSequenceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequences")
    .insert({
      coach_id: auth.coachId,
      name: parsed.data.name,
      trigger_type: parsed.data.trigger_type,
      trigger_config: parsed.data.trigger_config,
      is_active: false,
    })
    .select("*")
    .single();

  if (error || !data) return apiError(error?.message ?? "Insert failed", 500);
  return apiOk({ sequence: data }, 201);
}
```

- [ ] **Step 2: Create app/api/v1/sequences/[id]/route.ts**

```typescript
// GET    /api/v1/sequences/[id]  — fetch a single sequence with steps
// PATCH  /api/v1/sequences/[id]  — update sequence metadata
// DELETE /api/v1/sequences/[id]  — delete a sequence (cascades steps + enrollments)

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const PatchSequenceSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    trigger_type: z.enum(["quiz_completed", "status_change"]).optional(),
    trigger_config: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "must include at least one field to update",
  });

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();

  const [{ data: sequence, error: seqErr }, { data: steps }] = await Promise.all([
    admin
      .from("cp_sequences")
      .select("*")
      .eq("id", params.id)
      .eq("coach_id", auth.coachId)
      .maybeSingle(),
    admin
      .from("cp_sequence_steps")
      .select("*")
      .eq("sequence_id", params.id)
      .eq("coach_id", auth.coachId)
      .order("position", { ascending: true }),
  ]);

  if (seqErr) return apiError(seqErr.message, 500);
  if (!sequence) return apiError("Sequence not found", 404);

  return apiOk({ sequence, steps: steps ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, PatchSequenceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequences")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Sequence not found", 404);

  return apiOk({ sequence: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const admin = createAdminClient();
  const { error } = await admin
    .from("cp_sequences")
    .delete()
    .eq("id", params.id)
    .eq("coach_id", auth.coachId);

  if (error) return apiError(error.message, 500);
  return apiOk({ deleted: true });
}
```

- [ ] **Step 3: Create app/api/v1/sequences/[id]/steps/route.ts**

```typescript
// GET /api/v1/sequences/[id]/steps  — list steps for a sequence
// PUT /api/v1/sequences/[id]/steps  — batch replace all steps

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const StepSchema = z.object({
  position: z.number().int().min(1),
  delay_minutes: z.number().int().min(0).default(0),
  action_type: z.string().default("send_email"),
  content_mode: z.enum(["template", "ai_draft"]),
  action_config: z.record(z.unknown()).default({}),
  ai_prompt: z.string().max(2000).nullable().default(null),
});

const BatchReplaceSchema = z.object({
  steps: z.array(StepSchema).min(0).max(20),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .eq("coach_id", auth.coachId)
    .order("position", { ascending: true });

  if (error) return apiError(error.message, 500);
  return apiOk({ steps: data ?? [] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, BatchReplaceSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();

  // Verify sequence belongs to coach.
  const { data: seq } = await admin
    .from("cp_sequences")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();

  if (!seq) return apiError("Sequence not found", 404);

  // Delete existing steps, insert new ones.
  await admin
    .from("cp_sequence_steps")
    .delete()
    .eq("sequence_id", params.id)
    .eq("coach_id", auth.coachId);

  if (parsed.data.steps.length > 0) {
    const rows = parsed.data.steps.map((step) => ({
      ...step,
      sequence_id: params.id,
      coach_id: auth.coachId,
    }));

    const { error: insertErr } = await admin
      .from("cp_sequence_steps")
      .insert(rows);

    if (insertErr) return apiError(insertErr.message, 500);
  }

  // Return the fresh list.
  const { data: fresh } = await admin
    .from("cp_sequence_steps")
    .select("*")
    .eq("sequence_id", params.id)
    .order("position", { ascending: true });

  return apiOk({ steps: fresh ?? [] });
}
```

- [ ] **Step 4: Create app/api/v1/sequences/[id]/activate/route.ts**

```typescript
// POST /api/v1/sequences/[id]/activate  — activate or deactivate a sequence
//
// Body: { active: true } or { active: false }
// Guards: at least 1 step with valid content required for activation.

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { parseBody } from "@/lib/api-validation";

export const runtime = "edge";

const ActivateSchema = z.object({
  active: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  const parsed = await parseBody(request, ActivateSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);

  const admin = createAdminClient();

  // Verify sequence belongs to coach.
  const { data: seq } = await admin
    .from("cp_sequences")
    .select("id, is_active")
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .maybeSingle();

  if (!seq) return apiError("Sequence not found", 404);

  if (parsed.data.active) {
    // Activation guard: at least 1 step with valid content.
    const { data: steps } = await admin
      .from("cp_sequence_steps")
      .select("id, content_mode, action_config, ai_prompt")
      .eq("sequence_id", params.id);

    if (!steps || steps.length === 0) {
      return apiError("Cannot activate: sequence has no steps", 422);
    }

    // Each step must have content — template needs subject+body, ai_draft needs prompt.
    for (const step of steps) {
      if (step.content_mode === "template") {
        const config = (step.action_config ?? {}) as Record<string, unknown>;
        if (!config.subject || !config.body_html) {
          return apiError(
            "Cannot activate: template step missing subject or body",
            422
          );
        }
      } else if (step.content_mode === "ai_draft") {
        if (!step.ai_prompt) {
          return apiError(
            "Cannot activate: AI draft step missing prompt",
            422
          );
        }
      }
    }
  }

  // Update is_active.
  const { data, error } = await admin
    .from("cp_sequences")
    .update({ is_active: parsed.data.active })
    .eq("id", params.id)
    .eq("coach_id", auth.coachId)
    .select("*")
    .single();

  if (error) return apiError(error.message, 500);
  return apiOk({ sequence: data });
}
```

- [ ] **Step 5: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/sequences/
git commit -m "feat(api): add sequence CRUD + activate endpoints

GET/POST /api/v1/sequences — list and create.
GET/PATCH/DELETE /api/v1/sequences/[id] — single sequence ops.
GET/PUT /api/v1/sequences/[id]/steps — batch replace steps.
POST /api/v1/sequences/[id]/activate — with content validation."
```

---

### Task 7: Edge Function — process-sequences

**Files:**
- Create: `supabase/functions/process-sequences/index.ts`

**Context:** Supabase Edge Functions use Deno runtime. Imports from `jsr:@supabase/supabase-js@2` and `jsr:@supabase/functions-js/edge-runtime.d.ts`. Uses `Deno.env.get()` for env vars. The existing `auto-draft-response` function is the reference pattern. This function is called by pg_cron every 5 minutes (or manually via `supabase functions invoke`).

The function processes enrollments where `status = 'active' AND execute_at <= now()`, resolves content (template merge tags or AI draft), sends via Resend, logs results, and advances to the next step or marks complete.

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/process-sequences/index.ts`:

```typescript
// Edge Function: process-sequences
//
// The execution engine for automation sequences. Called by pg_cron every
// 5 minutes (or manually for testing). Processes up to 50 due enrollments
// per invocation.
//
// Flow per enrollment:
//   1. Load step + lead
//   2. Resolve content (template merge tags OR AI draft)
//   3. Resolve sender (coach BYOK Resend → platform fallback)
//   4. Send email via Resend
//   5. Log result to cp_sequence_step_logs
//   6. Advance to next step or mark complete
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

Deno.serve(async (_req: Request) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return json({ error: "Missing SUPABASE config" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Fetch due enrollments.
  const { data: enrollments, error: fetchErr } = await supabase
    .from("cp_sequence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("execute_at", new Date().toISOString())
    .order("execute_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!enrollments || enrollments.length === 0) {
    return json({ processed: 0, message: "No due enrollments" });
  }

  let processed = 0;
  let failed = 0;

  for (const enrollment of enrollments) {
    try {
      await processEnrollment(supabase, enrollment);
      processed++;
    } catch (err) {
      console.error("[process-sequences] enrollment error:", enrollment.id, err);
      failed++;
    }
  }

  return json({ processed, failed, total: enrollments.length });
});

async function processEnrollment(supabase: any, enrollment: any) {
  // Skip if current_step_id is null (step was deleted mid-run).
  if (!enrollment.current_step_id) {
    await advanceToNextStep(supabase, enrollment, null);
    return;
  }

  // Load the step.
  const { data: step } = await supabase
    .from("cp_sequence_steps")
    .select("*")
    .eq("id", enrollment.current_step_id)
    .maybeSingle();

  if (!step) {
    // Step deleted — skip and advance.
    await logStepResult(supabase, enrollment, null, "skipped", null, "Step deleted");
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Load the lead.
  const { data: lead } = await supabase
    .from("cp_leads")
    .select("id, full_name, email, status, coach_id")
    .eq("id", enrollment.lead_id)
    .maybeSingle();

  if (!lead || !lead.email) {
    await logStepResult(supabase, enrollment, step.id, "skipped", null, "Lead missing or no email");
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Resolve content.
  let subject: string;
  let bodyHtml: string;
  let replyTo: string | undefined;

  if (step.content_mode === "template") {
    const config = step.action_config ?? {};
    const coachName = await getCoachName(supabase, enrollment.coach_id);
    subject = resolveTags(config.subject ?? "", lead, coachName);
    bodyHtml = resolveTags(config.body_html ?? "", lead, coachName);
    replyTo = config.reply_to;
  } else if (step.content_mode === "ai_draft") {
    try {
      const drafted = await generateAiDraft(supabase, enrollment.coach_id, lead, step.ai_prompt);
      subject = drafted.subject;
      bodyHtml = drafted.bodyHtml;
    } catch (err) {
      // AI draft failure: skip step, log, advance.
      await logStepResult(supabase, enrollment, step.id, "skipped", null, `AI draft failed: ${err}`);
      await advanceToNextStep(supabase, enrollment, step);
      return;
    }
  } else {
    await logStepResult(supabase, enrollment, step.id, "skipped", null, `Unknown content_mode: ${step.content_mode}`);
    await advanceToNextStep(supabase, enrollment, step);
    return;
  }

  // Resolve sender.
  const sender = await resolveResendSender(supabase, enrollment.coach_id);
  if (!sender) {
    await handleSendFailure(supabase, enrollment, step, "No Resend sender configured");
    return;
  }

  // Send email.
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender.from,
        to: lead.email,
        subject,
        html: bodyHtml,
        reply_to: replyTo,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      throw new Error(`Resend ${resendRes.status}: ${detail.slice(0, 300)}`);
    }

    const result = await resendRes.json();
    const messageId = result?.id ?? null;

    await logStepResult(supabase, enrollment, step.id, "sent", messageId, null);
    await advanceToNextStep(supabase, enrollment, step);
  } catch (err) {
    await handleSendFailure(supabase, enrollment, step, String(err));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function advanceToNextStep(supabase: any, enrollment: any, currentStep: any | null) {
  if (!currentStep) {
    // No current step — mark complete.
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        execute_at: null,
        last_step_executed_at: new Date().toISOString(),
      })
      .eq("id", enrollment.id);
    return;
  }

  // Find next step by position.
  const { data: nextStep } = await supabase
    .from("cp_sequence_steps")
    .select("id, delay_minutes")
    .eq("sequence_id", enrollment.sequence_id)
    .gt("position", currentStep.position)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextStep) {
    const delayMs = (nextStep.delay_minutes ?? 0) * 60 * 1000;
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        current_step_id: nextStep.id,
        execute_at: new Date(Date.now() + delayMs).toISOString(),
        last_step_executed_at: new Date().toISOString(),
        retry_count: 0,
        error: null,
      })
      .eq("id", enrollment.id);
  } else {
    // No more steps — mark complete.
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        execute_at: null,
        last_step_executed_at: new Date().toISOString(),
      })
      .eq("id", enrollment.id);
  }
}

async function handleSendFailure(supabase: any, enrollment: any, step: any, errorMsg: string) {
  const newRetry = (enrollment.retry_count ?? 0) + 1;

  if (newRetry >= MAX_RETRIES) {
    // Max retries exceeded — mark enrollment as failed.
    await logStepResult(supabase, enrollment, step.id, "failed", null, errorMsg);
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        status: "failed",
        error: errorMsg,
        retry_count: newRetry,
      })
      .eq("id", enrollment.id);
  } else {
    // Increment retry, leave execute_at unchanged (retry next cycle).
    await logStepResult(supabase, enrollment, step.id, "failed", null, `Retry ${newRetry}/${MAX_RETRIES}: ${errorMsg}`);
    await supabase
      .from("cp_sequence_enrollments")
      .update({
        retry_count: newRetry,
        error: errorMsg,
      })
      .eq("id", enrollment.id);
  }
}

async function logStepResult(
  supabase: any,
  enrollment: any,
  stepId: string | null,
  status: string,
  resendMessageId: string | null,
  error: string | null
) {
  await supabase.from("cp_sequence_step_logs").insert({
    enrollment_id: enrollment.id,
    step_id: stepId,
    coach_id: enrollment.coach_id,
    lead_id: enrollment.lead_id,
    status,
    error,
    resend_message_id: resendMessageId,
  });
}

// ── Merge tags (duplicated from lib/sequence-merge.ts for edge function
//    isolation — edge functions can't import from the Next.js app) ─────

function resolveTags(template: string, lead: any, coachName: string): string {
  const firstName = (lead.full_name ?? "").split(" ")[0] ?? "";
  const values: Record<string, string> = {
    first_name: firstName,
    full_name: lead.full_name ?? "",
    email: lead.email ?? "",
    coach_name: coachName,
    status: lead.status ?? "",
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match: string, tag: string) => {
    return tag in values ? values[tag]! : match;
  });
}

async function getCoachName(supabase: any, coachId: string): Promise<string> {
  const { data } = await supabase.auth.admin.getUserById(coachId);
  return data?.user?.user_metadata?.full_name ?? data?.user?.email ?? "Your Coach";
}

// ── Resend sender resolution (duplicated from lib/email/coach-resend.ts
//    for edge function isolation) ──────────────────────────────────────

type Sender = { apiKey: string; from: string };

async function resolveResendSender(supabase: any, coachId: string): Promise<Sender | null> {
  // Try coach BYOK first.
  const { data: settings } = await supabase
    .from("cp_coach_settings")
    .select("resend_api_key_ciphertext, resend_api_key_iv, resend_from_email, resend_from_name")
    .eq("coach_id", coachId)
    .maybeSingle();

  // Coach BYOK requires decryption — skip for edge function simplicity.
  // In v1, the edge function always uses the platform key.
  // TODO: Add decryption support if BYOK is needed from edge functions.

  const platformKey = Deno.env.get("RESEND_API_KEY");
  if (platformKey) {
    return {
      apiKey: platformKey,
      from: Deno.env.get("RESEND_FROM") ?? "Brand OS <brand-os@elevateaisystem.com>",
    };
  }

  return null;
}

// ── AI Draft ────────────────────────────────────────────────────────────

async function generateAiDraft(
  supabase: any,
  coachId: string,
  lead: any,
  prompt: string
): Promise<{ subject: string; bodyHtml: string }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Load coach's voice profile for tone matching.
  const { data: voiceProfile } = await supabase
    .from("cp_voice_profiles")
    .select("voice_json, sample_messages")
    .eq("coach_id", coachId)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const voiceCtx = voiceProfile
    ? `VOICE PROFILE:\n${JSON.stringify(voiceProfile.voice_json, null, 2)}\n\nSAMPLES:\n${(voiceProfile.sample_messages ?? []).slice(0, 3).join("\n")}`
    : "No voice profile available. Write in a warm, professional coaching tone.";

  const coachName = await getCoachName(supabase, coachId);

  const systemPrompt = [
    "You are drafting a follow-up email in a coach's voice as part of an automated sequence.",
    "Output JSON with two fields: { \"subject\": \"...\", \"body_html\": \"...\" }",
    "The body_html should use simple HTML (p tags, br tags). No complex formatting.",
    "Do NOT use em-dashes. Keep it under 200 words.",
    "",
    voiceCtx,
  ].join("\n");

  const userPrompt = [
    `INSTRUCTION: ${prompt}`,
    "",
    `LEAD: ${lead.full_name} (${lead.email}), status: ${lead.status}`,
    `COACH: ${coachName}`,
  ].join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  const result = await res.json();
  const content = result?.content?.[0]?.text ?? "";

  // Parse JSON from response.
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response not valid JSON");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.subject || !parsed.body_html) {
    throw new Error("AI response missing subject or body_html");
  }

  return { subject: parsed.subject, bodyHtml: parsed.body_html };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/process-sequences/
git commit -m "feat: add process-sequences edge function

Execution engine: fetches due enrollments, resolves template or
AI-drafted content, sends via Resend, logs results, advances to
next step or marks complete. Handles retries (3 max) and failures."
```

---

### Task 8: Timeline Integration

**Files:**
- Modify: `lib/timeline.ts` (add type + normalizer)
- Modify: `components/ContactTimeline.tsx` (add automation event rendering)

**Context:** `lib/timeline.ts` has a `TimelineEventKind` union type and normalizer functions per event type. A `mergeTimeline()` function combines all sources. `components/ContactTimeline.tsx` renders events with kind-specific cards. The existing kinds are: `message_outbound`, `message_inbound`, `session`, `payment`, `brand_os`, `quiz`, `status_change`, `lead_created`.

- [ ] **Step 1: Add automation_email to TimelineEventKind**

In `lib/timeline.ts`, update the `TimelineEventKind` type (line 15-23) to include `automation_email`:

```typescript
export type TimelineEventKind =
  | "message_outbound"
  | "message_inbound"
  | "session"
  | "payment"
  | "brand_os"
  | "quiz"
  | "status_change"
  | "lead_created"
  | "automation_email";
```

- [ ] **Step 2: Add the normalizeAutomationLogs function**

Add after the `normalizeLeadLifecycle` function (after line 200), before the `mergeTimeline` function:

```typescript
type AutomationLogRow = {
  id: string;
  enrollment_id: string;
  step_id: string | null;
  coach_id: string;
  lead_id: string;
  status: string;
  error: string | null;
  resend_message_id: string | null;
  executed_at: string;
  /** Joined from cp_sequences via enrollment. */
  sequence_name?: string;
  /** Joined from cp_sequence_steps. */
  step_position?: number;
};

export function normalizeAutomationLogs(
  logs: AutomationLogRow[]
): TimelineEvent[] {
  return logs.map((log) => {
    const failed = log.status === "failed";
    const skipped = log.status === "skipped";
    const stepLabel = log.step_position ? `Step ${log.step_position}` : "Step";
    const seqLabel = log.sequence_name ?? "Sequence";

    let title: string;
    if (failed) {
      title = `${seqLabel} — ${stepLabel} failed`;
    } else if (skipped) {
      title = `${seqLabel} — ${stepLabel} skipped`;
    } else {
      title = `${seqLabel} — ${stepLabel} sent`;
    }

    return {
      id: `auto-${log.id}`,
      kind: "automation_email" as const,
      timestamp: log.executed_at,
      title,
      subtitle: log.error ?? undefined,
      accent: failed ? "none" : ("indigo" as const),
      metadata: {
        status: log.status,
        enrollment_id: log.enrollment_id,
      },
    };
  });
}
```

- [ ] **Step 3: Add automation event rendering in ContactTimeline.tsx**

Read `components/ContactTimeline.tsx` first to find the event card rendering section, then add an `automation_email` case.

In the event card rendering (the switch/if-else block that handles each `kind`), add:

```tsx
{ev.kind === "automation_email" && (
  <div className="flex items-center gap-2">
    <span className="text-base">⚡</span>
    <div className="min-w-0 flex-1">
      <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
        {ev.title}
      </p>
      {ev.subtitle && (
        <p className="text-[length:var(--t-micro)] text-[color:var(--text-muted)] truncate">
          {ev.subtitle}
        </p>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/timeline.ts components/ContactTimeline.tsx
git commit -m "feat: add automation_email to contact timeline

normalizeAutomationLogs() converts step logs to timeline events.
ContactTimeline renders with lightning bolt icon and indigo accent."
```

---

### Task 9: Sequences List Page

**Files:**
- Create: `app/sequences/page.tsx`
- Create: `components/SequenceList.tsx`

**Context:** Server components use `createClient()` from `@/lib/supabase-server` (cookie auth, RLS), auth via `supabase.auth.getUser()`, redirect to `/login` if unauthenticated. Client components use `createClient()` from `@/lib/supabase-browser` for mutations. The funnels page (`app/funnels/page.tsx`) is the closest pattern to follow.

- [ ] **Step 1: Create the server component**

Create `app/sequences/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SequenceList from "@/components/SequenceList";
import { loadNavUnlocks } from "@/lib/nav-unlocks";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [navUnlocks, { data: sequences }, { data: stepRows }, { data: enrollmentRows }] =
    await Promise.all([
      loadNavUnlocks(supabase, user.id),
      supabase
        .from("cp_sequences")
        .select("*")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cp_sequence_steps")
        .select("sequence_id")
        .eq("coach_id", user.id),
      supabase
        .from("cp_sequence_enrollments")
        .select("sequence_id, status")
        .eq("coach_id", user.id),
    ]);

  // Compute step counts per sequence.
  const stepCounts: Record<string, number> = {};
  for (const s of stepRows ?? []) {
    const sid = (s as { sequence_id: string }).sequence_id;
    stepCounts[sid] = (stepCounts[sid] ?? 0) + 1;
  }

  // Compute enrollment stats per sequence.
  const stats: Record<string, { enrolled: number; completed: number; failed: number }> = {};
  for (const e of enrollmentRows ?? []) {
    const sid = (e as { sequence_id: string; status: string }).sequence_id;
    const st = (e as { sequence_id: string; status: string }).status;
    if (!stats[sid]) stats[sid] = { enrolled: 0, completed: 0, failed: 0 };
    stats[sid]!.enrolled++;
    if (st === "completed") stats[sid]!.completed++;
    if (st === "failed") stats[sid]!.failed++;
  }

  const enriched = (sequences ?? []).map((seq: Record<string, unknown>) => ({
    ...seq,
    step_count: stepCounts[seq.id as string] ?? 0,
    stats: stats[seq.id as string] ?? { enrolled: 0, completed: 0, failed: 0 },
  }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-5xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <SequenceList sequences={enriched} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create the client component**

Create `components/SequenceList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type SequenceWithStats = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  step_count: number;
  stats: { enrolled: number; completed: number; failed: number };
};

type Props = {
  sequences: SequenceWithStats[];
};

const TRIGGER_LABELS: Record<string, string> = {
  quiz_completed: "Quiz completed",
  status_change: "Status change",
};

export default function SequenceList({ sequences: initial }: Props) {
  const router = useRouter();
  const [sequences] = useState(initial);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cp_sequences")
        .insert({
          coach_id: user.id,
          name: "New Sequence",
          trigger_type: "quiz_completed",
          trigger_config: {},
          is_active: false,
        })
        .select("id")
        .single();

      if (error || !data) {
        console.error("Failed to create sequence:", error);
        return;
      }

      router.push(`/sequences/${data.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--text)]">
            Sequences
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
            Automated email chains triggered by events
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 h-10 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Sequence
        </button>
      </div>

      {/* Sequence cards */}
      {sequences.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-[var(--r-lg)] p-12 text-center">
          <Zap size={32} className="mx-auto mb-3 text-[color:var(--text-muted)]" />
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] font-bold">
            Create your first sequence to start automating follow-ups
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((seq) => (
            <a
              key={seq.id}
              href={`/sequences/${seq.id}`}
              className="block bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition"
              style={{
                borderLeftWidth: "3px",
                borderLeftColor: seq.is_active
                  ? "var(--brand)"
                  : "var(--border)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] truncate">
                      {seq.name}
                    </span>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--t-micro)] font-bold ${
                        seq.is_active
                          ? "bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[color:var(--brand)]"
                          : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"
                      }`}
                    >
                      {seq.is_active ? "Active" : "Draft"}
                    </span>
                  </div>
                  <p className="text-[length:var(--t-micro)] text-[color:var(--text-muted)] mt-1">
                    Trigger: {TRIGGER_LABELS[seq.trigger_type] ?? seq.trigger_type}
                    {seq.trigger_type === "status_change" && seq.trigger_config?.to_status
                      ? ` → ${seq.trigger_config.to_status}`
                      : ""}
                    {" · "}
                    {seq.step_count} step{seq.step_count !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Stats */}
                {seq.stats.enrolled > 0 && (
                  <div className="flex gap-4 shrink-0 ml-4">
                    <div className="text-center">
                      <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--brand)]">
                        {seq.stats.enrolled}
                      </div>
                      <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                        enrolled
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--accent-indigo,#6366f1)]">
                        {seq.stats.completed}
                      </div>
                      <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                        completed
                      </div>
                    </div>
                    {seq.stats.failed > 0 && (
                      <div className="text-center">
                        <div className="text-[length:var(--t-heading)] font-extrabold text-[color:var(--danger)]">
                          {seq.stats.failed}
                        </div>
                        <div className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                          failed
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add app/sequences/page.tsx components/SequenceList.tsx
git commit -m "feat(ui): add sequences list page

Server component loads sequences with step counts and enrollment
stats. Client component renders card list with active/draft badges,
trigger labels, stats, and empty state. Create button inserts a
draft and navigates to the builder."
```

---

### Task 10: Sequence Builder Page

**Files:**
- Create: `app/sequences/[id]/page.tsx`
- Create: `components/SequenceBuilder.tsx`
- Create: `components/SequenceStepEditor.tsx`

**Context:** The builder is the sequence detail page — name input, trigger selector, vertical timeline of steps with delay indicators between them, "Add Step" button, Save/Activate actions. Each step can be template mode (subject + body rich text) or AI draft mode (prompt textarea). Follow the funnels page pattern for server/client split.

- [ ] **Step 1: Create the server component**

Create `app/sequences/[id]/page.tsx`:

```typescript
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SequenceBuilder from "@/components/SequenceBuilder";
import { loadNavUnlocks } from "@/lib/nav-unlocks";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SequenceBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [navUnlocks, { data: sequence }, { data: steps }] = await Promise.all([
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_sequences")
      .select("*")
      .eq("id", params.id)
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_sequence_steps")
      .select("*")
      .eq("sequence_id", params.id)
      .eq("coach_id", user.id)
      .order("position", { ascending: true }),
  ]);

  if (!sequence) notFound();

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <SequenceBuilder
          sequence={sequence as any}
          initialSteps={(steps ?? []) as any[]}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create components/SequenceStepEditor.tsx**

```tsx
"use client";

import { Trash2 } from "lucide-react";

export type StepData = {
  id?: string;
  position: number;
  delay_minutes: number;
  content_mode: "template" | "ai_draft";
  action_config: {
    subject?: string;
    body_html?: string;
    reply_to?: string;
  };
  ai_prompt: string | null;
};

type Props = {
  step: StepData;
  index: number;
  isLast: boolean;
  onChange: (updated: StepData) => void;
  onDelete: () => void;
};

const DELAY_PRESETS = [
  { label: "Immediately", minutes: 0 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
];

export default function SequenceStepEditor({
  step,
  index,
  isLast,
  onChange,
  onDelete,
}: Props) {
  const isTemplate = step.content_mode === "template";
  const stepColor = isTemplate ? "var(--brand)" : "var(--accent-indigo, #6366f1)";

  function updateField<K extends keyof StepData>(key: K, value: StepData[K]) {
    onChange({ ...step, [key]: value });
  }

  function updateConfig(key: string, value: string) {
    onChange({
      ...step,
      action_config: { ...step.action_config, [key]: value },
    });
  }

  return (
    <div>
      {/* Step card with timeline connector */}
      <div className="flex gap-3">
        {/* Timeline indicator */}
        <div className="flex flex-col items-center w-7 shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[length:var(--t-micro)] font-extrabold"
            style={{ backgroundColor: stepColor, color: isTemplate ? "var(--navy)" : "#fff" }}
          >
            {index + 1}
          </div>
          {!isLast && (
            <div className="w-0.5 flex-1 bg-[var(--border)] mt-1 mb-1" />
          )}
        </div>

        {/* Step content */}
        <div
          className="flex-1 bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 mb-3"
          style={{ borderLeftWidth: "3px", borderLeftColor: stepColor }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                Send Email
              </span>
              {/* Mode toggle */}
              <select
                value={step.content_mode}
                onChange={(e) =>
                  updateField("content_mode", e.target.value as "template" | "ai_draft")
                }
                className="px-2 py-0.5 rounded-[var(--r-sm)] text-[length:var(--t-micro)] font-bold border border-[var(--border)] bg-[var(--surface-deep)] text-[color:var(--text)]"
              >
                <option value="template">Template</option>
                <option value="ai_draft">AI Draft</option>
              </select>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-[var(--r-sm)] hover:bg-[var(--danger-soft)] text-[color:var(--text-muted)] hover:text-[color:var(--danger)] transition"
              title="Delete step"
            >
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          </div>

          {/* Content based on mode */}
          {isTemplate ? (
            <div className="space-y-2">
              <div>
                <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  value={step.action_config.subject ?? ""}
                  onChange={(e) => updateConfig("subject", e.target.value)}
                  placeholder="Welcome {{first_name}} — your results"
                  className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                  Body (HTML)
                </label>
                <textarea
                  value={step.action_config.body_html ?? ""}
                  onChange={(e) => updateConfig("body_html", e.target.value)}
                  placeholder="<p>Hey {{first_name}}, thanks for taking the quiz!...</p>"
                  rows={4}
                  className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none resize-y"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
                AI Prompt
              </label>
              <textarea
                value={step.ai_prompt ?? ""}
                onChange={(e) => updateField("ai_prompt", e.target.value)}
                placeholder="Write a warm follow-up about their quiz results. Reference their Brand OS output. Invite them to a free session. Under 150 words."
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] placeholder:text-[color:var(--text-muted)] focus:border-[var(--brand)] focus:outline-none resize-y"
              />
            </div>
          )}

          {/* Delay selector */}
          <div className="mt-3 pt-3 border-t border-[var(--border-faint)]">
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] mb-1">
              Delay before this step
            </label>
            <select
              value={step.delay_minutes}
              onChange={(e) => updateField("delay_minutes", Number(e.target.value))}
              className="px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              {DELAY_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Delay indicator between steps */}
      {!isLast && step.delay_minutes > 0 && (
        <div className="flex gap-3 mb-3">
          <div className="flex flex-col items-center w-7 shrink-0">
            <div className="w-4 h-4 rounded-full bg-[var(--surface-deep)] border border-[var(--border)] flex items-center justify-center text-[8px]">
              ⏱
            </div>
            <div className="w-0.5 flex-1 bg-[var(--border)] mt-1" />
          </div>
          <span className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
            Wait {formatDelay(step.delay_minutes)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes === 0) return "immediately";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.round(minutes / 1440);
  return `${days} day${days !== 1 ? "s" : ""}`;
}
```

- [ ] **Step 3: Create components/SequenceBuilder.tsx**

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import SequenceStepEditor, { type StepData } from "@/components/SequenceStepEditor";
import type { Sequence, SequenceStep } from "@/lib/types";

type Props = {
  sequence: Sequence;
  initialSteps: SequenceStep[];
};

const TRIGGER_OPTIONS = [
  { value: "quiz_completed", label: "Quiz completed" },
  { value: "status_change", label: "Status change" },
];

const STATUS_OPTIONS = ["contacted", "qualified", "booked", "client", "closed_lost"];

export default function SequenceBuilder({ sequence: initialSeq, initialSteps }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialSeq.name);
  const [triggerType, setTriggerType] = useState(initialSeq.trigger_type);
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    initialSeq.trigger_config ?? {}
  );
  const [isActive, setIsActive] = useState(initialSeq.is_active);
  const [steps, setSteps] = useState<StepData[]>(
    initialSteps.map((s) => ({
      id: s.id,
      position: s.position,
      delay_minutes: s.delay_minutes,
      content_mode: s.content_mode,
      action_config: s.action_config as StepData["action_config"],
      ai_prompt: s.ai_prompt,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  // ── Save ───────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      // Update sequence metadata.
      const { error: seqErr } = await supabase
        .from("cp_sequences")
        .update({
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
        })
        .eq("id", initialSeq.id);

      if (seqErr) throw new Error(seqErr.message);

      // Batch replace steps: delete all, insert fresh.
      await supabase
        .from("cp_sequence_steps")
        .delete()
        .eq("sequence_id", initialSeq.id);

      if (steps.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const rows = steps.map((step, i) => ({
          sequence_id: initialSeq.id,
          coach_id: user!.id,
          position: i + 1,
          delay_minutes: step.delay_minutes,
          action_type: "send_email",
          content_mode: step.content_mode,
          action_config: step.action_config,
          ai_prompt: step.ai_prompt,
        }));

        const { error: stepErr } = await supabase
          .from("cp_sequence_steps")
          .insert(rows);

        if (stepErr) throw new Error(stepErr.message);
      }

      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }, [name, triggerType, triggerConfig, steps, initialSeq.id, supabase, router]);

  // ── Activate / Deactivate ──────────────────────────────────

  const handleToggleActive = useCallback(async () => {
    setActivating(true);
    setError("");
    try {
      // Save first.
      await handleSave();

      const newActive = !isActive;

      // Validate before activating.
      if (newActive) {
        if (steps.length === 0) {
          setError("Add at least one step before activating.");
          setActivating(false);
          return;
        }
        for (const step of steps) {
          if (step.content_mode === "template") {
            if (!step.action_config.subject || !step.action_config.body_html) {
              setError("All template steps need a subject and body.");
              setActivating(false);
              return;
            }
          } else if (!step.ai_prompt) {
            setError("All AI draft steps need a prompt.");
            setActivating(false);
            return;
          }
        }
      }

      const { error: actErr } = await supabase
        .from("cp_sequences")
        .update({ is_active: newActive })
        .eq("id", initialSeq.id);

      if (actErr) throw new Error(actErr.message);
      setIsActive(newActive);
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setActivating(false);
    }
  }, [isActive, steps, handleSave, initialSeq.id, supabase, router]);

  // ── Step management ────────────────────────────────────────

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        position: prev.length + 1,
        delay_minutes: prev.length === 0 ? 0 : 1440,
        content_mode: "template",
        action_config: { subject: "", body_html: "" },
        ai_prompt: null,
      },
    ]);
  }

  function updateStep(index: number, updated: StepData) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function deleteStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <a
          href="/sequences"
          className="flex items-center gap-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back to sequences
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border-strong)] transition disabled:opacity-50"
          >
            <Save size={14} strokeWidth={2.5} />
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={activating}
            className={`flex items-center gap-1.5 px-4 h-10 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold transition disabled:opacity-50 ${
              isActive
                ? "border border-[var(--danger)] text-[color:var(--danger)] hover:bg-[var(--danger-soft)]"
                : "bg-[var(--brand)] text-[color:var(--navy)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
            }`}
          >
            <Zap size={14} strokeWidth={2.5} />
            {activating ? "..." : isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] text-[length:var(--t-caption)] text-[color:var(--danger)] font-bold">
          {error}
        </div>
      )}

      {/* Name + trigger config */}
      <div className="bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              Sequence Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quiz Welcome Flow"
              className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              Trigger
            </label>
            <select
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value as "quiz_completed" | "status_change");
                setTriggerConfig({});
              }}
              className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status change sub-config */}
        {triggerType === "status_change" && (
          <div className="mt-3">
            <label className="block text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">
              When status changes to
            </label>
            <select
              value={(triggerConfig.to_status as string) ?? ""}
              onChange={(e) =>
                setTriggerConfig(
                  e.target.value ? { to_status: e.target.value } : {}
                )
              }
              className="px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] text-[length:var(--t-caption)] text-[color:var(--text)]"
            >
              <option value="">Any status change</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="mb-4">
        {steps.map((step, i) => (
          <SequenceStepEditor
            key={`step-${i}`}
            step={step}
            index={i}
            isLast={i === steps.length - 1}
            onChange={(updated) => updateStep(i, updated)}
            onDelete={() => deleteStep(i)}
          />
        ))}
      </div>

      {/* Add step button */}
      <div className="flex gap-3">
        <div className="w-7 shrink-0" />
        <button
          type="button"
          onClick={addStep}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[color:var(--text)] transition"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Step
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add app/sequences/\[id\]/page.tsx components/SequenceBuilder.tsx components/SequenceStepEditor.tsx
git commit -m "feat(ui): add sequence builder page

Server component loads sequence + steps. SequenceBuilder handles
name, trigger config, step management, save, and activate/deactivate.
SequenceStepEditor handles per-step template/AI mode, delay selector."
```

---

### Task 11: Header Nav + Lead Detail Integration

**Files:**
- Modify: `components/Header.tsx` (add Sequences nav link)
- Modify: `components/LeadDetail.tsx` (add active sequences sidebar)
- Modify: `app/leads/[id]/page.tsx` (add enrollment + step log queries)

**Context:**

**Header:** `NAV_ITEMS` array at line 48 defines nav links. Add `{ href: "/sequences", label: "Sequences" }` after the Funnels entry.

**LeadDetail:** Large client component. Has a sidebar with lead info cards. We add an "Active Sequences" section showing enrollments for this lead, with a cancel button per enrollment.

**Lead page:** Server component with `Promise.all` parallel queries. Add queries for enrollments and step logs for this lead, pass as props.

- [ ] **Step 1: Add Sequences to Header nav**

In `components/Header.tsx`, update the `NAV_ITEMS` array (lines 48-57). Add `{ href: "/sequences", label: "Sequences" }` after the Funnels entry:

```typescript
const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/command-center", label: "Home" },
  { href: "/inbox", label: "Leads" },
  { href: "/clients", label: "Clients" },
  { href: "/sessions", label: "Sessions" },
  { href: "/voice", label: "Voice" },
  { href: "/content", label: "Content" },
  { href: "/twitter", label: "Twitter" },
  { href: "/funnels", label: "Funnels" },
  { href: "/sequences", label: "Sequences" },
];
```

- [ ] **Step 2: Add enrollment + step log queries to app/leads/[id]/page.tsx**

Add two queries to the `Promise.all` array (after the `tripRes` query, around line 76):

```typescript
    supabase
      .from("cp_sequence_enrollments")
      .select("id, sequence_id, current_step_id, status, execute_at, enrolled_at")
      .eq("lead_id", params.id)
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("cp_sequence_step_logs")
      .select("id, enrollment_id, step_id, coach_id, lead_id, status, error, resend_message_id, executed_at")
      .eq("lead_id", params.id)
      .order("executed_at", { ascending: false })
      .limit(50),
```

Update the destructuring to include the new results. Add them as props to `<LeadDetail>`:

```typescript
enrollments={(enrollmentsRes.data ?? []) as any[]}
automationLogs={(automationLogsRes.data ?? []) as any[]}
```

- [ ] **Step 3: Add active sequences section to LeadDetail.tsx**

In `components/LeadDetail.tsx`, add the `enrollments` and `automationLogs` props. In the sidebar area (after the summary card or relevant section), add:

```tsx
{/* Active Sequences */}
{enrollments.filter((e: any) => e.status === "active").length > 0 && (
  <div className="mt-4">
    <h3 className="text-[length:var(--t-micro)] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-2">
      Active Sequences
    </h3>
    <div className="space-y-2">
      {enrollments
        .filter((e: any) => e.status === "active")
        .map((enrollment: any) => (
          <div
            key={enrollment.id}
            className="bg-[var(--surface-elevated)] rounded-[var(--r-md)] border border-[var(--border)] p-3 flex items-center justify-between"
          >
            <div className="min-w-0">
              <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] truncate">
                Sequence
              </p>
              <p className="text-[length:var(--t-micro)] text-[color:var(--text-muted)]">
                {enrollment.execute_at
                  ? `Next step: ${new Date(enrollment.execute_at).toLocaleDateString()}`
                  : "Processing..."}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const supabase = (await import("@/lib/supabase-browser")).createClient();
                await supabase
                  .from("cp_sequence_enrollments")
                  .update({ status: "cancelled" })
                  .eq("id", enrollment.id);
                window.location.reload();
              }}
              className="shrink-0 px-2 py-1 rounded-[var(--r-sm)] text-[length:var(--t-micro)] font-bold bg-[var(--danger-soft)] text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition"
            >
              Cancel
            </button>
          </div>
        ))}
    </div>
  </div>
)}
```

Also wire the `automationLogs` into the timeline merge by adding `normalizeAutomationLogs(automationLogs)` to the `mergeTimeline()` call in the memo.

- [ ] **Step 4: Verify the build passes**

Run: `npx next lint --quiet 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add components/Header.tsx components/LeadDetail.tsx app/leads/\[id\]/page.tsx
git commit -m "feat: add Sequences nav link + lead detail integration

Header: add Sequences link after Funnels.
Lead page: query enrollments + step logs for the lead.
LeadDetail: show active sequences sidebar with cancel button,
wire automation logs into the contact timeline."
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Task |
|---|---|
| Data Model (4 tables) | Task 1 |
| Types | Task 2 |
| Merge Tags | Task 3 |
| Trigger Detection (checkSequenceTriggers) | Task 4 |
| Wire triggers into funnel-log.ts | Task 5 |
| Wire triggers into leads/[id] PATCH | Task 5 |
| Execution Engine (Edge Function) | Task 7 |
| API Routes (CRUD + activate) | Task 6 |
| /sequences list page | Task 9 |
| /sequences/[id] builder page | Task 10 |
| Header nav link | Task 11 |
| Lead detail sidebar | Task 11 |
| Timeline integration | Task 8 |
| Edge cases (no email, no Resend, retries, etc.) | Tasks 4, 7 |

**Placeholder scan:** No TBD, TODO, or vague steps found. All steps have complete code.

**Type consistency check:**
- `StepData` in SequenceStepEditor matches `SequenceStep` from types.ts
- `SequenceWithStats` in SequenceList matches the enriched shape from page.tsx
- `checkSequenceTriggers` signature consistent between definition (Task 4) and usage (Task 5)
- `matchesTriggerConfig` exported and tested
- `normalizeAutomationLogs` used in Task 11 (LeadDetail), defined in Task 8 (timeline.ts)

**Note:** pg_cron job scheduling (`cron.schedule(...)`) is NOT in the migration because enabling pg_cron and pg_net extensions requires Supabase dashboard actions (enabling extensions, then creating the cron job via SQL editor separately). The migration creates the tables; the pg_cron job should be set up manually after deploying the edge function:

```sql
-- Run in SQL editor AFTER deploying the process-sequences edge function
-- and enabling pg_cron + pg_net extensions in the Supabase dashboard:
select cron.schedule(
  'process-sequences',
  '*/5 * * * *',
  $$select net.http_post(
    url := 'https://modepuhwinzdngirlnkz.supabase.co/functions/v1/process-sequences',
    headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb
  )$$
);
```
