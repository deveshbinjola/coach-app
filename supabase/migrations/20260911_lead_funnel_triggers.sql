-- Lead-funnel instrumentation — P0 slice 5 (roadmap/p0-one-surface.md).
--
-- Why triggers and not app code: the Approval Queue and the lead page write
-- cp_leads straight from the browser (supabase-js), so any app-level logging
-- would miss exactly the transitions the One Surface creates. The database
-- is the only place that sees every path (API routes, edge functions,
-- browser clients, imports).
--
-- Events written (vocabulary mirrored in lib/funnel.ts LEAD_FUNNEL_EVENTS):
--   lead_created        cp_leads INSERT
--   lead_contacted      cp_leads.status -> 'contacted'
--   lead_qualified      cp_leads.status -> 'qualified'
--   lead_booked         cp_leads.status -> 'booked'
--   lead_became_client  cp_leads.status -> 'client'
--   lead_closed_lost    cp_leads.status -> 'closed_lost'
--   lead_enrolled       cp_offering_members INSERT (coach via offering,
--                       lead via client room)
--   payment_received    cp_payments INSERT (lead linkage TODO when
--                       cp_payments carries a lead reference)
--
-- cp_funnel_events is append-only with no authenticated INSERT policy;
-- these functions are SECURITY DEFINER so the inserts ride the owner role,
-- same trust model as lib/funnel-log.ts using the service-role client.
--
-- Apply via Supabase SQL editor or MCP apply_migration.

create or replace function public.cp_log_funnel_event(
  p_coach uuid,
  p_name  text,
  p_meta  jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.cp_funnel_events (coach_id, name, meta)
  values (p_coach, p_name, coalesce(p_meta, '{}'::jsonb));
$$;

-- 1. lead_created --------------------------------------------------------

create or replace function public.cp_trg_lead_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cp_log_funnel_event(
    new.coach_id,
    'lead_created',
    jsonb_build_object('lead_id', new.id, 'source', new.source, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_cp_leads_funnel_insert on public.cp_leads;
create trigger trg_cp_leads_funnel_insert
  after insert on public.cp_leads
  for each row execute function public.cp_trg_lead_created();

-- 2. status transitions ---------------------------------------------------

create or replace function public.cp_trg_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('contacted', 'qualified', 'booked', 'client', 'closed_lost') then
    perform public.cp_log_funnel_event(
      new.coach_id,
      case new.status
        when 'contacted'   then 'lead_contacted'
        when 'qualified'   then 'lead_qualified'
        when 'booked'      then 'lead_booked'
        when 'client'      then 'lead_became_client'
        when 'closed_lost' then 'lead_closed_lost'
      end,
      jsonb_build_object('lead_id', new.id, 'from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cp_leads_funnel_status on public.cp_leads;
create trigger trg_cp_leads_funnel_status
  after update of status on public.cp_leads
  for each row execute function public.cp_trg_lead_status_change();

-- 3. lead_enrolled --------------------------------------------------------

create or replace function public.cp_trg_offering_member_enrolled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
  v_lead  uuid;
begin
  select o.coach_id into v_coach from public.cp_offerings o where o.id = new.offering_id;
  select r.lead_id  into v_lead  from public.cp_client_rooms r where r.id = new.client_room_id;
  if v_coach is not null then
    perform public.cp_log_funnel_event(
      v_coach,
      'lead_enrolled',
      jsonb_build_object('lead_id', v_lead, 'offering_id', new.offering_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cp_offering_members_funnel on public.cp_offering_members;
create trigger trg_cp_offering_members_funnel
  after insert on public.cp_offering_members
  for each row execute function public.cp_trg_offering_member_enrolled();

-- 4. payment_received -----------------------------------------------------

create or replace function public.cp_trg_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cp_log_funnel_event(
    new.coach_id,
    'payment_received',
    jsonb_build_object('amount_cents', new.amount_cents)
  );
  return new;
end;
$$;

drop trigger if exists trg_cp_payments_funnel on public.cp_payments;
create trigger trg_cp_payments_funnel
  after insert on public.cp_payments
  for each row execute function public.cp_trg_payment_received();
