-- Frameworks — coach-coined acronym frameworks generated via the Framework
-- Generator. Each framework is a named method (e.g. S.C.O.R.E., T.A.S.T.E.)
-- with 3-5 pillars, a tagline, and optional lead magnet type suggestion.
--
-- Coaches can have multiple frameworks. One can be marked as primary.
-- The framework feeds into content generation, lead magnets, and carousels.

-- ---------------------------------------------------------------------------
-- 1. cp_frameworks
-- ---------------------------------------------------------------------------

create table if not exists public.cp_frameworks (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references auth.users(id) on delete cascade,

  -- The acronym itself (e.g. "SCORE", "TASTE")
  acronym       text not null,

  -- Full framework name (e.g. "The S.C.O.R.E. Audit")
  name          text not null,

  -- One-liner positioning tagline
  tagline       text,

  -- JSON array of pillar objects: [{letter, title, description}]
  pillars       jsonb not null default '[]'::jsonb,

  -- The coach's original input that generated this framework
  source_input  text,

  -- Suggested lead magnet type (e.g. "audit", "scorecard", "checklist")
  lead_magnet_type text,

  -- Is this the coach's primary/featured framework?
  is_primary    boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast lookups by coach
create index if not exists idx_cp_frameworks_coach
  on public.cp_frameworks(coach_id);

-- RLS
alter table public.cp_frameworks enable row level security;

create policy "Coaches see own frameworks"
  on public.cp_frameworks for select
  using (auth.uid() = coach_id);

create policy "Coaches insert own frameworks"
  on public.cp_frameworks for insert
  with check (auth.uid() = coach_id);

create policy "Coaches update own frameworks"
  on public.cp_frameworks for update
  using (auth.uid() = coach_id);

create policy "Coaches delete own frameworks"
  on public.cp_frameworks for delete
  using (auth.uid() = coach_id);

-- Ensure only one primary per coach
create unique index if not exists idx_cp_frameworks_primary
  on public.cp_frameworks(coach_id) where (is_primary = true);
