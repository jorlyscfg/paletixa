-- Native wholesale lifecycle support. This migration keeps the existing sales
-- ledger and record_sale contract intact while adding order-owned sale
-- snapshots, reversible sale relations, completion data, and realtime events.

alter table public.wholesale_orders
  add column payment_amount numeric(14,2),
  add column payment_currency text,
  add column payment_confirmed_at timestamptz,
  add column payment_confirmed_by uuid references auth.users(id) on delete restrict,
  add column payment_reference text,
  add column payment_note text,
  add column delivery_agreement text,
  add column admin_seen_at timestamptz,
  add column admin_seen_by uuid references auth.users(id) on delete restrict,
  add column reordered_from_order_id uuid references public.wholesale_orders(id) on delete restrict;

alter table public.wholesale_orders
  add constraint wholesale_orders_payment_amount_non_negative check (
    payment_amount is null or payment_amount >= 0
  ),
  add constraint wholesale_orders_payment_currency_valid check (
    payment_currency is null or payment_currency in ('mxn', 'usd')
  ),
  add constraint wholesale_orders_payment_reference_length check (
    payment_reference is null or length(btrim(payment_reference)) between 1 and 160
  ),
  add constraint wholesale_orders_payment_note_length check (
    payment_note is null or length(btrim(payment_note)) between 1 and 500
  ),
  add constraint wholesale_orders_delivery_agreement_valid check (
    delivery_agreement is null or delivery_agreement in ('delivery', 'pickup')
  ),
  add constraint wholesale_orders_completed_data_check check (
    status <> 'completed'
    or (
      completed_at is not null
      and payment_amount is not null
      and payment_amount > 0
      and payment_currency is not null
      and payment_confirmed_at is not null
      and payment_confirmed_by is not null
      and delivery_agreement is not null
    )
  );

create index wholesale_orders_admin_seen_idx
  on public.wholesale_orders(admin_seen_at, created_at)
  where deleted_at is null;
create index wholesale_orders_reordered_from_idx
  on public.wholesale_orders(reordered_from_order_id);

create table public.sale_reversals (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  wholesale_order_id uuid not null references public.wholesale_orders(id) on delete restrict,
  reason text not null,
  reversed_by uuid not null references auth.users(id) on delete restrict,
  reversed_at timestamptz not null default now(),
  request_id uuid not null,
  correlation_id uuid not null,
  previous_reversal_id uuid references public.sale_reversals(id) on delete restrict,
  constraint sale_reversals_reason_not_blank check (length(btrim(reason)) between 1 and 500)
);

create unique index sale_reversals_sale_key on public.sale_reversals(sale_id);
create index sale_reversals_order_idx on public.sale_reversals(wholesale_order_id, reversed_at desc);
create index sale_reversals_request_idx on public.sale_reversals(request_id);

create table public.wholesale_order_sales (
  sale_id uuid primary key references public.sales(id) on delete restrict,
  order_id uuid not null references public.wholesale_orders(id) on delete restrict,
  generation integer not null check (generation > 0),
  predecessor_sale_id uuid references public.sales(id) on delete restrict,
  prior_reversal_id uuid references public.sale_reversals(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint wholesale_order_sales_generation_key unique (order_id, generation)
);

create index wholesale_order_sales_order_idx
  on public.wholesale_order_sales(order_id, generation desc);
create unique index wholesale_order_sales_predecessor_key
  on public.wholesale_order_sales(order_id, predecessor_sale_id)
  where predecessor_sale_id is not null;

create table public.wholesale_mutation_requests (
  request_id uuid not null,
  operation text not null,
  resource_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, operation),
  constraint wholesale_mutation_operation_not_blank check (length(btrim(operation)) between 1 and 120)
);

create index wholesale_mutation_resource_idx
  on public.wholesale_mutation_requests(resource_id, created_at desc);

create table public.wholesale_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.wholesale_orders(id) on delete restrict,
  customer_id uuid not null references public.wholesale_customers(id) on delete restrict,
  event_type text not null,
  actor_kind text not null check (actor_kind in ('admin', 'customer', 'system')),
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  request_id uuid,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  constraint wholesale_order_events_type_not_blank check (length(btrim(event_type)) between 1 and 120),
  constraint wholesale_order_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint wholesale_order_events_no_credentials check (
    payload::text !~* '"(pin|pin_hash|generated_pin|session_token)"[[:space:]]*:'
  )
);

create index wholesale_order_events_order_idx
  on public.wholesale_order_events(order_id, created_at desc);
create index wholesale_order_events_customer_idx
  on public.wholesale_order_events(customer_id, created_at desc);

insert into public.wholesale_order_sales(sale_id, order_id, generation, created_by)
select order_row.sale_id, order_row.id, 1, sale.created_by
from public.wholesale_orders as order_row
join public.sales as sale on sale.id = order_row.sale_id
where order_row.sale_id is not null
on conflict (sale_id) do nothing;

create or replace function public.wholesale_unit_price_for_quantity(
  p_retail_price numeric,
  p_wholesale_price numeric,
  p_quantity integer
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'wholesale quantity must be positive';
  end if;
  if p_retail_price is null or p_retail_price <= 0 then
    raise exception 'retail price must be positive';
  end if;
  return case
    when p_quantity >= 10 and p_wholesale_price is not null and p_wholesale_price > 0
      then round(p_wholesale_price, 2)
    else round(p_retail_price, 2)
  end;
end;
$$;

create or replace function public.normalize_wholesale_completion(p_completion jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  amount numeric;
  currency text;
  delivery text;
  reference text;
  note text;
begin
  if p_completion is null or jsonb_typeof(p_completion) <> 'object' then
    raise exception 'completion data must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_completion) as keys(key)
    where keys.key not in ('payment_amount', 'payment_currency', 'payment_reference', 'payment_note', 'delivery_agreement')
  ) then
    raise exception 'completion data contains unknown fields';
  end if;
  if coalesce(jsonb_typeof(p_completion->'payment_amount'), '') <> 'number' then
    raise exception 'payment amount is required';
  end if;
  amount := round((p_completion->>'payment_amount')::numeric, 2);
  if amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  currency := lower(btrim(coalesce(nullif(p_completion->>'payment_currency', ''), 'mxn')));
  if currency not in ('mxn', 'usd') then
    raise exception 'payment currency is invalid';
  end if;
  if coalesce(jsonb_typeof(p_completion->'delivery_agreement'), '') <> 'string' then
    raise exception 'delivery agreement is required';
  end if;
  delivery := lower(btrim(p_completion->>'delivery_agreement'));
  if delivery not in ('delivery', 'pickup') then
    raise exception 'delivery agreement is invalid';
  end if;
  reference := nullif(btrim(coalesce(p_completion->>'payment_reference', '')), '');
  note := nullif(btrim(coalesce(p_completion->>'payment_note', '')), '');
  if reference is not null and length(reference) > 160 then
    raise exception 'payment reference is too long';
  end if;
  if note is not null and length(note) > 500 then
    raise exception 'payment note is too long';
  end if;
  return jsonb_build_object(
    'payment_amount', amount,
    'payment_currency', currency,
    'payment_reference', reference,
    'payment_note', note,
    'delivery_agreement', delivery
  );
end;
$$;

create or replace function public.wholesale_mutation_was_replayed(
  p_operation text,
  p_request_id uuid,
  p_resource_id uuid,
  p_payload_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  existing_hash text;
  existing_resource uuid;
begin
  select payload_hash, resource_id
  into existing_hash, existing_resource
  from public.wholesale_mutation_requests
  where operation = p_operation and request_id = p_request_id;
  if not found then
    return false;
  end if;
  if existing_hash <> p_payload_hash or existing_resource <> p_resource_id then
    raise exception 'request conflict';
  end if;
  return true;
end;
$$;

create or replace function public.wholesale_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger sale_reversals_append_only
before update or delete on public.sale_reversals
for each row execute function public.wholesale_append_only_guard();

create trigger wholesale_order_sales_append_only
before update or delete on public.wholesale_order_sales
for each row execute function public.wholesale_append_only_guard();

create trigger wholesale_mutation_requests_append_only
before update or delete on public.wholesale_mutation_requests
for each row execute function public.wholesale_append_only_guard();

create trigger wholesale_order_events_append_only
before update or delete on public.wholesale_order_events
for each row execute function public.wholesale_append_only_guard();

-- The old functions keep their input contracts where possible, but their
-- projections are recreated with the lifecycle fields required by this batch.
drop function if exists public.create_wholesale_customer_order(text, uuid, jsonb, text, text, text);
drop function if exists public.list_wholesale_customer_orders(text);
drop function if exists public.cancel_wholesale_customer_order(text, uuid, uuid, text);
drop function if exists public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text);
drop function if exists public.list_wholesale_orders(boolean);
drop function if exists public.set_wholesale_order_status(uuid, uuid, text, text);
drop function if exists public.update_wholesale_admin_order(uuid, uuid, uuid, jsonb, text, text, text, text);
drop function if exists public.delete_wholesale_order(uuid, uuid, text);
drop function if exists public.wholesale_order_projection(uuid);

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

create function public.wholesale_order_projection(p_order_id uuid)
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
        'product_id', item.product_id,
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
    made_sale_id, 'product', item.product_id, null, null,
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

create or replace function public.reverse_wholesale_order_sale(
  p_order_id uuid,
  p_reason text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  order_row public.wholesale_orders%rowtype;
  sale_to_reverse uuid;
  previous_reversal_id uuid;
  before_snapshot jsonb;
begin
  if actor is null then
    raise exception 'authenticated admin is required';
  end if;
  if p_order_id is null or p_request_id is null then
    raise exception 'sale reversal identifiers are required';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null
    or length(btrim(p_reason)) > 500 then
    raise exception 'a reason is required';
  end if;
  select * into order_row
  from public.wholesale_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;
  sale_to_reverse := order_row.sale_id;
  if sale_to_reverse is null then
    return null;
  end if;
  if exists (select 1 from public.sale_reversals where sale_id = sale_to_reverse) then
    update public.wholesale_orders
    set sale_id = null, updated_at = now()
    where id = p_order_id;
    return sale_to_reverse;
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  select history.prior_reversal_id into previous_reversal_id
  from public.wholesale_order_sales as history
  where history.sale_id = sale_to_reverse;
  insert into public.sale_reversals(
    sale_id, wholesale_order_id, reason, reversed_by, request_id, correlation_id, previous_reversal_id
  ) values (
    sale_to_reverse, p_order_id, btrim(p_reason), actor, p_request_id, p_request_id, previous_reversal_id
  );
  update public.wholesale_orders
  set sale_id = null, updated_at = now()
  where id = p_order_id and sale_id = sale_to_reverse;
  perform public.append_wholesale_audit_event(
    'admin', actor, order_row.customer_id, 'order.sale_reversed', btrim(p_reason),
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return sale_to_reverse;
end;
$$;

create function public.create_wholesale_customer_order(
  p_session_token text,
  p_request_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
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
  if session_customer_id is null then raise exception 'customer session is invalid or expired'; end if;
  if p_request_id is null then raise exception 'request ID is required'; end if;
  select normalized_items, total_mxn into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'create_wholesale_customer_order|' || session_customer_id::text || '|' || prepared::text || '|' || payment::text,
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-create:' || p_request_id::text, 0));
  select * into existing from public.wholesale_orders where request_id = p_request_id for update;
  if found then
    if existing.customer_id <> session_customer_id or existing.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
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

create function public.reorder_wholesale_customer_order(
  p_session_token text,
  p_request_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
  original public.wholesale_orders%rowtype;
  prepared jsonb;
  total numeric;
  payment jsonb;
  payload_hash text;
  made public.wholesale_orders%rowtype;
  existing public.wholesale_orders%rowtype;
begin
  if session_customer_id is null then raise exception 'customer session is invalid or expired'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'reorder identifiers are required'; end if;
  select * into original
  from public.wholesale_orders
  where id = p_order_id and customer_id = session_customer_id and deleted_at is null;
  if not found then raise exception 'order not found'; end if;
  select normalized_items, total_mxn into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'reorder_wholesale_customer_order|' || session_customer_id::text || '|' || p_order_id::text || '|' || prepared::text || '|' || payment::text,
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-create:' || p_request_id::text, 0));
  select * into existing from public.wholesale_orders where request_id = p_request_id for update;
  if found then
    if existing.customer_id <> session_customer_id or existing.payload_hash <> payload_hash then raise exception 'request conflict'; end if;
    return query select * from public.wholesale_order_projection(existing.id);
    return;
  end if;
  insert into public.wholesale_orders(
    request_id, customer_id, source, status, payment_method,
    transfer_ticket_url, transfer_ticket_key, total_mxn, payload_hash, reordered_from_order_id
  ) values (
    p_request_id, session_customer_id, 'customer', 'pending', payment->>'payment_method',
    payment->>'transfer_ticket_url', payment->>'transfer_ticket_key', total, payload_hash, p_order_id
  ) returning * into made;
  perform public.insert_wholesale_order_items(made.id, prepared);
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.reordered', null,
    jsonb_build_object('reordered_from_order_id', p_order_id),
    public.wholesale_order_snapshot(made.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(made.id);
end;
$$;

create function public.list_wholesale_customer_orders(p_session_token text)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
begin
  if session_customer_id is null then raise exception 'customer session is invalid or expired'; end if;
  update public.wholesale_customer_sessions
  set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  return query
  select projection.*
  from public.wholesale_orders as order_row
  cross join lateral public.wholesale_order_projection(order_row.id) as projection
  where order_row.customer_id = session_customer_id and order_row.deleted_at is null
  order by projection.created_at desc, projection.order_id desc;
end;
$$;

create function public.cancel_wholesale_customer_order(
  p_session_token text, p_request_id uuid, p_order_id uuid, p_reason text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if session_customer_id is null then raise exception 'customer session is invalid or expired'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order cancellation identifiers are required'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null or length(btrim(p_reason)) > 500 then raise exception 'a reason is required'; end if;
  if not exists (
    select 1 from public.wholesale_orders
    where id = p_order_id and customer_id = session_customer_id
  ) then raise exception 'order not found'; end if;
  payload_hash := encode(public.digest(convert_to('cancel|' || p_order_id::text || '|' || btrim(p_reason), 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-cancel:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('customer.cancel', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders
  where id = p_order_id and customer_id = session_customer_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if changed.deleted_at is not null or changed.status <> 'pending' or changed.admin_seen_at is not null then
    raise exception 'only unseen pending orders can be cancelled';
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'customer.cancel', p_order_id, payload_hash);
  update public.wholesale_orders
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_order_id and status = 'pending' and admin_seen_at is null and deleted_at is null
  returning * into changed;
  if not found then raise exception 'order is no longer pending or has been seen'; end if;
  update public.wholesale_customer_sessions set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.cancelled', btrim(p_reason),
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.delete_wholesale_customer_order(
  p_session_token text, p_request_id uuid, p_order_id uuid, p_reason text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  session_customer_id uuid := public.wholesale_customer_session_id(p_session_token);
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if session_customer_id is null then raise exception 'customer session is invalid or expired'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order deletion identifiers are required'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null or length(btrim(p_reason)) > 500 then raise exception 'a reason is required'; end if;
  if not exists (
    select 1 from public.wholesale_orders
    where id = p_order_id and customer_id = session_customer_id
  ) then raise exception 'order not found'; end if;
  payload_hash := encode(public.digest(convert_to('delete|' || p_order_id::text || '|' || btrim(p_reason), 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-delete:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('customer.delete', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders
  where id = p_order_id and customer_id = session_customer_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if changed.deleted_at is not null or changed.status <> 'pending' or changed.admin_seen_at is not null then
    raise exception 'only unseen pending orders can be deleted';
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'customer.delete', p_order_id, payload_hash);
  update public.wholesale_orders
  set deleted_at = now(), deletion_reason = btrim(p_reason), updated_at = now()
  where id = p_order_id and status = 'pending' and admin_seen_at is null and deleted_at is null
  returning * into changed;
  if not found then raise exception 'order is no longer pending or has been seen'; end if;
  update public.wholesale_customer_sessions set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.deleted', btrim(p_reason),
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.create_wholesale_admin_order(
  p_request_id uuid, p_customer_id uuid, p_items jsonb, p_payment_method text,
  p_transfer_ticket_url text, p_transfer_ticket_key text, p_initial_status text,
  p_completion jsonb, p_reason text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_status text := lower(btrim(coalesce(p_initial_status, 'pending')));
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  completion jsonb;
  prepared jsonb;
  total numeric;
  payment jsonb;
  payload_hash text;
  customer public.wholesale_customers%rowtype;
  made public.wholesale_orders%rowtype;
  existing public.wholesale_orders%rowtype;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_customer_id is null then raise exception 'manual order identifiers are required'; end if;
  if wanted_status not in ('pending', 'processing', 'completed', 'cancelled') then raise exception 'invalid initial wholesale order status'; end if;
  if wanted_status = 'completed' then completion := public.normalize_wholesale_completion(p_completion); elsif p_completion is not null then raise exception 'completion data is only valid for completed orders'; end if;
  if wanted_status = 'cancelled' and (normalized_reason is null or length(normalized_reason) > 500) then raise exception 'a reason is required to create a cancelled order'; end if;
  select * into customer from public.wholesale_customers where id = p_customer_id and status = 'active';
  if not found then raise exception 'active customer not found'; end if;
  select normalized_items, total_mxn into prepared, total from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'create_wholesale_admin_order|' || actor::text || '|' || p_customer_id::text || '|' || wanted_status || '|' || prepared::text || '|' || payment::text || '|' || coalesce(completion, '{}'::jsonb)::text || '|' || coalesce(normalized_reason, ''),
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-create:' || p_request_id::text, 0));
  select * into existing from public.wholesale_orders where request_id = p_request_id for update;
  if found then
    if existing.payload_hash <> payload_hash then raise exception 'request conflict'; end if;
    return query select * from public.wholesale_order_projection(existing.id);
    return;
  end if;
  insert into public.wholesale_orders(
    request_id, customer_id, created_by, source, status, payment_method,
    transfer_ticket_url, transfer_ticket_key, total_mxn, payload_hash,
    completed_at, cancelled_at, payment_amount, payment_currency,
    payment_confirmed_at, payment_confirmed_by, payment_reference, payment_note,
    delivery_agreement
  ) values (
    p_request_id, p_customer_id, actor, 'admin', wanted_status, payment->>'payment_method',
    payment->>'transfer_ticket_url', payment->>'transfer_ticket_key', total, payload_hash,
    case when wanted_status = 'completed' then now() end,
    case when wanted_status = 'cancelled' then now() end,
    case when wanted_status = 'completed' then (completion->>'payment_amount')::numeric end,
    case when wanted_status = 'completed' then completion->>'payment_currency' end,
    case when wanted_status = 'completed' then now() end,
    case when wanted_status = 'completed' then actor end,
    case when wanted_status = 'completed' then completion->>'payment_reference' end,
    case when wanted_status = 'completed' then completion->>'payment_note' end,
    case when wanted_status = 'completed' then completion->>'delivery_agreement' end
  ) returning * into made;
  perform public.insert_wholesale_order_items(made.id, prepared);
  if wanted_status = 'completed' then perform public.complete_wholesale_order_sale(made.id); end if;
  perform public.append_wholesale_audit_event(
    'admin', actor, p_customer_id, 'order.created', normalized_reason, '{}'::jsonb,
    public.wholesale_order_snapshot(made.id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(made.id);
end;
$$;

create function public.create_wholesale_admin_order(
  p_request_id uuid, p_customer_id uuid, p_items jsonb, p_payment_method text,
  p_transfer_ticket_url text, p_transfer_ticket_key text, p_initial_status text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select * from public.create_wholesale_admin_order(
    p_request_id, p_customer_id, p_items, p_payment_method,
    p_transfer_ticket_url, p_transfer_ticket_key, p_initial_status, null, null
  )
$$;

create function public.list_wholesale_orders(p_include_deleted boolean default false)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  return query
  select projection.*
  from public.wholesale_orders as order_row
  cross join lateral public.wholesale_order_projection(order_row.id) as projection
  where p_include_deleted or order_row.deleted_at is null
  order by projection.created_at desc, projection.order_id desc;
end;
$$;

create function public.mark_wholesale_order_seen(p_request_id uuid, p_order_id uuid)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order seen identifiers are required'; end if;
  payload_hash := encode(public.digest(convert_to('seen|' || p_order_id::text, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-seen:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('admin.seen', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then raise exception 'active order not found'; end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'admin.seen', p_order_id, payload_hash);
  update public.wholesale_orders
  set admin_seen_at = coalesce(admin_seen_at, now()),
      admin_seen_by = coalesce(admin_seen_by, actor), updated_at = now()
  where id = p_order_id
  returning * into changed;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.seen', null,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.complete_wholesale_order(
  p_request_id uuid, p_order_id uuid, p_completion jsonb
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  completion jsonb := public.normalize_wholesale_completion(p_completion);
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order completion identifiers are required'; end if;
  payload_hash := encode(public.digest(convert_to('complete|' || p_order_id::text || '|' || completion::text, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-complete:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('admin.complete', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then raise exception 'active order not found'; end if;
  if changed.status = 'completed' and changed.sale_id is not null then raise exception 'order is already completed'; end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'admin.complete', p_order_id, payload_hash);
  update public.wholesale_orders
  set status = 'completed', completed_at = now(), cancelled_at = null,
      payment_amount = (completion->>'payment_amount')::numeric,
      payment_currency = completion->>'payment_currency', payment_confirmed_at = now(),
      payment_confirmed_by = actor, payment_reference = completion->>'payment_reference',
      payment_note = completion->>'payment_note', delivery_agreement = completion->>'delivery_agreement',
      updated_at = now()
  where id = p_order_id
  returning * into changed;
  perform public.complete_wholesale_order_sale(p_order_id);
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.completed', null,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.set_wholesale_order_status(
  p_request_id uuid, p_order_id uuid, p_status text, p_reason text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  wanted_status text := lower(btrim(coalesce(p_status, '')));
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order status identifiers are required'; end if;
  if wanted_status not in ('pending', 'processing', 'completed', 'cancelled') then raise exception 'invalid wholesale order status'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  if wanted_status = 'completed' then raise exception 'completed orders require the completion RPC'; end if;
  payload_hash := encode(public.digest(convert_to('status|' || p_order_id::text || '|' || wanted_status || '|' || normalized_reason, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-status:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('admin.status', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then raise exception 'active order not found'; end if;
  if changed.status = wanted_status then
    insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
    values (p_request_id, 'admin.status', p_order_id, payload_hash);
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'admin.status', p_order_id, payload_hash);
  if changed.status = 'completed' then perform public.reverse_wholesale_order_sale(p_order_id, normalized_reason, p_request_id); end if;
  update public.wholesale_orders
  set status = wanted_status,
      completed_at = null,
      cancelled_at = case when wanted_status = 'cancelled' then now() else null end,
      payment_amount = null, payment_currency = null, payment_confirmed_at = null,
      payment_confirmed_by = null, payment_reference = null, payment_note = null,
      delivery_agreement = null, updated_at = now()
  where id = p_order_id
  returning * into changed;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.status_changed', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.update_wholesale_admin_order(
  p_request_id uuid, p_order_id uuid, p_customer_id uuid, p_items jsonb,
  p_payment_method text, p_transfer_ticket_url text, p_transfer_ticket_key text, p_reason text
)
returns table(
  order_id uuid, customer_id uuid, customer_name text, customer_mobile text, customer_email text,
  status text, payment_method text, transfer_ticket_url text, transfer_ticket_key text,
  total_mxn numeric, sale_id uuid, source text, created_at timestamptz, updated_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, deleted_at timestamptz,
  payment_amount numeric, payment_currency text, payment_confirmed_at timestamptz,
  payment_confirmed_by uuid, payment_reference text, payment_note text, delivery_agreement text,
  admin_seen_at timestamptz, admin_seen_by uuid, reordered_from_order_id uuid,
  sale_generation integer, items jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  prepared jsonb;
  total numeric;
  payment jsonb;
  changed public.wholesale_orders%rowtype;
  customer public.wholesale_customers%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null or p_customer_id is null then raise exception 'order update identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  select normalized_items, total_mxn into prepared, total from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  payload_hash := encode(public.digest(convert_to(
    'update|' || p_order_id::text || '|' || p_customer_id::text || '|' || prepared::text || '|' || payment::text || '|' || normalized_reason,
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-update:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('admin.update', p_request_id, p_order_id, payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found or changed.deleted_at is not null then raise exception 'active order not found'; end if;
  select * into customer from public.wholesale_customers where id = p_customer_id and status = 'active';
  if not found then raise exception 'active customer not found'; end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'admin.update', p_order_id, payload_hash);
  if changed.status = 'completed' then perform public.reverse_wholesale_order_sale(p_order_id, normalized_reason, p_request_id); end if;
  update public.wholesale_orders
  set customer_id = p_customer_id,
      status = case when changed.status = 'completed' then 'processing' else changed.status end,
      payment_method = payment->>'payment_method',
      transfer_ticket_url = payment->>'transfer_ticket_url',
      transfer_ticket_key = payment->>'transfer_ticket_key',
      total_mxn = total,
      payload_hash = encode(public.digest(convert_to('update|' || p_order_id::text || '|' || prepared::text || '|' || payment::text, 'utf8'), 'sha256'), 'hex'),
      completed_at = null,
      cancelled_at = case when changed.status = 'cancelled' then changed.cancelled_at else null end,
      payment_amount = null, payment_currency = null, payment_confirmed_at = null,
      payment_confirmed_by = null, payment_reference = null, payment_note = null,
      delivery_agreement = null, updated_at = now()
  where id = p_order_id
  returning * into changed;
  delete from public.wholesale_order_items where order_id = p_order_id;
  perform public.insert_wholesale_order_items(p_order_id, prepared);
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.updated', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create function public.delete_wholesale_order(p_request_id uuid, p_order_id uuid, p_reason text)
returns table(order_id uuid, customer_id uuid, status text, deleted boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order deletion identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  payload_hash := encode(public.digest(convert_to('delete|' || p_order_id::text || '|' || normalized_reason, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('wholesale-admin-delete:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('admin.delete', p_request_id, p_order_id, payload_hash) then
    select * into changed from public.wholesale_orders where id = p_order_id;
    return query select changed.id, changed.customer_id, changed.status, true;
    return;
  end if;
  select * into changed from public.wholesale_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if changed.deleted_at is not null then
    insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
    values (p_request_id, 'admin.delete', p_order_id, payload_hash);
    return query select changed.id, changed.customer_id, changed.status, false;
    return;
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'admin.delete', p_order_id, payload_hash);
  if changed.status = 'completed' then perform public.reverse_wholesale_order_sale(p_order_id, normalized_reason, p_request_id); end if;
  update public.wholesale_orders
  set deleted_at = now(), deleted_by = actor, deletion_reason = normalized_reason, updated_at = now()
  where id = p_order_id and deleted_at is null
  returning * into changed;
  if not found then raise exception 'order was already deleted'; end if;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.deleted', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select changed.id, changed.customer_id, changed.status, true;
end;
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
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'at least one wholesale order item is required'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) as elements(value) group by value->>'product_id' having count(*) > 1) then raise exception 'duplicate wholesale order product'; end if;
  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'wholesale order items must be objects'; end if;
    if exists (select 1 from jsonb_object_keys(item) as keys(key) where keys.key not in ('product_id', 'quantity')) then raise exception 'wholesale order item contains unknown fields'; end if;
    if coalesce(jsonb_typeof(item->'product_id'), '') <> 'string' or btrim(coalesce(item->>'product_id', '')) = '' or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then raise exception 'wholesale order items require a product ID and positive integer quantity'; end if;
    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::integer;
    select catalog_product.* into product from public.products as catalog_product where catalog_product.id = product_id and catalog_product.active for share;
    if not found then raise exception 'product not found or inactive'; end if;
    unit_price := public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, quantity);
    line_total := round(unit_price * quantity, 2);
    calculated_total := calculated_total + line_total;
    prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
      'product_id', product.id, 'product_name', product.name, 'unit_price_mxn', unit_price,
      'quantity', quantity, 'line_total_mxn', line_total
    ));
  end loop;
  return query select prepared_items, round(calculated_total, 2);
end;
$$;

create or replace function public.notify_wholesale_order_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  event_name text := case when tg_op = 'INSERT' then 'order.created' else 'order.changed' end;
  event_payload jsonb := jsonb_build_object(
    'order_id', new.id,
    'customer_id', new.customer_id,
    'status', new.status,
    'deleted', new.deleted_at is not null,
    'updated_at', new.updated_at
  );
begin
  insert into public.wholesale_order_events(
    order_id, customer_id, event_type, actor_kind, actor_id, payload, request_id, correlation_id
  ) values (
    new.id, new.customer_id, event_name,
    case when actor is null then 'system' when public.wholesale_admin_allowed() then 'admin' else 'customer' end,
    actor, event_payload, null, null
  );
  perform realtime.publish('wholesale:orders', event_name, event_payload);
  return new;
end;
$$;

create trigger wholesale_orders_event_after_insert
after insert on public.wholesale_orders
for each row execute function public.notify_wholesale_order_event();

create trigger wholesale_orders_event_after_update
after update on public.wholesale_orders
for each row execute function public.notify_wholesale_order_event();

insert into realtime.channels(pattern, description, enabled)
values ('wholesale:orders', 'Native wholesale order lifecycle events', true)
on conflict (pattern) do update set description = excluded.description, enabled = excluded.enabled;

create or replace function public.report_sales_by_channel(
  p_from timestamptz, p_to timestamptz
)
returns table(channel text, sale_count bigint, total_mxn numeric)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('reports.view') then raise exception 'access denied'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid report date range'; end if;
  if p_to - p_from > interval '366 days' then raise exception 'report date range is limited to 366 days'; end if;
  return query
  with channels(channel) as (values ('pos'::text), ('wholesale'::text), ('event'::text))
  select channels.channel, count(sale.id)::bigint, coalesce(sum(sale.total_mxn), 0)::numeric(14,2)
  from channels
  left join public.sales as sale
    on sale.channel = channels.channel
    and sale.created_at >= p_from and sale.created_at < p_to
    and not exists (select 1 from public.sale_reversals as reversal where reversal.sale_id = sale.id)
  group by channels.channel
  order by case channels.channel when 'pos' then 1 when 'wholesale' then 2 else 3 end;
end;
$$;

create or replace function public.report_sales_detail(
  p_from timestamptz, p_to timestamptz, p_limit integer default 100
)
returns table(
  sale_id uuid, sale_date timestamptz, channel text, total_mxn numeric,
  product_name text, quantity integer, line_total_mxn numeric, context_label text,
  line_kind text, category_id uuid, category_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('reports.view') then raise exception 'access denied'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'invalid report date range'; end if;
  if p_to - p_from > interval '366 days' then raise exception 'report date range is limited to 366 days'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'report detail limit is limited to 100 sales'; end if;
  return query
  with selected_sales as (
    select sale.id, sale.created_at, sale.channel, sale.total_mxn,
      case sale.channel when 'event' then nullif(btrim(sale.business_context ->> 'event_name'), '') else nullif(btrim(sale.business_context ->> 'customer_name'), '') end as context_label
    from public.sales as sale
    where sale.created_at >= p_from and sale.created_at < p_to
      and not exists (select 1 from public.sale_reversals as reversal where reversal.sale_id = sale.id)
    order by sale.created_at desc, sale.id desc
    limit p_limit
  )
  select selected_sales.id, selected_sales.created_at, selected_sales.channel, selected_sales.total_mxn,
    item.product_name, item.quantity, item.line_total_mxn, selected_sales.context_label,
    item.line_kind, item.category_id, item.category_name
  from selected_sales
  join public.sale_items as item on item.sale_id = selected_sales.id
  order by selected_sales.created_at desc, selected_sales.id desc, item.id;
end;
$$;

alter table public.sale_reversals enable row level security;
alter table public.wholesale_order_sales enable row level security;
alter table public.wholesale_mutation_requests enable row level security;
alter table public.wholesale_order_events enable row level security;

revoke all on public.sale_reversals, public.wholesale_order_sales,
  public.wholesale_mutation_requests, public.wholesale_order_events
from public, anon, authenticated;

revoke all on function public.wholesale_unit_price_for_quantity(numeric, numeric, integer),
  public.normalize_wholesale_completion(jsonb),
  public.wholesale_mutation_was_replayed(text, uuid, uuid, text),
  public.wholesale_append_only_guard(),
  public.wholesale_order_snapshot(uuid),
  public.wholesale_order_projection(uuid),
  public.complete_wholesale_order_sale(uuid),
  public.reverse_wholesale_order_sale(uuid, text, uuid),
  public.notify_wholesale_order_event()
from public, anon, authenticated;

revoke all on function public.create_wholesale_customer_order(text, uuid, jsonb, text, text, text),
  public.reorder_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text),
  public.list_wholesale_customer_orders(text),
  public.cancel_wholesale_customer_order(text, uuid, uuid, text),
  public.delete_wholesale_customer_order(text, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.create_wholesale_customer_order(text, uuid, jsonb, text, text, text),
  public.reorder_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text),
  public.list_wholesale_customer_orders(text),
  public.cancel_wholesale_customer_order(text, uuid, uuid, text),
  public.delete_wholesale_customer_order(text, uuid, uuid, text)
to anon, authenticated;

revoke all on function public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text),
  public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text, jsonb, text),
  public.list_wholesale_orders(boolean),
  public.mark_wholesale_order_seen(uuid, uuid),
  public.complete_wholesale_order(uuid, uuid, jsonb),
  public.set_wholesale_order_status(uuid, uuid, text, text),
  public.update_wholesale_admin_order(uuid, uuid, uuid, jsonb, text, text, text, text),
  public.delete_wholesale_order(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text),
  public.create_wholesale_admin_order(uuid, uuid, jsonb, text, text, text, text, jsonb, text),
  public.list_wholesale_orders(boolean),
  public.mark_wholesale_order_seen(uuid, uuid),
  public.complete_wholesale_order(uuid, uuid, jsonb),
  public.set_wholesale_order_status(uuid, uuid, text, text),
  public.update_wholesale_admin_order(uuid, uuid, uuid, jsonb, text, text, text, text),
  public.delete_wholesale_order(uuid, uuid, text)
to authenticated;

grant execute on function public.report_sales_by_channel(timestamptz, timestamptz),
  public.report_sales_detail(timestamptz, timestamptz, integer)
to authenticated;
