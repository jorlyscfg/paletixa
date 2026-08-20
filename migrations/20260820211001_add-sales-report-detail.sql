create function public.report_sales_detail(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100
)
returns table(
  sale_id uuid,
  sale_date timestamptz,
  channel text,
  total_mxn numeric,
  product_name text,
  quantity integer,
  line_total_mxn numeric,
  context_label text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('reports.view') then
    raise exception 'access denied';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid report date range';
  end if;
  if p_to - p_from > interval '366 days' then
    raise exception 'report date range is limited to 366 days';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'report detail limit is limited to 100 sales';
  end if;

  return query
  with selected_sales as (
    select
      sales.id,
      sales.created_at,
      sales.channel,
      sales.total_mxn,
      case sales.channel
        when 'event' then nullif(btrim(sales.business_context ->> 'event_name'), '')
        else nullif(btrim(sales.business_context ->> 'customer_name'), '')
      end as context_label
    from public.sales sales
    where sales.created_at >= p_from
      and sales.created_at < p_to
    order by sales.created_at desc, sales.id desc
    limit p_limit
  )
  select
    selected_sales.id,
    selected_sales.created_at,
    selected_sales.channel,
    selected_sales.total_mxn,
    sale_items.product_name,
    sale_items.quantity,
    sale_items.line_total_mxn,
    selected_sales.context_label
  from selected_sales
  join public.sale_items
    on sale_items.sale_id = selected_sales.id
  order by selected_sales.created_at desc, selected_sales.id desc, sale_items.id;
end;
$$;

revoke execute on function public.report_sales_detail(timestamptz, timestamptz, integer)
from public, anon, authenticated;
grant execute on function public.report_sales_detail(timestamptz, timestamptz, integer)
to authenticated;
