-- Push a OneSignal notification to admin devices (web + APK) whenever a customer
-- order lands. Uses pg_net to call the OneSignal REST API straight from a trigger.
-- The REST key lives in a `private` schema that is NOT exposed to the PostgREST API.

create extension if not exists pg_net;

create schema if not exists private;

-- Holds the OneSignal credentials. Single row (id=1). Populated once the
-- OneSignal app exists (App ID + REST API Key). Not reachable from anon/auth API.
create table if not exists private.push_config (
  id int primary key default 1,
  onesignal_app_id text,
  onesignal_rest_key text,
  admin_url text not null default 'https://jr-importers.pages.dev/admin',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.push_config (id) values (1) on conflict (id) do nothing;
revoke all on private.push_config from anon, authenticated;

create or replace function public.notify_admins_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, private, net, extensions
as $$
declare
  cfg private.push_config;
  item_count int;
  body jsonb;
begin
  select * into cfg from private.push_config where id = 1;

  -- Only fire when configured and for customer/online orders (skip POS 'Paid' sales).
  if cfg.onesignal_app_id is null or cfg.onesignal_rest_key is null or cfg.enabled = false then
    return new;
  end if;
  if not (coalesce(new.status, '') = 'Pending' or coalesce(new.payment_method, '') ilike '%dpo%') then
    return new;
  end if;

  item_count := coalesce(jsonb_array_length(new.items), 0);

  body := jsonb_build_object(
    'app_id', cfg.onesignal_app_id,
    'filters', jsonb_build_array(
      jsonb_build_object('field','tag','key','role','relation','=','value','admin')
    ),
    'headings', jsonb_build_object('en', '🛒 New order received'),
    'contents', jsonb_build_object('en',
      coalesce(new.customer_name, 'Customer') || ' · N$ ' ||
      to_char(coalesce(new.total_amount, 0), 'FM999G999G990D00') ||
      ' · ' || item_count || ' item(s)'),
    'data', jsonb_build_object('order_id', new.id::text, 'type', 'new_order'),
    'url', cfg.admin_url || '#online-orders',
    'android_channel_id', null,
    'priority', 10
  );

  perform net.http_post(
    url := 'https://onesignal.com/api/v1/notifications',
    body := body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Basic ' || cfg.onesignal_rest_key
    ),
    timeout_milliseconds := 6000
  );

  return new;
exception when others then
  -- Never let a notification failure block the order from being created.
  return new;
end;
$$;

drop trigger if exists trg_notify_admins_new_order on public.orders;
create trigger trg_notify_admins_new_order
  after insert on public.orders
  for each row execute function public.notify_admins_new_order();

-- Helper to set the OneSignal credentials (call from the Management API / SQL editor):
--   select private.set_push_config('<ONESIGNAL_APP_ID>', '<ONESIGNAL_REST_API_KEY>');
create or replace function private.set_push_config(p_app_id text, p_rest_key text)
returns void language sql security definer set search_path = private as $$
  update private.push_config
     set onesignal_app_id = p_app_id,
         onesignal_rest_key = p_rest_key,
         enabled = true,
         updated_at = now()
   where id = 1;
$$;
