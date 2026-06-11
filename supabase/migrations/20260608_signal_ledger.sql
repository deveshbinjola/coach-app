-- Append-only signal ledger. Every feature deposits here via lib/signals.ts.
create table if not exists public.cp_signals (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  source      text not null check (source in ('session','voice','brand_os','lead','trust')),
  kind        text not null check (kind in ('topic','commitment','pattern','somatic','goal','note')),
  ref_table   text not null,
  ref_id      uuid,
  subject_id  uuid,
  text        text not null,
  evidence    text,
  confidence  text not null default 'candidate' check (confidence in ('candidate','repeated','confirmed')),
  weight      real not null default 1,
  status      text not null default 'active' check (status in ('active','dismissed')),
  created_at  timestamptz not null default now()
);

alter table public.cp_signals enable row level security;
drop policy if exists "coach owns signals" on public.cp_signals;
create policy "coach owns signals" on public.cp_signals
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create index if not exists cp_signals_brief on public.cp_signals (coach_id, subject_id, status, created_at desc);
create index if not exists cp_signals_distilled on public.cp_signals (coach_id, source, ref_id);

-- Allow distilled session facts to live in cp_coach_memory.
alter table public.cp_coach_memory drop constraint if exists cp_coach_memory_source_check;
alter table public.cp_coach_memory add constraint cp_coach_memory_source_check
  check (source in ('conversation','explicit','brand_os','session'));
