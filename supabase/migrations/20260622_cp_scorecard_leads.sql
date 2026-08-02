-- The Positioned-to-Win Scorecard: lead + result log.
-- App-owned lead magnet (NOT coach-owned, unlike cp_funnels). A public visitor
-- answers eight questions, the client scores six positioning axes, and one row
-- lands here per completion. Email is captured at the result step and patched
-- on after. Every write goes through the service-role admin client, so RLS is
-- enabled with no public policies (locked by default). See app/win/.

create table if not exists public.cp_scorecard_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- The instrument. answers: [{ q_id, choice, points }]. axis_scores: the six
  -- 0..100 sub-scores keyed by axis. total: 0..100 headline. gap_axis: the
  -- lowest axis, which drives the result copy + the Brand OS handoff.
  answers       jsonb not null,
  axis_scores   jsonb not null,
  total         integer not null check (total between 0 and 100),
  tier          text not null
                  check (tier in ('positioned_to_win', 'at_risk', 'commodity_zone')),
  gap_axis      text not null
                  check (gap_axis in ('pov', 'methodology', 'niche', 'proof', 'audience', 'category')),
  -- Lead capture (optional — a completion with no email is still a signal).
  email         text,
  name          text,
  -- If a logged-in coach takes it, link them; null for cold public traffic.
  coach_id      uuid references auth.users(id) on delete set null,
  -- Attribution.
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referrer      text,
  user_agent    text
);

comment on table public.cp_scorecard_leads is 'Positioned-to-Win Scorecard completions. App-owned lead magnet; written via service role only. Feeds the Brand OS funnel.';

-- Reporting: most-recent first, and pull the emailed leads.
create index if not exists cp_scorecard_leads_created_idx on public.cp_scorecard_leads (created_at desc);
create index if not exists cp_scorecard_leads_email_idx on public.cp_scorecard_leads (email) where email is not null;
create index if not exists cp_scorecard_leads_tier_idx on public.cp_scorecard_leads (tier, created_at desc);

-- Locked: only the service-role admin client touches this table. No anon or
-- authenticated policies, so RLS denies all client-side access by default.
alter table public.cp_scorecard_leads enable row level security;
