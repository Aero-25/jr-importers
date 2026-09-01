-- Every invoice raised in a shift belongs to that shift's cash-up.
--
-- The first attempt counted only settled invoices, on the reasoning that an
-- account sale is not money taken. True of the drawer, wrong about the day:
-- stock left the shop against those invoices, and a cash-up showing N$0.00
-- sales on a day four invoices were raised does not describe the day.
--
-- So the two questions are separated, which is what a cash-up is actually for:
--
--   * What was sold?      Every invoice raised in the shift.
--   * What is in the till? Only what was settled in cash.
--
-- An unpaid or account invoice therefore raises total sales and never touches
-- expected cash. The cashier still counts the drawer against cash alone.

create or replace function public.invoice_stamp_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift bigint;
begin
  if lower(coalesce(new.status, '')) = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;

  -- Imported history predates the till entirely.
  if new.source = 'iq-import' then
    return new;
  end if;

  -- Already attributed. Re-stamping would move an older invoice into whichever
  -- shift happens to be open when someone edits it.
  if new.till_shift_id is not null then
    return new;
  end if;

  -- Raised now: it belongs to the shift that is open now. On update, only a
  -- settlement pulls a previously unattributed invoice into the current shift.
  if tg_op = 'INSERT' or lower(coalesce(new.status, '')) = 'paid' then
    select id into v_shift
      from public.till_shifts
     where status = 'Open'
     order by opening_time desc
     limit 1;
    new.till_shift_id := v_shift;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_stamp_shift on public.invoices;
create trigger invoices_stamp_shift
before insert or update on public.invoices
for each row execute function public.invoice_stamp_shift();

-- Invoices already raised during the open shift, before the rule existed.
update public.invoices i
   set till_shift_id = s.id
  from public.till_shifts s
 where i.till_shift_id is null
   and i.source is distinct from 'iq-import'
   and s.status = 'Open'
   and i.created_at >= s.opening_time;
