-- Resonance Layer — Tier 1.
--
-- Three additive structures, in dependency order:
--   1. cp_pain_points — pain point as a first-class OBJECT (not a tag).
--      A coach-defined object with a name + a set of stages. The wedge:
--      coaches think in pain points first, so the platform should too.
--   2. cp_tags + cp_lead_tags — multi-axis tagging. Tag a lead by program,
--      source, or free custom tags. Warmth + source already live as their
--      own cp_leads columns; this generalizes the rest.
--   3. cp_coaches.sacred_zones — content kinds the AI will not generate
--      net-new. The moat: AI that refuses to write things.
--
-- Everything here is ADDITIVE. The existing cp_leads.pain_signal (coarse
-- enum array) and cp_leads.tags (flat text array) stay untouched for
-- back-compat. The new object layer sits alongside them.
--
-- Apply via Supabase SQL editor or MCP apply_migration. Run after a backup.

-- ---------------------------------------------------------------------------
-- 1. cp_pain_points — pain point as an object
-- ---------------------------------------------------------------------------

create table if not exists public.cp_pain_points (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default 'slate',
  -- Default stage ladder. Coaches can edit per pain point later; for Tier 1
  -- this is the shared shape so leads always have a stage to sit on.
  stages      text[] not null default '{aware,exploring,committed,working,integrated}',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.cp_pain_points is
  'Pain point as a first-class object. Coach-defined. Leads carry a primary_pain_point_id + pain_stage and can be sorted, segmented, and broadcast on it.';

-- One pain point name per coach, case-insensitive.
create unique index if not exists cp_pain_points_coach_name
  on public.cp_pain_points (coach_id, lower(name));

create index if not exists cp_pain_points_coach_sort
  on public.cp_pain_points (coach_id, sort_order asc);

alter table public.cp_pain_points enable row level security;

drop policy if exists "coach owns pain points" on public.cp_pain_points;
create policy "coach owns pain points" on public.cp_pain_points
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- 2. cp_tags + cp_lead_tags — multi-axis tagging
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cp_tag_axis') then
    create type cp_tag_axis as enum ('program', 'source', 'custom');
  end if;
end$$;

create table if not exists public.cp_tags (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references auth.users(id) on delete cascade,
  axis       cp_tag_axis not null default 'custom',
  label      text not null,
  color      text not null default 'slate',
  created_at timestamptz not null default now()
);

comment on table public.cp_tags is
  'Multi-axis tags. axis = program | source | custom. Attached to leads via cp_lead_tags.';

-- One label per (coach, axis), case-insensitive.
create unique index if not exists cp_tags_coach_axis_label
  on public.cp_tags (coach_id, axis, lower(label));

create index if not exists cp_tags_coach_axis
  on public.cp_tags (coach_id, axis);

alter table public.cp_tags enable row level security;

drop policy if exists "coach owns tags" on public.cp_tags;
create policy "coach owns tags" on public.cp_tags
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create table if not exists public.cp_lead_tags (
  lead_id    uuid not null references public.cp_leads(id) on delete cascade,
  tag_id     uuid not null references public.cp_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

comment on table public.cp_lead_tags is
  'Join: leads <-> tags. RLS goes through cp_tags ownership.';

create index if not exists cp_lead_tags_tag on public.cp_lead_tags (tag_id);

alter table public.cp_lead_tags enable row level security;

-- Coach owns a join row if they own the tag (tag ownership implies lead
-- ownership in practice — tags and leads are both coach-scoped).
drop policy if exists "coach owns lead tags" on public.cp_lead_tags;
create policy "coach owns lead tags" on public.cp_lead_tags
  for all using (
    exists (
      select 1 from public.cp_tags t
      where t.id = cp_lead_tags.tag_id and t.coach_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.cp_tags t
      where t.id = cp_lead_tags.tag_id and t.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. cp_leads — pain point object reference + stage
-- ---------------------------------------------------------------------------

alter table public.cp_leads
  add column if not exists primary_pain_point_id uuid
    references public.cp_pain_points(id) on delete set null,
  add column if not exists pain_stage text;

comment on column public.cp_leads.primary_pain_point_id is
  'The lead''s primary pain point, as a structured object. Distinct from pain_signal (coarse enum quick-tag).';
comment on column public.cp_leads.pain_stage is
  'Where the lead sits on their pain point''s stage ladder. Free text validated against cp_pain_points.stages in the UI.';

create index if not exists cp_leads_coach_pain_point
  on public.cp_leads (coach_id, primary_pain_point_id);

-- ---------------------------------------------------------------------------
-- 4. cp_coaches — sacred zones
-- ---------------------------------------------------------------------------

alter table public.cp_coaches
  add column if not exists sacred_zones jsonb not null default '[]'::jsonb;

comment on column public.cp_coaches.sacred_zones is
  'Array of content kinds the AI will NOT generate net-new (e.g. ["newsletter"]). It may still REPURPOSE an existing piece into a sacred zone. Enforced in /api/content/draft.';

-- ---------------------------------------------------------------------------
-- 5. Verification
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('cp_pain_points','cp_tags','cp_lead_tags');
--
--   select column_name from information_schema.columns
--   where table_name = 'cp_leads'
--   and column_name in ('primary_pain_point_id','pain_stage');
--
--   select column_name from information_schema.columns
--   where table_name = 'cp_coaches' and column_name = 'sacred_zones';
