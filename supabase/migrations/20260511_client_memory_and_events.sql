-- Client memory and calendar-lite layer.
--
-- This keeps the client room useful after every session: what changed,
-- what to do next, what to send, and what content the conversation revealed.

alter table public.cp_client_sessions
  add column if not exists commitments text[] not null default '{}',
  add column if not exists follow_up_draft text,
  add column if not exists content_ideas text[] not null default '{}',
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists extraction_source text not null default 'manual'
    check (extraction_source in ('manual', 'ai', 'fallback'));

create unique index if not exists cp_client_sessions_coach_external
  on public.cp_client_sessions (coach_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create table if not exists public.cp_client_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_room_id uuid not null references public.cp_client_rooms(id) on delete cascade,
  title text not null default 'Client session',
  starts_at timestamptz not null,
  meeting_url text,
  source text not null default 'manual'
    check (source in ('manual', 'cal_com', 'calendly', 'google_calendar', 'zoom')),
  external_id text,
  created_at timestamptz not null default now()
);

alter table public.cp_client_events enable row level security;

drop policy if exists "coach owns client events" on public.cp_client_events;
create policy "coach owns client events" on public.cp_client_events
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create index if not exists cp_client_events_room_starts
  on public.cp_client_events (client_room_id, starts_at asc);

create index if not exists cp_client_events_coach_starts
  on public.cp_client_events (coach_id, starts_at asc);

create unique index if not exists cp_client_events_coach_external
  on public.cp_client_events (coach_id, external_id)
  where external_id is not null;
