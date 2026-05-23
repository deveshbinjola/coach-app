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
