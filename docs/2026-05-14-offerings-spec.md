# Offerings — Feature Spec

**Status:** Greenlit. Decisions locked: many-to-many membership, secondary tab on /clients.
**Effort:** ~2 focused days.

---

## Thesis

Each `cp_client_rooms` row already carries a `program_name` text field — every coach reinvents it per-client. Promoting it to a first-class object lets a coach see *every member of the men's group in one place*, *every retreat attendee with their referral chain*, and *one client across all the offerings they're in*.

Membership is many-to-many: a client can be in 1:1, the men's group, AND a retreat at the same time.

---

## Data model

Migration: `supabase/migrations/20260514_offerings.sql`.

### `cp_offerings`
```sql
create type cp_offering_kind as enum (
  'one_on_one',
  'private_intensive',
  'mens_group',
  'private_retreat',
  'online_retreat',
  'custom'
);

create table public.cp_offerings (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        cp_offering_kind not null default 'one_on_one',
  status      text not null default 'active'
              check (status in ('active', 'archived')),
  description text,
  capacity    int,                            -- null = unlimited
  price_cents bigint,                         -- null = unset
  starts_at   date,                           -- for cohort-shaped offerings
  ends_at     date,
  color       text not null default 'slate',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
-- unique (coach_id, lower(name)), RLS, index on (coach_id, status, sort_order)
```

### `cp_offering_members` (join)
```sql
create table public.cp_offering_members (
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
-- RLS via cp_offerings ownership.
```

**Referrals — already in the schema.** `cp_client_rooms.lead_id → cp_leads.referred_by_lead_id` resolves to the referrer's name. No new schema; we just surface it in the offering detail view.

---

## Surfaces

1. **/settings → Offerings** — manage the catalog (add/edit/archive/reorder). Same shape as the Resonance panel.
2. **/clients** — add a tab bar: **Clients** (existing view) | **Offerings**. The Offerings view is a grid of offering cards (name, kind badge, member count, capacity, next session date).
3. **/clients/offerings/[id]** (new) — offering detail:
   - Header: name, kind badge, status, capacity / member count, dates if any
   - Roster table: member name, role, joined date, payment status, referred by (linked name), current focus
   - Referral chains (a small sub-section): "Marcus → Sarah → Tom"
   - Add member: picker pulling from this coach's `cp_client_rooms` not already in the offering
   - Notes / log: chronological events (member joined, member completed, etc.)

---

## Day 1 → Day 2

| Day | Work |
|---|---|
| 1 | Migration, types, settings catalog panel, /clients tab bar, OfferingsWorkspace grid. |
| 2 | Offering detail page (roster, referrals, add-member). Polish. |

---

## Out of scope (Tier 2)

- Per-offering session scheduling (offerings sharing one session vs each member's own)
- Group session notes (one note → all members)
- Payment plans / invoicing per offering
- Public-facing offering page (sales)

These wait until the data layer is being used.
