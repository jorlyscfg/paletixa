-- Global report timezone configuration with server-authoritative date boundaries.

create table public.report_timezone_configuration (
  singleton boolean primary key default true check (singleton),
  timezone text not null check (timezone in ('America/Cancun', 'America/Mexico_City')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  effective_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.report_timezone_configuration(singleton, timezone, owner_id, updated_by, effective_at)
select true, 'America/Cancun', configuration.owner_id, configuration.updated_by, null
from public.event_configuration as configuration
where configuration.singleton
on conflict (singleton) do nothing;

do $$
begin
  if not exists (select 1 from public.report_timezone_configuration where singleton) then
    raise exception 'cannot establish the global report timezone configuration owner';
  end if;
end
$$;

create table public.report_timezone_configuration_receipts (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  scope text not null default 'global' check (scope = 'global'),
  payload_hash text not null,
  result_timezone text not null check (result_timezone in ('America/Cancun', 'America/Mexico_City')),
  result_owner_id uuid not null references auth.users(id) on delete restrict,
  result_state text not null default 'configured' check (result_state = 'configured'),
  result_effective_at timestamptz not null,
  result_status text not null default 'created' check (result_status = 'created'),
  created_at timestamptz not null default now()
);

create index report_timezone_configuration_receipts_actor_idx
  on public.report_timezone_configuration_receipts(actor_id, created_at desc);

create table public.report_timezone_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  scope text not null default 'global' check (scope = 'global'),
  before_timezone text not null check (before_timezone in ('America/Cancun', 'America/Mexico_City')),
  after_timezone text not null check (after_timezone in ('America/Cancun', 'America/Mexico_City')),
  before_effective_at timestamptz,
  after_effective_at timestamptz not null,
  request_id uuid not null references public.report_timezone_configuration_receipts(request_id) on delete restrict,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  unique (request_id)
);

create index report_timezone_configuration_audit_created_idx
  on public.report_timezone_configuration_audit(created_at desc);

create function public.report_timezone_configuration_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger report_timezone_configuration_receipts_append_only
before update or delete on public.report_timezone_configuration_receipts
for each row execute function public.report_timezone_configuration_append_only_guard();

create trigger report_timezone_configuration_audit_append_only
before update or delete on public.report_timezone_configuration_audit
for each row execute function public.report_timezone_configuration_append_only_guard();

create function public.get_report_timezone_configuration()
returns table(
  timezone text,
  scope text,
  owner_id uuid,
  state text,
  effective_at timestamptz,
  result_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('reports.view') then
    raise exception 'access denied';
  end if;
  return query
  select configuration.timezone,
    'global'::text,
    configuration.owner_id,
    case when configuration.effective_at is null then 'compatibility-default' else 'configured' end,
    configuration.effective_at,
    null::text
  from public.report_timezone_configuration as configuration
  where configuration.singleton;
end
$$;

create function public.set_report_timezone_configuration(
  p_request_id uuid,
  p_timezone text
)
returns table(
  timezone text,
  scope text,
  owner_id uuid,
  state text,
  effective_at timestamptz,
  result_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_timezone text := btrim(coalesce(p_timezone, ''));
  payload_hash text;
  changed_at timestamptz;
  existing_receipt public.report_timezone_configuration_receipts%rowtype;
  configuration public.report_timezone_configuration%rowtype;
begin
  if not public.has_capability('configuration.manage') then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if normalized_timezone not in ('America/Cancun', 'America/Mexico_City') then
    raise exception 'reporting timezone is invalid';
  end if;

  payload_hash := encode(public.digest(convert_to(
    'set-report-timezone-configuration|global|' || normalized_timezone,
    'utf8'
  ), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'report-timezone-configuration:' || p_request_id::text, 0
  ));
  select * into existing_receipt
  from public.report_timezone_configuration_receipts as receipt
  where receipt.request_id = p_request_id
  for update;
  if found then
    if existing_receipt.actor_id is distinct from actor
      or existing_receipt.scope <> 'global'
      or existing_receipt.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query select existing_receipt.result_timezone, existing_receipt.scope,
      existing_receipt.result_owner_id, existing_receipt.result_state,
      existing_receipt.result_effective_at, 'replayed'::text;
    return;
  end if;

  select * into configuration
  from public.report_timezone_configuration
  where singleton
  for update;
  if not found then
    raise exception 'report timezone configuration is unavailable';
  end if;
  changed_at := now();

  insert into public.report_timezone_configuration_receipts(
    request_id, actor_id, payload_hash, result_timezone, result_owner_id,
    result_effective_at
  ) values (
    p_request_id, actor, payload_hash, normalized_timezone, configuration.owner_id,
    changed_at
  );

  update public.report_timezone_configuration
  set timezone = normalized_timezone,
      updated_by = actor,
      effective_at = changed_at,
      updated_at = changed_at
  where singleton;

  insert into public.report_timezone_configuration_audit(
    actor_id, before_timezone, after_timezone, before_effective_at,
    after_effective_at, request_id, payload_hash
  ) values (
    actor, configuration.timezone, normalized_timezone, configuration.effective_at,
    changed_at, p_request_id, payload_hash
  );

  return query select normalized_timezone, 'global'::text, configuration.owner_id,
    'configured'::text, changed_at, 'created'::text;
end
$$;

-- Keep the report RPC contract stable. The input timezone is still validated as
-- a supported client value, but all report semantics use the stored value.
create or replace function public.report_dashboard_snapshot(
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
  from_date date;
  to_date date;
  utc_from timestamptz;
  utc_to timestamptz;
  configured_timezone text;
  normalized_scope text := lower(btrim(coalesce(p_scope, 'all')));
  scope_kind text;
  selected_branch_id uuid;
  selected_branch_name text;
  window_days integer;
begin
  if not public.has_capability('reports.view') then
    raise exception 'access denied';
  end if;
  if p_timezone is null or p_timezone not in ('America/Cancun', 'America/Mexico_City') then
    raise exception 'reporting timezone is invalid';
  end if;
  select configuration.timezone
    into configured_timezone
  from public.report_timezone_configuration as configuration
  where configuration.singleton;
  if configured_timezone is null or configured_timezone not in ('America/Cancun', 'America/Mexico_City') then
    raise exception 'report timezone configuration is unavailable';
  end if;
  if p_from is null or p_to is null
    or p_from !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_to !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid report date range';
  end if;

  begin
    from_date := p_from::date;
    to_date := p_to::date;
  exception when others then
    raise exception 'invalid report date range';
  end;
  if to_char(from_date, 'YYYY-MM-DD') <> p_from
    or to_char(to_date, 'YYYY-MM-DD') <> p_to
    or to_date < from_date then
    raise exception 'invalid report date range';
  end if;
  if to_date - from_date >= 366 then
    raise exception 'report date range is limited to 366 calendar days';
  end if;
  window_days := to_date - from_date + 1;

  utc_from := from_date::timestamp at time zone configured_timezone;
  utc_to := (to_date + 1)::timestamp at time zone configured_timezone;

  if normalized_scope = 'all' and p_branch_id is not null then
    raise exception 'all-branch scope does not accept a branch ID';
  end if;
  if p_branch_id is not null and normalized_scope not in ('all', 'branch') then
    begin
      if normalized_scope::uuid <> p_branch_id then
        raise exception 'scope selector does not match branch ID';
      end if;
    exception when invalid_text_representation then
      raise exception 'invalid report scope selector';
    end;
  end if;

  if p_branch_id is not null then
    selected_branch_id := p_branch_id;
    scope_kind := 'branch';
  elsif normalized_scope = 'all' then
    scope_kind := 'all';
  elsif normalized_scope = 'branch' then
    raise exception 'branch scope requires a branch ID';
  else
    begin
      selected_branch_id := normalized_scope::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid report scope selector';
    end;
    scope_kind := 'branch';
  end if;

  if selected_branch_id is not null then
    select branch.name
      into selected_branch_name
    from public.branches as branch
    where branch.id = selected_branch_id
      and branch.status = 'active';
    if not found then
      raise exception 'branch scope is not permitted';
    end if;
  end if;

  return (
    with recognized_sales as (
      select
        sale.id,
        sale.created_at,
        sale.channel,
        sale.total_mxn
      from public.sales as sale
      where sale.created_at >= utc_from
        and sale.created_at < utc_to
        and not exists (select 1 from public.sale_reversals as reversal where reversal.sale_id = sale.id)
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
    sales_totals as (
      select
        count(*)::bigint as sale_count,
        coalesce(sum(recognized.total_mxn), 0)::numeric as total_mxn
      from recognized_sales as recognized
    ),
    channel_values(channel_order, channel) as (
      values (1, 'pos'::text), (2, 'wholesale'::text), (3, 'event'::text)
    ),
    channel_totals as (
      select
        channels.channel_order,
        channels.channel,
        count(recognized.id)::bigint as sale_count,
        coalesce(sum(recognized.total_mxn), 0)::numeric as total_mxn
      from channel_values as channels
      left join recognized_sales as recognized
        on recognized.channel = channels.channel
      group by channels.channel_order, channels.channel
    ),
    daily_totals as (
      select
        days.report_date::date as report_date,
        count(recognized.id)::bigint as sale_count,
        coalesce(sum(recognized.total_mxn), 0)::numeric as total_mxn
      from generate_series(from_date, to_date, interval '1 day') as days(report_date)
      left join recognized_sales as recognized
        on (recognized.created_at at time zone configured_timezone)::date = days.report_date::date
      group by days.report_date::date
    ),
    report_line_items as (
      select
        recognized.id as sale_id,
        coalesce(item.line_kind, 'product') as line_kind,
        item.product_id,
        coalesce(item.category_id, product.category_id) as category_id,
        item.product_name,
        coalesce(nullif(btrim(item.category_name), ''), category.name) as category_name,
        item.quantity,
        item.line_total_mxn
      from recognized_sales as recognized
      join public.sale_items as item on item.sale_id = recognized.id
      left join public.products as product on product.id = item.product_id
      left join public.product_categories as category
        on category.id = coalesce(item.category_id, product.category_id)
    ),
    product_totals as (
      select
        line_kind,
        product_id,
        category_id,
        max(product_name) as product_name,
        max(category_name) as category_name,
        sum(quantity)::bigint as quantity,
        round(sum(line_total_mxn), 2)::numeric as total_mxn
      from report_line_items
      group by line_kind, product_id, category_id
    )
    select jsonb_build_object(
      'from', to_char(from_date, 'YYYY-MM-DD'),
      'to', to_char(to_date, 'YYYY-MM-DD'),
      'timezone', configured_timezone,
      'utc_from', to_char(utc_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'utc_to', to_char(utc_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'scope', jsonb_build_object(
        'kind', scope_kind,
        'branch_id', selected_branch_id,
        'branch_name', selected_branch_name,
        'includes_unassigned', selected_branch_id is null
      ),
      'sales', jsonb_build_object(
        'total_mxn', totals.total_mxn,
        'count', totals.sale_count,
        'average_ticket_mxn', case
          when totals.sale_count = 0 then 0::numeric
          else round(totals.total_mxn / totals.sale_count, 2)
        end,
        'average_state', case when totals.sale_count = 0 then 'no-data' else 'value' end,
        'channels', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'channel', channels.channel,
            'sale_count', channels.sale_count,
            'total_mxn', channels.total_mxn
          ) order by channels.channel_order), '[]'::jsonb)
          from channel_totals as channels
        ),
        'daily', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'date', to_char(days.report_date, 'YYYY-MM-DD'),
            'sale_count', days.sale_count,
            'total_mxn', days.total_mxn
          ) order by days.report_date), '[]'::jsonb)
          from daily_totals as days
        ),
        'products', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'line_kind', products.line_kind,
            'product_id', products.product_id,
            'product_name', products.product_name,
            'category_id', products.category_id,
            'category_name', products.category_name,
            'quantity', products.quantity,
            'total_mxn', products.total_mxn
          ) order by products.quantity desc, products.total_mxn desc, products.product_name, products.product_id), '[]'::jsonb)
          from product_totals as products
        )
      ),
      'operations', jsonb_build_object(
        'wholesale', jsonb_build_object(
          'scope', 'global',
          'pending_count', (
            select count(*)::bigint
            from public.wholesale_orders as order_row
            where order_row.deleted_at is null and order_row.status = 'pending'
          ),
          'processing_count', (
            select count(*)::bigint
            from public.wholesale_orders as order_row
            where order_row.deleted_at is null and order_row.status = 'processing'
          ),
          'workload_count', (
            select count(*)::bigint
            from public.wholesale_orders as order_row
            where order_row.deleted_at is null
              and order_row.status in ('pending', 'processing')
          )
        ),
        'event', jsonb_build_object(
          'scope', 'global',
          'pending_count', (
            select count(*)::bigint
            from public.event_reservations as reservation
            where reservation.status = 'pending'
          ),
          'reserved_count', (
            select count(*)::bigint
            from public.event_reservations as reservation
            where reservation.status = 'reserved'
          ),
          'allocated_count', (
            select count(*)::bigint
            from public.event_reservations as reservation
            where reservation.status in ('reserved', 'completed')
              and reservation.cart_allocated = true
              and reservation.event_date >= from_date
              and reservation.event_date <= to_date
          ),
          'capacity_limit', public.operational_event_capacity_limit(),
          'available_count', greatest(
            public.operational_event_capacity_limit() * window_days - (
              select count(*)::integer
              from public.event_reservations as reservation
              where reservation.status in ('reserved', 'completed')
                and reservation.cart_allocated = true
                and reservation.event_date >= from_date
                and reservation.event_date <= to_date
            ),
            0
          )
        ),
        'pos', jsonb_build_object(
          'scope', scope_kind,
          'open_shift_count', (
            select count(*)::bigint
            from public.pos_shifts as shift
            where shift.status = 'open'
              and (selected_branch_id is null or shift.branch_id = selected_branch_id)
          )
        )
      )
    )
    from sales_totals as totals
  );
end
$$;

alter table public.report_timezone_configuration enable row level security;
alter table public.report_timezone_configuration_receipts enable row level security;
alter table public.report_timezone_configuration_audit enable row level security;

revoke all on public.report_timezone_configuration,
  public.report_timezone_configuration_receipts,
  public.report_timezone_configuration_audit
from public, anon, authenticated;

revoke all on function public.report_timezone_configuration_append_only_guard(),
  public.get_report_timezone_configuration(),
  public.set_report_timezone_configuration(uuid, text),
  public.report_dashboard_snapshot(text, text, text, text, uuid)
from public, anon, authenticated;

grant execute on function public.get_report_timezone_configuration(),
  public.set_report_timezone_configuration(uuid, text),
  public.report_dashboard_snapshot(text, text, text, text, uuid)
to authenticated;
