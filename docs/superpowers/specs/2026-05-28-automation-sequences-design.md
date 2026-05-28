# Automation Sequences — Design Spec

## Overview

Add trigger-based email automation to the coach platform. Coaches build sequences (trigger → delay → email chains) that fire automatically when leads complete quizzes or change status. Kills the "you still need Mailchimp" objection — email nurture lives inside the same platform.

## Goals

- Coach builds a 3-step quiz welcome flow in under 5 minutes
- Emails send automatically with zero manual intervention after activation
- Per-step choice: coach-written template with merge tags OR AI-drafted using their voice profile
- Full audit trail — coach sees exactly what sent, when, and whether it succeeded

## Approach

**Supabase pg_cron + database state machine.** Trigger detection in existing API routes creates enrollment rows. pg_cron calls a Supabase Edge Function every 5 minutes to process due enrollments — resolve content, send via Resend, log results, advance to next step or mark complete.

---

## Data Model

4 new tables. All follow existing codebase conventions: uuid PKs with `gen_random_uuid()`, `coach_id` for RLS, `text` columns (no Postgres enums), `timestamptz` with `DEFAULT now()`, jsonb defaults as `'{}'::jsonb`.

### cp_sequences

The recipe — defines what triggers the sequence and its metadata.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, gen_random_uuid() |
| coach_id | uuid | NOT NULL, FK → cp_coaches ON DELETE CASCADE |
| name | text | NOT NULL |
| trigger_type | text | NOT NULL — `quiz_completed` or `status_change` |
| trigger_config | jsonb | NOT NULL DEFAULT '{}' — `quiz_completed`: `{}` (fires on any quiz), `status_change`: `{"to_status": "qualified"}` |
| is_active | bool | NOT NULL DEFAULT false |
| created_at | timestamptz | NOT NULL DEFAULT now() |
| updated_at | timestamptz | NOT NULL DEFAULT now() |

**Indexes:** `(coach_id)`, `(coach_id, is_active)`
**Trigger:** `trg_cp_sequences_updated_at` calling `cp_set_updated_at()`
**RLS:** `auth.uid() = coach_id` on all ops

### cp_sequence_steps

Each step in the recipe — position, delay, and email content.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, gen_random_uuid() |
| sequence_id | uuid | NOT NULL, FK → cp_sequences ON DELETE CASCADE |
| coach_id | uuid | NOT NULL, FK → cp_coaches ON DELETE CASCADE |
| position | int | NOT NULL |
| delay_minutes | int | NOT NULL DEFAULT 0 — 0 = immediate, 1440 = 1 day |
| action_type | text | NOT NULL DEFAULT 'send_email' |
| content_mode | text | NOT NULL — `template` or `ai_draft` |
| action_config | jsonb | NOT NULL DEFAULT '{}' |
| ai_prompt | text | nullable — used when content_mode = 'ai_draft' |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Indexes:** `(sequence_id, position)`, `(coach_id)`
**RLS:** `auth.uid() = coach_id` on all ops
**No updated_at** — steps are rewritten through the builder, not independently updated (matches `cp_brand_os_answers`, `cp_lead_tags` pattern).

#### action_config shape (template mode)

```json
{
  "subject": "Welcome {{first_name}} — your Brand OS results",
  "body_html": "<p>Hey {{first_name}}, thanks for taking the quiz!...</p>",
  "reply_to": "sunny@elevateai.com"
}
```

#### ai_prompt (ai_draft mode)

Plain text instruction for Claude:
```
"Write a warm follow-up about their quiz results. Reference their Brand OS output. Invite them to a free session. Under 150 words."
```

### cp_sequence_enrollments

Tracks each lead's progress through a sequence. The pg_cron hot table.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, gen_random_uuid() |
| sequence_id | uuid | NOT NULL, FK → cp_sequences ON DELETE CASCADE |
| lead_id | uuid | NOT NULL, FK → cp_leads ON DELETE CASCADE |
| coach_id | uuid | NOT NULL, FK → cp_coaches ON DELETE CASCADE |
| current_step_id | uuid | nullable, FK → cp_sequence_steps |
| status | text | NOT NULL DEFAULT 'active' — `active`, `completed`, `cancelled`, `failed` |
| execute_at | timestamptz | nullable — when next step fires |
| enrolled_at | timestamptz | NOT NULL DEFAULT now() |
| completed_at | timestamptz | nullable |
| last_step_executed_at | timestamptz | nullable |
| error | text | nullable — last error message |
| retry_count | int | NOT NULL DEFAULT 0 |

**Indexes:**
- `UNIQUE(sequence_id, lead_id) WHERE status = 'active'` — partial unique, allows re-enrollment after completion
- `(execute_at) WHERE status = 'active'` — pg_cron hot-path index
- `(coach_id)`
- `(lead_id)` — for lead detail sidebar lookup

**RLS:** `auth.uid() = coach_id` on all ops

### cp_sequence_step_logs

Audit trail — what happened at each step execution.

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, gen_random_uuid() |
| enrollment_id | uuid | NOT NULL, FK → cp_sequence_enrollments ON DELETE CASCADE |
| step_id | uuid | NOT NULL, FK → cp_sequence_steps ON DELETE SET NULL |
| coach_id | uuid | NOT NULL |
| lead_id | uuid | NOT NULL |
| status | text | NOT NULL — `sent`, `failed`, `skipped` |
| error | text | nullable — error detail if failed |
| resend_message_id | text | nullable — Resend API response ID |
| executed_at | timestamptz | NOT NULL DEFAULT now() |

**Indexes:** `(enrollment_id)`, `(lead_id, executed_at DESC)` — for timeline feed, `(coach_id)`
**RLS:** `auth.uid() = coach_id` on SELECT (append-only from system, read-only for coach)

---

## Trigger Detection

Triggers are detected in existing API code paths — no database triggers needed.

### quiz_completed

`lib/funnel-log.ts` already inserts into `cp_funnel_events`. After the insert, call `checkSequenceTriggers(coachId, "quiz_completed", lead)`.

### status_change

`PATCH /api/v1/leads/[id]` already handles status updates. When `status` field changes, call `checkSequenceTriggers(coachId, "status_change", lead, { to_status: newStatus })`.

### checkSequenceTriggers() function

```
1. Query cp_sequences WHERE coach_id = $coachId AND trigger_type = $type AND is_active = true
2. For each matching sequence:
   a. Match trigger_config (e.g. for status_change, check trigger_config.to_status matches)
   b. Guard: lead has email? (required for send_email)
   c. Guard: lead not already actively enrolled in this sequence?
   d. Get first step (position = 1) and its delay_minutes
   e. INSERT cp_sequence_enrollments with:
      - current_step_id = first step
      - execute_at = now() + first_step.delay_minutes * interval '1 minute'
      - status = 'active'
```

Lives in `lib/sequence-triggers.ts`. Uses Supabase admin client (service role) since it runs in API routes that may not have user auth context (e.g., webhook routes).

---

## Execution Engine

### pg_cron + Supabase Edge Function

1. Enable `pg_cron` extension (not yet installed)
2. Create a Supabase Edge Function: `supabase/functions/process-sequences/index.ts`
3. pg_cron job calls the edge function every 5 minutes via `pg_net` HTTP extension

### Edge Function: process-sequences

```
1. SELECT enrollments WHERE status = 'active' AND execute_at <= now()
   ORDER BY execute_at ASC LIMIT 50 (batch size)
2. For each enrollment:
   a. Load the step (JOIN cp_sequence_steps)
   b. Load the lead (JOIN cp_leads for merge tags)
   c. Resolve content:
      - template mode: replace merge tags ({{first_name}}, {{full_name}}, {{email}}, {{coach_name}}, {{status}})
      - ai_draft mode: call Claude API with coach's voice profile (from cp_brand_os_runs.voice data) + lead context + ai_prompt
   d. Resolve sender: use resolveResendSender(coachId) from lib/email/coach-resend.ts
   e. Send email via resendSend()
   f. INSERT cp_sequence_step_logs with status + resend_message_id
   g. Advance:
      - If next step exists: UPDATE enrollment SET current_step_id = next, execute_at = now() + next.delay_minutes
      - If no next step: UPDATE enrollment SET status = 'completed', completed_at = now()
3. Error handling:
   - Resend API failure: increment retry_count, set error message, leave execute_at unchanged (retry next cycle)
   - 3 consecutive failures (retry_count >= 3): SET status = 'failed'
   - AI draft failure: fall back to skipping step, log as 'skipped'
```

### Merge Tags

| Tag | Resolves to |
|-----|-------------|
| `{{first_name}}` | `lead.full_name.split(' ')[0]` |
| `{{full_name}}` | `lead.full_name` |
| `{{email}}` | `lead.email` |
| `{{coach_name}}` | coach display name from user_metadata |
| `{{status}}` | `lead.status` |

---

## UI

### New Pages

#### /sequences — List Page

- Header: "Sequences" title + "+ New Sequence" button
- Card per sequence showing:
  - Name + Active/Draft badge
  - Trigger type + step count + "Last sent X ago"
  - Stats: enrolled count, completed count, failed count
- Empty state: "Create your first sequence to start automating follow-ups"
- Nav: Add "Sequences" link to Header component between Content and Brand OS

#### /sequences/[id] — Sequence Builder

- **Header section:** Name input + Trigger selector dropdown (quiz_completed, status_change with sub-config)
- **Steps section:** Vertical timeline layout
  - Numbered circles connected by vertical line
  - Delay indicators between steps (⏱ icon + "Wait 1 day")
  - Each step card shows:
    - Template badge (green) or AI Draft badge (indigo)
    - Template mode: subject + body preview (rich text editor on expand)
    - AI Draft mode: prompt textarea
    - Delay input (number + unit selector: minutes/hours/days)
    - Delete step button
  - "+ Add Step" button at bottom
- **Actions:** Save Draft / Activate buttons
- **Activation guard:** Requires at least 1 step with valid content + coach has Resend configured

#### /sequences/[id] — New Sequence Flow

"+ New Sequence" creates a draft sequence and navigates to the builder. Coach fills in name, trigger, steps, then clicks Activate.

### Modified Components

#### Lead Detail Sidebar

Add "Active Sequences" section below SummaryCard:
- Shows each active enrollment for this lead
- Displays: sequence name, "Step N of M", "sends in Xh"
- Cancel button per enrollment (sets status = 'cancelled')

#### Contact Timeline Integration

Step logs (`cp_sequence_step_logs`) surface in the timeline as automation events. Add a new `TimelineEventKind`: `automation_email`. Rendered with a ⚡ icon and automation-specific styling.

---

## New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `lib/sequence-triggers.ts` | `checkSequenceTriggers()` — enrollment logic | ~80 |
| `lib/sequence-merge.ts` | Merge tag resolution for templates | ~40 |
| `app/sequences/page.tsx` | Sequence list page (server component) | ~60 |
| `app/sequences/[id]/page.tsx` | Sequence builder page (server component) | ~40 |
| `components/SequenceList.tsx` | Client component for sequence list + stats | ~120 |
| `components/SequenceBuilder.tsx` | Client component for step builder UI | ~300 |
| `components/SequenceStepEditor.tsx` | Single step editor (template or AI prompt) | ~150 |
| `app/api/v1/sequences/route.ts` | CRUD for sequences (GET list, POST create) | ~60 |
| `app/api/v1/sequences/[id]/route.ts` | CRUD for single sequence (GET, PATCH, DELETE) | ~80 |
| `app/api/v1/sequences/[id]/steps/route.ts` | CRUD for steps (GET, PUT batch replace) | ~70 |
| `app/api/v1/sequences/[id]/activate/route.ts` | POST to activate/deactivate | ~50 |
| `supabase/functions/process-sequences/index.ts` | Edge function: process due enrollments | ~200 |

## Modified Files

| File | Change |
|------|--------|
| `lib/funnel-log.ts` | Add `checkSequenceTriggers()` call after funnel event insert |
| `app/api/v1/leads/[id]/route.ts` | Add `checkSequenceTriggers()` call on status change |
| `components/Header.tsx` | Add "Sequences" nav link |
| `components/LeadDetail.tsx` | Add active sequences sidebar section |
| `lib/timeline.ts` | Add `normalizeAutomationLogs()` + `automation_email` event kind |
| `components/ContactTimeline.tsx` | Add automation_email card rendering |
| `app/leads/[id]/page.tsx` | Add `cp_sequence_step_logs` query to Promise.all, pass as prop |

## Migration

Single migration file enabling pg_cron, creating 4 tables, indexes, RLS policies, and the updated_at trigger:

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net; -- for HTTP calls from pg_cron

-- Tables, indexes, RLS as specified above
-- pg_cron job: SELECT cron.schedule('process-sequences', '*/5 * * * *', $$SELECT net.http_post(...)$$);
```

---

## Edge Cases

- **Lead has no email:** Skip enrollment (guard in checkSequenceTriggers)
- **Coach has no Resend configured:** Activation blocked in UI. If config removed while sequence active, emails fail → logged → 3 retries → failed status
- **Lead already enrolled:** Partial unique index prevents duplicate active enrollment. Completed leads can re-enroll.
- **Sequence deactivated mid-run:** Active enrollments continue to completion. Only new triggers are blocked. Coach can manually cancel individual enrollments.
- **Step deleted while enrollments active:** FK is ON DELETE SET NULL on current_step_id. Processor skips null steps and advances to next.
- **AI draft fails:** Step logged as 'skipped', enrollment advances to next step. Coach sees skip in audit log.
- **Batch size:** Process max 50 enrollments per cycle. At 5-min intervals, handles 600/hour — sufficient for coaching platform scale.

## What This Does NOT Include

- No branching/conditional logic (if/else paths)
- No open/click tracking (requires webhook from Resend — future enhancement)
- No A/B testing of email variants
- No SMS, DM, or non-email actions
- No visual flow editor (drag-and-drop) — vertical list builder only
- No sequence templates/presets (coach builds from scratch)
- No rate limiting per lead (e.g., max 1 email/day across sequences)

## Performance

- pg_cron runs every 5 min — max 5 min delay on "immediate" steps (acceptable for email)
- Partial index on `execute_at WHERE status = 'active'` keeps the hot query fast
- Batch limit of 50 prevents edge function timeout
- AI draft adds ~2-3s per step (Claude API call) — batched sequentially within the 50-item batch
- No impact on existing page load times — enrollment is async, triggered from API routes
