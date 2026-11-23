-- Black Friday items that keep their price.
--
-- A product can be part of the sale without a lower price: it is flagged
-- in_promotion and usually carries a deal_note describing the package
-- ("Free case + glass"). Products with a sale_price are part of the sale
-- anyway. Both only show while a promotion runs.

alter table public.products
  add column if not exists in_promotion boolean not null default false,
  add column if not exists deal_note text;

alter table public.products drop constraint if exists products_deal_note_length;
alter table public.products
  add constraint products_deal_note_length check (deal_note is null or char_length(deal_note) <= 120);

comment on column public.products.in_promotion is
  'Shown as a promotion item (Black Friday) while a promotion runs, even without a sale_price. Used for packages at the normal price.';
comment on column public.products.deal_note is
  'Short package or deal text shown on the product while a promotion runs, e.g. "Free case + screen protector".';

grant select (in_promotion, deal_note) on public.products to anon, authenticated;

-- Customers cannot change these; only admins.
CREATE OR REPLACE FUNCTION public.limit_customer_product_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.is_admin() then
    return new;
  end if;

  new.name := old.name;
  new.brand := old.brand;
  new.category := old.category;
  new.description := old.description;
  new.price := old.price;
  new.sale_price := old.sale_price;
  new.allow_backorder := old.allow_backorder;
  new.in_promotion := old.in_promotion;
  new.deal_note := old.deal_note;
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
