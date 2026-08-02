-- READY (men's work): Readiness Test completions + leads.
-- Public landing page writes client-side with the anon key, matching the
-- site convention (newsletter, quiz, scorecard all insert anon).
-- Insert-only: anon may write a lead but never read, update, or delete.
-- Applied to modepuhwinzdngirlnkz on 2026-07-28 via MCP.

create table if not exists public.mw_ready_leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- answers: [{ q, choice, points }]. domain_scores: 0..100 per domain.
  answers       jsonb not null,
  domain_scores jsonb not null,
  total         integer not null check (total between 0 and 100),
  tier          text not null
                  check (tier in ('ready', 'steady_leaking', 'running_hot', 'red_line')),
  profile       text not null
                  check (profile in ('pressure_cooker', 'short_fuse', 'grinder', 'ghost')),
  email         text,
  first_name    text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referrer      text,
  user_agent    text
);

comment on table public.mw_ready_leads is 'READY Readiness Test completions (men''s work lead magnet). Anon insert-only from the public landing page.';

create index if not exists mw_ready_leads_created_idx on public.mw_ready_leads (created_at desc);
create index if not exists mw_ready_leads_email_idx on public.mw_ready_leads (email) where email is not null;
create index if not exists mw_ready_leads_profile_idx on public.mw_ready_leads (profile, created_at desc);

alter table public.mw_ready_leads enable row level security;

drop policy if exists "anon can submit ready test" on public.mw_ready_leads;
create policy "anon can submit ready test" on public.mw_ready_leads
  for insert to anon
  with check (true);
