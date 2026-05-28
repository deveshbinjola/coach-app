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
