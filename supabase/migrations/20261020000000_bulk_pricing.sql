-- Bulk pricing: a supplier list in, a selling price list out.
--
-- Every Monday a supplier emails a spreadsheet of costs. Turning it into a
-- customer price list meant rebuilding the same workbook by hand, which is
-- where the markup per handset lived — in one person's memory and last week's
-- file. This keeps the markup in the database, keyed on the variant rather than
-- the product name, so next Monday's upload remembers what each phone is sold
-- at even when the supplier renames it or the cost moves.
--
-- Money is computed here, in numeric, not in the browser. The order matters and
-- is fixed by the shop:
--
--   landed      = cost + cost * import_vat
--   excl. VAT   = landed + landed * markup
--   final       = excl + excl * sales_vat
--
-- Rates are settings, so they can change. A generated list therefore stores the
-- rates and the stock position it was built with: a price list is a statement
-- about a particular Monday and must not quietly restate itself later.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- Reuses the existing settings table so the Settings screen keeps working.
-- 17% import VAT and 22% markup are the shop's stated defaults.
-- settings.value is jsonb, so numbers go in as numbers and text as JSON text.
-- to_jsonb() does the escaping, which matters for the multi-line email body.
insert into public.settings (key, value) values
  ('bulk_import_vat_rate',  to_jsonb(0.17)),
  ('bulk_sales_vat_rate',   to_jsonb(0.15)),
  ('bulk_default_markup',   to_jsonb(22)),
  ('bulk_schedule_day',     to_jsonb(1)),            -- 1 = Monday (ISO)
  ('bulk_schedule_time',    to_jsonb('08:00'::text)),
  ('bulk_auto_send',        to_jsonb(false)),
  ('bulk_require_approval', to_jsonb(true)),
  ('bulk_email_subject',
     to_jsonb('JR Importers | Weekly Samsung Price List - {date}'::text)),
  ('bulk_email_body', to_jsonb($body$Good Morning {name},

Our latest JR Importers Samsung smartphone price list is now available!

Please find this week's updated pricing attached, including our latest stock availability.

Products highlighted in green are currently in stock and available.

For orders, enquiries or availability confirmations, feel free to contact us.

Kind regards,
JR Importers
Shop Tech. Shop Smart.
www.jrimporters.com$body$::text))
on conflict (key) do nothing;

-- Reads a setting as text whatever JSON scalar it is stored as.
create or replace function public.bulk_setting(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select nullif(trim(value #>> '{}'), '') from public.settings where key = p_key),
    p_default
  );
$$;

revoke all on function public.bulk_setting(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The uploaded supplier file
-- ---------------------------------------------------------------------------
create table if not exists public.bulk_supplier_uploads (
  id             bigserial primary key,
  file_name      text not null,
  storage_path   text,
  supplier_name  text,
  list_date      date,
  row_count      integer not null default 0,
  phone_count    integer not null default 0,
  skipped        jsonb  not null default '[]'::jsonb,
  rows           jsonb  not null default '[]'::jsonb,
  uploaded_by    text,
  created_at     timestamptz not null default now()
);

comment on column public.bulk_supplier_uploads.rows is
  'The parsed Samsung phone lines: variant_key, description, model, storage, five_g, supplier_cost.';
comment on column public.bulk_supplier_uploads.skipped is
  'Lines deliberately not imported, with the reason — tablets, other brands, unparseable prices.';

-- ---------------------------------------------------------------------------
-- The markup, which must outlive any one upload
-- ---------------------------------------------------------------------------
-- Keyed on the variant, not the product: the shop may not stock a handset yet
-- and still have decided what it will sell for. variant_key is the model and
-- the storage size — an A07 64GB and an A07 128GB never share a markup however
-- similar their names are. RAM is deliberately not part of it: the shop prices
-- by storage, so the two RAM builds of one handset are one line on the list.
create table if not exists public.bulk_variant_markups (
  variant_key  text primary key,
  label        text,
  markup_pct   numeric(6,3) not null check (markup_pct >= 0 and markup_pct <= 500),
  product_id   bigint references public.products(id) on delete set null,
  updated_by   text,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- A generated list, and what it said
-- ---------------------------------------------------------------------------
create table if not exists public.bulk_price_lists (
  id                bigserial primary key,
  upload_id         bigint references public.bulk_supplier_uploads(id) on delete set null,
  -- The Monday the list belongs to, in Africa/Windhoek. Auto-send uses this to
  -- refuse to post last week's prices.
  week_start        date not null,
  import_vat_rate   numeric(6,4) not null,
  sales_vat_rate    numeric(6,4) not null,
  default_markup    numeric(6,3) not null,
  product_count     integer not null default 0,
  in_stock_count    integer not null default 0,
  on_order_count    integer not null default 0,
  status            text not null default 'draft'
                      check (status in ('draft', 'approved', 'sent', 'superseded')),
  generated_by      text,
  approved_by       text,
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists bulk_price_lists_week on public.bulk_price_lists (week_start desc, id desc);

create table if not exists public.bulk_price_list_items (
  id             bigserial primary key,
  list_id        bigint not null references public.bulk_price_lists(id) on delete cascade,
  variant_key    text not null,
  display_name   text not null,
  model          text,
  storage_gb     integer,
  five_g         boolean not null default false,
  supplier_cost  numeric(12,2) not null,
  import_vat     numeric(12,2) not null,
  landed_cost    numeric(12,2) not null,
  markup_pct     numeric(6,3) not null,
  price_excl_vat numeric(12,2) not null,
  sales_vat      numeric(12,2) not null,
  final_price    numeric(12,2) not null,
  -- Snapshotted at generation: the file must still say what was true that day.
  stock_status   text not null check (stock_status in ('in_stock', 'on_order', 'out_of_stock')),
  stock_qty      integer not null default 0,
  product_id     bigint references public.products(id) on delete set null,
  unique (list_id, variant_key)
);

create index if not exists bulk_price_list_items_list on public.bulk_price_list_items (list_id, display_name);

-- ---------------------------------------------------------------------------
-- Who gets it, and whether they got it
-- ---------------------------------------------------------------------------
create table if not exists public.bulk_recipients (
  id            bigserial primary key,
  name          text,
  email         text not null,
  active        boolean not null default true,
  opted_out_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists bulk_recipients_email on public.bulk_recipients (lower(email));

create table if not exists public.bulk_distributions (
  id               bigserial primary key,
  list_id          bigint not null references public.bulk_price_lists(id) on delete cascade,
  subject          text not null,
  body             text not null,
  file_name        text,
  recipient_count  integer not null default 0,
  started_by       text,
  trigger          text not null default 'manual' check (trigger in ('manual', 'scheduled', 'test', 'retry')),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);

-- One row per recipient per distribution: this is what makes "fifty people,
-- fifty separate emails" checkable afterwards, and the unique constraint is
-- what stops a retried job sending twice.
create table if not exists public.bulk_deliveries (
  id               bigserial primary key,
  distribution_id  bigint not null references public.bulk_distributions(id) on delete cascade,
  recipient_id     bigint references public.bulk_recipients(id) on delete set null,
  email            text not null,
  name             text,
  status           text not null default 'pending'
                     check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts         integer not null default 0,
  error            text,
  sent_at          timestamptz,
  updated_at       timestamptz not null default now(),
  unique (distribution_id, email)
);

create index if not exists bulk_deliveries_pending
  on public.bulk_deliveries (status, distribution_id) where status in ('pending', 'sending');

-- ---------------------------------------------------------------------------
-- Row security: costs and margins are for administrators
-- ---------------------------------------------------------------------------
-- Everything here carries what the shop pays and what it makes. None of it is
-- a cashier's business, let alone a customer's.
do $rls$
declare
  t text;
begin
  foreach t in array array['bulk_supplier_uploads', 'bulk_variant_markups', 'bulk_price_lists',
                           'bulk_price_list_items', 'bulk_recipients', 'bulk_distributions',
                           'bulk_deliveries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admins manage %s" on public.%I', t, t);
    execute format(
      'create policy "admins manage %s" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$rls$;

grant usage, select on all sequences in schema public to authenticated;

-- Changing a price or a markup is a pricing decision; it belongs in the log.
drop trigger if exists log_activity_trg on public.bulk_variant_markups;
create trigger log_activity_trg
  after insert or update or delete on public.bulk_variant_markups
  for each row execute function public.log_activity();

drop trigger if exists log_activity_trg on public.bulk_price_lists;
create trigger log_activity_trg
  after insert or update or delete on public.bulk_price_lists
  for each row execute function public.log_activity();

drop trigger if exists log_activity_trg on public.bulk_distributions;
create trigger log_activity_trg
  after insert or update or delete on public.bulk_distributions
  for each row execute function public.log_activity();
