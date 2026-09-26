-- Native wholesale foundation. Sensitive credentials are returned only by the
-- create/regenerate commands and are never included in persistent snapshots.

create table public.wholesale_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mobile text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  pin_hash text not null,
  failed_login_attempts integer not null default 0 check (failed_login_attempts >= 0),
  last_failed_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wholesale_customers_name_not_blank check (length(btrim(name)) between 1 and 160),
  constraint wholesale_customers_mobile_format check (mobile ~ '^\+52[2-9][0-9]{9}$'),
  constraint wholesale_customers_email_format check (
    email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create unique index wholesale_customers_mobile_key on public.wholesale_customers(mobile);
create index wholesale_customers_status_name_idx on public.wholesale_customers(status, name);

create table public.wholesale_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.wholesale_customers(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index wholesale_customer_sessions_token_key on public.wholesale_customer_sessions(token_hash);
create index wholesale_customer_sessions_customer_idx on public.wholesale_customer_sessions(customer_id, expires_at);

create table public.wholesale_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  customer_id uuid not null references public.wholesale_customers(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  source text not null check (source in ('customer', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  transfer_ticket_url text,
  transfer_ticket_key text,
  total_mxn numeric(14,2) not null check (total_mxn >= 0),
  payload_hash text not null,
  sale_id uuid references public.sales(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  deletion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wholesale_orders_source_actor_check check (
    (source = 'customer' and created_by is null) or
    (source = 'admin' and created_by is not null)
  ),
  constraint wholesale_orders_ticket_pair_check check (
    (transfer_ticket_url is null) = (transfer_ticket_key is null)
  ),
  constraint wholesale_orders_ticket_payment_check check (
    payment_method = 'transfer' or (transfer_ticket_url is null and transfer_ticket_key is null)
  ),
  constraint wholesale_orders_ticket_url_length check (
    transfer_ticket_url is null or length(transfer_ticket_url) between 1 and 2048
  ),
  constraint wholesale_orders_ticket_key_length check (
    transfer_ticket_key is null or length(transfer_ticket_key) between 1 and 512
  ),
  constraint wholesale_orders_deletion_reason_check check (
    deleted_at is null or length(btrim(coalesce(deletion_reason, ''))) between 1 and 500
  )
);

create index wholesale_orders_customer_created_idx on public.wholesale_orders(customer_id, created_at desc);
create index wholesale_orders_status_created_idx on public.wholesale_orders(status, created_at desc)
  where deleted_at is null;
create index wholesale_orders_active_created_idx on public.wholesale_orders(created_at desc)
  where deleted_at is null;
create index wholesale_orders_sale_id_idx on public.wholesale_orders(sale_id);
create unique index wholesale_orders_sale_key on public.wholesale_orders(sale_id)
  where sale_id is not null;

create table public.wholesale_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.wholesale_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price_mxn numeric(12,2) not null check (unit_price_mxn >= 0),
  quantity integer not null check (quantity > 0),
  line_total_mxn numeric(14,2) not null check (line_total_mxn = round(unit_price_mxn * quantity, 2)),
  constraint wholesale_order_items_product_name_not_blank check (length(btrim(product_name)) > 0),
  constraint wholesale_order_items_product_once unique (order_id, product_id)
);

create index wholesale_order_items_order_idx on public.wholesale_order_items(order_id, id);
create index wholesale_order_items_product_idx on public.wholesale_order_items(product_id);

create table public.wholesale_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('admin', 'customer', 'anonymous', 'system')),
  actor_id uuid,
  customer_id uuid,
  action text not null,
  reason text,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  request_id uuid not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wholesale_audit_action_not_blank check (length(btrim(action)) between 1 and 120),
  constraint wholesale_audit_reason_length check (reason is null or length(reason) <= 500),
  constraint wholesale_audit_before_object check (jsonb_typeof(before_snapshot) = 'object'),
  constraint wholesale_audit_after_object check (jsonb_typeof(after_snapshot) = 'object'),
  constraint wholesale_audit_before_no_credentials check (
    before_snapshot::text !~* '"(pin|pin_hash|generated_pin|session_token)"[[:space:]]*:'
  ),
  constraint wholesale_audit_after_no_credentials check (
    after_snapshot::text !~* '"(pin|pin_hash|generated_pin|session_token)"[[:space:]]*:'
  )
);

create index wholesale_audit_events_created_idx on public.wholesale_audit_events(created_at desc);
create index wholesale_audit_events_customer_idx on public.wholesale_audit_events(customer_id, created_at desc);
create index wholesale_audit_events_request_idx on public.wholesale_audit_events(request_id);

insert into public.capabilities(key) values ('wholesale.manage') on conflict do nothing;
insert into public.role_capabilities(role_id, capability_id)
select roles.id, capabilities.id
from public.roles
cross join public.capabilities
where roles.key = 'admin' and capabilities.key = 'wholesale.manage'
on conflict do nothing;

create or replace function public.normalize_wholesale_mobile(p_mobile text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  digits text;
begin
  if p_mobile is null or btrim(p_mobile) = '' or p_mobile !~ '^[+0-9() .-]+$' then
    raise exception 'invalid Mexico mobile number';
  end if;

  digits := regexp_replace(p_mobile, '[^0-9]', '', 'g');
  if digits ~ '^521[2-9][0-9]{9}$' then
    digits := substr(digits, 4);
  elsif digits ~ '^52[2-9][0-9]{9}$' then
    digits := substr(digits, 3);
  elsif digits !~ '^[2-9][0-9]{9}$' then
    raise exception 'invalid Mexico mobile number';
  end if;

  return '+52' || digits;
end;
$$;

create or replace function public.make_wholesale_pin()
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  random_bytes bytea;
  random_number integer;
begin
  random_bytes := public.gen_random_bytes(2);
  random_number := get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1);
  return lpad((random_number % 10000)::text, 4, '0');
end;
$$;

create or replace function public.normalize_wholesale_payment(
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  wanted_method text := lower(btrim(coalesce(p_payment_method, '')));
  ticket_url text := nullif(btrim(coalesce(p_transfer_ticket_url, '')), '');
  ticket_key text := nullif(btrim(coalesce(p_transfer_ticket_key, '')), '');
begin
  if wanted_method not in ('cash', 'transfer') then
    raise exception 'invalid wholesale payment method';
  end if;
  if (ticket_url is null) <> (ticket_key is null) then
    raise exception 'transfer ticket URL and key must be provided together';
  end if;
  if wanted_method = 'cash' and (ticket_url is not null or ticket_key is not null) then
    raise exception 'transfer ticket is only available for transfer payments';
  end if;
  if ticket_url is not null and length(ticket_url) > 2048 then
    raise exception 'transfer ticket URL is too long';
  end if;
  if ticket_key is not null and length(ticket_key) > 512 then
    raise exception 'transfer ticket key is too long';
  end if;

  return jsonb_build_object(
    'payment_method', wanted_method,
    'transfer_ticket_url', ticket_url,
    'transfer_ticket_key', ticket_key
  );
end;
$$;

create or replace function public.wholesale_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and public.has_capability('wholesale.manage')
$$;

create or replace function public.wholesale_audit_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wholesale audit events are append-only';
end;
$$;

create trigger wholesale_audit_events_append_only
before update or delete on public.wholesale_audit_events
for each row execute function public.wholesale_audit_append_only_guard();

create or replace function public.append_wholesale_audit_event(
  p_actor_kind text,
  p_actor_id uuid,
  p_customer_id uuid,
  p_action text,
  p_reason text,
  p_before_snapshot jsonb,
  p_after_snapshot jsonb,
  p_request_id uuid,
  p_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.wholesale_audit_events(
    actor_kind, actor_id, customer_id, action, reason,
    before_snapshot, after_snapshot, request_id, correlation_id
  )
  values (
    p_actor_kind, p_actor_id, p_customer_id, p_action, p_reason,
    coalesce(p_before_snapshot, '{}'::jsonb), coalesce(p_after_snapshot, '{}'::jsonb),
    p_request_id, p_correlation_id
  );
end;
$$;

create or replace function public.wholesale_customer_session_id(p_session_token text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select session.customer_id
  from public.wholesale_customer_sessions as session
  join public.wholesale_customers as customer on customer.id = session.customer_id
  where p_session_token is not null
    and btrim(p_session_token) <> ''
    and session.token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex')
    and session.revoked_at is null
    and session.expires_at > now()
    and customer.status = 'active'
  limit 1
$$;

create or replace function public.wholesale_customer_snapshot(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', customer.id,
        'name', customer.name,
        'mobile', customer.mobile,
        'email', customer.email,
        'status', customer.status,
        'created_at', customer.created_at,
        'updated_at', customer.updated_at
      )
      from public.wholesale_customers as customer
      where customer.id = p_customer_id
    ),
    '{}'::jsonb
  )
$$;

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
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'product_id', item.product_id,
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

create or replace function public.prepare_wholesale_order_items(p_items jsonb)
returns table(normalized_items jsonb, total_mxn numeric)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  item jsonb;
  product public.products%rowtype;
  product_id uuid;
  quantity integer;
  unit_price numeric;
  line_total numeric;
  calculated_total numeric := 0;
  prepared_items jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one wholesale order item is required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as elements(value)
    group by value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'duplicate wholesale order product';
  end if;

  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'wholesale order items must be objects';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(item) as keys(key)
      where keys.key not in ('product_id', 'quantity')
    ) then
      raise exception 'wholesale order item contains unknown fields';
    end if;
    if coalesce(jsonb_typeof(item->'product_id'), '') <> 'string'
      or btrim(coalesce(item->>'product_id', '')) = ''
      or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'wholesale order items require a product ID and positive integer quantity';
    end if;

    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::integer;
    select catalog_product.* into product
    from public.products as catalog_product
    where catalog_product.id = product_id and catalog_product.active
    for share;
    if not found then
      raise exception 'product not found or inactive';
    end if;

    unit_price := product.wholesale_price_mxn;
    line_total := round(unit_price * quantity, 2);
    calculated_total := calculated_total + line_total;
    prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
      'product_id', product.id,
      'product_name', product.name,
      'unit_price_mxn', unit_price,
      'quantity', quantity,
      'line_total_mxn', line_total
    ));
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
      order_id, product_id, product_name, unit_price_mxn, quantity, line_total_mxn
    ) values (
      p_order_id,
      (item->>'product_id')::uuid,
      item->>'product_name',
      (item->>'unit_price_mxn')::numeric,
      (item->>'quantity')::integer,
      (item->>'line_total_mxn')::numeric
    );
  end loop;
end;
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'product_id', item.product_id,
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

create or replace function public.create_wholesale_customer(
  p_request_id uuid,
  p_name text,
  p_mobile text,
  p_email text
)
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  generated_pin text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  normalized_mobile text;
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  generated_pin text := public.make_wholesale_pin();
  made public.wholesale_customers%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'customer name is invalid';
  end if;
  normalized_mobile := public.normalize_wholesale_mobile(p_mobile);
  if normalized_email is not null and (
    length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'customer email is invalid';
  end if;

  insert into public.wholesale_customers(name, mobile, email, pin_hash)
  values (normalized_name, normalized_mobile, normalized_email, public.crypt(generated_pin, public.gen_salt('bf')))
  returning * into made;

  perform public.append_wholesale_audit_event(
    'admin', actor, made.id, 'customer.created', null, '{}'::jsonb,
    public.wholesale_customer_snapshot(made.id), p_request_id, p_request_id
  );

  return query select made.id, made.name, made.mobile, made.email, made.status,
    made.created_at, made.updated_at, generated_pin;
end;
$$;

create or replace function public.list_wholesale_customers()
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  failed_login_attempts integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  return query
  select customer.id, customer.name, customer.mobile, customer.email, customer.status,
    customer.failed_login_attempts, customer.created_at, customer.updated_at
  from public.wholesale_customers as customer
  order by customer.name, customer.id;
end;
$$;

create or replace function public.update_wholesale_customer(
  p_request_id uuid,
  p_customer_id uuid,
  p_name text,
  p_mobile text,
  p_email text
)
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  before_snapshot jsonb;
  normalized_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  normalized_mobile text;
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  changed public.wholesale_customers%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_customer_id is null then
    raise exception 'customer update identifiers are required';
  end if;
  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'customer name is invalid';
  end if;
  normalized_mobile := public.normalize_wholesale_mobile(p_mobile);
  if normalized_email is not null and (
    length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'customer email is invalid';
  end if;

  before_snapshot := public.wholesale_customer_snapshot(p_customer_id);
  update public.wholesale_customers
  set name = normalized_name,
      mobile = normalized_mobile,
      email = normalized_email,
      updated_at = now()
  where id = p_customer_id
  returning * into changed;
  if not found then
    raise exception 'customer not found';
  end if;
  if before_snapshot->>'mobile' is distinct from changed.mobile then
    update public.wholesale_customer_sessions
    set revoked_at = now()
    where customer_id = changed.id and revoked_at is null;
  end if;

  perform public.append_wholesale_audit_event(
    'admin', actor, changed.id, 'customer.updated', null, before_snapshot,
    public.wholesale_customer_snapshot(changed.id), p_request_id, p_request_id
  );

  return query select changed.id, changed.name, changed.mobile, changed.email,
    changed.status, changed.created_at, changed.updated_at;
end;
$$;

create or replace function public.set_wholesale_customer_status(
  p_request_id uuid,
  p_customer_id uuid,
  p_status text,
  p_reason text
)
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_status text := lower(btrim(coalesce(p_status, '')));
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  changed public.wholesale_customers%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_customer_id is null then
    raise exception 'customer status identifiers are required';
  end if;
  if wanted_status not in ('active', 'inactive') then
    raise exception 'invalid customer status';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;

  select public.wholesale_customer_snapshot(p_customer_id) into before_snapshot;
  update public.wholesale_customers
  set status = wanted_status, updated_at = now()
  where id = p_customer_id
  returning * into changed;
  if not found then
    raise exception 'customer not found';
  end if;
  if changed.status = 'inactive' then
    update public.wholesale_customer_sessions
    set revoked_at = now()
    where customer_id = changed.id and revoked_at is null;
  end if;

  perform public.append_wholesale_audit_event(
    'admin', actor, changed.id, 'customer.status_changed', normalized_reason,
    before_snapshot, public.wholesale_customer_snapshot(changed.id), p_request_id, p_request_id
  );

  return query select changed.id, changed.name, changed.mobile, changed.email,
    changed.status, changed.created_at, changed.updated_at;
end;
$$;

create or replace function public.regenerate_wholesale_customer_pin(
  p_request_id uuid,
  p_customer_id uuid,
  p_reason text
)
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  generated_pin text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  generated_pin text := public.make_wholesale_pin();
  changed public.wholesale_customers%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_customer_id is null then
    raise exception 'PIN regeneration identifiers are required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;

  before_snapshot := public.wholesale_customer_snapshot(p_customer_id);
  update public.wholesale_customers
  set pin_hash = public.crypt(generated_pin, public.gen_salt('bf')),
      failed_login_attempts = 0,
      last_failed_login_at = null,
      updated_at = now()
  where id = p_customer_id
  returning * into changed;
  if not found then
    raise exception 'customer not found';
  end if;

  perform public.append_wholesale_audit_event(
    'admin', actor, changed.id, 'customer.pin_regenerated', normalized_reason,
    before_snapshot, public.wholesale_customer_snapshot(changed.id), p_request_id, p_request_id
  );

  return query select changed.id, changed.name, changed.mobile, changed.email,
    changed.status, changed.created_at, changed.updated_at, generated_pin;
end;
$$;

create or replace function public.delete_wholesale_customer(
  p_request_id uuid,
  p_customer_id uuid,
  p_reason text
)
returns table(customer_id uuid, status text, deleted boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  order_count integer;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_customer_id is null then
    raise exception 'customer deletion identifiers are required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;

  before_snapshot := public.wholesale_customer_snapshot(p_customer_id);
  if before_snapshot = '{}'::jsonb then
    raise exception 'customer not found';
  end if;
  select count(*)::integer into order_count
  from public.wholesale_orders
  where customer_id = p_customer_id;

  if order_count > 0 then
    update public.wholesale_customers
    set status = 'inactive', updated_at = now()
    where id = p_customer_id;
    update public.wholesale_customer_sessions
    set revoked_at = now()
    where customer_id = p_customer_id and revoked_at is null;
    perform public.append_wholesale_audit_event(
      'admin', actor, p_customer_id, 'customer.deactivated', normalized_reason,
      before_snapshot, public.wholesale_customer_snapshot(p_customer_id), p_request_id, p_request_id
    );
    return query select p_customer_id, 'inactive'::text, false;
    return;
  end if;

  perform public.append_wholesale_audit_event(
    'admin', actor, p_customer_id, 'customer.deleted', normalized_reason,
    before_snapshot, '{}'::jsonb, p_request_id, p_request_id
  );
  delete from public.wholesale_customers where id = p_customer_id;
  return query select p_customer_id, 'deleted'::text, true;
end;
$$;

create or replace function public.wholesale_customer_login(
  p_mobile text,
  p_pin text,
  p_request_id uuid
)
returns table(
  authenticated boolean,
  session_token text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  failed_login_attempts integer,
  contact_admin boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  normalized_mobile text;
  customer public.wholesale_customers%rowtype;
  attempts integer;
  token text;
  session_expiry timestamptz := now() + interval '30 days';
begin
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  begin
    normalized_mobile := public.normalize_wholesale_mobile(p_mobile);
  exception when others then
    perform public.append_wholesale_audit_event(
      'anonymous', null, null, 'customer.login_failed', null, '{}'::jsonb,
      jsonb_build_object('authenticated', false), p_request_id, p_request_id
    );
    return query select false, null::text, null::uuid, null::text, null::text, 0, false, null::timestamptz;
    return;
  end;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    perform public.append_wholesale_audit_event(
      'anonymous', null, null, 'customer.login_failed', null, '{}'::jsonb,
      jsonb_build_object('authenticated', false), p_request_id, p_request_id
    );
    return query select false, null::text, null::uuid, null::text, null::text, 0, false, null::timestamptz;
    return;
  end if;

  select * into customer
  from public.wholesale_customers
  where mobile = normalized_mobile
  for update;
  if not found or customer.status <> 'active' or public.crypt(p_pin, customer.pin_hash) <> customer.pin_hash then
    if found then
      attempts := customer.failed_login_attempts + 1;
      update public.wholesale_customers
      set failed_login_attempts = attempts, last_failed_login_at = now(), updated_at = now()
      where id = customer.id;
      perform public.append_wholesale_audit_event(
        'anonymous', null, customer.id, 'customer.login_failed', null,
        jsonb_build_object('failed_login_attempts', customer.failed_login_attempts),
        jsonb_build_object('failed_login_attempts', attempts, 'contact_admin', attempts >= 3),
        p_request_id, p_request_id
      );
      return query select false, null::text, null::uuid, null::text, null::text,
        attempts, attempts >= 3, null::timestamptz;
    end if;
    perform public.append_wholesale_audit_event(
      'anonymous', null, null, 'customer.login_failed', null, '{}'::jsonb,
      jsonb_build_object('authenticated', false), p_request_id, p_request_id
    );
    return query select false, null::text, null::uuid, null::text, null::text, 0, false, null::timestamptz;
    return;
  end if;

  token := encode(public.gen_random_bytes(32), 'hex');
  update public.wholesale_customers
  set failed_login_attempts = 0, last_failed_login_at = null, updated_at = now()
  where id = customer.id;
  insert into public.wholesale_customer_sessions(customer_id, token_hash, expires_at)
  values (customer.id, encode(public.digest(convert_to(token, 'utf8'), 'sha256'), 'hex'), session_expiry);
  perform public.append_wholesale_audit_event(
    'customer', customer.id, customer.id, 'customer.login_succeeded', null,
    jsonb_build_object('failed_login_attempts', customer.failed_login_attempts),
    jsonb_build_object('authenticated', true), p_request_id, p_request_id
  );
  return query select true, token, customer.id, customer.name, customer.email, 0, false, session_expiry;
end;
$$;

create or replace function public.revoke_wholesale_customer_session(
  p_session_token text,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
begin
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  if session_customer_id is null then
    return false;
  end if;
  update public.wholesale_customer_sessions
  set revoked_at = now()
  where customer_id = session_customer_id
    and token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex')
    and revoked_at is null;
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'customer.session_revoked', null,
    jsonb_build_object('active', true), jsonb_build_object('active', false),
    p_request_id, p_request_id
  );
  return true;
end;
$$;

create or replace function public.create_wholesale_customer_order(
  p_session_token text,
  p_request_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text
)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
  prepared jsonb;
  total numeric;
  payment jsonb;
  payload_hash text;
  made public.wholesale_orders%rowtype;
  existing public.wholesale_orders%rowtype;
begin
  if session_customer_id is null then
    raise exception 'customer session is invalid or expired';
  end if;
  if p_request_id is null then
    raise exception 'request ID is required';
  end if;
  select normalized_items, total_mxn into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'create_wholesale_customer_order|' || session_customer_id::text || '|' || prepared::text || '|' || payment::text,
    'utf8'
  ), 'sha256'), 'hex');

  select * into existing from public.wholesale_orders where request_id = p_request_id for update;
  if found then
    if existing.customer_id <> session_customer_id or existing.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    update public.wholesale_customer_sessions
    set last_seen_at = now()
    where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
    return query select * from public.wholesale_order_projection(existing.id);
    return;
  end if;

  insert into public.wholesale_orders(
    request_id, customer_id, source, status, payment_method,
    transfer_ticket_url, transfer_ticket_key, total_mxn, payload_hash
  ) values (
    p_request_id, session_customer_id, 'customer', 'pending', payment->>'payment_method',
    payment->>'transfer_ticket_url', payment->>'transfer_ticket_key', total, payload_hash
  ) returning * into made;
  perform public.insert_wholesale_order_items(made.id, prepared);
  update public.wholesale_customer_sessions
  set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.created', null, '{}'::jsonb,
    public.wholesale_order_snapshot(made.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(made.id);
end;
$$;

create or replace function public.list_wholesale_customer_orders(p_session_token text)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
begin
  if session_customer_id is null then
    raise exception 'customer session is invalid or expired';
  end if;
  update public.wholesale_customer_sessions
  set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  return query
  select projection.*
  from public.wholesale_orders as order_row
  cross join lateral public.wholesale_order_projection(order_row.id) as projection
  where order_row.customer_id = session_customer_id
    and order_row.deleted_at is null
  order by projection.created_at desc, projection.order_id desc;
end;
$$;

create or replace function public.cancel_wholesale_customer_order(
  p_session_token text,
  p_request_id uuid,
  p_order_id uuid,
  p_reason text
)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  changed public.wholesale_orders%rowtype;
begin
  if session_customer_id is null then
    raise exception 'customer session is invalid or expired';
  end if;
  if p_request_id is null or p_order_id is null then
    raise exception 'order cancellation identifiers are required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;

  select * into changed
  from public.wholesale_orders
  where id = p_order_id and customer_id = session_customer_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;
  if changed.deleted_at is not null or changed.status <> 'pending' then
    raise exception 'only pending orders can be cancelled';
  end if;
  before_snapshot := public.wholesale_order_snapshot(changed.id);
  update public.wholesale_orders
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = changed.id and status = 'pending' and deleted_at is null
  returning * into changed;
  if not found then
    raise exception 'order is no longer pending';
  end if;
  update public.wholesale_customer_sessions
  set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.cancelled', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(changed.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(changed.id);
end;
$$;

create or replace function public.complete_wholesale_order_sale(
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  order_row public.wholesale_orders%rowtype;
  customer public.wholesale_customers%rowtype;
  sale_items jsonb;
  made_sale_id uuid;
begin
  select * into order_row from public.wholesale_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if order_row.sale_id is not null then
    return order_row.sale_id;
  end if;
  select * into customer from public.wholesale_customers where id = order_row.customer_id;
  if not found then
    raise exception 'customer not found';
  end if;
  select coalesce(
    jsonb_agg(jsonb_build_object('product_id', item.product_id, 'quantity', item.quantity) order by item.id),
    '[]'::jsonb
  ) into sale_items
  from public.wholesale_order_items as item
  where item.order_id = p_order_id;

  select result.sale_id into made_sale_id
  from public.record_sale(
    order_row.request_id,
    'wholesale',
    sale_items,
    jsonb_build_object(
      'customer_name', customer.name,
      'phone', customer.mobile,
      'delivery_method', 'pickup',
      'payment_method', order_row.payment_method
    )
  ) as result;
  if made_sale_id is null then
    raise exception 'wholesale sale was not created';
  end if;
  update public.wholesale_orders
  set sale_id = made_sale_id, updated_at = now()
  where id = p_order_id and sale_id is null;
  return made_sale_id;
end;
$$;

create or replace function public.create_wholesale_admin_order(
  p_request_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text,
  p_initial_status text
)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_status text := lower(btrim(coalesce(p_initial_status, 'pending')));
  prepared jsonb;
  total numeric;
  payment jsonb;
  payload_hash text;
  customer public.wholesale_customers%rowtype;
  made public.wholesale_orders%rowtype;
  made_sale_id uuid;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_customer_id is null then
    raise exception 'manual order identifiers are required';
  end if;
  if wanted_status not in ('pending', 'processing', 'completed') then
    raise exception 'invalid initial wholesale order status';
  end if;
  select * into customer from public.wholesale_customers
  where id = p_customer_id and status = 'active';
  if not found then
    raise exception 'active customer not found';
  end if;
  select normalized_items, total_mxn into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'create_wholesale_admin_order|' || actor::text || '|' || p_customer_id::text || '|' ||
    wanted_status || '|' || prepared::text || '|' || payment::text,
    'utf8'
  ), 'sha256'), 'hex');

  insert into public.wholesale_orders(
    request_id, customer_id, created_by, source, status, payment_method,
    transfer_ticket_url, transfer_ticket_key, total_mxn, payload_hash, completed_at
  ) values (
    p_request_id, p_customer_id, actor, 'admin', wanted_status, payment->>'payment_method',
    payment->>'transfer_ticket_url', payment->>'transfer_ticket_key', total, payload_hash,
    case when wanted_status = 'completed' then now() end
  ) returning * into made;
  perform public.insert_wholesale_order_items(made.id, prepared);
  if wanted_status = 'completed' then
    made_sale_id := public.complete_wholesale_order_sale(made.id);
  end if;
  perform public.append_wholesale_audit_event(
    'admin', actor, p_customer_id, 'order.created', null, '{}'::jsonb,
    public.wholesale_order_snapshot(made.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(made.id);
end;
$$;

create or replace function public.list_wholesale_orders(p_include_deleted boolean default false)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  return query
  select projection.*
  from public.wholesale_orders as order_row
  cross join lateral public.wholesale_order_projection(order_row.id) as projection
  where p_include_deleted or order_row.deleted_at is null
  order by projection.created_at desc, projection.order_id desc;
end;
$$;

create or replace function public.set_wholesale_order_status(
  p_request_id uuid,
  p_order_id uuid,
  p_status text,
  p_reason text
)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_status text := lower(btrim(coalesce(p_status, '')));
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  changed public.wholesale_orders%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_order_id is null then
    raise exception 'order status identifiers are required';
  end if;
  if wanted_status not in ('pending', 'processing', 'completed', 'cancelled') then
    raise exception 'invalid wholesale order status';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;

  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then
    raise exception 'active order not found';
  end if;
  if changed.status = 'completed' and wanted_status <> 'completed' then
    raise exception 'completed order reversal is not available in this foundation';
  end if;
  if changed.status = wanted_status then
    if wanted_status = 'completed' and changed.sale_id is null then
      perform public.complete_wholesale_order_sale(changed.id);
    end if;
    return query select * from public.wholesale_order_projection(changed.id);
    return;
  end if;

  before_snapshot := public.wholesale_order_snapshot(changed.id);
  update public.wholesale_orders
  set status = wanted_status,
      completed_at = case when wanted_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      cancelled_at = case when wanted_status = 'cancelled' then now() else null end,
      updated_at = now()
  where id = changed.id;
  if wanted_status = 'completed' then
    perform public.complete_wholesale_order_sale(changed.id);
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.status_changed', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(changed.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(changed.id);
end;
$$;

create or replace function public.update_wholesale_admin_order(
  p_request_id uuid,
  p_order_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text,
  p_reason text
)
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
  items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  prepared jsonb;
  total numeric;
  payment jsonb;
  changed public.wholesale_orders%rowtype;
  customer public.wholesale_customers%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_order_id is null or p_customer_id is null then
    raise exception 'order update identifiers are required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then
    raise exception 'active order not found';
  end if;
  if changed.status = 'completed' then
    raise exception 'completed order editing is not available in this foundation';
  end if;
  select * into customer from public.wholesale_customers where id = p_customer_id and status = 'active';
  if not found then
    raise exception 'active customer not found';
  end if;
  select normalized_items, total_mxn into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  before_snapshot := public.wholesale_order_snapshot(changed.id);

  update public.wholesale_orders
  set customer_id = p_customer_id,
      payment_method = payment->>'payment_method',
      transfer_ticket_url = payment->>'transfer_ticket_url',
      transfer_ticket_key = payment->>'transfer_ticket_key',
      total_mxn = total,
      payload_hash = encode(public.digest(convert_to(
        'update_wholesale_admin_order|' || p_customer_id::text || '|' || prepared::text || '|' || payment::text,
        'utf8'
      ), 'sha256'), 'hex'),
      updated_at = now()
  where id = changed.id
  returning * into changed;
  delete from public.wholesale_order_items where order_id = changed.id;
  perform public.insert_wholesale_order_items(changed.id, prepared);
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.updated', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(changed.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(changed.id);
end;
$$;

create or replace function public.delete_wholesale_order(
  p_request_id uuid,
  p_order_id uuid,
  p_reason text
)
returns table(
  order_id uuid,
  customer_id uuid,
  status text,
  deleted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  before_snapshot jsonb;
  changed public.wholesale_orders%rowtype;
begin
  if not public.wholesale_admin_allowed() then
    raise exception 'access denied';
  end if;
  if p_request_id is null or p_order_id is null then
    raise exception 'order deletion identifiers are required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'a reason is required';
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if changed.deleted_at is not null then
    return query select changed.id, changed.customer_id, changed.status, false;
    return;
  end if;
  if changed.status = 'completed' then
    raise exception 'completed order deletion requires the reversal foundation';
  end if;
  before_snapshot := public.wholesale_order_snapshot(changed.id);
  update public.wholesale_orders
  set deleted_at = now(), deleted_by = actor, deletion_reason = normalized_reason, updated_at = now()
  where id = changed.id and deleted_at is null
  returning * into changed;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.deleted', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(changed.id), p_request_id, p_request_id
  );
  return query select changed.id, changed.customer_id, changed.status, true;
end;
$$;

create or replace function public.wholesale_order_no_physical_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wholesale orders are logically deleted';
end;
$$;

create trigger wholesale_orders_no_physical_delete
before delete on public.wholesale_orders
for each row execute function public.wholesale_order_no_physical_delete();

alter table public.wholesale_customers enable row level security;
alter table public.wholesale_customer_sessions enable row level security;
alter table public.wholesale_orders enable row level security;
alter table public.wholesale_order_items enable row level security;
alter table public.wholesale_audit_events enable row level security;

revoke all on public.wholesale_customers, public.wholesale_customer_sessions,
  public.wholesale_orders, public.wholesale_order_items, public.wholesale_audit_events
from public, anon, authenticated;

revoke all on function public.normalize_wholesale_mobile(text),
  public.make_wholesale_pin(),
  public.normalize_wholesale_payment(text, text, text),
  public.wholesale_admin_allowed(),
  public.append_wholesale_audit_event(text, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid),
  public.wholesale_customer_session_id(text),
  public.wholesale_customer_snapshot(uuid),
  public.wholesale_order_snapshot(uuid),
  public.prepare_wholesale_order_items(jsonb),
  public.insert_wholesale_order_items(uuid, jsonb),
  public.wholesale_order_projection(uuid),
  public.complete_wholesale_order_sale(uuid),
  public.wholesale_audit_append_only_guard(),
  public.wholesale_order_no_physical_delete()
from public, anon, authenticated;

revoke all on function public.create_wholesale_customer(uuid, text, text, text),
  public.list_wholesale_customers(),
  public.update_wholesale_customer(uuid, uuid, text, text, text),
  public.set_wholesale_customer_status(uuid, uuid, text, text),
  public.regenerate_wholesale_customer_pin(uuid, uuid, text),
  public.delete_wholesale_customer(uuid, uuid, text),
  public.wholesale_customer_login(text, text, uuid),
  public.revoke_wholesale_customer_session(text, uuid),
  public.create_wholesale_customer_order(text, uuid, jsonb, text, text, text),
  public.list_wholesale_customer_orders(text),
  public.cancel_wholesale_customer_order(text, uuid, uuid, text),
  public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text),
  public.list_wholesale_orders(boolean),
  public.set_wholesale_order_status(uuid, uuid, text, text),
  public.update_wholesale_admin_order(uuid, uuid, uuid, jsonb, text, text, text, text),
  public.delete_wholesale_order(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.wholesale_customer_login(text, text, uuid),
  public.revoke_wholesale_customer_session(text, uuid),
  public.create_wholesale_customer_order(text, uuid, jsonb, text, text, text),
  public.list_wholesale_customer_orders(text),
  public.cancel_wholesale_customer_order(text, uuid, uuid, text)
to anon, authenticated;

grant execute on function public.create_wholesale_customer(uuid, text, text, text),
  public.list_wholesale_customers(),
  public.update_wholesale_customer(uuid, uuid, text, text, text),
  public.set_wholesale_customer_status(uuid, uuid, text, text),
  public.regenerate_wholesale_customer_pin(uuid, uuid, text),
  public.delete_wholesale_customer(uuid, uuid, text),
  public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text),
  public.list_wholesale_orders(boolean),
  public.set_wholesale_order_status(uuid, uuid, text, text),
  public.update_wholesale_admin_order(uuid, uuid, uuid, jsonb, text, text, text, text),
  public.delete_wholesale_order(uuid, uuid, text)
to authenticated;
