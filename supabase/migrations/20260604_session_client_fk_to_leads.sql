-- Fix: cp_coaching_sessions.client_id was constrained to cp_client_rooms(id),
-- but the whole app treats client_id as a LEAD id (the API validates against
-- cp_leads, SessionCard renders it as a lead, the dashboards key sessions by
-- lead). Logging a session for a lead with no client-room row therefore failed
-- the foreign key. Repoint the constraint at cp_leads(id). Table is empty, so
-- no data migration is needed.

alter table public.cp_coaching_sessions
  drop constraint if exists cp_coaching_sessions_client_id_fkey;

alter table public.cp_coaching_sessions
  add constraint cp_coaching_sessions_client_id_fkey
  foreign key (client_id) references public.cp_leads(id) on delete cascade;
