-- Daily Brief state on cp_coaches.
--
-- The brief is the trigger phase that used to be missing entirely: after
-- the 5-day onboarding drip ended, nothing ever reached out again. It only
-- sends when Business Pulse has something real to say, so these columns
-- are throttle + consent, not a schedule.

alter table public.cp_coaches
  add column if not exists brief_last_sent_at timestamptz,
  add column if not exists brief_opt_out boolean not null default false;

comment on column public.cp_coaches.brief_last_sent_at is 'Last Daily Brief send. Guards against more than one brief per calendar day.';
comment on column public.cp_coaches.brief_opt_out is 'Coach turned the brief off. Never send when true.';

-- The cron scans for eligible coaches by last-send time.
create index if not exists cp_coaches_brief_due_idx
  on public.cp_coaches (brief_last_sent_at)
  where brief_opt_out = false;
