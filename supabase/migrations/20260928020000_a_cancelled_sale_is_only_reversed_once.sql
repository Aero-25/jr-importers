/*
  Crediting a counter sale reversed it twice.

  Crediting a till sale does two things: it cancels the order, and it raises
  a credit note. A cancelled order drops straight out of the cash-up — it is
  no longer Paid, so its tenders stop counting. The credit note then took the
  money off a second time.

  Shift 27 is the case in point. INV12169 was rung up at N$2 500 on card,
  found to be wrong, cancelled and re-rung as INV12170. The orders on that
  shift tender N$25 110 to the card machine with the cancelled sale already
  excluded — but CRN406 subtracted its N$2 500 again, and the cash-up read
  N$22 610. Whether or not the card was ever physically charged for the
  cancelled sale, N$22 610 is not a figure the slip can ever show.

  A counter sale is reversed by its order, exactly as it is counted by its
  order. So when the credit note lands in the same shift as the sale it
  undoes, the cancellation has already done the work and the credit note is
  a document rather than a second movement — it is marked `pos`, the same
  flag that keeps a till sale's invoice from double-counting beside its own
  order.

  A credit raised in a later shift is a different matter and still counts:
  the money left the drawer today, not on the day of the sale.
*/

create or replace function public.credit_invoice(p_invoice_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Already credited: hand back the credit note rather than raising a second.
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
  -- undoes rather than as a bare amount.
  select coalesce(jsonb_agg(
           line || jsonb_build_object(
             'price', -1 * coalesce((line->>'price')::numeric, 0),
             'line_total', -1 * coalesce((line->>'line_total')::numeric, 0))
         ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_inv.items, '[]'::jsonb)) as line;

  -- And the same tenders, reversed. A sale taken N$500 cash and N$2 000 card
  -- is refunded N$500 out of the drawer and N$2 000 back to the card, so the
  -- cash-up takes it off each in the proportion it went on.
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
    -- The shop refunds every credit, so it is settled the moment it is
    -- raised; the statement shows the credit and the refund netting to zero.
    -- till_shift_id is left out on purpose: invoice_stamp_shift() puts the
    -- credit in the shift that is open now, which is the drawer the money
    -- comes out of. Taking the original's shift would reach back and change
    -- a cash-up that was counted and signed off days ago.
    status, payment_method, payments, notes, created_at
  )
  values (
    'credit_note', v_inv.id, v_inv.customer_id, v_inv.customer_name, v_inv.customer_email,
    v_items, -1 * coalesce(v_inv.subtotal_amount, 0), -1 * coalesce(v_inv.vat_amount, 0),
    -1 * coalesce(v_inv.total_amount, 0),
    'paid', v_inv.payment_method, v_payments,
    concat_ws(' ', 'Credit of ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.', nullif(btrim(coalesce(p_reason, '')), '')),
    now()
  )
  returning * into v_credit;

  -- A counter sale: the goods come back and the sale is cancelled. Nothing
  -- is assumed about an account invoice typed by hand, or IQ history.
  if v_inv.order_id is not null then
    select till_shift_id into v_order_shift from public.orders where id = v_inv.order_id;

    perform public.release_order_stock(v_inv.order_id);
    update public.orders
       set status = 'Cancelled',
           notes  = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
     where id = v_inv.order_id and status <> 'Cancelled';

    -- Cancelled within the same shift, so the sale's tenders have already
    -- stopped counting on this cash-up. Counting the credit note as well
    -- would take the money off twice. `pos` is the flag the cash-up already
    -- uses for "the order is the record here".
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
    'message', v_credit.invoice_number || ' raised against ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.'
  );
end;
$function$;

-- CRN406 is the one already on the books: raised in shift 27 against
-- INV12169, whose order was cancelled in shift 27. Card takings go back to
-- the N$25 110 the machine actually holds.
update public.invoices c
   set source = 'pos'
  from public.invoices i
  join public.orders o on o.id = i.order_id
 where c.credits_invoice_id = i.id
   and coalesce(c.source, '') <> 'pos'
   and o.status = 'Cancelled'
   and o.till_shift_id is not distinct from c.till_shift_id;
