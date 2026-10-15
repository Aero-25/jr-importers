-- The role check must actually check.
--
-- public.is_admin() and public.is_staff() were found in production defined as
--
--     create or replace function public.is_admin()
--     returns boolean language sql as $$ select true $$;
--
-- — no SECURITY DEFINER, no search_path, and a constant TRUE for every caller,
-- including `anon`. They are the hinge the whole authorisation model hangs on:
-- 79 row-level policies read `is_admin() OR ...` or `is_staff() OR ...`, so
-- while these stubs stood, every one of those policies was a no-op and anybody
-- holding the public anon key had an administrator's reach over the shop.
--
-- The stubs came from an audit session: a throwaway `create or replace` used to
-- exercise admin paths inside `begin; ... rollback;` escaped its transaction and
-- was committed over the real definitions. Nothing in the application ever
-- redefines these, so there is no other way they could have changed.
--
-- This restores the definitions of 20260807110000_roles_and_cashup_amend.sql
-- verbatim, and the guard at the end of this file makes the same accident loud
-- next time instead of silent.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.active = true
      and (
        u.id = auth.uid()
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and lower(u.role) in ('admin', 'owner', 'manager')
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.active = true
      and (
        u.id = auth.uid()
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and lower(u.role) in ('admin', 'owner', 'manager', 'sales', 'cashier', 'staff')
  );
$$;

-- `create or replace` keeps existing grants, but state them again so this file
-- is enough on its own. anon needs is_admin() because policies written `to
-- public` evaluate it for unauthenticated readers too, and a bare
-- "permission denied for function is_admin" would break the storefront.
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- A stubbed role check is invisible: everything keeps working, only more
-- permissively. So assert the shape of it here, where a restore that goes
-- wrong fails the migration rather than quietly opening the shop.
do $guard$
declare
  bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
  into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_admin', 'is_staff')
    and (
      p.prosecdef is not true                      -- must run as owner
      or p.provolatile <> 's'                      -- must be stable
      or p.proconfig is null                       -- must pin search_path
      or not (p.proconfig @> array['search_path=public'])
      or pg_get_functiondef(p.oid) not like '%from public.users%'  -- must read a role
    );

  if bad is not null then
    raise exception 'role check is not a real check: %', bad;
  end if;
end
$guard$;
