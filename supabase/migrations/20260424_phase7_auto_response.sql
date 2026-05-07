-- Phase 7 — Auto-Response Engine foundation.
--
-- This migration sets up the schema for the Auto-Response Engine. After it
-- runs, the data model is ready for:
--   1. Marking leads as "auto-draft eligible" so bulk imports don't fire 500
--      drafts at once.
--   2. Tagging messages with a `purpose` so the AI prompts itself differently
--      for first-response vs. follow-up vs. rewarm.
--   3. Storing per-coach toggles (auto-draft on/off, email notifications,
--      weekly reach target) in a real table instead of user_metadata.
--   4. Deduping drafts so the trigger can be safely retried without
--      generating duplicate first-response messages for the same lead.
--
-- Apply via Supabase SQL editor, or via Supabase MCP `apply_migration`.
-- Run after a backup.

-- ---------------------------------------------------------------------------
-- 1. cp_leads — auto_draft_eligible flag
-- ---------------------------------------------------------------------------

-- True for "live" lead arrivals (form, webhook, email sync, manual single-add)
-- where we want the auto-response engine to fire. False for bulk imports
-- (Notion ZIP, CSV) where firing 500 AI calls would be insane and noisy.
--
-- Default true for safety: any new code path that inserts a lead gets
-- auto-draft on by default. ImportWizard explicitly sets false on bulk insert
-- (already handled in the application code patch that ships with this).
alter table cp_leads
  add column if not exists auto_draft_eligible boolean not null default true;

comment on column cp_leads.auto_draft_eligible is
  'When true and status=new, the auto-response trigger fires. ImportWizard sets this to false on bulk inserts to avoid generating drafts for hundreds of leads at once.';

-- ---------------------------------------------------------------------------
-- 2. cp_lead_messages — purpose, external_id, synced_from
-- ---------------------------------------------------------------------------

-- Why was this draft generated? Lets the model branch its prompt for
-- first-response vs. follow-up vs. rewarm vs. ad-hoc Compose drafts.
alter table cp_lead_messages
  add column if not exists purpose text
    check (purpose in ('first_response', 'follow_up', 'rewarm', 'ad_hoc'));

-- For dedupe + Gmail integration. We don't want two auto-drafts for the same
-- lead, and once Gmail is wired we map back to Gmail message IDs here.
alter table cp_lead_messages
  add column if not exists external_id text;

-- Where did this message originate from? `compose`, `auto_response`,
-- `gmail_sync`, `manual`, etc. Useful for analytics + debugging.
alter table cp_lead_messages
  add column if not exists synced_from text;

comment on column cp_lead_messages.purpose is
  'Why this message was drafted. Drives prompt branching in the auto-draft Edge Function. Null for legacy rows.';
comment on column cp_lead_messages.external_id is
  'External system ID (e.g., Gmail message id) for dedupe and bidirectional sync.';
comment on column cp_lead_messages.synced_from is
  'Origin of this message: compose, auto_response, gmail_sync, manual, etc.';

-- Prevent duplicate first-response drafts per lead. If the trigger fires
-- twice (retries, double-insert), the second insert silently fails the
-- unique constraint instead of creating a duplicate draft.
create unique index if not exists uq_first_response_per_lead
  on cp_lead_messages (lead_id)
  where purpose = 'first_response' and direction = 'draft';

-- Index for the "Just landed" query on /today: find drafts pending review.
create index if not exists idx_pending_first_response_drafts
  on cp_lead_messages (coach_id, lead_id)
  where purpose = 'first_response' and direction = 'draft';

-- Index for Gmail dedup once that lands.
create index if not exists idx_lead_messages_external_id
  on cp_lead_messages (coach_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- 3. cp_coach_settings — per-coach toggles
-- ---------------------------------------------------------------------------

create table if not exists cp_coach_settings (
  coach_id uuid primary key references auth.users(id) on delete cascade,

  -- Auto-Response Engine toggle. Default true — every Founding 10 coach
  -- gets it on. Coach can disable in /settings if they want manual-only.
  auto_draft_on_new_lead boolean not null default true,

  -- Should we send a "draft ready" email when a draft is generated?
  -- Default true; coach can opt out to reduce notification noise.
  auto_draft_email_notification boolean not null default true,

  -- Weekly reach target. Migrated from user_metadata.reach_target_per_week.
  -- Default matches /today: 15 distinct outbound leads/week.
  reach_target_per_week int not null default 15
    check (reach_target_per_week between 1 and 500),

  -- Future: timezone, business hours, AI guardrails, channel preferences.
  -- Add columns as needed; this table is the catch-all for per-coach config.
  updated_at timestamptz not null default now()
);

comment on table cp_coach_settings is
  'Per-coach toggles and preferences. One row per coach. Auto-created on first read; see ensure_coach_settings() helper.';

-- RLS — each coach reads/writes only their own row.
alter table cp_coach_settings enable row level security;

drop policy if exists "coach reads own settings" on cp_coach_settings;
create policy "coach reads own settings" on cp_coach_settings
  for select using (auth.uid() = coach_id);

drop policy if exists "coach writes own settings" on cp_coach_settings;
create policy "coach writes own settings" on cp_coach_settings
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- Helper: get-or-create the settings row for the calling coach. Called by
-- the app on first /today render so we never have to handle missing rows.
create or replace function ensure_coach_settings()
returns cp_coach_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  result cp_coach_settings;
begin
  insert into cp_coach_settings (coach_id)
  values (auth.uid())
  on conflict (coach_id) do nothing;

  select * into result from cp_coach_settings where coach_id = auth.uid();
  return result;
end;
$$;

grant execute on function ensure_coach_settings() to authenticated;

-- Touch updated_at on any update.
create or replace function cp_coach_settings_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cp_coach_settings_updated_at on cp_coach_settings;
create trigger trg_cp_coach_settings_updated_at
  before update on cp_coach_settings
  for each row execute function cp_coach_settings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Backfill — migrate existing reach_target_per_week from user_metadata
-- ---------------------------------------------------------------------------

-- Any coach who set a custom reach target in user_metadata gets it copied
-- into cp_coach_settings here. Default-15 coaches get a row created on
-- first call to ensure_coach_settings() — no special-case needed.
insert into cp_coach_settings (coach_id, reach_target_per_week)
select
  u.id,
  coalesce((u.raw_user_meta_data->>'reach_target_per_week')::int, 15)
from auth.users u
where (u.raw_user_meta_data->>'reach_target_per_week') is not null
on conflict (coach_id) do update
  set reach_target_per_week = excluded.reach_target_per_week;

-- ---------------------------------------------------------------------------
-- 5. Verification queries — run these after the migration to confirm health
-- ---------------------------------------------------------------------------
--
--   -- Should return the new columns:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_leads' and column_name = 'auto_draft_eligible';
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_lead_messages'
--   and column_name in ('purpose', 'external_id', 'synced_from');
--
--   -- Should show the new table with RLS enabled:
--   select tablename, rowsecurity from pg_tables where tablename = 'cp_coach_settings';
--
--   -- Should show the unique partial index:
--   select indexname from pg_indexes
--   where indexname = 'uq_first_response_per_lead';
--
--   -- Should return your settings row (creates it if missing):
--   select * from ensure_coach_settings();
