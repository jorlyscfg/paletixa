create or replace function public.create_wholesale_customer_order(
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
  select prepared_items.normalized_items, prepared_items.total_mxn
  into prepared, total
  from public.prepare_wholesale_order_items(p_items) as prepared_items;
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

create or replace function public.reorder_wholesale_customer_order(
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
  select prepared_items.normalized_items, prepared_items.total_mxn
  into prepared, total
  from public.prepare_wholesale_order_items(p_items) as prepared_items;
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
