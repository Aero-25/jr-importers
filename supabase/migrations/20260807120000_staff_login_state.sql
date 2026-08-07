-- Whether a staff record can actually sign in.
--
-- The console had no way to tell. public.users says what somebody may do;
-- auth.users decides whether they get through the door, and the auth schema is
-- not reachable from the browser — so a person could be given a role, saved,
-- and left with no login and nothing on screen saying so.
create or replace function public.staff_has_login(p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.is_admin()
     and exists (
       select 1 from auth.users a
       where lower(a.email) = lower(trim(p_email))
     );
$fn$;

revoke all on function public.staff_has_login(text) from public, anon;
grant execute on function public.staff_has_login(text) to authenticated;
