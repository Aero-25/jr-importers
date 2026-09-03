/*
  Damage reports — the pack sent to an insurer or a supplier when stock is
  damaged, lost or fails under warranty.

  Deliberately its own table rather than a flag on `products` or a stock
  movement. A claim has a life of its own: it is submitted, chased, approved
  or refused, and settled weeks after the stock has gone. It also has to carry
  evidence — photos, the IMEI, the invoice it was sold on — that a movement
  row has nowhere to put.

  Numbering comes from `next_document_number`, not a sequence. A sequence
  burns a number on every rolled-back transaction, and an insurer reading
  DR-0001, DR-0004, DR-0005 will ask what happened to the two in between.
*/

create table if not exists public.damage_reports (
  id            bigint generated always as identity primary key,
  report_number text not null unique,

  /* warranty — a fault the maker should cover; insurance — an incident on the
     shop's policy; supplier — arrived damaged or dead on arrival. */
  claim_type    text not null default 'warranty'
                check (claim_type in ('warranty', 'insurance', 'supplier')),
  status        text not null default 'draft'
                check (status in ('draft', 'submitted', 'approved', 'rejected', 'settled')),

  /* What was damaged. product_id may be null: the item can be written off and
     deleted long before the claim settles, and the report must survive it. */
  product_id       bigint references public.products(id) on delete set null,
  product_name     text not null,
  imei             text,
  purchase_invoice text,

  customer_id   uuid   references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  supplier_id   bigint references public.suppliers(id) on delete set null,
  supplier_name text,

  incident_date date,
  reported_date date not null default current_date,
  description   text not null,
  cause         text,

  claim_amount  numeric(12,2) not null default 0,
  settled_amount numeric(12,2),

  /* Public URLs in the Images bucket. An array so a claim can carry the
     several angles an assessor asks for. */
  photos          jsonb not null default '[]'::jsonb,
  claim_reference text,
  notes           text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists damage_reports_status_idx on public.damage_reports (status);
create index if not exists damage_reports_created_idx on public.damage_reports (created_at desc);
create index if not exists damage_reports_imei_idx on public.damage_reports (imei);

comment on table public.damage_reports is
  'Insurance, warranty and supplier claims for damaged or failed stock, with the evidence attached.';

/* House numbering: DR-0001, gapless, shared counter mechanism. */
create or replace function public.set_damage_report_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.report_number is null or new.report_number = '' then
    new.report_number := 'DR-' || lpad(public.next_document_number('damage_report')::text, 4, '0');
  end if;
  return new;
end;
$function$;

drop trigger if exists damage_reports_number on public.damage_reports;
create trigger damage_reports_number
  before insert on public.damage_reports
  for each row execute function public.set_damage_report_number();

drop trigger if exists set_damage_reports_updated_at on public.damage_reports;
create trigger set_damage_reports_updated_at
  before update on public.damage_reports
  for each row execute function public.set_updated_at();

drop trigger if exists log_activity_trg on public.damage_reports;
create trigger log_activity_trg
  after insert or delete or update on public.damage_reports
  for each row execute function public.log_activity();

alter table public.damage_reports enable row level security;

/* Staff raise and work claims; only a manager may delete one, because a
   deleted claim is evidence destroyed. */
drop policy if exists "staff read damage reports" on public.damage_reports;
create policy "staff read damage reports" on public.damage_reports
  for select using (public.is_staff() or public.is_admin());

drop policy if exists "staff write damage reports" on public.damage_reports;
create policy "staff write damage reports" on public.damage_reports
  for insert with check (public.is_staff() or public.is_admin());

drop policy if exists "staff update damage reports" on public.damage_reports;
create policy "staff update damage reports" on public.damage_reports
  for update using (public.is_staff() or public.is_admin());

drop policy if exists "admins delete damage reports" on public.damage_reports;
create policy "admins delete damage reports" on public.damage_reports
  for delete using (public.is_admin());
