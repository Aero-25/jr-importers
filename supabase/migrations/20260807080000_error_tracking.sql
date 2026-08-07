-- Error tracking.
--
-- A crash at the till was invisible. The failure mode is not a dramatic one: a
-- cashier hits an error, works around it, and never mentions it, so the bug
-- lives for months and the shop quietly stops using a feature.
--
-- Kept in-house rather than sent to a third party. It needs no account, no
-- monthly fee and no customer data leaving the country, and the volume a
-- one-shop system produces does not justify anything larger.

create table if not exists public.client_errors (
  id           bigint generated always as identity primary key,
  fingerprint  text not null,
  message      text not null,
  stack        text,
  surface      text,
  url          text,
  actor        text,
  user_agent   text,
  context      jsonb,
  seen_count   integer not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text
);

create unique index if not exists client_errors_fingerprint_key on public.client_errors (fingerprint);
create index if not exists client_errors_last_seen_idx on public.client_errors (last_seen desc);
create index if not exists client_errors_open_idx on public.client_errors (resolved_at) where resolved_at is null;

alter table public.client_errors enable row level security;

drop policy if exists "admins read client errors" on public.client_errors;
create policy "admins read client errors"
  on public.client_errors for select to authenticated
  using (public.is_admin());

-- Reporting goes through the function below, which is what stops a noisy loop
-- from writing ten thousand rows: repeats increment a counter instead.

create or replace function public.report_client_error(
  p_fingerprint text,
  p_message text,
  p_stack text default null,
  p_surface text default null,
  p_url text default null,
  p_user_agent text default null,
  p_context jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.client_errors (
    fingerprint, message, stack, surface, url, actor, user_agent, context
  )
  values (
    left(coalesce(p_fingerprint, 'unknown'), 200),
    left(coalesce(p_message, 'Unknown error'), 2000),
    left(p_stack, 8000),
    left(p_surface, 200),
    left(p_url, 500),
    public.current_actor(),
    left(p_user_agent, 400),
    p_context
  )
  on conflict (fingerprint) do update
    set seen_count = public.client_errors.seen_count + 1,
        last_seen  = now(),
        actor      = excluded.actor,
        url        = coalesce(excluded.url, public.client_errors.url),
        -- A fault that comes back after being marked fixed is not resolved.
        resolved_at = null,
        resolved_by = null;
end;
$$;

create or replace function public.resolve_client_error(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare e public.client_errors%rowtype;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  update public.client_errors
     set resolved_at = now(), resolved_by = public.current_actor()
   where id = p_id
  returning * into e;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Not found.');
  end if;
  return jsonb_build_object('ok', true, 'error', to_jsonb(e));
end;
$$;

-- Signed-in staff only: an open reporting endpoint is a free way to fill
-- somebody else's database.
revoke all on function public.report_client_error(text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.resolve_client_error(bigint) from public, anon;
grant execute on function public.report_client_error(text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.resolve_client_error(bigint) to authenticated;
