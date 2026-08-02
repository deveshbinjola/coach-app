-- Self-healing coach-app, P0: bug report capture.
-- Every in-app report and caught error lands in one queue. The nightly Claude
-- agent (P1) reads open rows, diagnoses from logs + repo, and writes back
-- fix_branch / fix_pr_url. Sunny stays the merge gate. Nothing auto-ships.

create table if not exists public.cp_bug_reports (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  severity      text not null default 'normal'
                  check (severity in ('low', 'normal', 'high', 'critical')),
  status        text not null default 'open'
                  check (status in ('open', 'triaged', 'in_progress', 'fixed', 'wont_fix', 'duplicate')),
  page_url      text,                 -- where it happened (window.location.href)
  user_agent    text,                 -- browser / device context
  console_error text,                 -- optional captured stack trace
  -- Written later by the nightly agent. Null until a fix is proposed.
  fix_branch    text,
  fix_pr_url    text,
  fix_notes     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.cp_bug_reports is 'Self-healing loop queue. Coaches and the error boundary file reports here; the nightly agent proposes fixes via PR. Human merges.';

-- The nightly agent (service role) scans by status then age.
create index if not exists cp_bug_reports_status_idx on public.cp_bug_reports (status, created_at);
create index if not exists cp_bug_reports_coach_idx on public.cp_bug_reports (coach_id, created_at desc);

alter table public.cp_bug_reports enable row level security;

-- A coach can see and file their own reports. The nightly agent uses the
-- service role, which bypasses RLS, so it can read every coach's queue and
-- write fix_branch / status back.
drop policy if exists "coach owns bug reports" on public.cp_bug_reports;
create policy "coach owns bug reports" on public.cp_bug_reports
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
