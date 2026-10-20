-- A credit note records the handset that went out in its place.
--
-- Two things, one of which is urgent.
--
-- URGENT. 20261020110000 made an invoice refuse unless every handset it bills
-- comes off the shelf. A credit note is an invoice row too, and its lines name
-- the handset being credited — which is already sold. So the guard matched zero
-- available units, decided the shop was short, and refused: crediting an
-- invoice has been failing since that migration went out. The guard was written
-- for a sale and applied to a document that is the opposite of one.
--
-- A credit note must never be refused for that reason. The handset on its lines
-- is coming back, not going out, so there is nothing to take.
--
-- THE GAP. The shop replaces rather than refunds, so when a credit note is
-- raised a second handset leaves the counter. Nothing recorded which one. That
-- is how a Samsung A16 went missing: CRN408 credited Roland Bravenboer's
-- ...663555 on 5 October, he walked out with another one, and the shop found it
-- at stocktake a fortnight later.
--
-- A credit note line may now carry `replacement_imei`. That handset is taken off
-- the shelf, with a movement saying which credit note took it and which handset
-- it stood in for. The money is untouched: a credit note still does not reach
-- the day's takings, which is the shop's own rule.
--
-- It is recorded, not required. A credit can be raised before the shop knows
-- what it is giving back, or for something that is not replaced at all. The
-- audit in supabase/checks/stock-integrity.sql lists the ones left open.

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
  v_repl   text;
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

  -- ── A credit note ──────────────────────────────────────────────────────
  -- The handset on the line is coming back, so nothing is taken for it and
  -- nothing is refused. Only a replacement named on the line goes out.
  if coalesce(new.doc_type, 'invoice') = 'credit_note' then
    for v_line in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
    loop
      v_repl := nullif(btrim(coalesce(v_line->>'replacement_imei', '')), '');
      continue when v_repl is null;

      v_pid := nullif(v_line->>'product_id', '')::bigint;
      select name into v_name from public.products where id = v_pid;

      with taken as (
        update public.product_imeis
           set status = 'sold', sold_at = now(), updated_at = now()
         where status = 'available'
           and coalesce(imei, serial_number) = v_repl
        returning product_id
      )
      select count(*)::integer into v_took from taken;

      if v_took = 0 then
        raise exception
          'The replacement handset % is not on the shelf — check the IMEI, or that it has not already gone out.',
          v_repl
          using errcode = 'check_violation';
      end if;

      insert into public.stock_movements
        (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
      values
        (v_pid, coalesce(v_name, 'Replacement'), 'sale', -1, 'credit_note',
         coalesce(new.invoice_number, new.id::text),
         'Replacement for ' || coalesce(nullif(v_line->>'imei', ''), 'a credited handset')
           || ' on ' || coalesce(new.invoice_number, 'credit note #' || new.id));
    end loop;

    new.stock_taken := true;
    return new;
  end if;

  -- A till invoice mirrors an order, and reserve_order_stock already moved
  -- those units. Deducting here as well would take the phone twice.
  if new.source = 'pos' then
    new.stock_taken := true;
    return new;
  end if;

  -- ── An ordinary sale ───────────────────────────────────────────────────
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
      -- A handset tracked by IMEI must be named, and every one billed must come
      -- off the shelf. The hole this closes let INV12192 bill a Samsung A26
      -- 256GB, name nothing, and take nothing.
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
      -- rather than clamp.
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

-- ---------------------------------------------------------------------------
-- Crediting, with the replacement named
-- ---------------------------------------------------------------------------
-- p_replacements is [{"imei": "<the handset coming back>",
--                     "replacement_imei": "<the one going out>"}, ...].
-- Matched onto the credit note's lines by the handset being credited, so a
-- multi-line invoice can replace one phone and not another.
create or replace function public.credit_invoice(
  p_invoice_id bigint,
  p_reason text default null,
  p_replacements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_credit public.invoices%rowtype;
  v_items jsonb;
  v_payments jsonb;
  v_order_shift bigint;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can credit an invoice.');
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invoice not found.');
  end if;

  if coalesce(v_inv.doc_type, 'invoice') = 'credit_note' then
    return jsonb_build_object('ok', false, 'message', 'That is already a credit note.');
  end if;

  select * into v_existing from public.invoices where credits_invoice_id = p_invoice_id;
  if found then
    return jsonb_build_object(
      'ok', true, 'existed', true, 'id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'message', 'Already credited by ' || coalesce(v_existing.invoice_number, '#' || v_existing.id) || '.'
    );
  end if;

  if public.is_period_locked(v_inv.created_at) then
    return jsonb_build_object('ok', false, 'message', 'That accounting period is closed. Reopen it first.');
  end if;

  -- The same lines, reversed, so the credit note reads like the invoice it
  -- undoes rather than as a bare amount — plus the replacement handset where
  -- one was named for that line.
  select coalesce(jsonb_agg(
           line || jsonb_build_object(
             'price', -1 * coalesce((line->>'price')::numeric, 0),
             'line_total', -1 * coalesce((line->>'line_total')::numeric, 0))
                || coalesce(
                     (select jsonb_build_object('replacement_imei', r.value->>'replacement_imei')
                      from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) as r(value)
                      where nullif(r.value->>'replacement_imei', '') is not null
                        and r.value->>'imei' is not distinct from line->>'imei'
                      limit 1),
                     '{}'::jsonb)
         ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_inv.items, '[]'::jsonb)) as line;

  -- Every replacement offered must have landed on a line. A replacement keyed
  -- to a handset this invoice never sold would otherwise be dropped in silence
  -- and the handset would walk out unrecorded — the exact failure this whole
  -- migration exists to stop.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) as r(value)
    where nullif(r.value->>'replacement_imei', '') is not null
      and not exists (
        select 1 from jsonb_array_elements(v_items) as line
        where line->>'replacement_imei' = r.value->>'replacement_imei'
      )
  ) then
    return jsonb_build_object('ok', false,
      'message', 'A replacement was given for a handset that is not on this invoice. '
                 || 'Check the IMEI being credited.');
  end if;

  select case
           when jsonb_typeof(v_inv.payments) = 'array' and jsonb_array_length(v_inv.payments) > 0
           then (select jsonb_agg(p || jsonb_build_object(
                          'amount', -1 * coalesce((p->>'amount')::numeric, 0)))
                   from jsonb_array_elements(v_inv.payments) as p)
         end
    into v_payments;

  insert into public.invoices (
    doc_type, credits_invoice_id, customer_id, customer_name, customer_email,
    items, subtotal_amount, vat_amount, total_amount,
    status, payment_method, payments, notes, created_at
  )
  values (
    'credit_note', v_inv.id, v_inv.customer_id, v_inv.customer_name, v_inv.customer_email,
    v_items, -1 * coalesce(v_inv.subtotal_amount, 0), -1 * coalesce(v_inv.vat_amount, 0),
    -1 * coalesce(v_inv.total_amount, 0),
    'paid', v_inv.payment_method, v_payments,
    concat_ws(' ', 'Credit of ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.',
              nullif(btrim(coalesce(p_reason, '')), '')),
    now()
  )
  returning * into v_credit;

  if v_inv.order_id is not null then
    select till_shift_id into v_order_shift from public.orders where id = v_inv.order_id;

    perform public.release_order_stock(v_inv.order_id);
    update public.orders
       set status = 'Cancelled',
           notes  = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
     where id = v_inv.order_id and status <> 'Cancelled';

    if v_order_shift is not distinct from v_credit.till_shift_id then
      update public.invoices set source = 'pos' where id = v_credit.id;
      v_credit.source := 'pos';
    end if;
  end if;

  update public.invoices
     set notes = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
   where id = v_inv.id;

  return jsonb_build_object(
    'ok', true, 'existed', false, 'id', v_credit.id,
    'invoice_number', v_credit.invoice_number,
    'total_amount', v_credit.total_amount,
    'replacements', (select count(*) from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) as r(value)
                     where nullif(r.value->>'replacement_imei', '') is not null),
    'message', v_credit.invoice_number || ' raised against '
               || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.'
  );
end;
$$;

revoke all on function public.credit_invoice(bigint, text, jsonb) from public, anon;
grant execute on function public.credit_invoice(bigint, text, jsonb) to authenticated;

-- There is no separate two-argument version. It would have defaults on both
-- p_reason and p_replacements, which makes credit_invoice(id) ambiguous and
-- every existing one-argument call from the console fail with
-- "function public.credit_invoice(bigint) is not unique". The three-argument
-- form already answers a call with one or two arguments.
drop function if exists public.credit_invoice(bigint, text);
