-- OAuth/API-key integrations for scheduling and meeting memory.
--
-- Gmail already uses cp_coach_integrations. This expands the same secure
-- table to Cal.com, Calendly, and Zoom so coaches can click connect instead
-- of only copy-pasting webhook URLs.

alter table public.cp_coach_integrations
  drop constraint if exists cp_coach_integrations_provider_check;

alter table public.cp_coach_integrations
  add constraint cp_coach_integrations_provider_check
  check (provider in ('gmail', 'cal_com', 'calendly', 'zoom', 'granola'));

alter table public.cp_coach_integrations
  add column if not exists metadata jsonb not null default '{}'::jsonb;
