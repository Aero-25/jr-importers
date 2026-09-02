/*
  Stock sold at the counter that must not appear on the shop.

  `active` could not express this. It gates the storefront and the till from
  the same flag — `usePosSearch` filters `active = true` — so switching a line
  off the website also made it unsellable at the POS. Glass screen protectors
  were the first line to need the distinction: 182 units, counter only.

  The guarantee lives in RLS rather than in the frontend query. The storefront
  holds the anon key, so a row the policy withholds cannot be reached even by
  a hand-written REST call, and it is withheld from the moment this migration
  runs — before the new client code ships.
*/

alter table public.products
  add column if not exists show_online boolean not null default true;

comment on column public.products.show_online is
  'Listed on the public storefront. Counter-only stock sets this false; active stays true so the POS can still sell it.';

drop policy if exists "public reads active products" on public.products;

create policy "public reads active products"
  on public.products for select
  using (
    -- customers: on sale and listed
    (active = true and show_online = true)
    -- staff: everything on sale, including counter-only lines they must ring up
    or (active = true and public.is_staff())
    -- admins: everything, including deactivated lines
    or public.is_admin()
  );

/*
  The customer-facing guard already pins `active`; without `show_online` beside
  it, a non-admin update could quietly put counter-only stock on the website.
*/
create or replace function public.limit_customer_product_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  new.name := old.name;
  new.brand := old.brand;
  new.category := old.category;
  new.description := old.description;
  new.price := old.price;
  new.cost_price := old.cost_price;
  new.reorder_level := old.reorder_level;
  new.sku := old.sku;
  new.barcode := old.barcode;
  new.color := old.color;
  new.image := old.image;
  new.image1 := old.image1;
  new.image2 := old.image2;
  new.image3 := old.image3;
  new.image4 := old.image4;
  new.image5 := old.image5;
  new.spec_display := old.spec_display;
  new.spec_processor := old.spec_processor;
  new.spec_ram := old.spec_ram;
  new.spec_storage := old.spec_storage;
  new.spec_battery := old.spec_battery;
  new.spec_back_camera := old.spec_back_camera;
  new.spec_front_camera := old.spec_front_camera;
  new.spec_os := old.spec_os;
  new.spec_weight := old.spec_weight;
  new.spec_extras := old.spec_extras;
  new.active := old.active;
  new.show_online := old.show_online;
  new.featured := old.featured;
  return new;
end;
$function$;
