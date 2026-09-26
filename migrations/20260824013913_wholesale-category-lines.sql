-- Add category order lines to the native wholesale contract without rewriting
-- any previously applied migration or changing the POS schema.

alter table public.wholesale_order_items
  alter column product_id drop not null,
  add column if not exists line_kind text not null default 'product',
  add column if not exists category_id uuid references public.product_categories(id) on delete restrict,
  add column if not exists category_name text;

alter table public.wholesale_order_items
  drop constraint if exists wholesale_order_items_product_once,
  drop constraint if exists wholesale_order_items_line_kind_valid,
  drop constraint if exists wholesale_order_items_line_identity_valid;

alter table public.wholesale_order_items
  add constraint wholesale_order_items_line_kind_valid check (line_kind in ('product', 'category')),
  add constraint wholesale_order_items_line_identity_valid check (
    (line_kind = 'product' and product_id is not null and category_name is null)
    or (line_kind = 'category' and product_id is null and category_id is not null and category_name is not null and length(btrim(category_name)) > 0)
  );

create unique index wholesale_order_items_line_key
  on public.wholesale_order_items(order_id, line_kind, coalesce(product_id, category_id));
create index wholesale_order_items_category_idx on public.wholesale_order_items(category_id);

create or replace function public.wholesale_order_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', order_row.id,
        'request_id', order_row.request_id,
        'customer_id', order_row.customer_id,
        'source', order_row.source,
        'status', order_row.status,
        'payment_method', order_row.payment_method,
        'transfer_ticket_url', order_row.transfer_ticket_url,
        'transfer_ticket_key', order_row.transfer_ticket_key,
        'total_mxn', order_row.total_mxn,
        'sale_id', order_row.sale_id,
        'completed_at', order_row.completed_at,
        'cancelled_at', order_row.cancelled_at,
        'deleted_at', order_row.deleted_at,
        'deleted_by', order_row.deleted_by,
        'deletion_reason', order_row.deletion_reason,
        'payment_amount', order_row.payment_amount,
        'payment_currency', order_row.payment_currency,
        'payment_confirmed_at', order_row.payment_confirmed_at,
        'payment_confirmed_by', order_row.payment_confirmed_by,
        'payment_reference', order_row.payment_reference,
        'payment_note', order_row.payment_note,
        'delivery_agreement', order_row.delivery_agreement,
        'admin_seen_at', order_row.admin_seen_at,
        'admin_seen_by', order_row.admin_seen_by,
        'reordered_from_order_id', order_row.reordered_from_order_id,
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'line_kind', item.line_kind,
                'product_id', item.product_id,
                'category_id', item.category_id,
                'category_name', item.category_name,
                'product_name', item.product_name,
                'unit_price_mxn', item.unit_price_mxn,
                'quantity', item.quantity,
                'line_total_mxn', item.line_total_mxn
              ) order by item.id
            )
            from public.wholesale_order_items as item
            where item.order_id = order_row.id
          ),
          '[]'::jsonb
        )
      )
      from public.wholesale_orders as order_row
      where order_row.id = p_order_id
    ),
    '{}'::jsonb
  )
$$;

create or replace function public.wholesale_order_projection(p_order_id uuid)
returns table(
  order_id uuid,
  customer_id uuid,
  customer_name text,
  customer_mobile text,
  customer_email text,
  status text,
  payment_method text,
  transfer_ticket_url text,
  transfer_ticket_key text,
  total_mxn numeric,
  sale_id uuid,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  payment_amount numeric,
  payment_currency text,
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid,
  payment_reference text,
  payment_note text,
  delivery_agreement text,
  admin_seen_at timestamptz,
  admin_seen_by uuid,
  reordered_from_order_id uuid,
  sale_generation integer,
  items jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    order_row.id,
    order_row.customer_id,
    customer.name,
    customer.mobile,
    customer.email,
    order_row.status,
    order_row.payment_method,
    order_row.transfer_ticket_url,
    order_row.transfer_ticket_key,
    order_row.total_mxn,
    order_row.sale_id,
    order_row.source,
    order_row.created_at,
    order_row.updated_at,
    order_row.completed_at,
    order_row.cancelled_at,
    order_row.deleted_at,
    order_row.payment_amount,
    order_row.payment_currency,
    order_row.payment_confirmed_at,
    order_row.payment_confirmed_by,
    order_row.payment_reference,
    order_row.payment_note,
    order_row.delivery_agreement,
    order_row.admin_seen_at,
    order_row.admin_seen_by,
    order_row.reordered_from_order_id,
    (
      select history.generation
      from public.wholesale_order_sales as history
      where history.sale_id = order_row.sale_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'line_kind', item.line_kind,
            'product_id', item.product_id,
            'category_id', item.category_id,
            'category_name', item.category_name,
            'product_name', item.product_name,
            'unit_price_mxn', item.unit_price_mxn,
            'quantity', item.quantity,
            'line_total_mxn', item.line_total_mxn
          ) order by item.id
        )
        from public.wholesale_order_items as item
        where item.order_id = order_row.id
      ),
      '[]'::jsonb
    )
  from public.wholesale_orders as order_row
  join public.wholesale_customers as customer on customer.id = order_row.customer_id
  where order_row.id = p_order_id
$$;

create or replace function public.prepare_wholesale_order_items(p_items jsonb)
returns table(normalized_items jsonb, total_mxn numeric)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  item jsonb;
  line_kind text;
  product public.products%rowtype;
  category public.product_categories%rowtype;
  product_id uuid;
  category_id uuid;
  quantity integer;
  category_quantity integer;
  unit_price numeric;
  line_total numeric;
  category_product_count integer;
  category_retail_invalid_count integer;
  category_wholesale_invalid_count integer;
  category_retail_min numeric;
  category_retail_max numeric;
  category_wholesale_min numeric;
  category_wholesale_max numeric;
  calculated_total numeric := 0;
  prepared_items jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one wholesale order item is required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as elements(value)
    group by coalesce(value->>'line_kind', 'product'), coalesce(value->>'product_id', value->>'category_id')
    having count(*) > 1
  ) then
    raise exception 'duplicate wholesale order line';
  end if;

  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'wholesale order items must be objects';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(item) as keys(key)
      where keys.key not in ('line_kind', 'product_id', 'category_id', 'quantity')
    ) then
      raise exception 'wholesale order item contains unknown fields';
    end if;

    line_kind := coalesce(nullif(btrim(item->>'line_kind'), ''), 'product');
    if line_kind not in ('product', 'category') or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'wholesale order items require a valid line kind and positive integer quantity';
    end if;
    quantity := (item->>'quantity')::integer;

    if line_kind = 'product' then
      if jsonb_typeof(item->'product_id') <> 'string' or btrim(coalesce(item->>'product_id', '')) = '' then
        raise exception 'product ID is required';
      end if;
      product_id := (item->>'product_id')::uuid;
      select catalog_product.* into product
      from public.products as catalog_product
      where catalog_product.id = product_id and catalog_product.active
      for share;
       if not found then
         raise exception 'product not found or inactive';
       end if;
       select coalesce(sum((value->>'quantity')::integer), 0)
       into category_quantity
       from jsonb_array_elements(p_items) as elements(value)
       where coalesce(value->>'line_kind', 'product') = 'product'
         and (value->>'product_id')::uuid in (
           select category_product.id
           from public.products as category_product
           where category_product.category_id = product.category_id
         );
       select category_quantity + coalesce(sum((value->>'quantity')::integer), 0)
       into category_quantity
       from jsonb_array_elements(p_items) as elements(value)
       where coalesce(value->>'line_kind', 'product') = 'category'
         and (value->>'category_id')::uuid = product.category_id;
       unit_price := public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, category_quantity);
      line_total := round(unit_price * quantity, 2);
      calculated_total := calculated_total + line_total;
      prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
        'line_kind', 'product',
        'product_id', product.id,
        'category_id', product.category_id,
        'category_name', null,
        'product_name', product.name,
        'unit_price_mxn', unit_price,
        'quantity', quantity,
        'line_total_mxn', line_total
      ));
    else
      if jsonb_typeof(item->'category_id') <> 'string' or btrim(coalesce(item->>'category_id', '')) = '' then
        raise exception 'category ID is required';
      end if;
      category_id := (item->>'category_id')::uuid;
      select category_row.* into category
      from public.product_categories as category_row
      where category_row.id = category_id;
      if not found then
        raise exception 'category not found';
      end if;
      select
        count(*)::integer,
        count(*) filter (where category_product.retail_price_mxn is null or category_product.retail_price_mxn <= 0)::integer,
        count(*) filter (where category_product.wholesale_price_mxn is null or category_product.wholesale_price_mxn <= 0)::integer,
        min(category_product.retail_price_mxn),
        max(category_product.retail_price_mxn),
        min(category_product.wholesale_price_mxn),
        max(category_product.wholesale_price_mxn)
      into category_product_count, category_retail_invalid_count, category_wholesale_invalid_count,
        category_retail_min, category_retail_max, category_wholesale_min, category_wholesale_max
      from public.products as category_product
      where category_product.category_id = category_id and category_product.active;
      if category_product_count = 0 then
        raise exception 'category has no active products';
      end if;
      if category_retail_invalid_count > 0 or category_retail_min is null or category_retail_max is null or category_retail_min <> category_retail_max then
        raise exception 'category price is ambiguous; active products must share the same positive retail price';
      end if;
      select coalesce(sum((value->>'quantity')::integer), 0)
      into category_quantity
      from jsonb_array_elements(p_items) as elements(value)
      where coalesce(value->>'line_kind', 'product') = 'category'
        and (value->>'category_id')::uuid = category_id;
      select category_quantity + coalesce(sum((value->>'quantity')::integer), 0)
      into category_quantity
      from jsonb_array_elements(p_items) as elements(value)
      where coalesce(value->>'line_kind', 'product') = 'product'
        and (value->>'product_id')::uuid in (
          select category_product.id
          from public.products as category_product
          where category_product.category_id = category_id
        );
      unit_price := case
        when category_quantity >= 10
          and category_wholesale_invalid_count = 0
          and category_wholesale_min is not null
          and category_wholesale_max is not null
          and category_wholesale_min = category_wholesale_max
          then category_wholesale_min
        else category_retail_min
      end;
      line_total := round(unit_price * quantity, 2);
      calculated_total := calculated_total + line_total;
      prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
        'line_kind', 'category',
        'product_id', null,
        'category_id', category.id,
        'category_name', category.name,
        'product_name', category.name,
        'unit_price_mxn', unit_price,
        'quantity', quantity,
        'line_total_mxn', line_total
      ));
    end if;
  end loop;

  return query select prepared_items, round(calculated_total, 2);
end;
$$;

create or replace function public.insert_wholesale_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  item jsonb;
begin
  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    insert into public.wholesale_order_items(
      order_id, line_kind, product_id, category_id, category_name,
      product_name, unit_price_mxn, quantity, line_total_mxn
    ) values (
      p_order_id,
      coalesce(item->>'line_kind', 'product'),
      (item->>'product_id')::uuid,
      (item->>'category_id')::uuid,
      item->>'category_name',
      item->>'product_name',
      (item->>'unit_price_mxn')::numeric,
      (item->>'quantity')::integer,
      (item->>'line_total_mxn')::numeric
    );
  end loop;
end;
$$;

create or replace function public.complete_wholesale_order_sale(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  order_row public.wholesale_orders%rowtype;
  customer public.wholesale_customers%rowtype;
  made_sale_id uuid;
  sale_request_id uuid := gen_random_uuid();
  payload_hash text;
  sale_items jsonb;
  next_generation integer;
  predecessor_sale_id uuid;
  prior_reversal_id uuid;
begin
  if actor is null then
    raise exception 'authenticated admin is required';
  end if;
  select * into order_row
  from public.wholesale_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;
  if order_row.status <> 'completed' then
    raise exception 'only completed orders can create a sale';
  end if;
  if order_row.sale_id is not null then
    if exists (select 1 from public.sale_reversals where sale_id = order_row.sale_id) then
      raise exception 'completed order points to a reversed sale';
    end if;
    return order_row.sale_id;
  end if;
  if order_row.payment_amount is null
    or order_row.payment_amount <= 0
    or order_row.payment_currency is null
    or order_row.payment_confirmed_at is null
    or order_row.payment_confirmed_by is null
    or order_row.delivery_agreement is null then
    raise exception 'completed order payment and delivery confirmation are required';
  end if;
  select * into customer
  from public.wholesale_customers
  where id = order_row.customer_id;
  if not found then
    raise exception 'customer not found';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_kind', item.line_kind,
        'product_id', item.product_id,
        'category_id', item.category_id,
        'category_name', item.category_name,
        'product_name', item.product_name,
        'unit_price_mxn', item.unit_price_mxn,
        'quantity', item.quantity,
        'line_total_mxn', item.line_total_mxn
      ) order by item.id
    ),
    '[]'::jsonb
  ) into sale_items
  from public.wholesale_order_items as item
  where item.order_id = p_order_id;
  if jsonb_array_length(sale_items) = 0 then
    raise exception 'completed wholesale order must contain items';
  end if;

  select coalesce(max(history.generation), 0) + 1
  into next_generation
  from public.wholesale_order_sales as history
  where history.order_id = p_order_id;
  select history.sale_id into predecessor_sale_id
  from public.wholesale_order_sales as history
  where history.order_id = p_order_id
  order by history.generation desc
  limit 1;
  select reversal.id into prior_reversal_id
  from public.sale_reversals as reversal
  where reversal.wholesale_order_id = p_order_id
  order by reversal.reversed_at desc, reversal.id desc
  limit 1;

  payload_hash := encode(public.digest(convert_to(
    'wholesale-order-sale|' || p_order_id::text || '|' || next_generation::text || '|' || sale_items::text || '|' ||
    jsonb_build_object(
      'payment_amount', order_row.payment_amount,
      'payment_currency', order_row.payment_currency,
      'payment_confirmed_at', order_row.payment_confirmed_at,
      'delivery_agreement', order_row.delivery_agreement
    )::text,
    'utf8'
  ), 'sha256'), 'hex');

  insert into public.sales(
    created_by, request_id, channel, total_mxn, payload_hash, business_context
  ) values (
    actor,
    sale_request_id,
    'wholesale',
    order_row.total_mxn,
    payload_hash,
    jsonb_build_object(
      'wholesale_order_id', order_row.id,
      'customer_name', customer.name,
      'phone', customer.mobile,
      'delivery_method', order_row.delivery_agreement,
      'payment_method', order_row.payment_method,
      'payment_amount', order_row.payment_amount,
      'payment_currency', order_row.payment_currency,
      'payment_confirmed_at', order_row.payment_confirmed_at,
      'payment_reference', order_row.payment_reference,
      'payment_note', order_row.payment_note,
      'sale_generation', next_generation
    )
  ) returning id into made_sale_id;

  insert into public.sale_items(
    sale_id, line_kind, product_id, category_id, category_name,
    product_name, unit_price_mxn, quantity, line_total_mxn
  )
  select
    made_sale_id, item.line_kind, item.product_id, item.category_id, item.category_name,
    item.product_name, item.unit_price_mxn, item.quantity, item.line_total_mxn
  from public.wholesale_order_items as item
  where item.order_id = p_order_id;

  insert into public.wholesale_order_sales(
    sale_id, order_id, generation, predecessor_sale_id, prior_reversal_id, created_by
  ) values (
    made_sale_id, p_order_id, next_generation, predecessor_sale_id, prior_reversal_id, actor
  );
  update public.wholesale_orders
  set sale_id = made_sale_id, updated_at = now()
  where id = p_order_id and sale_id is null;
  return made_sale_id;
end;
$$;

-- Keep the deployed sale contract and idempotency rules intact. The only
-- wholesale-specific changes are category-line admission and threshold-based
-- product pricing; POS validation and pricing remain unchanged.
create or replace function public.record_sale(
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
  actor uuid := auth.uid();
  wanted_channel text := lower(btrim(p_channel));
  actor_branch_id uuid;
  active_shift public.pos_shifts%rowtype;
  active_shift_id uuid;
  active_usd_mxn_rate numeric := 15;
  wanted_payment text;
  wanted_currency text;
  wanted_delivery text;
  wanted_advance_payment text;
  customer_name text;
  phone text;
  event_name text;
  event_date_text text;
  event_date date;
  responsible_name text;
  advance_amount numeric;
  input_usd_mxn_rate numeric;
  input_usd_paid numeric;
  input_received_mxn numeric;
  usd_equivalent numeric;
  received_mxn numeric;
  change_mxn numeric;
  normalized_details jsonb;
  hash_details jsonb;
  payload_hash text;
  legacy_payload_hash text;
  existing public.sales%rowtype;
  made public.sales%rowtype;
  product public.products%rowtype;
  category_row public.product_categories%rowtype;
  item jsonb;
  validated_item jsonb;
  validated_items jsonb := '[]'::jsonb;
  line_kind text;
  product_id uuid;
  target_category_id uuid;
  category_quantity integer;
  category_product_count integer;
  category_retail_invalid_count integer;
  category_wholesale_invalid_count integer;
  category_retail_min numeric;
  category_retail_max numeric;
  category_wholesale_min numeric;
  category_wholesale_max numeric;
  quantity integer;
  unit_price numeric;
  line_total numeric;
  sale_total numeric := 0;
  resolved_cashier_name text;
  resolved_branch_name text;
begin
  if public.has_capability('sales.record') then
    actor_branch_id := null;
  elsif public.has_capability('pos.use') then
    if wanted_channel <> 'pos' then raise exception 'cashiers can only record POS sales'; end if;
    actor_branch_id := public.get_cashier_branch_id();
    if actor_branch_id is null then raise exception 'cashier branch is unavailable'; end if;
  else
    raise exception 'access denied';
  end if;
  if p_request_id is null then raise exception 'request ID is required'; end if;
  if wanted_channel is null or wanted_channel not in ('pos', 'wholesale', 'event') then raise exception 'invalid sales channel'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'at least one sale item is required'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then raise exception 'sale details must be an object'; end if;

  if wanted_channel = 'pos' then
    if exists (
      select 1 from jsonb_object_keys(p_details) as keys(key)
      where keys.key not in ('customer_name', 'payment_method', 'payment_currency', 'usd_mxn_rate', 'usd_paid', 'received_amount_mxn')
    ) then raise exception 'sale details contain unknown fields'; end if;
    if jsonb_typeof(p_details->'payment_method') <> 'string' or btrim(p_details->>'payment_method') = '' then raise exception 'payment method is required'; end if;
    wanted_payment := lower(btrim(p_details->>'payment_method'));
    if wanted_payment not in ('cash', 'card') then raise exception 'invalid POS payment method'; end if;
    wanted_currency := coalesce(lower(nullif(btrim(p_details->>'payment_currency'), '')), 'mxn');
    if wanted_currency not in ('mxn', 'usd') then raise exception 'invalid POS payment currency'; end if;
    if wanted_currency = 'usd' and wanted_payment <> 'cash' then raise exception 'USD payment is only available for cash'; end if;
    if p_details ? 'usd_mxn_rate' then
      if jsonb_typeof(p_details->'usd_mxn_rate') <> 'number' or (p_details->>'usd_mxn_rate')::numeric <= 0 then raise exception 'USD/MXN rate must be positive'; end if;
      input_usd_mxn_rate := (p_details->>'usd_mxn_rate')::numeric;
    end if;
    if p_details ? 'usd_paid' then
      if jsonb_typeof(p_details->'usd_paid') <> 'number' or (p_details->>'usd_paid')::numeric <= 0 then raise exception 'USD paid must be positive'; end if;
      input_usd_paid := round((p_details->>'usd_paid')::numeric, 2);
    end if;
    if p_details ? 'received_amount_mxn' then
      if jsonb_typeof(p_details->'received_amount_mxn') <> 'number' or (p_details->>'received_amount_mxn')::numeric < 0 then raise exception 'Received MXN must be non-negative'; end if;
      input_received_mxn := round((p_details->>'received_amount_mxn')::numeric, 2);
    end if;
    if p_details ? 'customer_name' then
      if jsonb_typeof(p_details->'customer_name') <> 'string' or btrim(p_details->>'customer_name') = '' then raise exception 'POS customer name must be a non-empty string when provided'; end if;
      customer_name := btrim(p_details->>'customer_name');
      if length(customer_name) > 160 then raise exception 'POS customer name is too long'; end if;
    end if;
    hash_details := jsonb_build_object('payment_method', wanted_payment, 'payment_currency', wanted_currency);
    if customer_name is not null then hash_details := hash_details || jsonb_build_object('customer_name', customer_name); end if;
    if input_usd_mxn_rate is not null then hash_details := hash_details || jsonb_build_object('usd_mxn_rate', input_usd_mxn_rate); end if;
    if input_usd_paid is not null then hash_details := hash_details || jsonb_build_object('usd_paid', input_usd_paid); end if;
    if input_received_mxn is not null then hash_details := hash_details || jsonb_build_object('received_amount_mxn', input_received_mxn); end if;
  elsif wanted_channel = 'wholesale' then
    if exists (select 1 from jsonb_object_keys(p_details) as keys(key) where keys.key not in ('customer_name', 'phone', 'delivery_method', 'payment_method')) then raise exception 'sale details contain unknown fields'; end if;
    if jsonb_typeof(p_details->'customer_name') <> 'string' or btrim(p_details->>'customer_name') = '' then raise exception 'wholesale customer name is required'; end if;
    if jsonb_typeof(p_details->'phone') <> 'string' or btrim(p_details->>'phone') = '' then raise exception 'wholesale customer phone is required'; end if;
    if jsonb_typeof(p_details->'delivery_method') <> 'string' or btrim(p_details->>'delivery_method') = '' then raise exception 'wholesale delivery method is required'; end if;
    if jsonb_typeof(p_details->'payment_method') <> 'string' or btrim(p_details->>'payment_method') = '' then raise exception 'wholesale payment method is required'; end if;
    customer_name := btrim(p_details->>'customer_name'); phone := btrim(p_details->>'phone'); wanted_delivery := lower(btrim(p_details->>'delivery_method')); wanted_payment := lower(btrim(p_details->>'payment_method'));
    if length(customer_name) > 160 then raise exception 'wholesale customer name is too long'; end if;
    if length(phone) > 40 then raise exception 'wholesale customer phone is too long'; end if;
    if wanted_delivery not in ('delivery', 'pickup') then raise exception 'invalid wholesale delivery method'; end if;
    if wanted_payment not in ('credit', 'cash', 'transfer') then raise exception 'invalid wholesale payment method'; end if;
    hash_details := jsonb_build_object('customer_name', customer_name, 'phone', phone, 'delivery_method', wanted_delivery, 'payment_method', wanted_payment);
  else
    if exists (select 1 from jsonb_object_keys(p_details) as keys(key) where keys.key not in ('event_name', 'event_date', 'responsible_name', 'advance_amount_mxn', 'advance_payment_method')) then raise exception 'sale details contain unknown fields'; end if;
    if jsonb_typeof(p_details->'event_name') <> 'string' or btrim(p_details->>'event_name') = '' then raise exception 'event name is required'; end if;
    if jsonb_typeof(p_details->'event_date') <> 'string' or btrim(p_details->>'event_date') = '' then raise exception 'event date is required'; end if;
    if jsonb_typeof(p_details->'responsible_name') <> 'string' or btrim(p_details->>'responsible_name') = '' then raise exception 'event responsible name is required'; end if;
    event_name := btrim(p_details->>'event_name'); event_date_text := btrim(p_details->>'event_date'); responsible_name := btrim(p_details->>'responsible_name');
    if length(event_name) > 160 then raise exception 'event name is too long'; end if;
    if length(responsible_name) > 160 then raise exception 'event responsible name is too long'; end if;
    if event_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'event date must be an ISO date'; end if;
    begin event_date := event_date_text::date; exception when others then raise exception 'event date must be an ISO date'; end;
    if to_char(event_date, 'YYYY-MM-DD') <> event_date_text then raise exception 'event date must be an ISO date'; end if;
    hash_details := jsonb_build_object('event_name', event_name, 'event_date', event_date_text, 'responsible_name', responsible_name);
    if p_details ? 'advance_amount_mxn' then
      if jsonb_typeof(p_details->'advance_amount_mxn') <> 'number' then raise exception 'advance amount must be a number'; end if;
      advance_amount := (p_details->>'advance_amount_mxn')::numeric;
      if advance_amount < 0 then raise exception 'advance amount cannot be negative'; end if;
      hash_details := hash_details || jsonb_build_object('advance_amount_mxn', advance_amount);
      if advance_amount > 0 then
        if p_details->'advance_payment_method' is null or jsonb_typeof(p_details->'advance_payment_method') <> 'string' or btrim(p_details->>'advance_payment_method') = '' then raise exception 'advance payment method is required when an advance is recorded'; end if;
        wanted_advance_payment := lower(btrim(p_details->>'advance_payment_method'));
        if wanted_advance_payment not in ('cash', 'card') then raise exception 'invalid advance payment method'; end if;
        hash_details := hash_details || jsonb_build_object('advance_payment_method', wanted_advance_payment);
      end if;
    end if;
  end if;

  payload_hash := encode(public.digest(convert_to('record_sale|' || wanted_channel || '|' || p_items::text || '|' || hash_details::text, 'utf8'), 'sha256'), 'hex');
  legacy_payload_hash := encode(public.digest(convert_to('record_sale|' || wanted_channel || '|' || p_items::text || '|' || (case when wanted_channel = 'pos' then hash_details - 'payment_currency' else hash_details end)::text, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id::text, 0));
  select sale.* into existing from public.sales as sale where sale.created_by = actor and sale.request_id = p_request_id;
  if found then
    if existing.channel <> wanted_channel or existing.payload_hash <> payload_hash and existing.payload_hash <> legacy_payload_hash then raise exception 'request conflict'; end if;
    return query select existing.id, existing.channel, existing.total_mxn, existing.created_at, 'replayed'::text,
      null::text, existing.branch_id, null::text, existing.pos_shift_id,
      existing.business_context->>'payment_method', existing.business_context->>'payment_currency', existing.pos_usd_mxn_rate,
      existing.pos_usd_equivalent, existing.pos_usd_paid, existing.pos_received_mxn, existing.pos_change_mxn, null::jsonb;
    return;
  end if;

  if wanted_channel = 'pos' and actor_branch_id is not null then
    select shift.* into active_shift from public.pos_shifts as shift
    where shift.cashier_id = actor and shift.branch_id = actor_branch_id and shift.status = 'open' for update;
    if not found then raise exception 'active POS shift is required'; end if;
    active_shift_id := active_shift.id;
    active_usd_mxn_rate := active_shift.usd_mxn_rate;
  elsif wanted_channel = 'pos' then
    active_usd_mxn_rate := coalesce(input_usd_mxn_rate, 15);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) elements(value)
    group by coalesce(value->>'line_kind', 'product'), coalesce(value->>'product_id', value->>'category_id')
    having count(*) > 1
  ) then raise exception 'duplicate sale line'; end if;

  for item in select value from jsonb_array_elements(p_items) elements(value) loop
    line_kind := coalesce(item->>'line_kind', 'product');
    if jsonb_typeof(item) <> 'object' or line_kind not in ('product', 'category') or item->>'quantity' !~ '^[1-9][0-9]*$' then raise exception 'sale items require a valid line kind and positive integer quantity'; end if;
    quantity := (item->>'quantity')::integer;
    if line_kind = 'category' and wanted_channel not in ('pos', 'wholesale') then raise exception 'category sale lines are only available in POS or wholesale'; end if;
    if line_kind = 'product' then
      if jsonb_typeof(item->'product_id') <> 'string' or btrim(item->>'product_id') = '' then raise exception 'product ID is required'; end if;
      product_id := (item->>'product_id')::uuid;
      select catalog_product.* into product
      from public.products as catalog_product
      where catalog_product.id = product_id and catalog_product.active
      for share;
      if not found then raise exception 'product not found or inactive'; end if;
      select coalesce(sum((value->>'quantity')::integer), 0) into category_quantity
      from jsonb_array_elements(p_items) elements(value)
      where coalesce(value->>'line_kind', 'product') = 'product'
        and (value->>'product_id')::uuid in (select category_products.id from public.products as category_products where category_products.category_id = product.category_id);
      select category_quantity + coalesce(sum((value->>'quantity')::integer), 0) into category_quantity
      from jsonb_array_elements(p_items) elements(value)
      where value->>'line_kind' = 'category' and (value->>'category_id')::uuid = product.category_id;
       unit_price := case
         when wanted_channel = 'wholesale' then public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, category_quantity)
         when wanted_channel = 'pos' and category_quantity >= 10 and product.wholesale_price_mxn > 0 then product.wholesale_price_mxn
         else product.retail_price_mxn
      end;
      validated_item := jsonb_build_object('line_kind', 'product', 'product_id', product.id, 'category_id', product.category_id, 'product_name', product.name, 'unit_price_mxn', unit_price, 'quantity', quantity, 'line_total_mxn', round(unit_price * quantity, 2));
    else
      if jsonb_typeof(item->'category_id') <> 'string' or btrim(item->>'category_id') = '' then raise exception 'category ID is required'; end if;
      target_category_id := (item->>'category_id')::uuid;
      select category.* into category_row from public.product_categories as category where category.id = target_category_id;
      if not found then raise exception 'category not found'; end if;
      select
        count(*)::integer,
        count(*) filter (where category_products.retail_price_mxn is null or category_products.retail_price_mxn <= 0)::integer,
        count(*) filter (where category_products.wholesale_price_mxn is null or category_products.wholesale_price_mxn <= 0)::integer,
        min(category_products.retail_price_mxn),
        max(category_products.retail_price_mxn),
        min(category_products.wholesale_price_mxn),
        max(category_products.wholesale_price_mxn)
      into category_product_count, category_retail_invalid_count, category_wholesale_invalid_count,
        category_retail_min, category_retail_max, category_wholesale_min, category_wholesale_max
      from public.products as category_products
      where category_products.category_id = target_category_id and category_products.active;
      if category_product_count = 0 then raise exception 'category has no active products'; end if;
      if category_retail_invalid_count > 0 or category_retail_min is null or category_retail_max is null or category_retail_min <= 0 or category_retail_min <> category_retail_max then raise exception 'category price is ambiguous; active products must share the same positive retail price'; end if;
      select coalesce(sum((value->>'quantity')::integer), 0) into category_quantity
      from jsonb_array_elements(p_items) elements(value)
      where coalesce(value->>'line_kind', 'product') = 'category' and (value->>'category_id')::uuid = target_category_id;
      select category_quantity + coalesce(sum((value->>'quantity')::integer), 0) into category_quantity
      from jsonb_array_elements(p_items) elements(value)
      where coalesce(value->>'line_kind', 'product') = 'product'
        and (value->>'product_id')::uuid in (select category_products.id from public.products as category_products where category_products.category_id = target_category_id);
      unit_price := case
        when category_quantity >= 10
          and category_wholesale_invalid_count = 0
          and category_wholesale_min is not null
          and category_wholesale_min > 0
          and category_wholesale_min = category_wholesale_max
          then category_wholesale_min
        else category_retail_min
      end;
      validated_item := jsonb_build_object('line_kind', 'category', 'category_id', category_row.id, 'category_name', category_row.name, 'product_name', category_row.name, 'unit_price_mxn', unit_price, 'quantity', quantity, 'line_total_mxn', round(unit_price * quantity, 2));
    end if;
    line_total := (validated_item->>'line_total_mxn')::numeric;
    sale_total := sale_total + line_total;
    validated_items := validated_items || jsonb_build_array(validated_item);
  end loop;

  if wanted_channel = 'pos' then
    if wanted_currency = 'usd' then
      if input_usd_paid is null then raise exception 'USD paid is required when USD is selected'; end if;
      usd_equivalent := round(sale_total / active_usd_mxn_rate, 2);
      received_mxn := round(input_usd_paid * active_usd_mxn_rate, 2);
      if received_mxn < sale_total then raise exception 'USD paid is less than the MXN sale total'; end if;
      change_mxn := round(received_mxn - sale_total, 2);
    elsif wanted_payment = 'cash' then
      received_mxn := coalesce(input_received_mxn, sale_total);
      if received_mxn < sale_total then raise exception 'Received MXN is less than the MXN sale total'; end if;
      change_mxn := round(received_mxn - sale_total, 2);
    else
      received_mxn := sale_total;
      change_mxn := 0;
    end if;
    normalized_details := jsonb_build_object('payment_method', wanted_payment, 'payment_currency', wanted_currency, 'usd_mxn_rate', active_usd_mxn_rate, 'received_amount_mxn', received_mxn, 'change_mxn', change_mxn);
    if wanted_currency = 'usd' then normalized_details := normalized_details || jsonb_build_object('usd_equivalent', usd_equivalent, 'usd_paid', input_usd_paid); end if;
    if customer_name is not null then normalized_details := normalized_details || jsonb_build_object('customer_name', customer_name); end if;
  elsif wanted_channel = 'wholesale' then
    normalized_details := hash_details;
  else
    normalized_details := hash_details;
  end if;

  select coalesce(employee.display_name, nullif(to_jsonb(auth_user)->'profile'->>'name', ''), auth_user.email)
  into resolved_cashier_name
  from auth.users auth_user
  left join public.employee_identities employee on employee.user_id = auth_user.id
  where auth_user.id = actor;
  select branch.name into resolved_branch_name from public.branches as branch where branch.id = actor_branch_id;

  insert into public.sales(
    created_by, request_id, channel, branch_id, total_mxn, payload_hash, business_context,
    pos_shift_id, pos_usd_mxn_rate, pos_usd_equivalent, pos_usd_paid, pos_received_mxn, pos_change_mxn
  ) values (
    actor, p_request_id, wanted_channel, actor_branch_id, sale_total, payload_hash, normalized_details,
    active_shift_id, case when wanted_channel = 'pos' then active_usd_mxn_rate end,
    case when wanted_channel = 'pos' then usd_equivalent end,
    case when wanted_channel = 'pos' and wanted_currency = 'usd' then input_usd_paid end,
    case when wanted_channel = 'pos' then received_mxn end,
    case when wanted_channel = 'pos' then change_mxn end
  ) returning * into made;

  for item in select value from jsonb_array_elements(validated_items) elements(value) loop
    insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn)
    values (
      made.id, item->>'line_kind', (item->>'product_id')::uuid, (item->>'category_id')::uuid, item->>'category_name', item->>'product_name',
      (item->>'unit_price_mxn')::numeric, (item->>'quantity')::integer, (item->>'line_total_mxn')::numeric
    );
  end loop;

  return query select made.id, made.channel, made.total_mxn, made.created_at, 'created'::text,
    resolved_cashier_name, made.branch_id, resolved_branch_name, made.pos_shift_id,
    made.business_context->>'payment_method', made.business_context->>'payment_currency', made.pos_usd_mxn_rate,
    made.pos_usd_equivalent, made.pos_usd_paid, made.pos_received_mxn, made.pos_change_mxn, validated_items;
end;
$$;

revoke execute on function public.record_sale(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_sale(uuid, text, jsonb, jsonb) to authenticated;
