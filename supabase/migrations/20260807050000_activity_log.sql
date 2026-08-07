-- Who did what.
--
-- Nobody could answer who changed a price, deleted a job card or adjusted
-- stock. With one shared admin login that did not matter much; the moment a
-- cashier account exists it matters a great deal, and a log that only starts
-- when trouble appears is worth nothing.
--
-- Recorded by trigger rather than from the client, so it captures the change
-- even when it was made from the SQL editor, a script, or a screen nobody has
-- written yet.

create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  actor      text,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  summary    text,
  changes    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_entity_idx  on public.activity_log (entity, entity_id);
create index if not exists activity_log_actor_idx   on public.activity_log (actor);

alter table public.activity_log enable row level security;

drop policy if exists "admins read the activity log" on public.activity_log;
create policy "admins read the activity log"
  on public.activity_log for select to authenticated
  using (public.is_admin());

-- No write policy at all. The log is written by the trigger below, which runs
-- as definer; a log anyone can edit is not a log.

/* ── The recorder ────────────────────────────────────────────────────────── */

-- Columns that are noise, and columns that must never be copied anywhere.
create or replace function private.loggable(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key not in (
    'updated_at', 'created_at', 'cart',
    -- Never. A log is read by more people than the users table is.
    'password_hash', 'accepted_signature', 'pattern_pin', 'accept_token'
  );
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text := public.current_actor();
  v_new jsonb;
  v_old jsonb;
  v_changes jsonb;
  v_id text;
  v_summary text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id := v_old ->> 'id';
    v_summary := format('Deleted %s %s', tg_table_name, coalesce(v_old ->> 'name', v_id, ''));

    insert into public.activity_log (actor, actor_id, action, entity, entity_id, summary, changes)
    values (v_actor, auth.uid(), 'delete', tg_table_name, v_id, v_summary,
            (select jsonb_object_agg(key, value) from jsonb_each(v_old) where private.loggable(key)));
    return old;
  end if;

  v_new := to_jsonb(new);
  v_id := v_new ->> 'id';

  if tg_op = 'INSERT' then
    v_summary := format('Created %s %s', tg_table_name, coalesce(v_new ->> 'name', v_id, ''));

    insert into public.activity_log (actor, actor_id, action, entity, entity_id, summary)
    values (v_actor, auth.uid(), 'insert', tg_table_name, v_id, v_summary);
    return new;
  end if;

  v_old := to_jsonb(old);

  -- Only the fields that actually moved. A row dump per update would bury the
  -- one change somebody is looking for.
  select jsonb_object_agg(key, jsonb_build_array(v_old -> key, v_new -> key))
  into v_changes
  from jsonb_each(v_new)
  where private.loggable(key)
    and v_new -> key is distinct from v_old -> key;

  if v_changes is null then
    return new;
  end if;

  v_summary := format(
    'Updated %s %s (%s)',
    tg_table_name,
    coalesce(v_new ->> 'name', v_id, ''),
    (select string_agg(key, ', ' order by key) from jsonb_object_keys(v_changes) as k(key))
  );

  insert into public.activity_log (actor, actor_id, action, entity, entity_id, summary, changes)
  values (v_actor, auth.uid(), 'update', tg_table_name, v_id, v_summary, v_changes);

  return new;
end;
$$;

/* ── What gets watched ───────────────────────────────────────────────────── */

do $$
declare
  t text;
begin
  -- Money, stock, access and customer commitments. Deliberately not orders:
  -- every sale would drown the log, and orders are already an audit trail of
  -- themselves.
  foreach t in array array[
    'products', 'users', 'job_cards', 'expenses', 'refunds',
    'settings', 'suppliers', 'coupons', 'laybys', 'till_shifts'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists log_activity_trg on public.%I', t);
      execute format(
        'create trigger log_activity_trg after insert or update or delete on public.%I
           for each row execute function public.log_activity()', t
      );
    end if;
  end loop;
end;
$$;
