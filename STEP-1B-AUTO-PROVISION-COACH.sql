-- Auto-provision a cp_coaches row when a new auth.user is created.
-- Apply via Supabase SQL Editor or MCP apply_migration.

-- Function: copy auth.users id + email into cp_coaches
create or replace function public.cp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cp_coaches (id, email, full_name, plan, onboarded_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'founding',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger: fires after each auth.users insert
drop trigger if exists cp_on_auth_user_created on auth.users;
create trigger cp_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cp_handle_new_user();
