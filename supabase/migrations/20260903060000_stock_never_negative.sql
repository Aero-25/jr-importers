/*
  Never let a sale take stock below zero.

  Two things allowed it. `invoice_take_stock` moved unserialised lines with
  `greatest(stock - qty, 0)`, so raising an invoice for five when two were on
  the shelf succeeded: stock floored at zero, the sale recorded in full, and
  the shop short three units with nothing to show it happened. And nothing at
  the table level stopped a negative from being written by any other path.

  The function now locks the row and refuses, naming the product and both
  numbers so whoever is at the counter can see what went wrong.

  The CHECK constraint is the part that makes this a guarantee rather than a
  promise: no code path, RPC, import or hand-written update can drive stock
  negative, whatever it does. Serialised stock was never exposed to this — it
  is counted from the unit ledger — but the constraint covers it too.
*/

-- Would fail loudly if anything were already negative; the catalogue is clean.
alter table public.products
  add constraint products_stock_not_negative check (stock >= 0);

CREATE OR REPLACE FUNCTION public.invoice_take_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
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

    -- Unserialised lines — accessories, a repair charge — move the count.
    if v_took = 0 and not exists (
      select 1 from public.product_imeis where product_id = v_pid
    ) then
      -- Lock the row, then refuse rather than clamp. greatest(stock - qty, 0)
      -- let an invoice for more units than exist succeed: stock floored at
      -- zero, the sale recorded in full, and the shop short without knowing.
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
$function$
;
