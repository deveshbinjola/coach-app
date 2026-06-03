-- Dhara: the coach's growing memory + conversation log.
create table if not exists public.cp_coach_memory (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact','preference','goal','audience','voice_note')),
  text text not null,
  source text not null check (source in ('conversation','explicit','brand_os')),
  source_ref text,
  confidence text not null default 'candidate' check (confidence in ('candidate','repeated','confirmed')),
  status text not null default 'active' check (status in ('active','forgotten')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.cp_coach_memory enable row level security;
drop policy if exists "coach owns memory" on public.cp_coach_memory;
create policy "coach owns memory" on public.cp_coach_memory
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index if not exists cp_coach_memory_active on public.cp_coach_memory (coach_id, status, confidence);

create table if not exists public.cp_dhara_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.cp_dhara_messages enable row level security;
drop policy if exists "coach owns dhara messages" on public.cp_dhara_messages;
create policy "coach owns dhara messages" on public.cp_dhara_messages
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index if not exists cp_dhara_messages_recent on public.cp_dhara_messages (coach_id, created_at desc);
