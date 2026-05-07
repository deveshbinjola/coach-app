-- Phase 8 — Gmail integration foundation.
--
-- One table, RLS-protected, stores OAuth tokens per coach. The sync Edge
-- Function reads from here to authenticate Gmail API calls. We deliberately
-- DON'T put refresh tokens in user_metadata — they're sensitive enough to
-- deserve their own dedicated, RLS-locked table.
--
-- Apply via Supabase SQL editor or `apply_migration`.

create table if not exists cp_coach_integrations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,

  -- Provider name. 'gmail' for Phase 8; future: 'calendar', 'linkedin', etc.
  -- One row per coach per provider.
  provider text not null check (provider in ('gmail')),

  -- The Gmail account email. Useful for display ("Connected as you@x.com")
  -- and for catching cases where a coach connected a personal account by
  -- mistake instead of their business account.
  account_email text,

  -- Long-lived refresh token. Treat as a secret. RLS restricts reads to the
  -- owning coach + the service role (which the Edge Function uses).
  refresh_token text not null,

  -- Short-lived access token + expiry. We refresh proactively when
  -- expires_at is within 60s of now. Stored so the Edge Function doesn't
  -- have to round-trip Google on every sync.
  access_token text,
  access_token_expires_at timestamptz,

  -- OAuth scopes granted. Lets us tell whether we have read-only or
  -- read+send when the time comes. Comma-separated for easy text matching.
  scopes text not null default '',

  -- Last successful sync timestamp. Drives the polling cadence on /today
  -- (re-sync if last_synced_at < now - 10min). Null = never synced.
  last_synced_at timestamptz,

  -- Most recently observed Gmail historyId. Lets the next sync ask Google
  -- for "what's changed since X" instead of pulling all sent mail every
  -- time. Empty until first sync establishes a baseline.
  last_history_id text,

  -- Connection state. 'active' (default), 'revoked' (Google said the
  -- refresh token is invalid), or 'paused' (coach disabled it without
  -- disconnecting). Sync skips non-active rows.
  status text not null default 'active'
    check (status in ('active', 'revoked', 'paused')),

  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Hard uniqueness — at most one row per (coach, provider). If a coach
  -- reconnects, the OAuth callback updates this row instead of inserting.
  unique (coach_id, provider)
);

comment on table cp_coach_integrations is
  'Per-coach OAuth tokens for external integrations (Gmail in Phase 8). RLS-protected; refresh_token is sensitive — only readable by the owning coach and the service role.';

-- RLS — each coach reads/writes only their own integration rows. Service
-- role bypasses RLS, which is what the sync Edge Function uses.
alter table cp_coach_integrations enable row level security;

drop policy if exists "coach reads own integrations" on cp_coach_integrations;
create policy "coach reads own integrations" on cp_coach_integrations
  for select using (auth.uid() = coach_id);

drop policy if exists "coach writes own integrations" on cp_coach_integrations;
create policy "coach writes own integrations" on cp_coach_integrations
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- Touch updated_at on any update (refresh token rotations, sync timestamp,
-- status changes all flow through this).
create or replace function cp_coach_integrations_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cp_coach_integrations_updated_at
  on cp_coach_integrations;
create trigger trg_cp_coach_integrations_updated_at
  before update on cp_coach_integrations
  for each row execute function cp_coach_integrations_touch_updated_at();

-- Verification:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_coach_integrations';
--
--   select tablename, rowsecurity from pg_tables
--   where tablename = 'cp_coach_integrations';
