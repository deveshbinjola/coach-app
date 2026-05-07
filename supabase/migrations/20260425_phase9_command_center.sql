-- Phase 9: Command Center — content pipeline table
--
-- Replaces /today with /command-center — a unified view of content output
-- and lead pipeline. cp_content stores everything the Brand OS Agent
-- generates and tracks it through draft → scheduled → published.
--
-- Metricool integration (Phase 10) will backfill metricool_post_id and
-- populate the performance jsonb via a cron-driven Edge Function.

create table if not exists cp_content (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid references auth.users(id) on delete cascade not null,

  -- Core fields
  title               text not null,
  body                text,                           -- full content text
  platform            text not null                  -- 'linkedin' | 'instagram' | 'twitter' | 'facebook'
                        check (platform in ('linkedin','instagram','twitter','facebook')),
  content_type        text not null default 'post'   -- 'post' | 'carousel' | 'story' | 'reel' | 'thread'
                        check (content_type in ('post','carousel','story','reel','thread')),
  status              text not null default 'draft'  -- 'draft' | 'scheduled' | 'published' | 'failed'
                        check (status in ('draft','scheduled','published','failed')),

  -- Content pillar — maps to Brand OS pillars (authority / story / offer / engagement)
  pillar              text,

  -- Scheduling
  scheduled_at        timestamptz,
  published_at        timestamptz,

  -- Metricool integration (Phase 10)
  metricool_post_id   text unique,

  -- Performance data — pulled back from Metricool via Edge Function
  -- { views: number, likes: number, comments: number, shares: number, clicks: number }
  performance         jsonb not null default '{}',

  -- Attribution
  brand_os_generated  boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Coaches see only their own content
alter table cp_content enable row level security;

create policy "coach manages own content"
  on cp_content for all
  using  (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- Common query patterns
create index cp_content_coach_status   on cp_content (coach_id, status);
create index cp_content_coach_schedule on cp_content (coach_id, scheduled_at asc) where status = 'scheduled';
create index cp_content_coach_platform on cp_content (coach_id, platform);

-- Keep updated_at current
create or replace function cp_content_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cp_content_updated_at
  before update on cp_content
  for each row execute procedure cp_content_set_updated_at();
