-- Reports dashboard and operational configuration backend contracts.
-- Reporting uses the canonical ledger and persists no derived business rows.

alter table public.event_configuration
  add column if not exists owner_id uuid,
  add column if not exists effective_at timestamptz;

do $$
declare
  accountable_owner uuid;
  configured_capacity integer;
begin
  select configuration.carts_per_day
    into configured_capacity
  from public.event_configuration as configuration
  where configuration.singleton
  for update;

  if configured_capacity is not null and (configured_capacity < 1 or configured_capacity > 10000) then
    raise exception 'existing event capacity is outside the supported bounds';
  end if;

  select auth_user.id
    into accountable_owner
  from auth.users as auth_user
  join public.profiles as profile on profile.user_id = auth_user.id
  join public.user_roles as user_role on user_role.user_id = auth_user.id
  join public.roles as role on role.id = user_role.role_id
  where auth_user.id = (
      select configuration.updated_by
      from public.event_configuration as configuration
      where configuration.singleton
    )
    and role.key = 'admin'
    and profile.is_active
    and case
      when to_jsonb(auth_user) ? 'email_confirmed_at'
        then nullif(to_jsonb(auth_user)->>'email_confirmed_at', '') is not null
      else coalesce((to_jsonb(auth_user)->>'email_verified')::boolean, false)
    end
  limit 1;

  if accountable_owner is null then
    select auth_user.id
      into accountable_owner
    from auth.users as auth_user
    join public.profiles as profile on profile.user_id = auth_user.id
    join public.user_roles as user_role on user_role.user_id = auth_user.id
    join public.roles as role on role.id = user_role.role_id
    where role.key = 'admin'
      and profile.is_active
      and case
        when to_jsonb(auth_user) ? 'email_confirmed_at'
          then nullif(to_jsonb(auth_user)->>'email_confirmed_at', '') is not null
        else coalesce((to_jsonb(auth_user)->>'email_verified')::boolean, false)
      end
    order by auth_user.id
    limit 1;
  end if;

  if accountable_owner is null then
    raise exception 'cannot establish an accountable verified active administrator for operational configuration';
  end if;

  if configured_capacity is null then
    insert into public.event_configuration(
      singleton, carts_per_day, owner_id, updated_by, effective_at
    ) values (true, 7, accountable_owner, accountable_owner, null);
  else
    update public.event_configuration
    set owner_id = accountable_owner,
        updated_by = accountable_owner
    where singleton;
  end if;
end
$$;

alter table public.event_configuration
  alter column owner_id set not null;

alter table public.event_configuration
  add constraint event_configuration_capacity_bounds
    check (carts_per_day between 1 and 10000),
  add constraint event_configuration_owner_id_fkey
    foreign key (owner_id) references auth.users(id) on delete restrict;

create table public.pos_configuration (
  singleton boolean primary key default true check (singleton),
  usd_mxn_rate numeric(12,4) not null default 15,
  usd_mxn_rate_effective_at timestamptz,
  wholesale_threshold integer not null default 10,
  wholesale_threshold_effective_at timestamptz,
  owner_id uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint pos_configuration_rate_bounds
    check (usd_mxn_rate between 0.01 and 10000),
  constraint pos_configuration_threshold_bounds
    check (wholesale_threshold between 1 and 10000)
);

insert into public.pos_configuration(
  singleton, usd_mxn_rate, usd_mxn_rate_effective_at,
  wholesale_threshold, wholesale_threshold_effective_at,
  owner_id, updated_by
)
select true, 15, null, 10, null, configuration.owner_id, configuration.updated_by
from public.event_configuration as configuration
where configuration.singleton;

insert into public.capabilities(key)
values ('configuration.manage')
on conflict do nothing;

insert into public.role_capabilities(role_id, capability_id)
select role.id, capability.id
from public.roles as role
cross join public.capabilities as capability
where role.key = 'admin'
  and capability.key = 'configuration.manage'
on conflict do nothing;

create table public.operational_configuration_receipts (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  setting_key text not null,
  scope text not null default 'global',
  payload_hash text not null,
  setting_type text not null,
  result_value numeric not null,
  result_owner_id uuid not null references auth.users(id) on delete restrict,
  result_state text not null,
  result_effective_at timestamptz,
  result_status text not null default 'created',
  created_at timestamptz not null default now(),
  constraint operational_configuration_receipt_key_check
    check (setting_key in ('event_daily_capacity', 'pos_usd_mxn_rate', 'pos_wholesale_threshold')),
  constraint operational_configuration_receipt_scope_check
    check (scope = 'global'),
  constraint operational_configuration_receipt_type_check
    check (setting_type in ('integer', 'rate')),
  constraint operational_configuration_receipt_state_check
    check (result_state = 'configured'),
  constraint operational_configuration_receipt_status_check
    check (result_status = 'created')
);

create index operational_configuration_receipts_actor_idx
  on public.operational_configuration_receipts(actor_id, created_at desc);

create table public.operational_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  setting_key text not null,
  scope text not null default 'global',
  before_value numeric not null,
  after_value numeric not null,
  before_effective_at timestamptz,
  after_effective_at timestamptz,
  request_id uuid not null references public.operational_configuration_receipts(request_id) on delete restrict,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  constraint operational_configuration_audit_key_check
    check (setting_key in ('event_daily_capacity', 'pos_usd_mxn_rate', 'pos_wholesale_threshold')),
  constraint operational_configuration_audit_scope_check
    check (scope = 'global')
);

create unique index operational_configuration_audit_request_key
  on public.operational_configuration_audit(request_id, setting_key);
create index operational_configuration_audit_created_idx
  on public.operational_configuration_audit(created_at desc);

create or replace function public.operational_configuration_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger operational_configuration_receipts_append_only
before update or delete on public.operational_configuration_receipts
for each row execute function public.operational_configuration_append_only_guard();

create trigger operational_configuration_audit_append_only
before update or delete on public.operational_configuration_audit
for each row execute function public.operational_configuration_append_only_guard();

create or replace function public.operational_configuration_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and public.has_capability('configuration.manage')
$$;

create or replace function public.operational_event_capacity_limit()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select configuration.carts_per_day
     from public.event_configuration as configuration
     where configuration.singleton),
    7
  )::integer
$$;

create or replace function public.operational_pos_usd_mxn_rate()
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select configuration.usd_mxn_rate
     from public.pos_configuration as configuration
     where configuration.singleton),
    15
  )::numeric(12,4)
$$;

create or replace function public.operational_pos_wholesale_threshold()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select configuration.wholesale_threshold
     from public.pos_configuration as configuration
     where configuration.singleton),
    10
  )::integer
$$;

-- Keep the Event helper and its public RPC contract stable while making the
-- effective capacity value come from the typed singleton.
create or replace function public.event_capacity_limit()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.operational_event_capacity_limit()
$$;

create or replace function public.get_event_configuration()
returns table(event_carts_per_day integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.event_admin_allowed() then
    raise exception 'access denied';
  end if;
  return query select public.operational_event_capacity_limit();
end
$$;

-- Preserve the legacy Event setter signature and events.manage authorization.
create or replace function public.set_event_capacity(
  p_request_id uuid,
  p_carts_per_day integer
)
returns table(event_carts_per_day integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  current_value integer;
  changed_value integer;
  payload_hash text;
begin
  if not public.event_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if p_carts_per_day is null or p_carts_per_day < 1 or p_carts_per_day > 10000 then
    raise exception 'daily event capacity must be between 1 and 10000';
  end if;

  payload_hash := encode(public.digest(
    convert_to('set-event-capacity|' || p_carts_per_day::text, 'utf8'),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-configuration', 0));
  if public.event_reservation_mutation_replayed(
    p_request_id, 'configuration', null, payload_hash
  ) then
    return query select public.operational_event_capacity_limit();
    return;
  end if;

  select configuration.carts_per_day
    into current_value
  from public.event_configuration as configuration
  where configuration.singleton
  for update;

  insert into public.event_reservation_mutations(
    request_id, operation, reservation_id, payload_hash
  ) values (p_request_id, 'configuration', null, payload_hash);

  update public.event_configuration as configuration
  set carts_per_day = p_carts_per_day,
      owner_id = configuration.owner_id,
      updated_by = actor,
      effective_at = now(),
      updated_at = now()
  where configuration.singleton
  returning configuration.carts_per_day into changed_value;

  if changed_value is null then
    raise exception 'event configuration is unavailable';
  end if;

  perform public.event_append_audit(
    null,
    'capacity.updated',
    'admin',
    actor,
    p_request_id,
    p_request_id,
    jsonb_build_object('before', current_value, 'after', changed_value)
  );
  return query select changed_value;
end
$$;

create function public.get_operational_configuration(
  p_scope text default 'global'
)
returns table(
  key text,
  type text,
  value numeric,
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
  normalized_scope text := lower(btrim(coalesce(p_scope, 'global')));
begin
  if not public.operational_configuration_admin_allowed() then
    raise exception 'access denied';
  end if;
  if normalized_scope <> 'global' then
    raise exception 'operational configuration is global and does not accept branch selectors';
  end if;

  return query
  select
    'event_daily_capacity'::text,
    'integer'::text,
    configuration.carts_per_day::numeric,
    'global'::text,
    configuration.owner_id,
    case when configuration.effective_at is null then 'compatibility-default' else 'configured' end,
    configuration.effective_at,
    null::text
  from public.event_configuration as configuration
  where configuration.singleton
  union all
  select
    'pos_usd_mxn_rate'::text,
    'rate'::text,
    configuration.usd_mxn_rate::numeric,
    'global'::text,
    configuration.owner_id,
    case when configuration.usd_mxn_rate_effective_at is null then 'compatibility-default' else 'configured' end,
    configuration.usd_mxn_rate_effective_at,
    null::text
  from public.pos_configuration as configuration
  where configuration.singleton
  union all
  select
    'pos_wholesale_threshold'::text,
    'integer'::text,
    configuration.wholesale_threshold::numeric,
    'global'::text,
    configuration.owner_id,
    case when configuration.wholesale_threshold_effective_at is null then 'compatibility-default' else 'configured' end,
    configuration.wholesale_threshold_effective_at,
    null::text
  from public.pos_configuration as configuration
  where configuration.singleton
  order by 1;
end
$$;

create function public.set_operational_configuration(
  p_request_id uuid,
  p_key text,
  p_value jsonb,
  p_scope text default 'global'
)
returns table(
  key text,
  type text,
  value numeric,
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
  normalized_key text := lower(btrim(coalesce(p_key, '')));
  normalized_scope text := lower(btrim(coalesce(p_scope, 'global')));
  numeric_value numeric;
  integer_value integer;
  canonical_value text;
  payload_hash text;
  setting_type text;
  before_value numeric;
  after_value numeric;
  owner uuid;
  before_effective_at timestamptz;
  after_effective_at timestamptz;
  receipt public.operational_configuration_receipts%rowtype;
begin
  if not public.operational_configuration_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if normalized_scope <> 'global' then
    raise exception 'operational configuration is global and does not accept branch selectors';
  end if;
  if normalized_key not in (
    'event_daily_capacity', 'pos_usd_mxn_rate', 'pos_wholesale_threshold'
  ) then
    raise exception 'unknown operational configuration setting';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    raise exception 'operational configuration value must be a JSON number';
  end if;

  begin
    numeric_value := (p_value #>> '{}')::numeric;
  exception when others then
    raise exception 'operational configuration value must be finite';
  end;
  if numeric_value::text = 'NaN' then
    raise exception 'operational configuration value must be finite';
  end if;

  if normalized_key in ('event_daily_capacity', 'pos_wholesale_threshold') then
    if numeric_value <> trunc(numeric_value) then
      raise exception 'operational configuration value must be an integer';
    end if;
    if numeric_value < 1 or numeric_value > 10000 then
      raise exception 'integer operational configuration values must be between 1 and 10000';
    end if;
    integer_value := numeric_value::integer;
    canonical_value := integer_value::text;
    setting_type := 'integer';
  else
    if numeric_value < 0.01 or numeric_value > 10000 then
      raise exception 'POS USD/MXN rate must be between 0.01 and 10000';
    end if;
    if numeric_value <> round(numeric_value, 4) then
      raise exception 'POS USD/MXN rate must use at most four decimal places';
    end if;
    canonical_value := to_char(round(numeric_value, 4), 'FM9999999990.0000');
    setting_type := 'rate';
  end if;

  payload_hash := encode(public.digest(convert_to(
    'set-operational-configuration|' || normalized_key || '|global|' || canonical_value,
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'operational-configuration-request:' || p_request_id::text, 0
  ));

  select * into receipt
  from public.operational_configuration_receipts
  where request_id = p_request_id
  for update;
  if found then
    if receipt.actor_id is distinct from actor
      or receipt.setting_key <> normalized_key
      or receipt.scope <> normalized_scope
      or receipt.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query select
      receipt.setting_key,
      receipt.setting_type,
      receipt.result_value,
      receipt.scope,
      receipt.result_owner_id,
      receipt.result_state,
      receipt.result_effective_at,
      'replayed'::text;
    return;
  end if;

  if normalized_key = 'event_daily_capacity' then
    perform pg_advisory_xact_lock(hashtextextended('operational-configuration:event', 0));
    select configuration.carts_per_day, configuration.effective_at, configuration.owner_id
      into before_value, before_effective_at, owner
    from public.event_configuration as configuration
    where configuration.singleton
    for update;
    if owner is null then
      raise exception 'event configuration is unavailable';
    end if;
    after_value := integer_value;
    update public.event_configuration as configuration
    set carts_per_day = integer_value,
        effective_at = now(),
        updated_by = actor,
        updated_at = now()
    where configuration.singleton
    returning configuration.effective_at into after_effective_at;
  elsif normalized_key = 'pos_usd_mxn_rate' then
    perform pg_advisory_xact_lock(hashtextextended('operational-configuration:pos', 0));
    select configuration.usd_mxn_rate, configuration.usd_mxn_rate_effective_at, configuration.owner_id
      into before_value, before_effective_at, owner
    from public.pos_configuration as configuration
    where configuration.singleton
    for update;
    if owner is null then
      raise exception 'POS configuration is unavailable';
    end if;
    after_value := round(numeric_value, 4);
    update public.pos_configuration as configuration
    set usd_mxn_rate = after_value,
        usd_mxn_rate_effective_at = now(),
        updated_by = actor,
        updated_at = now()
    where configuration.singleton
    returning configuration.usd_mxn_rate_effective_at into after_effective_at;
  else
    perform pg_advisory_xact_lock(hashtextextended('operational-configuration:pos', 0));
    select configuration.wholesale_threshold, configuration.wholesale_threshold_effective_at, configuration.owner_id
      into before_value, before_effective_at, owner
    from public.pos_configuration as configuration
    where configuration.singleton
    for update;
    if owner is null then
      raise exception 'POS configuration is unavailable';
    end if;
    after_value := integer_value;
    update public.pos_configuration as configuration
    set wholesale_threshold = integer_value,
        wholesale_threshold_effective_at = now(),
        updated_by = actor,
        updated_at = now()
    where configuration.singleton
    returning configuration.wholesale_threshold_effective_at into after_effective_at;
  end if;

  insert into public.operational_configuration_receipts(
    request_id, actor_id, setting_key, scope, payload_hash, setting_type,
    result_value, result_owner_id, result_state, result_effective_at, result_status
  ) values (
    p_request_id, actor, normalized_key, 'global', payload_hash, setting_type,
    after_value, owner, 'configured', after_effective_at, 'created'
  );

  insert into public.operational_configuration_audit(
    actor_id, setting_key, scope, before_value, after_value,
    before_effective_at, after_effective_at, request_id, payload_hash
  ) values (
    actor, normalized_key, 'global', before_value, after_value,
    before_effective_at, after_effective_at, p_request_id, payload_hash
  );

  return query select
    normalized_key,
    setting_type,
    after_value,
    'global'::text,
    owner,
    'configured'::text,
    after_effective_at,
    'created'::text;
end
$$;

create function public.report_dashboard_snapshot(
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
  normalized_scope text := lower(btrim(coalesce(p_scope, 'all')));
  scope_kind text;
  selected_branch_id uuid;
  selected_branch_name text;
  window_days integer;
begin
  if not public.has_capability('reports.view') then
    raise exception 'access denied';
  end if;
  if p_timezone is distinct from 'America/Mexico_City' then
    raise exception 'reporting timezone must be America/Mexico_City';
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

  utc_from := from_date::timestamp at time zone 'America/Mexico_City';
  utc_to := (to_date + 1)::timestamp at time zone 'America/Mexico_City';

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
        on (recognized.created_at at time zone 'America/Mexico_City')::date = days.report_date::date
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
      'timezone', 'America/Mexico_City',
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

alter table public.event_configuration enable row level security;
alter table public.pos_configuration enable row level security;
alter table public.operational_configuration_receipts enable row level security;
alter table public.operational_configuration_audit enable row level security;

revoke all on public.event_configuration,
  public.pos_configuration,
  public.operational_configuration_receipts,
  public.operational_configuration_audit
from public, anon, authenticated;

revoke all on function public.operational_configuration_append_only_guard(),
  public.operational_configuration_admin_allowed(),
  public.operational_event_capacity_limit(),
  public.operational_pos_usd_mxn_rate(),
  public.operational_pos_wholesale_threshold(),
  public.event_capacity_limit()
from public, anon, authenticated;

revoke all on function public.get_operational_configuration(text),
  public.set_operational_configuration(uuid, text, jsonb, text),
  public.report_dashboard_snapshot(text, text, text, text, uuid)
from public, anon, authenticated;

grant execute on function public.get_operational_configuration(text),
  public.set_operational_configuration(uuid, text, jsonb, text),
  public.report_dashboard_snapshot(text, text, text, text, uuid)
to authenticated;

-- Existing Event clients keep their exact signatures and capability boundary.
revoke all on function public.get_event_configuration(),
  public.set_event_capacity(uuid, integer)
from public, anon, authenticated;
grant execute on function public.get_event_configuration(),
  public.set_event_capacity(uuid, integer)
to authenticated;
