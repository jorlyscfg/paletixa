alter table public.sales
  add column business_context jsonb default '{}'::jsonb
  check (business_context is null or jsonb_typeof(business_context) = 'object');

drop function public.record_sale(uuid, text, jsonb);

create function public.record_sale(
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
  result_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_channel text := lower(btrim(p_channel));
  wanted_payment text;
  wanted_delivery text;
  wanted_advance_payment text;
  customer_name text;
  phone text;
  event_name text;
  event_date_text text;
  event_date date;
  responsible_name text;
  advance_amount numeric;
  normalized_details jsonb;
  payload_hash text;
  existing public.sales%rowtype;
  made public.sales%rowtype;
  product public.products%rowtype;
  item jsonb;
  validated_item jsonb;
  validated_items jsonb := '[]'::jsonb;
  product_id uuid;
  quantity integer;
  unit_price numeric;
  line_total numeric;
  sale_total numeric := 0;
begin
  if not public.has_capability('sales.record') then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if wanted_channel is null or wanted_channel not in ('pos', 'wholesale', 'event') then
    raise exception 'invalid sales channel';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one sale item is required';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'sale details must be an object';
  end if;

  if wanted_channel = 'pos' then
    if exists (
      select 1 from jsonb_object_keys(p_details) as keys(key)
      where keys.key not in ('customer_name', 'payment_method')
    ) then
      raise exception 'sale details contain unknown fields';
    end if;
    if not (jsonb_typeof(p_details->'payment_method') = 'string' and btrim(p_details->>'payment_method') <> '') then
      raise exception 'payment method is required';
    end if;
    wanted_payment := lower(btrim(p_details->>'payment_method'));
    if wanted_payment not in ('cash', 'card', 'transfer', 'other') then
      raise exception 'invalid POS payment method';
    end if;
    if p_details ? 'customer_name' then
      if jsonb_typeof(p_details->'customer_name') <> 'string' or btrim(p_details->>'customer_name') = '' then
        raise exception 'POS customer name must be a non-empty string when provided';
      end if;
      customer_name := btrim(p_details->>'customer_name');
      if length(customer_name) > 160 then
        raise exception 'POS customer name is too long';
      end if;
    end if;
    normalized_details := jsonb_build_object('payment_method', wanted_payment);
    if customer_name is not null then
      normalized_details := normalized_details || jsonb_build_object('customer_name', customer_name);
    end if;
  elsif wanted_channel = 'wholesale' then
    if exists (
      select 1 from jsonb_object_keys(p_details) as keys(key)
      where keys.key not in ('customer_name', 'phone', 'delivery_method', 'payment_method')
    ) then
      raise exception 'sale details contain unknown fields';
    end if;
    if not (jsonb_typeof(p_details->'customer_name') = 'string' and btrim(p_details->>'customer_name') <> '') then
      raise exception 'wholesale customer name is required';
    end if;
    if not (jsonb_typeof(p_details->'phone') = 'string' and btrim(p_details->>'phone') <> '') then
      raise exception 'wholesale customer phone is required';
    end if;
    if not (jsonb_typeof(p_details->'delivery_method') = 'string' and btrim(p_details->>'delivery_method') <> '') then
      raise exception 'wholesale delivery method is required';
    end if;
    if not (jsonb_typeof(p_details->'payment_method') = 'string' and btrim(p_details->>'payment_method') <> '') then
      raise exception 'wholesale payment method is required';
    end if;
    customer_name := btrim(p_details->>'customer_name');
    phone := btrim(p_details->>'phone');
    wanted_delivery := lower(btrim(p_details->>'delivery_method'));
    wanted_payment := lower(btrim(p_details->>'payment_method'));
    if length(customer_name) > 160 then
      raise exception 'wholesale customer name is too long';
    end if;
    if length(phone) > 40 then
      raise exception 'wholesale customer phone is too long';
    end if;
    if wanted_delivery not in ('delivery', 'pickup') then
      raise exception 'invalid wholesale delivery method';
    end if;
    if wanted_payment not in ('credit', 'cash', 'transfer') then
      raise exception 'invalid wholesale payment method';
    end if;
    normalized_details := jsonb_build_object(
      'customer_name', customer_name,
      'phone', phone,
      'delivery_method', wanted_delivery,
      'payment_method', wanted_payment
    );
  else
    if exists (
      select 1 from jsonb_object_keys(p_details) as keys(key)
      where keys.key not in ('event_name', 'event_date', 'responsible_name', 'advance_amount_mxn', 'advance_payment_method')
    ) then
      raise exception 'sale details contain unknown fields';
    end if;
    if not (jsonb_typeof(p_details->'event_name') = 'string' and btrim(p_details->>'event_name') <> '') then
      raise exception 'event name is required';
    end if;
    if not (jsonb_typeof(p_details->'event_date') = 'string' and btrim(p_details->>'event_date') <> '') then
      raise exception 'event date is required';
    end if;
    if not (jsonb_typeof(p_details->'responsible_name') = 'string' and btrim(p_details->>'responsible_name') <> '') then
      raise exception 'event responsible name is required';
    end if;
    if not (jsonb_typeof(p_details->'advance_payment_method') = 'string' and btrim(p_details->>'advance_payment_method') <> '') then
      raise exception 'advance payment method is required';
    end if;
    event_name := btrim(p_details->>'event_name');
    event_date_text := btrim(p_details->>'event_date');
    responsible_name := btrim(p_details->>'responsible_name');
    wanted_advance_payment := lower(btrim(p_details->>'advance_payment_method'));
    if length(event_name) > 160 then
      raise exception 'event name is too long';
    end if;
    if length(responsible_name) > 160 then
      raise exception 'event responsible name is too long';
    end if;
    if event_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'event date must be an ISO date';
    end if;
    begin
      event_date := event_date_text::date;
    exception when others then
      raise exception 'event date must be an ISO date';
    end;
    if to_char(event_date, 'YYYY-MM-DD') <> event_date_text then
      raise exception 'event date must be an ISO date';
    end if;
    if wanted_advance_payment not in ('cash', 'card') then
      raise exception 'invalid advance payment method';
    end if;
    normalized_details := jsonb_build_object(
      'event_name', event_name,
      'event_date', event_date_text,
      'responsible_name', responsible_name,
      'advance_payment_method', wanted_advance_payment
    );
    if p_details ? 'advance_amount_mxn' then
      if jsonb_typeof(p_details->'advance_amount_mxn') <> 'number' then
        raise exception 'advance amount must be a number';
      end if;
      advance_amount := (p_details->>'advance_amount_mxn')::numeric;
      if advance_amount < 0 then
        raise exception 'advance amount cannot be negative';
      end if;
      normalized_details := normalized_details || jsonb_build_object('advance_amount_mxn', advance_amount);
    end if;
  end if;

  payload_hash := encode(public.digest(
    convert_to('record_sale|' || wanted_channel || '|' || p_items::text || '|' || normalized_details::text, 'utf8'),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id::text, 0));

  select * into existing
  from public.sales
  where created_by = actor and request_id = p_request_id;
  if found then
    if existing.channel <> wanted_channel or existing.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query select existing.id, existing.channel, existing.total_mxn, existing.created_at, 'replayed'::text;
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) elements(value)
    group by value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'duplicate sale product';
  end if;

  for item in select value from jsonb_array_elements(p_items) elements(value) loop
    if jsonb_typeof(item) <> 'object' or
       jsonb_typeof(item->'product_id') <> 'string' or
       btrim(item->>'product_id') = '' or
       item->>'quantity' !~ '^[1-9][0-9]*$' then
      raise exception 'sale items require a product ID and positive integer quantity';
    end if;

    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::integer;
    select * into product
    from public.products
    where id = product_id and active
    for share;
    if not found then
      raise exception 'product not found or inactive';
    end if;

    unit_price := case when wanted_channel = 'wholesale'
      then product.wholesale_price_mxn else product.retail_price_mxn end;
    line_total := round(unit_price * quantity, 2);
    sale_total := sale_total + line_total;
    validated_item := jsonb_build_object(
      'product_id', product.id,
      'product_name', product.name,
      'unit_price_mxn', unit_price,
      'quantity', quantity,
      'line_total_mxn', line_total
    );
    validated_items := validated_items || jsonb_build_array(validated_item);
  end loop;

  insert into public.sales(created_by, request_id, channel, total_mxn, payload_hash, business_context)
  values (actor, p_request_id, wanted_channel, sale_total, payload_hash, normalized_details)
  returning * into made;

  for item in select value from jsonb_array_elements(validated_items) elements(value) loop
    insert into public.sale_items(
      sale_id, product_id, product_name, unit_price_mxn, quantity, line_total_mxn
    ) values (
      made.id,
      (item->>'product_id')::uuid,
      item->>'product_name',
      (item->>'unit_price_mxn')::numeric,
      (item->>'quantity')::integer,
      (item->>'line_total_mxn')::numeric
    );
  end loop;

  return query select made.id, made.channel, made.total_mxn, made.created_at, 'created'::text;
end;
$$;

revoke execute on function public.record_sale(uuid, text, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.record_sale(uuid, text, jsonb, jsonb)
to authenticated;
