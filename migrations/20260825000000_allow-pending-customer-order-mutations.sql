-- Keep customer mutations available for pending orders after the admin has seen them.

create or replace function public.cancel_wholesale_customer_order(
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
  if changed.deleted_at is not null or changed.status <> 'pending' then
    raise exception 'only pending orders can be cancelled';
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'customer.cancel', p_order_id, payload_hash);
  update public.wholesale_orders
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = p_order_id and status = 'pending' and deleted_at is null
  returning * into changed;
  if not found then raise exception 'order is no longer pending'; end if;
  update public.wholesale_customer_sessions set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.cancelled', btrim(p_reason),
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

create or replace function public.delete_wholesale_customer_order(
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
  if changed.deleted_at is not null or changed.status <> 'pending' then
    raise exception 'only pending orders can be deleted';
  end if;
  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'customer.delete', p_order_id, payload_hash);
  update public.wholesale_orders
  set deleted_at = now(), deletion_reason = btrim(p_reason), updated_at = now()
  where id = p_order_id and status = 'pending' and deleted_at is null
  returning * into changed;
  if not found then raise exception 'order is no longer pending'; end if;
  update public.wholesale_customer_sessions set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.deleted', btrim(p_reason),
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;
