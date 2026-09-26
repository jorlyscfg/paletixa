-- Allow customers to edit the same pending order without changing its identity.

create or replace function public.update_wholesale_customer_order(
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
  prepared jsonb;
  total numeric;
  payment jsonb;
  new_payload_hash text;
  changed public.wholesale_orders%rowtype;
  before_snapshot jsonb;
begin
  if session_customer_id is null then
    raise exception 'customer session is invalid or expired';
  end if;
  if p_request_id is null or p_order_id is null then
    raise exception 'order update identifiers are required';
  end if;

  select normalized_items, total_mxn
  into prepared, total
  from public.prepare_wholesale_order_items(p_items);
  payment := public.normalize_wholesale_payment(p_payment_method, p_transfer_ticket_url, p_transfer_ticket_key);
  new_payload_hash := encode(public.digest(convert_to(
    'update_wholesale_customer_order|' || session_customer_id::text || '|' ||
    p_order_id::text || '|' || prepared::text || '|' || payment::text,
    'utf8'
  ), 'sha256'), 'hex');

  if not exists (
    select 1
    from public.wholesale_orders
    where id = p_order_id and customer_id = session_customer_id
  ) then
    raise exception 'order not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wholesale-update:' || p_request_id::text, 0));
  if public.wholesale_mutation_was_replayed('customer.update', p_request_id, p_order_id, new_payload_hash) then
    return query select * from public.wholesale_order_projection(p_order_id);
    return;
  end if;

  select * into changed
  from public.wholesale_orders
  where id = p_order_id and customer_id = session_customer_id
  for update;
  if not found then
    raise exception 'order not found';
  end if;
  if changed.deleted_at is not null or changed.status <> 'pending' then
    raise exception 'only pending orders can be updated';
  end if;

  before_snapshot := public.wholesale_order_snapshot(p_order_id);
  insert into public.wholesale_mutation_requests(request_id, operation, resource_id, payload_hash)
  values (p_request_id, 'customer.update', p_order_id, new_payload_hash);

  update public.wholesale_orders
  set payment_method = payment->>'payment_method',
      transfer_ticket_url = payment->>'transfer_ticket_url',
      transfer_ticket_key = payment->>'transfer_ticket_key',
      total_mxn = total,
      payload_hash = new_payload_hash,
      updated_at = now()
  where id = p_order_id and customer_id = session_customer_id
    and status = 'pending' and deleted_at is null
  returning * into changed;
  if not found then
    raise exception 'order is no longer pending';
  end if;

  delete from public.wholesale_order_items where order_id = p_order_id;
  perform public.insert_wholesale_order_items(p_order_id, prepared);
  update public.wholesale_customer_sessions
  set last_seen_at = now()
  where token_hash = encode(public.digest(convert_to(p_session_token, 'utf8'), 'sha256'), 'hex');
  perform public.append_wholesale_audit_event(
    'customer', session_customer_id, session_customer_id, 'order.updated', null,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;

revoke all on function public.update_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text)
from public, anon, authenticated;

grant execute on function public.update_wholesale_customer_order(text, uuid, uuid, jsonb, text, text, text)
to anon, authenticated;
