create or replace function public.mark_wholesale_order_seen(p_request_id uuid, p_order_id uuid)
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
  update public.wholesale_orders as order_row
  set admin_seen_at = coalesce(order_row.admin_seen_at, now()),
      admin_seen_by = coalesce(order_row.admin_seen_by, actor), updated_at = now()
  where order_row.id = p_order_id
  returning order_row.* into changed;
  perform public.append_wholesale_audit_event(
    'admin', actor, changed.customer_id, 'order.seen', null,
    before_snapshot, public.wholesale_order_snapshot(p_order_id), p_request_id, p_request_id
  );
  return query select * from public.wholesale_order_projection(p_order_id);
end;
$$;
