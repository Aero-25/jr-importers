-- A markup needs more than three decimals.
--
-- The markup is not really a business figure — it is the lever used to reach a
-- price. What the shop commits to is the price on the list a customer is
-- holding, and that has to be reproducible to the cent.
--
-- At numeric(6,3) it is not. One thousandth of a per cent of a N$20,000 landed
-- cost is twenty cents, so a markup chosen to hit an advertised price can only
-- land within a few cents of it. Reproducing a list of 23 handsets priced on a
-- spreadsheet gave one exact match and twenty-two misses of one to twelve
-- cents.
--
-- Six decimals puts the step at a fiftieth of a cent on the dearest handset on
-- the list, which is finer than the thing being matched. The markups this
-- produces read oddly — 22.523810% rather than 22.5% — and that is the honest
-- shape of a number derived from a price rather than chosen as a margin.

alter table public.bulk_variant_markups
  alter column markup_pct type numeric(9,6);

alter table public.bulk_price_list_items
  alter column markup_pct type numeric(9,6);

-- The bound is unchanged; only the precision moves.
alter table public.bulk_variant_markups
  drop constraint if exists bulk_variant_markups_markup_pct_check;

alter table public.bulk_variant_markups
  add constraint bulk_variant_markups_markup_pct_check
  check (markup_pct >= 0 and markup_pct <= 500);

-- bulk_set_markup rounded to three decimals on the way in, which would have
-- quietly undone the column change.
create or replace function public.bulk_set_markup(
  p_variant_key text,
  p_markup numeric,
  p_label text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may change a markup.';
  end if;
  if p_markup is null or p_markup < 0 or p_markup > 500 then
    raise exception 'A markup must be between 0 and 500 per cent.';
  end if;

  insert into public.bulk_variant_markups (variant_key, label, markup_pct, updated_by, updated_at)
  values (p_variant_key, p_label, round(p_markup, 6), public.current_actor(), now())
  on conflict (variant_key) do update
    set markup_pct = excluded.markup_pct,
        label      = coalesce(excluded.label, public.bulk_variant_markups.label),
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

revoke all on function public.bulk_set_markup(text, numeric, text) from public, anon;
grant execute on function public.bulk_set_markup(text, numeric, text) to authenticated;
