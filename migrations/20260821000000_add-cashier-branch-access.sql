alter table public.sales
  add column branch_id uuid references public.branches(id) on delete restrict;

create index sales_branch_created_at_idx on public.sales(branch_id, created_at);

create table public.employee_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_username_format check (username ~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$'),
  constraint employee_username_length check (length(username) between 3 and 32),
  constraint employee_display_name_not_blank check (length(btrim(display_name)) between 1 and 120)
);

create unique index employee_identities_username_key on public.employee_identities(lower(username));
create index employee_identities_status_idx on public.employee_identities(status);

create table public.employee_branch_assignments (
  user_id uuid primary key references public.employee_identities(user_id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employee_branch_assignments_branch_id_idx on public.employee_branch_assignments(branch_id);

insert into public.roles(key) values ('cashier') on conflict do nothing;
insert into public.capabilities(key) values ('pos.use') on conflict do nothing;
insert into public.role_capabilities(role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'cashier' and c.key = 'pos.use'
on conflict do nothing;

create or replace function public.get_cashier_branch_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select assignment.branch_id
  from public.employee_identities employee
  join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
  join public.branches branch on branch.id = assignment.branch_id
  where employee.user_id = auth.uid()
    and employee.status = 'active'
    and branch.status = 'active'
  limit 1
$$;

create or replace function public.create_employee(
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_branch_id uuid
)
returns table(
  employee_user_id uuid,
  username text,
  display_name text,
  branch_id uuid,
  branch_name text,
  employee_status text,
  branch_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  normalized_username text := lower(btrim(p_username));
  normalized_display_name text := btrim(regexp_replace(p_display_name, '\s+', ' ', 'g'));
  cashier_role uuid;
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'employee auth user not found';
  end if;
  if normalized_username !~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$' then
    raise exception 'invalid employee username';
  end if;
  if length(normalized_username) < 3 or length(normalized_username) > 32 then
    raise exception 'invalid employee username';
  end if;
  if normalized_display_name = '' or length(normalized_display_name) > 120 then
    raise exception 'invalid employee display name';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and status = 'active') then
    raise exception 'branch unavailable';
  end if;
  if exists (
    select 1 from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where user_role.user_id = p_user_id and role.key = 'admin'
  ) then
    raise exception 'administrator cannot be assigned as an employee';
  end if;

  select id into strict cashier_role from public.roles where key = 'cashier';
  insert into public.profiles(user_id, is_active)
  values (p_user_id, true)
  on conflict (user_id) do update set is_active = true;
  insert into public.employee_identities(user_id, username, display_name, status)
  values (p_user_id, normalized_username, normalized_display_name, 'active');
  insert into public.employee_branch_assignments(user_id, branch_id)
  values (p_user_id, p_branch_id);
  insert into public.user_roles(user_id, role_id)
  values (p_user_id, cashier_role)
  on conflict do nothing;

  return query
  select employee.user_id, employee.username, employee.display_name,
    assignment.branch_id, branch.name, employee.status, branch.status
  from public.employee_identities employee
  join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
  join public.branches branch on branch.id = assignment.branch_id
  where employee.user_id = p_user_id;
end;
$$;

create or replace function public.list_employees()
returns table(
  employee_user_id uuid,
  username text,
  display_name text,
  branch_id uuid,
  branch_name text,
  employee_status text,
  branch_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  return query
  select employee.user_id, employee.username, employee.display_name,
    assignment.branch_id, branch.name, employee.status, branch.status
  from public.employee_identities employee
  join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
  join public.branches branch on branch.id = assignment.branch_id
  order by employee.display_name, employee.user_id;
end;
$$;

create or replace function public.set_employee_status(p_user_id uuid, p_status text)
returns table(
  employee_user_id uuid,
  username text,
  display_name text,
  branch_id uuid,
  branch_name text,
  employee_status text,
  branch_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  wanted_status text := lower(btrim(p_status));
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  if wanted_status not in ('active', 'suspended') then
    raise exception 'invalid employee status';
  end if;
  update public.employee_identities
  set status = wanted_status, updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'employee not found';
  end if;
  update public.profiles
  set is_active = wanted_status = 'active'
  where user_id = p_user_id;

  return query
  select employee.user_id, employee.username, employee.display_name,
    assignment.branch_id, branch.name, employee.status, branch.status
  from public.employee_identities employee
  join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
  join public.branches branch on branch.id = assignment.branch_id
  where employee.user_id = p_user_id;
end;
$$;

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
      array['branches.manage', 'catalog.manage', 'sales.record', 'reports.view']::text[],
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

alter table public.employee_identities enable row level security;
alter table public.employee_branch_assignments enable row level security;

create policy products_pos_active_select on public.products
for select to authenticated
using (public.has_capability('pos.use') and active);

create policy product_categories_pos_select on public.product_categories
for select to authenticated
using (public.has_capability('pos.use'));

revoke all on public.employee_identities, public.employee_branch_assignments from anon, authenticated;
revoke execute on function public.get_cashier_branch_id(), public.create_employee(uuid, text, text, uuid),
  public.list_employees(), public.set_employee_status(uuid, text), public.get_access_context()
from public, anon, authenticated;
grant execute on function public.create_employee(uuid, text, text, uuid), public.list_employees(),
  public.set_employee_status(uuid, text), public.get_access_context()
to authenticated;

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
  result_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_channel text := lower(btrim(p_channel));
  actor_branch_id uuid;
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
  if public.has_capability('sales.record') then
    actor_branch_id := null;
  elsif public.has_capability('pos.use') then
    if wanted_channel <> 'pos' then
      raise exception 'cashiers can only record POS sales';
    end if;
    actor_branch_id := public.get_cashier_branch_id();
    if actor_branch_id is null then
      raise exception 'cashier branch is unavailable';
    end if;
  else
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
    event_name := btrim(p_details->>'event_name');
    event_date_text := btrim(p_details->>'event_date');
    responsible_name := btrim(p_details->>'responsible_name');
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
    normalized_details := jsonb_build_object(
      'event_name', event_name,
      'event_date', event_date_text,
      'responsible_name', responsible_name
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
      if advance_amount > 0 then
        if p_details->'advance_payment_method' is null
          or jsonb_typeof(p_details->'advance_payment_method') <> 'string'
          or btrim(p_details->>'advance_payment_method') = '' then
          raise exception 'advance payment method is required when an advance is recorded';
        end if;
        wanted_advance_payment := lower(btrim(p_details->>'advance_payment_method'));
        if wanted_advance_payment not in ('cash', 'card') then
          raise exception 'invalid advance payment method';
        end if;
        normalized_details := normalized_details || jsonb_build_object('advance_payment_method', wanted_advance_payment);
      end if;
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

  insert into public.sales(created_by, request_id, channel, branch_id, total_mxn, payload_hash, business_context)
  values (actor, p_request_id, wanted_channel, actor_branch_id, sale_total, payload_hash, normalized_details)
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
