-- Client Rooms: post-sale coaching hub.
--
-- Leads are pre-sale. Client rooms are after the sale: sessions, homework,
-- resources, and the next focus. This keeps the app from becoming Delenta
-- overnight while giving coaches the minimum post-sale operating system.

create table if not exists public.cp_client_rooms (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.cp_leads(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  program_name text not null default 'Coaching container',
  current_focus text,
  next_session_at timestamptz,
  payment_status text not null default 'unknown'
    check (payment_status in ('unknown', 'unpaid', 'paid', 'payment_plan', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, lead_id)
);

create table if not exists public.cp_client_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_room_id uuid not null references public.cp_client_rooms(id) on delete cascade,
  title text not null default 'Session note',
  session_at timestamptz not null default now(),
  notes text not null default '',
  wins text[] not null default '{}',
  blockers text[] not null default '{}',
  next_focus text,
  created_at timestamptz not null default now()
);

create table if not exists public.cp_client_tasks (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_room_id uuid not null references public.cp_client_rooms(id) on delete cascade,
  title text not null,
  status text not null default 'open'
    check (status in ('open', 'done')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cp_client_resources (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_room_id uuid not null references public.cp_client_rooms(id) on delete cascade,
  title text not null,
  url text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.cp_client_rooms enable row level security;
alter table public.cp_client_sessions enable row level security;
alter table public.cp_client_tasks enable row level security;
alter table public.cp_client_resources enable row level security;

drop policy if exists "coach owns client rooms" on public.cp_client_rooms;
create policy "coach owns client rooms" on public.cp_client_rooms
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists "coach owns client sessions" on public.cp_client_sessions;
create policy "coach owns client sessions" on public.cp_client_sessions
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists "coach owns client tasks" on public.cp_client_tasks;
create policy "coach owns client tasks" on public.cp_client_tasks
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

drop policy if exists "coach owns client resources" on public.cp_client_resources;
create policy "coach owns client resources" on public.cp_client_resources
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create index if not exists cp_client_rooms_coach_status
  on public.cp_client_rooms (coach_id, status, updated_at desc);

create index if not exists cp_client_sessions_room_created
  on public.cp_client_sessions (client_room_id, session_at desc);

create index if not exists cp_client_tasks_room_status
  on public.cp_client_tasks (client_room_id, status, created_at desc);

create index if not exists cp_client_resources_room_created
  on public.cp_client_resources (client_room_id, created_at desc);

create or replace function public.cp_client_rooms_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cp_client_rooms_updated_at on public.cp_client_rooms;
create trigger trg_cp_client_rooms_updated_at
  before update on public.cp_client_rooms
  for each row execute function public.cp_client_rooms_touch_updated_at();
