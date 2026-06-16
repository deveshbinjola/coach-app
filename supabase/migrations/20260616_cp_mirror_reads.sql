-- The Mirror, Phase 1: instant-mirror read log.
-- A coach brings a stuck situation; Claude classifies the KIND of problem
-- (recipe / puzzle / garden / fire), names the thinking-mistake, and routes
-- them to the right protocol. Every read lands here. Phase 2 (within-week
-- digest) and Phase 3 (cross-week identity mirror) read straight off this
-- table -- it is the compounding asset, the moat. See docs/the-mirror-spec.html.

create table if not exists public.cp_mirror_reads (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references auth.users(id) on delete cascade,
  input               text not null,                  -- what the coach typed
  -- The read. system_type is null on the clarification path (no label yet).
  system_type         text
                        check (system_type in ('recipe', 'puzzle', 'garden', 'fire')),
  type_reason         text,
  mirror_line         text,                           -- the sharp single sentence (the hook)
  the_mistake         text,                           -- the called-out mismatch; null if none seen
  the_move            text,                           -- one concrete next action
  confidence          numeric(3,2),                   -- 0..1, gates the guardrail
  needs_clarification boolean not null default false,
  clarifying_question text,
  is_crisis           boolean not null default false, -- true -> framework suppressed, human mode
  -- The investment tap. Feeds precision calibration + the compounding mirror.
  tap                 text check (tap in ('yes', 'not_quite')),
  created_at          timestamptz not null default now()
);

comment on table public.cp_mirror_reads is 'The Mirror read log. Each row is one classify-and-name-the-mistake read. Phases 2-3 (weekly + identity mirror) read off this table.';

-- The weekly + identity mirror scan a coach''s reads in time order.
create index if not exists cp_mirror_reads_coach_idx on public.cp_mirror_reads (coach_id, created_at desc);
-- Calibration: review low-precision patterns by type.
create index if not exists cp_mirror_reads_type_idx on public.cp_mirror_reads (system_type, created_at desc);

alter table public.cp_mirror_reads enable row level security;

-- A coach owns their reads. The weekly digest job (service role) bypasses RLS.
drop policy if exists "coach owns mirror reads" on public.cp_mirror_reads;
create policy "coach owns mirror reads" on public.cp_mirror_reads
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
