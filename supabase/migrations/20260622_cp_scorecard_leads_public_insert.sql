-- Allow the public marketing site (elevateaisystem.com) to submit scorecard
-- completions directly via Supabase REST with the anon key, matching the
-- established site convention (newsletter + quiz both insert client-side).
--
-- Insert-only: anon may write a lead but can never read, update, or delete.
-- The in-app /win flow still writes via the service-role admin client (which
-- bypasses RLS entirely), so this policy only opens the one public path.

drop policy if exists "anon can submit scorecard" on public.cp_scorecard_leads;
create policy "anon can submit scorecard" on public.cp_scorecard_leads
  for insert to anon
  with check (true);
