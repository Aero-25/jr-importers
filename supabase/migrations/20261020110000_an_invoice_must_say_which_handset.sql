-- An invoice must say which handset it sold.
--
-- invoice_take_stock had two branches and a hole between them. A line naming
-- IMEIs took those units; a line for a product with no units at all came off
-- the plain count. A line for a product that IS tracked by IMEI but names none
-- matched the first branch zero times and was excluded from the second by
-- `not exists (select 1 from product_imeis where product_id = v_pid)` — so it
-- took nothing, recorded no movement, and saved without complaint.
--
-- INV12192 did exactly that on 6 October: a Samsung A26 256GB billed to Namib
-- Mills with no IMEI. The customer got the phone, the shop got the money, and
-- the handset sat on the books for a fortnight until a physical count found it.
--
-- The same hole swallows a partial line: quantity two with one IMEI named took
-- one unit and said nothing about the other.
--
-- For a serialised product the number of handsets taken must equal the quantity
-- invoiced. Anything else is refused, because the alternative is the shop
-- finding out at stocktake.

create or replace function public.invoice_take_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_service boolean;
  v_serialised boolean;
  v_have integer;
  v_line   jsonb;
  v_named  text[];
  v_pid    bigint;
  v_qty    integer;
  v_name   text;
  v_took   integer;
begin
  -- Already accounted for. The flag, not the status, because an invoice can be
  -- edited and saved repeatedly and stock must move exactly once.
  if new.stock_taken then
    return new;
  end if;

  -- History from IQ describes a shelf that no longer exists.
  if new.source = 'iq-import' then
    return new;
  end if;

  -- A till invoice mirrors an order, and reserve_order_stock already moved
  -- those units. Deducting here as well would take the phone twice.
  if new.source = 'pos' then
    new.stock_taken := true;
    return new;
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
  loop
    v_pid := nullif(v_line->>'product_id', '')::bigint;
    continue when v_pid is null;

    v_qty := greatest(coalesce(nullif(v_line->>'quantity', '')::integer, 0), 0);
    continue when v_qty = 0;

    select name into v_name from public.products where id = v_pid;
    select public.is_service_category(category) into v_is_service
      from public.products where id = v_pid;

    v_serialised := exists (select 1 from public.product_imeis where product_id = v_pid);

    select coalesce(array_agg(x), '{}')
      into v_named
      from (
        select jsonb_array_elements_text(v_line->'imeis') as x
        where jsonb_typeof(v_line->'imeis') = 'array'
        union
        select v_line->>'imei' where nullif(v_line->>'imei', '') is not null
      ) named
     where x is not null;

    v_took := 0;
    if array_length(v_named, 1) > 0 then
      -- Only units still on the shelf: re-saving an invoice cannot sell the
      -- same handset twice, and a unit already sold stays attached to the sale
      -- that took it.
      with taken as (
        update public.product_imeis
           set status = 'sold',
               sold_at = now(),
               updated_at = now()
         where product_id = v_pid
           and status = 'available'
           and coalesce(imei, serial_number) = any (v_named)
        returning 1
      )
      select count(*)::integer into v_took from taken;
    end if;

    -- Services are not inventory. A repair charge, a parts line or commission
    -- is billed, not counted — and since stock can no longer go negative, a
    -- service left in here would be refused outright once its count hit zero.
    if v_is_service then
      v_took := 0;

    elsif v_serialised then
      -- The hole this function used to have. A handset tracked by IMEI must be
      -- named, and every one billed must come off the shelf.
      if array_length(v_named, 1) is null then
        raise exception
          'Choose which % is going out — it is tracked by IMEI, and an invoice that does not name one takes nothing off the shelf.',
          v_name
          using errcode = 'check_violation';
      end if;

      if v_took < v_qty then
        raise exception
          'Only % of the % handsets billed for % could be taken: the rest are not on the shelf, or were already sold on another document.',
          v_took, v_qty, v_name
          using errcode = 'check_violation';
      end if;

    elsif v_took = 0 then
      -- Not serialised: comes off the plain count. Lock the row, then refuse
      -- rather than clamp. greatest(stock - qty, 0) let an invoice for more
      -- units than exist succeed: stock floored at zero, the sale recorded in
      -- full, and the shop short without knowing.
      select stock into v_have from public.products where id = v_pid for update;
      if coalesce(v_have, 0) < v_qty then
        raise exception
          'Not enough stock for %: % on hand, % invoiced.',
          v_name, coalesce(v_have, 0), v_qty
          using errcode = 'check_violation';
      end if;

      update public.products
         set stock = stock - v_qty, updated_at = now()
       where id = v_pid;
      v_took := v_qty;
    end if;

    if v_took > 0 then
      insert into public.stock_movements
        (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
      values
        (v_pid, v_name, 'sale', -v_took, 'invoice', new.id::text,
         'Invoiced on ' || coalesce(new.invoice_number, 'invoice #' || new.id));
    end if;
  end loop;

  new.stock_taken := true;
  return new;
end;
$$;
