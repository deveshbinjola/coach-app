-- Offerings — coach-defined offering objects + many-to-many client membership.
--
-- Each cp_client_rooms row carries a free-text program_name today. Every
-- coach reinvents the same names per-client. Promoting "offering" to a
-- first-class object lets a coach see every member of the men's group in
-- one place, every retreat attendee with their referral chain, and one
-- client across all the offerings they're in.
--
-- Many-to-many membership: a client can be in 1:1, the men's group, AND
-- a retreat at the same time.
--
-- Referrals — already wired. cp_client_rooms.lead_id → cp_leads
-- .referred_by_lead_id resolves to the referrer. No new schema needed;
-- we just surface it in the offering detail view.
--
-- Apply via Supabase SQL editor or MCP apply_migration. Additive.

-- ---------------------------------------------------------------------------
-- 1. cp_offering_kind enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cp_offering_kind') then
    create type cp_offering_kind as enum (
      'one_on_one',
      'private_intensive',
      'mens_group',
      'private_retreat',
      'online_retreat',
      'custom'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. cp_offerings — the catalog
-- ---------------------------------------------------------------------------

create table if not exists public.cp_offerings (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        cp_offering_kind not null default 'one_on_one',
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  description text,
  capacity    int,                              -- null = unlimited
  price_cents bigint,                           -- null = unset (cents)
  starts_at   date,                             -- for cohort-shaped offerings
  ends_at     date,
  color       text not null default 'slate',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.cp_offerings is
  'Coach-defined offerings. A client can be in many at once via cp_offering_members.';

-- One offering name per coach, case-insensitive.
create unique index if not exists cp_offerings_coach_name
  on public.cp_offerings (coach_id, lower(name));

create index if not exists cp_offerings_coach_status_sort
  on public.cp_offerings (coach_id, status, sort_order asc);

alter table public.cp_offerings enable row level security;

drop policy if exists "coach owns offerings" on public.cp_offerings;
create policy "coach owns offerings" on public.cp_offerings
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- 3. cp_offering_members — join (offering ↔ client room)
-- ---------------------------------------------------------------------------

create table if not exists public.cp_offering_members (
  offering_id    uuid not null references public.cp_offerings(id) on delete cascade,
  client_room_id uuid not null references public.cp_client_rooms(id) on delete cascade,
  role           text not null default 'member'
                 check (role in ('member', 'lead', 'co_facilitator')),
  status         text not null default 'active'
                 check (status in ('active', 'paused', 'completed', 'dropped')),
  joined_at      timestamptz not null default now(),
  notes          text,
  primary key (offering_id, client_room_id)
);

comment on table public.cp_offering_members is
  'Many-to-many: a client room can belong to many offerings. RLS goes through cp_offerings ownership.';

create index if not exists cp_offering_members_room
  on public.cp_offering_members (client_room_id);

alter table public.cp_offering_members enable row level security;

drop policy if exists "coach owns offering members" on public.cp_offering_members;
create policy "coach owns offering members" on public.cp_offering_members
  for all using (
    exists (
      select 1 from public.cp_offerings o
      where o.id = cp_offering_members.offering_id and o.coach_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.cp_offerings o
      where o.id = cp_offering_members.offering_id and o.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('cp_offerings', 'cp_offering_members');
--   select unnest(enum_range(null::cp_offering_kind));
