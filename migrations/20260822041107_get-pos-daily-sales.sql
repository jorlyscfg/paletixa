create or replace function public.get_pos_daily_sales(
  p_limit integer default 100
)
returns table(
  sale_id uuid,
  created_at timestamptz,
  total_mxn numeric,
  payment_method text,
  payment_currency text,
  line_items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_branch_id uuid;
  day_start timestamptz := date_trunc('day', now());
begin
  if auth.uid() is null or not public.can_use_pos() then
    raise exception 'access denied';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'POS daily sales limit is limited to 100 sales';
  end if;

  actor_branch_id := public.get_cashier_branch_id();
  if actor_branch_id is null then
    raise exception 'cashier branch is unavailable';
  end if;

  return query
  select
    sale.id,
    sale.created_at,
    sale.total_mxn,
    sale.business_context ->> 'payment_method',
    coalesce(nullif(btrim(sale.business_context ->> 'payment_currency'), ''), 'mxn'),
    coalesce(items.line_items, '[]'::jsonb)
  from public.sales as sale
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'name', item.product_name,
        'category', coalesce(
          nullif(btrim(item.category_name), ''),
          category.name,
          product_category.name
        ),
        'quantity', item.quantity,
        'unit_total_mxn', item.unit_price_mxn
      )
      order by item.id
    ) as line_items
    from public.sale_items as item
    left join public.product_categories as category on category.id = item.category_id
    left join public.products as product on product.id = item.product_id
    left join public.product_categories as product_category on product_category.id = product.category_id
    where item.sale_id = sale.id
  ) as items on true
  where sale.created_by = auth.uid()
    and sale.branch_id = actor_branch_id
    and sale.channel = 'pos'
    and sale.created_at >= day_start
    and sale.created_at < day_start + interval '1 day'
  order by sale.created_at desc, sale.id desc
  limit p_limit;
end;
$$;

revoke execute on function public.get_pos_daily_sales(integer)
from public, anon, authenticated;
grant execute on function public.get_pos_daily_sales(integer)
to authenticated;
