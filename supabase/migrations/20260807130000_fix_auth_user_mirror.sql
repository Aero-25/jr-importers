-- Creating a login for somebody who already has a staff record failed outright.
--
-- The mirror trigger guarded with `on conflict (id) do nothing`, but a profile
-- created from the Staff screen carries its own generated id and the same
-- email — so the collision was on users_email_key, the guard never fired, and
-- the unique violation rolled the whole signup back with a 500. The person got
-- a role, an email, and no possible way to sign in.
--
-- It would also have been wrong when it worked: the insert hardcodes
-- role 'customer', so adopting an existing staff profile that way would have
-- quietly demoted a manager to a shopper.
--
-- The profile is left exactly as it is. is_admin() and is_staff() both match on
-- email as well as id, so a staff row keeps working without its id being
-- rewritten to match auth.users — and rewriting a primary key that other tables
-- may reference is not worth doing for a link that is not needed.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not exists (
    select 1 from public.customers c where lower(c.email) = lower(new.email)
  ) then
    insert into public.customers (id, name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', new.email),
      new.email,
      new.raw_user_meta_data ->> 'phone'
    )
    on conflict (id) do nothing;
  end if;

  if not exists (
    select 1 from public.users u where lower(u.email) = lower(new.email)
  ) then
    insert into public.users (id, username, full_name, email, phone, role, active, password_hash)
    values (
      new.id,
      split_part(new.email, '@', 1),
      coalesce(new.raw_user_meta_data ->> 'name', new.email),
      new.email,
      new.raw_user_meta_data ->> 'phone',
      'customer',
      true,
      'supabase-auth-managed'
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$fn$;
