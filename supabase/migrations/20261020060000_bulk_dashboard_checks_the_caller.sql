-- bulk_dashboard() has to check who is asking.
--
-- It is SECURITY DEFINER, so it reads the bulk tables as the owner and their
-- row security never applies, and it was granted to `authenticated` with no
-- role check of its own. Every number it returns is confidential: the import
-- VAT and markup the shop prices at, how many markups have been overridden,
-- how many dealers are on the mailing list. Any signed-in customer could have
-- asked it.
--
-- Found by supabase/checks/security.sql — the standing check for exactly this
-- shape, which is how a new feature gets caught making the old mistake.

create or replace function public.bulk_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private'
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may read the pricing dashboard.';
  end if;

  return jsonb_build_object(
    'this_week', private.windhoek_week_start(),
    'rates', jsonb_build_object(
      'import_vat', public.bulk_setting('bulk_import_vat_rate', '0.17')::numeric,
      'sales_vat',  public.bulk_setting('bulk_sales_vat_rate', '0.15')::numeric,
      'default_markup', public.bulk_setting('bulk_default_markup', '22')::numeric,
      'auto_send', public.bulk_setting('bulk_auto_send', 'false')::boolean,
      'require_approval', public.bulk_setting('bulk_require_approval', 'true')::boolean
    ),
    'latest_upload', (
      select jsonb_build_object('id', u.id, 'file_name', u.file_name, 'at', u.created_at,
                                'rows', u.row_count, 'phones', u.phone_count,
                                'skipped', jsonb_array_length(u.skipped))
      from public.bulk_supplier_uploads u order by u.id desc limit 1
    ),
    'latest_list', (
      select jsonb_build_object('id', l.id, 'week', l.week_start, 'status', l.status,
                                'products', l.product_count, 'in_stock', l.in_stock_count,
                                'on_order', l.on_order_count, 'at', l.created_at,
                                'current_week', l.week_start = private.windhoek_week_start())
      from public.bulk_price_lists l
      where l.status <> 'superseded'
      order by l.week_start desc, l.id desc limit 1
    ),
    'latest_distribution', (
      select jsonb_build_object(
        'id', d.id, 'at', d.created_at, 'trigger', d.trigger,
        'recipients', d.recipient_count,
        'sent', (select count(*) from public.bulk_deliveries x
                  where x.distribution_id = d.id and x.status = 'sent'),
        'failed', (select count(*) from public.bulk_deliveries x
                    where x.distribution_id = d.id and x.status = 'failed'),
        'pending', (select count(*) from public.bulk_deliveries x
                     where x.distribution_id = d.id and x.status in ('pending','sending')))
      from public.bulk_distributions d order by d.id desc limit 1
    ),
    'recipients', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where active and opted_out_at is null))
      from public.bulk_recipients
    ),
    'markups_overridden', (select count(*) from public.bulk_variant_markups)
  );
end;
$$;

revoke all on function public.bulk_dashboard() from public, anon;
grant execute on function public.bulk_dashboard() to authenticated;
