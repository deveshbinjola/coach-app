# Resonance Layer — Tier 1 Feature Spec

**Status:** Greenlit — building now.
**Source:** Speed call (2026-05-14) + Missy validation. The "resonance layer" is
the 20% of Speed's wishlist that generalizes to every coach AND advances Brand OS.
**Effort:** ~3 focused days.

---

## Thesis

Speed thinks in **pain points first**. Every CRM thinks in pipeline stages first.
If the platform mirrors how a coach already sees their people, adoption is automatic.

Tier 1 ships three things, in dependency order:

1. **Multi-axis tagging** — the substrate. Tag a lead by program, source, and free
   custom tags. (Warmth + source already exist as first-class columns.)
2. **Pain point as a first-class object** — not a tag. A coach-defined object with a
   name and a stage. Sortable, segmentable, broadcastable. The wedge.
3. **Sacred zones** — content types the AI refuses to generate net-new. The moat:
   *AI that refuses to write things.* Plugs into the existing voice overlay.

Explicitly **out of scope** for Tier 1 (parked, will spec separately if 5+ coaches ask):
Calendly integration, multi-email routing, broadcast engine, voice integrity score.
Those are Tier 2 — they sit *on top of* this layer.

---

## Data model

New migration: `supabase/migrations/20260514_resonance_layer.sql`

### `cp_pain_points` — pain point as an object
```sql
create table public.cp_pain_points (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,                       -- "Heartbreak", "Purpose confusion"
  description text,
  color       text not null default 'slate',
  stages      text[] not null default
              '{aware,exploring,committed,working,integrated}',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
-- RLS: coach owns own rows. unique (coach_id, lower(name)).
```

### `cp_tags` + `cp_lead_tags` — multi-axis tagging
```sql
create type cp_tag_axis as enum ('program','source','custom');

create table public.cp_tags (
  id        uuid primary key default gen_random_uuid(),
  coach_id  uuid not null references auth.users(id) on delete cascade,
  axis      cp_tag_axis not null default 'custom',
  label     text not null,
  color     text not null default 'slate',
  created_at timestamptz not null default now()
);
-- unique (coach_id, axis, lower(label))

create table public.cp_lead_tags (
  lead_id uuid not null references public.cp_leads(id) on delete cascade,
  tag_id  uuid not null references public.cp_tags(id) on delete cascade,
  primary key (lead_id, tag_id)
);
-- RLS on both: coach owns via cp_leads / cp_tags ownership.
```

### `cp_leads` additions
```sql
alter table public.cp_leads
  add column primary_pain_point_id uuid references public.cp_pain_points(id) on delete set null,
  add column pain_stage text;
```
The existing `pain_signal text[]` (coarse 7-value enum) and flat `tags text[]` stay
for back-compat — the new object layer is additive. `pain_signal` becomes the
"quick gut tag", `primary_pain_point_id` is the structured object.

### `cp_coaches` addition — sacred zones
```sql
alter table public.cp_coaches
  add column sacred_zones jsonb not null default '[]';
-- e.g. ["newsletter"] — content kinds the AI will not generate net-new.
```

---

## API surface

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/pain-points` | GET, POST | List / create coach's pain point objects |
| `/api/v1/pain-points/[id]` | PATCH, DELETE | Rename / recolor / reorder / delete |
| `/api/v1/tags` | GET, POST | List / create tags (axis + label) |
| `/api/v1/tags/[id]` | DELETE | Delete a tag (cascades the join rows) |

Lead ↔ tag attach and lead pain-point assignment go through the **Supabase browser
client with RLS** (same pattern as `EditLeadForm`), not the agent API — these are
UI writes, not agent writes.

Sacred zones: read/written through the existing `cp_coaches` overlay path; a new
`/settings` panel toggles them. Enforcement is a server-side helper, not an endpoint.

---

## Sacred zone enforcement

`lib/brand-os/sacred-zones.ts`:
```ts
isSacred(coachSacredZones: string[], kind: string): boolean
assertNotSacredOrRepurpose(kind, sourceContentId, sacredZones): void  // throws if net-new in a sacred zone
```

Wired into `/api/content/draft`:
- If the requested draft `kind` maps to a sacred zone **and** no `sourceContentId` is
  passed → **refuse** with a clear message: *"Newsletter is a sacred zone. The AI can
  repurpose an existing piece into it, but won't write a net-new one."*
- If a `sourceContentId` IS passed → allowed (repurpose-only mode).
- Non-sacred kinds → unchanged.

This is the Tier 1 slice of "repurpose-only mode" — full repurpose UI is Tier 2.

---

## UI surfaces (Tier 1)

1. **EditLeadForm / NewLeadForm** — pain point picker (select from coach's objects +
   "add new"), pain stage select, program tag picker.
2. **Lead list / inbox** — filter chip row: filter by pain point, by program tag.
   (Warmth + source filters already exist.)
3. **/settings → Resonance panel** — manage pain point objects, manage tags, toggle
   sacred zones.

---

## Day-by-day

| Day | Work |
|---|---|
| 1 | Migration, types, RLS, backfill-safe. Pain-points + tags API endpoints. |
| 2 | EditLeadForm + NewLeadForm pain-point + tag UI. Lead-list filter chips. |
| 3 | Sacred zones: helper, content-draft enforcement, /settings Resonance panel. QA. |

---

## Validation criteria

Tier 1 is "done" when:
- A coach can create a pain point object, assign it + a stage to a lead, and filter
  the lead list by it.
- A coach can tag a lead with a program tag and filter by it.
- A coach can mark `newsletter` sacred; `/api/content/draft` refuses a net-new
  newsletter and allows a repurpose.

## Tier 2 trigger

Build the broadcast engine + interaction memory + voice integrity score **after**
3+ coaches are actively segmenting on pain points. The resonance layer has to be
*used* before the things that sit on top of it are worth building.
