-- Voice Asset training ledger.
-- Stores what trained the coach's voice asset: call transcripts, voice notes,
-- workshops, extracted rules, and approval status. Audio files are transcribed
-- server-side and not stored here by default.

create table if not exists public.cp_voice_training_sources (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  voice_profile_id uuid references public.cp_voice_profiles(id) on delete set null,
  source_type text not null check (source_type in ('sales_call', 'voice_note', 'workshop')),
  title text not null default 'Voice signal',
  transcript text not null,
  audio_filename text,
  audio_mime_type text,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  extracted_rules jsonb not null default '[]'::jsonb,
  approved_rule_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists cp_voice_training_sources_coach_created_idx
  on public.cp_voice_training_sources (coach_id, created_at desc);

alter table public.cp_voice_training_sources enable row level security;

drop policy if exists "Coaches can read own voice training sources"
  on public.cp_voice_training_sources;
create policy "Coaches can read own voice training sources"
  on public.cp_voice_training_sources
  for select
  using (auth.uid() = coach_id);

drop policy if exists "Coaches can insert own voice training sources"
  on public.cp_voice_training_sources;
create policy "Coaches can insert own voice training sources"
  on public.cp_voice_training_sources
  for insert
  with check (auth.uid() = coach_id);

drop policy if exists "Coaches can update own voice training sources"
  on public.cp_voice_training_sources;
create policy "Coaches can update own voice training sources"
  on public.cp_voice_training_sources
  for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);
