-- Expose the configuration capability through the existing admin access context.

create or replace function public.get_access_context()
returns table(
  access_role text,
  authorized boolean,
  user_id uuid,
  display_name text,
  capabilities text[],
  branch_id uuid,
  branch_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  admin_name text;
begin
  if public.has_capability('branches.manage') then
    select coalesce(nullif(to_jsonb(auth_user)->'profile'->>'name', ''), nullif(to_jsonb(auth_user)->>'name', ''), '')
    into admin_name
    from auth.users auth_user
    where auth_user.id = actor;
    return query select
      'admin'::text,
      true,
      actor,
      admin_name,
      array['branches.manage', 'catalog.manage', 'sales.record', 'reports.view']::text[]
        || case when public.has_capability('configuration.manage') then array['configuration.manage']::text[] else array[]::text[] end,
      null::uuid,
      null::text;
    return;
  end if;

  if public.has_capability('pos.use') then
    return query
    select 'cashier'::text, true, employee.user_id, employee.display_name,
      array['pos.use']::text[], assignment.branch_id, branch.name
    from public.employee_identities employee
    join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
    join public.branches branch on branch.id = assignment.branch_id
    where employee.user_id = actor
      and employee.status = 'active'
      and branch.status = 'active';
    if found then return; end if;
  end if;
end;
$$;

revoke execute on function public.get_access_context() from public, anon, authenticated;
grant execute on function public.get_access_context() to authenticated;

-- Reprice newly recorded POS lines with the effective threshold while leaving
-- existing sales, wholesale behavior, allocations, and open-shift rates unchanged.
create or replace function public.reprice_operational_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  threshold integer := public.operational_pos_wholesale_threshold();
  total_value numeric;
begin
  with category_quantities as (
    select coalesce(item.category_id, product.category_id) as category_id,
      sum(item.quantity)::integer as quantity
    from public.sale_items as item
    left join public.products as product on product.id = item.product_id
    where item.sale_id = p_sale_id
    group by coalesce(item.category_id, product.category_id)
  ), category_prices as (
    select product.category_id,
      min(product.retail_price_mxn) filter (where product.active) as retail_price,
      count(*) filter (where product.active and (product.wholesale_price_mxn is null or product.wholesale_price_mxn <= 0))::integer as wholesale_invalid_count,
      min(product.wholesale_price_mxn) filter (where product.active) as wholesale_min,
      max(product.wholesale_price_mxn) filter (where product.active) as wholesale_max
    from public.products as product
    group by product.category_id
  ), repriced as (
    select item.id,
      round(coalesce(
        case
          when coalesce(item.line_kind, 'product') = 'category' then
            case when quantity.quantity >= threshold
              and prices.wholesale_invalid_count = 0
              and prices.wholesale_min is not null
              and prices.wholesale_min = prices.wholesale_max
              then prices.wholesale_min else prices.retail_price end
          when quantity.quantity >= threshold and product.wholesale_price_mxn > 0 then product.wholesale_price_mxn
          else product.retail_price_mxn
        end,
        item.unit_price_mxn
      ), 2) as unit_price
    from public.sale_items as item
    left join public.products as product on product.id = item.product_id
    left join category_quantities as quantity on quantity.category_id = coalesce(item.category_id, product.category_id)
    left join category_prices as prices on prices.category_id = coalesce(item.category_id, product.category_id)
    where item.sale_id = p_sale_id
  )
  update public.sale_items as item
  set unit_price_mxn = repriced.unit_price,
      line_total_mxn = round(repriced.unit_price * item.quantity, 2)
  from repriced
  where item.id = repriced.id;

  select coalesce(sum(item.line_total_mxn), 0)::numeric
    into total_value
  from public.sale_items as item
  where item.sale_id = p_sale_id;

  update public.sales as sale
  set total_mxn = total_value,
      pos_usd_equivalent = case
        when sale.business_context->>'payment_currency' = 'usd'
          then round(total_value / nullif(sale.pos_usd_mxn_rate, 0), 2)
        else sale.pos_usd_equivalent
      end,
      pos_change_mxn = case
        when sale.channel = 'pos' and sale.business_context->>'payment_method' = 'cash'
          then round(coalesce(sale.pos_received_mxn, 0) - total_value, 2)
        when sale.channel = 'pos' then 0
        else sale.pos_change_mxn
      end,
      business_context = case
        when sale.channel = 'pos' then coalesce(sale.business_context, '{}'::jsonb) || jsonb_build_object(
          'change_mxn', case
            when sale.business_context->>'payment_method' = 'cash'
              then round(coalesce(sale.pos_received_mxn, 0) - total_value, 2)
            else 0
          end
        )
        else sale.business_context
      end
  where sale.id = p_sale_id;
end;
$$;

alter function public.record_sale_channels_legacy(uuid, text, jsonb, jsonb)
  rename to record_sale_channels_legacy_v1;

create function public.record_sale_channels_legacy(
  p_request_id uuid,
  p_channel text,
  p_items jsonb,
  p_details jsonb
)
returns table(
  sale_id uuid,
  channel text,
  total_mxn numeric,
  created_at timestamptz,
  result_status text,
  cashier_name text,
  branch_id uuid,
  branch_name text,
  shift_id uuid,
  payment_method text,
  payment_currency text,
  usd_mxn_rate numeric,
  usd_equivalent numeric,
  usd_paid numeric,
  received_mxn numeric,
  change_mxn numeric,
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  wanted_channel text := lower(btrim(coalesce(p_channel, '')));
  payload_details jsonb := p_details;
  existing_rate numeric;
  has_existing boolean := false;
  existing_used_fallback boolean := false;
  used_fallback boolean := false;
  old_result record;
  repriced boolean := false;
  updated_total numeric;
  updated_usd_equivalent numeric;
  updated_change numeric;
  updated_items jsonb;
begin
  select sale.pos_usd_mxn_rate,
    sale.business_context->>'operational_rate_fallback' = 'true'
    into existing_rate, existing_used_fallback
  from public.sales as sale
  where sale.created_by = auth.uid()
    and sale.request_id = p_request_id;
  has_existing := found;

  if wanted_channel = 'pos'
    and not (p_details ? 'usd_mxn_rate')
    and lower(coalesce(p_details->>'payment_currency', 'mxn')) = 'usd'
    and not has_existing
    and public.has_capability('sales.record') then
    payload_details := p_details || jsonb_build_object(
      'usd_mxn_rate', public.operational_pos_usd_mxn_rate()
    );
    used_fallback := true;
  end if;

  begin
    select * into old_result
    from public.record_sale_channels_legacy_v1(p_request_id, p_channel, p_items, payload_details);
  exception when others then
    if has_existing and wanted_channel = 'pos'
      and not (p_details ? 'usd_mxn_rate')
      and lower(coalesce(p_details->>'payment_currency', 'mxn')) = 'usd'
      and existing_used_fallback
      and existing_rate is not null then
      select * into old_result
      from public.record_sale_channels_legacy_v1(
        p_request_id,
        p_channel,
        p_items,
        p_details || jsonb_build_object('usd_mxn_rate', existing_rate)
      );
    else
      raise;
    end if;
  end;

  if old_result.result_status = 'created'
    and wanted_channel = 'pos' then
    if used_fallback then
      update public.sales as sale
      set business_context = coalesce(sale.business_context, '{}'::jsonb)
        || jsonb_build_object('operational_rate_fallback', true)
      where sale.id = old_result.sale_id;
    end if;
    perform public.reprice_operational_sale(old_result.sale_id);
    repriced := true;
    select sale.total_mxn, sale.pos_usd_equivalent, sale.pos_change_mxn
      into updated_total, updated_usd_equivalent, updated_change
    from public.sales as sale
    where sale.id = old_result.sale_id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'line_kind', coalesce(item.line_kind, 'product'),
      'product_id', item.product_id,
      'category_id', item.category_id,
      'category_name', item.category_name,
      'product_name', item.product_name,
      'unit_price_mxn', item.unit_price_mxn,
      'quantity', item.quantity,
      'line_total_mxn', item.line_total_mxn
    ) order by item.id), '[]'::jsonb)
      into updated_items
    from public.sale_items as item
    where item.sale_id = old_result.sale_id;
  end if;

  return query select
    old_result.sale_id,
    old_result.channel,
    case when repriced then updated_total else old_result.total_mxn end,
    old_result.created_at,
    old_result.result_status,
    old_result.cashier_name,
    old_result.branch_id,
    old_result.branch_name,
    old_result.shift_id,
    old_result.payment_method,
    old_result.payment_currency,
    old_result.usd_mxn_rate,
    case when repriced then updated_usd_equivalent else old_result.usd_equivalent end,
    old_result.usd_paid,
    old_result.received_mxn,
    case when repriced then updated_change else old_result.change_mxn end,
    case when repriced then updated_items else old_result.items end;
end;
$$;

revoke all on function public.reprice_operational_sale(uuid),
  public.record_sale_channels_legacy(uuid, text, jsonb, jsonb)
from public, anon, authenticated;
