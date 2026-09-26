-- Server-authoritative catalog and employee analysis for the Reports workspace.
-- The existing dashboard snapshot remains unchanged for compatibility; this
-- narrowly scoped RPC delegates date, timezone, capability, lifecycle, and
-- branch validation to that snapshot before calculating complete aggregates.

create function public.get_current_pos_shift()
returns table(
  shift_id uuid,
  cashier_id uuid,
  branch_id uuid,
  branch_name text,
  status text,
  opening_cash_mxn numeric,
  usd_mxn_rate numeric,
  opened_at timestamptz,
  closed_at timestamptz,
  cash_sales_mxn numeric,
  cash_sales_usd numeric,
  card_sales_mxn numeric,
  closing_cash_mxn numeric,
  closing_cash_usd numeric,
  closing_card_mxn numeric,
  cash_mxn_difference numeric,
  cash_usd_difference numeric,
  card_difference numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_branch_id uuid := public.get_cashier_branch_id();
  current_shift_id uuid;
begin
  if not public.can_use_pos() then
    raise exception 'access denied';
  end if;

  select shift.id
    into current_shift_id
  from public.pos_shifts as shift
  where shift.cashier_id = auth.uid()
    and shift.branch_id = actor_branch_id
  order by case when shift.status = 'open' then 0 else 1 end,
    shift.opened_at desc,
    shift.id desc
  limit 1;

  if current_shift_id is null then
    return;
  end if;

  return query select * from public.get_pos_shift_reconciliation(current_shift_id);
end
$$;

create function public.report_dashboard_analysis(
  p_from text,
  p_to text,
  p_timezone text,
  p_scope text default 'all',
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set timezone = 'UTC'
set search_path = pg_catalog, public, pg_temp
as $$
declare
  base_snapshot jsonb;
  from_date date;
  to_date date;
  utc_from timestamptz;
  utc_to timestamptz;
  configured_timezone text;
  selected_branch_id uuid;
  selected_branch_text text;
begin
  -- This call is the single source of truth for reports.view, the configured
  -- timezone, calendar validation, scope validation, and recognized-sale rules.
  base_snapshot := public.report_dashboard_snapshot(
    p_from, p_to, p_timezone, p_scope, p_branch_id
  );
  configured_timezone := base_snapshot->>'timezone';
  from_date := (base_snapshot->>'from')::date;
  to_date := (base_snapshot->>'to')::date;
  utc_from := (base_snapshot->>'utc_from')::timestamptz;
  utc_to := (base_snapshot->>'utc_to')::timestamptz;
  selected_branch_text := base_snapshot->'scope'->>'branch_id';
  if selected_branch_text is not null then
    selected_branch_id := selected_branch_text::uuid;
  end if;

  return (
    with recognized_sales as (
      select
        sale.id,
        sale.created_by,
        sale.created_at,
        sale.channel,
        sale.total_mxn
      from public.sales as sale
      where sale.created_at >= utc_from
        and sale.created_at < utc_to
        and not exists (
          select 1
          from public.sale_reversals as reversal
          where reversal.sale_id = sale.id
        )
        and (
          sale.channel <> 'wholesale'
          or (
            not exists (
              select 1
              from public.wholesale_order_sales as history
              where history.sale_id = sale.id
            )
            and not exists (
              select 1
              from public.wholesale_orders as linked_order
              where linked_order.sale_id = sale.id
            )
          )
          or exists (
            select 1
            from public.wholesale_order_sales as history
            join public.wholesale_orders as order_row
              on order_row.id = history.order_id
            where history.sale_id = sale.id
              and order_row.sale_id = sale.id
              and order_row.status = 'completed'
              and order_row.deleted_at is null
              and not exists (
                select 1
                from public.wholesale_order_sales as later_history
                where later_history.order_id = history.order_id
                  and later_history.generation > history.generation
                  and not exists (
                    select 1
                    from public.sale_reversals as later_reversal
                    where later_reversal.sale_id = later_history.sale_id
                  )
              )
          )
        )
        and (
          sale.channel <> 'event'
          or not exists (
            select 1
            from public.event_reservations as reservation
            where reservation.sale_id = sale.id
          )
          or exists (
            select 1
            from public.event_reservations as reservation
            where reservation.sale_id = sale.id
              and reservation.status = 'completed'
          )
        )
        and (selected_branch_id is null or sale.branch_id = selected_branch_id)
    ),
    report_line_items as (
      select
        recognized.id as sale_id,
        coalesce(item.line_kind, 'product') as line_kind,
        item.product_id,
        coalesce(item.category_id, product.category_id) as category_id,
        item.quantity,
        item.line_total_mxn
      from recognized_sales as recognized
      join public.sale_items as item on item.sale_id = recognized.id
      left join public.products as product on product.id = item.product_id
    ),
    catalog_products as (
      select
        'product'::text as line_kind,
        product.id as product_id,
        product.name as product_name,
        product.category_id,
        category.name as category_name,
        coalesce(sum(lines.quantity), 0)::bigint as quantity,
        coalesce(round(sum(lines.line_total_mxn), 2), 0)::numeric as total_mxn
      from public.products as product
      join public.product_categories as category on category.id = product.category_id
      left join report_line_items as lines
        on lines.line_kind = 'product'
       and lines.product_id = product.id
      group by product.id, product.name, product.category_id, category.name
    ),
    catalog_categories as (
      select
        'category'::text as line_kind,
        null::uuid as product_id,
        category.name as product_name,
        category.id as category_id,
        category.name as category_name,
        coalesce(sum(lines.quantity), 0)::bigint as quantity,
        coalesce(round(sum(lines.line_total_mxn), 2), 0)::numeric as total_mxn
      from public.product_categories as category
      left join report_line_items as lines on lines.category_id = category.id
      group by category.id, category.name
    ),
    employee_totals as (
      select
        recognized.created_by as employee_id,
        coalesce(
          max(nullif(btrim(employee.display_name), '')),
          max(nullif(btrim(to_jsonb(auth_user)->'profile'->>'name'), '')),
          max(nullif(btrim(to_jsonb(auth_user)->>'name'), '')),
          'Empleado sin nombre'
        ) as employee_name,
        count(*)::bigint as sale_count,
        coalesce(sum(recognized.total_mxn), 0)::numeric as total_mxn
      from recognized_sales as recognized
      left join public.employee_identities as employee
        on employee.user_id = recognized.created_by
      left join auth.users as auth_user
        on auth_user.id = recognized.created_by
      group by recognized.created_by
    )
    select jsonb_build_object(
      'products', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'line_kind', products.line_kind,
          'product_id', products.product_id,
          'product_name', products.product_name,
          'category_id', products.category_id,
          'category_name', products.category_name,
          'quantity', products.quantity,
          'total_mxn', products.total_mxn
        ) order by products.product_name, products.product_id), '[]'::jsonb)
        from catalog_products as products
      ),
      'categories', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'line_kind', categories.line_kind,
          'product_id', categories.product_id,
          'product_name', categories.product_name,
          'category_id', categories.category_id,
          'category_name', categories.category_name,
          'quantity', categories.quantity,
          'total_mxn', categories.total_mxn
        ) order by categories.product_name, categories.category_id), '[]'::jsonb)
        from catalog_categories as categories
      ),
      'employees', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'employee_id', employees.employee_id,
          'employee_name', employees.employee_name,
          'sale_count', employees.sale_count,
          'total_mxn', employees.total_mxn
        ) order by employees.employee_name, employees.employee_id), '[]'::jsonb)
        from employee_totals as employees
      ),
      'from', to_char(from_date, 'YYYY-MM-DD'),
      'to', to_char(to_date, 'YYYY-MM-DD'),
      'timezone', configured_timezone,
      'scope', base_snapshot->'scope'
    )
  );
end
$$;

revoke all on function public.report_dashboard_analysis(text, text, text, text, uuid),
  public.get_current_pos_shift()
from public, anon, authenticated;
grant execute on function public.report_dashboard_analysis(text, text, text, text, uuid),
  public.get_current_pos_shift()
to authenticated;
