-- Import job tracker for async source imports (Onboarding v2, Plan 3).
--
-- One row per import attempt. For Instagram, external_run_id / external_dataset_id
-- hold the Apify run + dataset ids so the status endpoint can poll. Inserts/updates
-- happen server-side via the service-role admin client; coaches may read their own.

create table if not exists public.cp_imports (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null references auth.users(id) on delete cascade,
  source               text not null,                       -- 'instagram' | 'website' | 'csv' | ...
  status               text not null default 'processing',  -- 'processing' | 'complete' | 'failed'
  source_ref           text,                                -- e.g. the instagram handle
  external_run_id      text,                                -- Apify run id
  external_dataset_id  text,                                -- Apify dataset id
  items_found          integer not null default 0,
  items_imported       integer not null default 0,
  error                text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

alter table public.cp_imports enable row level security;

drop policy if exists "coach reads own imports" on public.cp_imports;
create policy "coach reads own imports" on public.cp_imports
  for select using (auth.uid() = coach_id);

create index if not exists cp_imports_coach_created
  on public.cp_imports (coach_id, created_at desc);
