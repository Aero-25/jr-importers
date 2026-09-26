/*
  An invoice is never deleted. It is credited.

  A tax invoice is a legal record: it has been numbered out of a gapless
  series, it may have been handed to the customer, and it is what the VAT
  return is built from. Deleting one leaves a hole in the book that nobody
  can explain afterwards. Until now an admin could delete one from the
  console — and doing so left the sale behind it standing, so the shop had
  to go and cancel the order by hand.

  Deleting is now refused outright, by the table itself. The way back is a
  credit note: a document of its own, numbered CRN in the series carried
  over from IQ, carrying the same lines at negative value and pointing at
  the invoice it reverses. Both documents stay in the book, and the pair
  nets to nothing — which is exactly what the customer's statement should
  show.

  Crediting a counter sale also gives the handset back and cancels the sale,
  the work the shop was doing by hand.
*/

-- ---------------------------------------------------------------------------
-- 1. No deleting. Ever.
-- ---------------------------------------------------------------------------
revoke delete on public.invoices from anon, authenticated;

drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins read invoices"   on public.invoices for select to authenticated using (public.is_admin());
create policy "admins create invoices" on public.invoices for insert to authenticated with check (public.is_admin());
create policy "admins update invoices" on public.invoices for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Belt and braces: a grant restored by hand, a future policy, or a script
-- running as the table owner would otherwise slip past. The table refuses.
create or replace function public.invoices_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'An invoice cannot be deleted. Credit it instead — a credit note reverses it and both documents stay on the record.'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists invoices_delete_cancels_order on public.invoices;
drop function if exists public.invoice_delete_cancels_order();

drop trigger if exists invoices_no_delete on public.invoices;
create trigger invoices_no_delete
  before delete on public.invoices
  for each row
  execute function public.invoices_are_never_deleted();

-- ---------------------------------------------------------------------------
-- 2. The credit note, and what it points at.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists credits_invoice_id bigint references public.invoices(id);

comment on column public.invoices.credits_invoice_id is
  'The invoice this credit note reverses. Null on an invoice.';

-- One credit note per invoice: a second one would credit the customer twice.
create unique index if not exists invoices_credit_of_key
  on public.invoices (credits_invoice_id) where credits_invoice_id is not null;

-- The CRN series continues where IQ left off (CRN405 was the last).
insert into public.document_counters (name, next_value)
select 'credit_note', coalesce(max((regexp_replace(invoice_number, '\D', '', 'g'))::bigint), 0) + 1
  from public.invoices where invoice_number ~ '^CRN[0-9]+$'
on conflict (name) do nothing;

-- A credit note takes a CRN number, an invoice keeps INV.
create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare n bigint;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    if coalesce(new.doc_type, 'invoice') = 'credit_note' then
      n := public.next_document_number('credit_note');
      new.invoice_number := 'CRN' || n::text;
    else
      n := public.next_document_number('invoice');
      -- No padding: the imported series is unpadded (INV0 through INV12113),
      -- and a padded INV012114 would sort and read as a different book.
      new.invoice_number := 'INV' || n::text;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Crediting an invoice.
-- ---------------------------------------------------------------------------
create or replace function public.credit_invoice(p_invoice_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_credit public.invoices%rowtype;
  v_items jsonb;
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

  insert into public.invoices (
    doc_type, credits_invoice_id, customer_id, customer_name, customer_email,
    items, subtotal_amount, vat_amount, total_amount,
    -- The shop refunds every credit, so it is settled the moment it is
    -- raised; the statement shows the credit and the refund netting to zero.
    status, payment_method, till_shift_id, notes, created_at
  )
  values (
    'credit_note', v_inv.id, v_inv.customer_id, v_inv.customer_name, v_inv.customer_email,
    v_items, -1 * coalesce(v_inv.subtotal_amount, 0), -1 * coalesce(v_inv.vat_amount, 0),
    -1 * coalesce(v_inv.total_amount, 0),
    'paid', v_inv.payment_method, v_inv.till_shift_id,
    concat_ws(' ', 'Credit of ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.', nullif(btrim(coalesce(p_reason, '')), '')),
    now()
  )
  returning * into v_credit;

  -- A counter sale: the goods come back and the sale is cancelled. Nothing
  -- is assumed about an account invoice typed by hand, or IQ history.
  if v_inv.order_id is not null then
    perform public.release_order_stock(v_inv.order_id);
    update public.orders
       set status = 'Cancelled',
           notes  = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
     where id = v_inv.order_id and status <> 'Cancelled';
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
$$;

revoke all on function public.credit_invoice(bigint, text) from public, anon;
grant execute on function public.credit_invoice(bigint, text) to authenticated;
