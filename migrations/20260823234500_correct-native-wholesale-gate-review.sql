-- Native wholesale gate corrections. This forward migration intentionally does
-- not rewrite the foundation, lifecycle, or public-catalog migration history.
--
-- SECURITY TRADE-OFF: the current four-digit customer PIN is stored in
-- current_pin as well as pin_hash so an authenticated admin can recall it at
-- any time. This is less resistant to database disclosure than hash-only
-- storage, but it is the explicit product decision. The plaintext PIN is
-- exposed only by admin customer RPCs; it is not written to audit snapshots,
-- customer sessions, order payloads, public responses, or application logs.

alter table public.wholesale_customers
  add column if not exists current_pin text;

with generated_pins as (
  select customer.id, public.make_wholesale_pin() as pin
  from public.wholesale_customers as customer
  where customer.current_pin is null
)
update public.wholesale_customers as customer
set current_pin = generated.pin,
    pin_hash = public.crypt(generated.pin, public.gen_salt('bf')),
    failed_login_attempts = 0,
    last_failed_login_at = null,
    updated_at = now()
from generated_pins as generated
where customer.id = generated.id;

alter table public.wholesale_customers
  alter column current_pin set not null;

alter table public.wholesale_customers
  add constraint wholesale_customers_current_pin_format
  check (current_pin ~ '^[0-9]{4}$');

alter table public.wholesale_audit_events
  drop constraint if exists wholesale_audit_before_no_credentials,
  drop constraint if exists wholesale_audit_after_no_credentials;

alter table public.wholesale_audit_events
  add constraint wholesale_audit_before_no_credentials check (
    before_snapshot::text !~* '"(pin|pin_hash|generated_pin|current_pin|session_token)"[[:space:]]*:'
  ),
  add constraint wholesale_audit_after_no_credentials check (
    after_snapshot::text !~* '"(pin|pin_hash|generated_pin|current_pin|session_token)"[[:space:]]*:'
  );

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

  insert into public.wholesale_customers(name, mobile, email, pin_hash, current_pin)
  values (normalized_name, normalized_mobile, normalized_email,
    public.crypt(generated_pin, public.gen_salt('bf')), generated_pin)
  returning * into made;

  perform public.append_wholesale_audit_event(
    'admin', actor, made.id, 'customer.created', null, '{}'::jsonb,
    public.wholesale_customer_snapshot(made.id), p_request_id, p_request_id
  );

  return query select made.id, made.name, made.mobile, made.email, made.status,
    made.created_at, made.updated_at, generated_pin;
end;
$$;

drop function if exists public.list_wholesale_customers();

create function public.list_wholesale_customers()
returns table(
  customer_id uuid,
  name text,
  mobile text,
  email text,
  status text,
  failed_login_attempts integer,
  created_at timestamptz,
  updated_at timestamptz,
  current_pin text
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
    customer.failed_login_attempts, customer.created_at, customer.updated_at, customer.current_pin
  from public.wholesale_customers as customer
  order by customer.name, customer.id;
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
      current_pin = generated_pin,
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

-- The public projection is recreated rather than mutating the applied
-- migration because PostgreSQL cannot change RETURNS TABLE columns in place.
drop function if exists public.list_public_wholesale_catalog();

create function public.list_public_wholesale_catalog()
returns table(
  product_id uuid,
  product_name text,
  product_sku text,
  category_id uuid,
  category_name text,
  retail_price_mxn numeric,
  wholesale_price_mxn numeric,
  image_url text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    product.id,
    product.name,
    product.sku,
    category.id,
    category.name,
    product.retail_price_mxn,
    product.wholesale_price_mxn,
    case
      when btrim(coalesce(product.image_url, '')) ~ '^https://[^[:space:]]+$'
        then btrim(product.image_url)
      else null
    end
  from public.products as product
  join public.product_categories as category on category.id = product.category_id
  where product.active
  order by category.name, product.name, product.id
$$;

drop function if exists public.complete_wholesale_order(uuid, uuid, jsonb);

create function public.complete_wholesale_order(
  p_request_id uuid,
  p_order_id uuid,
  p_completion jsonb,
  p_reason text
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
  completion jsonb := public.normalize_wholesale_completion(p_completion);
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
  payload_hash text;
begin
  if not public.wholesale_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_order_id is null then raise exception 'order completion identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  payload_hash := encode(public.digest(convert_to('complete|' || p_order_id::text || '|' || completion::text || '|' || normalized_reason, 'utf8'), 'sha256'), 'hex');
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
    'admin', actor, changed.customer_id, 'order.completed', normalized_reason,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create or replace function public.create_wholesale_admin_order(
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
  if wanted_status in ('cancelled', 'completed') and (normalized_reason is null or length(normalized_reason) > 500) then raise exception 'a reason is required for this admin order state'; end if;
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

revoke all on function public.list_wholesale_customers(),
  public.list_public_wholesale_catalog(),
  public.complete_wholesale_order(uuid, uuid, jsonb, text)
from public, anon, authenticated;

grant execute on function public.list_wholesale_customers(),
  public.complete_wholesale_order(uuid, uuid, jsonb, text)
to authenticated;

grant execute on function public.list_public_wholesale_catalog()
to anon, authenticated;
