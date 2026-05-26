-- Quiz Funnels — Phase 1 (Resonance type only).
--
-- Two tables:
--   1. cp_funnels — coach-owned quiz definitions. Each row holds the full
--      config (questions, results, branding) as a jsonb blob. Generated
--      from cp_brand_os_runs.synthesis_json via /api/funnels/generate.
--   2. cp_funnel_responses — one row per quiz completion. Links to
--      cp_leads via lead_id so every quiz-taker shows up in the coach's
--      existing inbox. Append-only from the public submit endpoint.
--
-- Slug uniqueness: auto-generated on create, coach can override before
-- publishing. "Powered by ElevateAI" always shown on public quiz page.
--
-- Apply via Supabase SQL editor or MCP apply_migration.

-- ---------------------------------------------------------------------------
-- 1. cp_funnels — quiz definitions
-- ---------------------------------------------------------------------------

create table if not exists public.cp_funnels (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references auth.users(id) on delete cascade,
  slug                  text not null unique,
  type                  text not null default 'resonance'
                          check (type in ('resonance', 'diagnostic', 'path_picker')),
  title                 text not null,
  config                jsonb not null,
  published             boolean not null default false,
  view_count            int not null default 0,
  start_count           int not null default 0,
  complete_count        int not null default 0,
  email_count           int not null default 0,
  generated_from_run_id uuid references public.cp_brand_os_runs(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.cp_funnels is
  'Coach-owned quiz funnels. Config jsonb holds questions, result archetypes, and branding. Phase 1 supports resonance type only.';

create index if not exists cp_funnels_coach_idx
  on public.cp_funnels (coach_id, created_at desc);

create index if not exists cp_funnels_slug_idx
  on public.cp_funnels (slug);

alter table public.cp_funnels enable row level security;

-- Coaches can read/write their own funnels via authenticated client.
drop policy if exists "coach owns funnels" on public.cp_funnels;
create policy "coach owns funnels" on public.cp_funnels
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- Public can read published funnels (for /q/[slug] page).
drop policy if exists "public reads published funnels" on public.cp_funnels;
create policy "public reads published funnels" on public.cp_funnels
  for select using (published = true);

-- ---------------------------------------------------------------------------
-- 2. cp_funnel_responses — quiz completions
-- ---------------------------------------------------------------------------

create table if not exists public.cp_funnel_responses (
  id            uuid primary key default gen_random_uuid(),
  funnel_id     uuid not null references public.cp_funnels(id) on delete cascade,
  coach_id      uuid not null references auth.users(id) on delete cascade,
  answers       jsonb not null,
  result_key    text not null,
  email         text,
  name          text,
  lead_id       uuid references public.cp_leads(id),
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

comment on table public.cp_funnel_responses is
  'One row per quiz completion. Lead row created in parallel via the public submit endpoint. Coach reads these for analytics.';

create index if not exists cp_funnel_responses_funnel_idx
  on public.cp_funnel_responses (funnel_id, created_at desc);

create index if not exists cp_funnel_responses_coach_idx
  on public.cp_funnel_responses (coach_id, created_at desc);

alter table public.cp_funnel_responses enable row level security;

-- Coach reads their own responses.
drop policy if exists "coach reads funnel responses" on public.cp_funnel_responses;
create policy "coach reads funnel responses" on public.cp_funnel_responses
  for select using (auth.uid() = coach_id);

-- Public inserts (via service-role admin client in the submit endpoint,
-- so no INSERT policy needed for anon role here — the admin client
-- bypasses RLS entirely).

-- ---------------------------------------------------------------------------
-- 3. Counters update function
-- ---------------------------------------------------------------------------
-- Trigger to auto-increment funnel counters on response insert.

create or replace function public.fn_increment_funnel_counters()
returns trigger as $$
begin
  update public.cp_funnels
  set complete_count = complete_count + 1,
      email_count = case when NEW.email is not null then email_count + 1 else email_count end,
      updated_at = now()
  where id = NEW.funnel_id;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_funnel_response_counters on public.cp_funnel_responses;
create trigger trg_funnel_response_counters
  after insert on public.cp_funnel_responses
  for each row
  execute function public.fn_increment_funnel_counters();

-- ---------------------------------------------------------------------------
-- 4. View count increment RPC (avoids race conditions)
-- ---------------------------------------------------------------------------

create or replace function public.increment_funnel_view(funnel_id uuid)
returns void as $$
begin
  update public.cp_funnels
  set view_count = view_count + 1,
      updated_at = now()
  where id = funnel_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 5. Start count increment RPC (called when visitor begins Q1)
-- ---------------------------------------------------------------------------

create or replace function public.increment_funnel_start(funnel_id uuid)
returns void as $$
begin
  update public.cp_funnels
  set start_count = start_count + 1,
      updated_at = now()
  where id = funnel_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 6. Verification queries (run manually after applying)
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('cp_funnels', 'cp_funnel_responses');
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_funnels' order by ordinal_position;
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'cp_funnel_responses' order by ordinal_position;
