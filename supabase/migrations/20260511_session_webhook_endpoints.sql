-- Session webhooks for Cal.com, Calendly, and Zoom.
--
-- These are not lead capture links. They feed the Client Rooms calendar and,
-- when available, meeting memory from recording/transcript events.

alter table public.cp_client_events
  drop constraint if exists cp_client_events_source_check;

alter table public.cp_client_events
  add constraint cp_client_events_source_check
  check (source in ('manual', 'cal_com', 'calendly', 'google_calendar', 'zoom'));

create table if not exists public.cp_session_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('cal_com', 'calendly', 'zoom')),
  token text not null unique,
  name text not null,
  active boolean not null default true,
  total_received integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cp_session_webhook_endpoints enable row level security;

drop policy if exists "coach owns session webhook endpoints" on public.cp_session_webhook_endpoints;
create policy "coach owns session webhook endpoints" on public.cp_session_webhook_endpoints
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create index if not exists cp_session_webhook_endpoints_coach_provider
  on public.cp_session_webhook_endpoints (coach_id, provider, created_at desc);

create or replace function public.cp_session_webhooks_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cp_session_webhooks_updated_at on public.cp_session_webhook_endpoints;
create trigger trg_cp_session_webhooks_updated_at
  before update on public.cp_session_webhook_endpoints
  for each row execute function public.cp_session_webhooks_touch_updated_at();
