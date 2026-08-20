create table public.sales (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('pos', 'wholesale', 'event')),
  total_mxn numeric(14,2) not null check (total_mxn >= 0),
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint sales_request_owner_key unique (created_by, request_id)
);

create index sales_channel_created_at_idx on public.sales(channel, created_at);
create index sales_created_by_idx on public.sales(created_by);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price_mxn numeric(12,2) not null check (unit_price_mxn >= 0),
  quantity integer not null check (quantity > 0),
  line_total_mxn numeric(14,2) not null check (line_total_mxn = round(unit_price_mxn * quantity, 2)),
  constraint sale_items_product_once unique (sale_id, product_id),
  constraint sale_items_product_name_not_blank check (length(btrim(product_name)) > 0)
);

create index sale_items_product_id_idx on public.sale_items(product_id);

insert into public.capabilities(key)
values ('sales.record'), ('reports.view')
on conflict do nothing;

insert into public.role_capabilities(role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'admin' and c.key in ('sales.record', 'reports.view')
on conflict do nothing;

create function public.record_sale(
  p_request_id uuid,
  p_channel text,
  p_items jsonb
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

  payload_hash := encode(public.digest(
    convert_to('record_sale|' || wanted_channel || '|' || p_items::text, 'utf8'),
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

  insert into public.sales(created_by, request_id, channel, total_mxn, payload_hash)
  values (actor, p_request_id, wanted_channel, sale_total, payload_hash)
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

create function public.report_sales_by_channel(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  channel text,
  sale_count bigint,
  total_mxn numeric
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

  return query
  with channels(channel) as (
    values ('pos'::text), ('wholesale'::text), ('event'::text)
  )
  select channels.channel,
    count(sales.id)::bigint,
    coalesce(sum(sales.total_mxn), 0)::numeric(14,2)
  from channels
  left join public.sales sales
    on sales.channel = channels.channel
    and sales.created_at >= p_from
    and sales.created_at < p_to
  group by channels.channel
  order by case channels.channel when 'pos' then 1 when 'wholesale' then 2 else 3 end;
end;
$$;

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy sales_report_select on public.sales
for select to authenticated
using (public.has_capability('reports.view'));

create policy sale_items_report_select on public.sale_items
for select to authenticated
using (public.has_capability('reports.view'));

revoke all on public.sales, public.sale_items from anon, authenticated;
grant select on public.sales, public.sale_items to authenticated;

revoke execute on function public.record_sale(uuid, text, jsonb),
  public.report_sales_by_channel(timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.record_sale(uuid, text, jsonb),
  public.report_sales_by_channel(timestamptz, timestamptz)
to authenticated;
