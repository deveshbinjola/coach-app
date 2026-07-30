-- Meet-your-assistant teaser quiz: lead + result log.
-- App-owned lead magnet (like cp_scorecard_leads, NOT coach-owned). A public
-- visitor answers three questions at /meet, gets an assistant archetype, and
-- optionally leaves their email to receive the result. One row per email
-- capture. Every write goes through the service-role admin client, so RLS is
-- enabled with no public policies (locked by default). See app/meet/.

create table if not exists public.cp_meet_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  email         text not null,
  archetype     text not null
                  check (archetype in ('closer', 'ghostwriter', 'operator', 'chief_of_staff')),
  -- The raw teaser answers: { timeDrain, handOffFirst, desires[] }.
  answers       jsonb not null,
  -- Delivery log for the archetype email: sent / failed / skipped(no key).
  email_status  text not null default 'pending'
                  check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  -- Attribution.
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referrer      text,
  user_agent    text
);

comment on table public.cp_meet_leads is 'Meet-your-assistant (/meet) archetype quiz email captures. App-owned lead magnet; written via service role only. Feeds Coach Assistant signups.';

create index if not exists cp_meet_leads_created_idx on public.cp_meet_leads (created_at desc);
create index if not exists cp_meet_leads_email_idx on public.cp_meet_leads (email);

-- Locked: only the service-role admin client touches this table.
alter table public.cp_meet_leads enable row level security;
