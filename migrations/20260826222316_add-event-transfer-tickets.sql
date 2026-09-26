-- Keep Event transfer receipts private and scoped to the opaque reservation request.

alter table public.event_reservations
  add column transfer_ticket_url text,
  add column transfer_ticket_key text;

alter table public.event_reservations
  add constraint event_reservations_transfer_ticket_pair_check
  check ((transfer_ticket_url is null) = (transfer_ticket_key is null)),
  add constraint event_reservations_transfer_ticket_url_check
  check (transfer_ticket_url is null or length(btrim(transfer_ticket_url)) between 1 and 4096),
  add constraint event_reservations_transfer_ticket_key_check
  check (
    transfer_ticket_key is null
    or (
      length(transfer_ticket_key) between 1 and 512
      and transfer_ticket_key ~ ('^events/' || request_id::text || '/[A-Za-z0-9._-]+$')
      and transfer_ticket_key not like '%..%'
    )
  );

-- Adding attributes keeps the existing composite type OID stable for the
-- unchanged lifecycle RPCs. The projection function is replaced below before
-- any new composite-return overload is granted.
alter type public.event_reservation_projection_row_v2 add attribute transfer_ticket_url text;
alter type public.event_reservation_projection_row_v2 add attribute transfer_ticket_key text;

create or replace function public.event_reservation_snapshot(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'id', reservation.id,
      'request_id', reservation.request_id,
      'created_by', reservation.created_by,
      'origin', reservation.origin,
      'status', reservation.status,
      'event_date', reservation.event_date,
      'customer_name', reservation.customer_name,
      'customer_phone', reservation.customer_phone,
      'customer_email', reservation.customer_email,
      'payment_plan', reservation.payment_plan,
      'total_mxn', reservation.total_mxn,
      'declared_payment_amount', reservation.declared_payment_amount,
      'declared_payment_method', reservation.declared_payment_method,
      'declared_payment_reference', reservation.declared_payment_reference,
      'transfer_ticket_url', reservation.transfer_ticket_url,
      'transfer_ticket_key', reservation.transfer_ticket_key,
      'confirmed_payment_amount', reservation.confirmed_payment_amount,
      'confirmed_payment_method', reservation.confirmed_payment_method,
      'confirmed_payment_reference', reservation.confirmed_payment_reference,
      'confirmed_payment_note', reservation.confirmed_payment_note,
      'payment_confirmed_at', reservation.payment_confirmed_at,
      'remaining_payment_amount', reservation.remaining_payment_amount,
      'remaining_payment_method', reservation.remaining_payment_method,
      'remaining_payment_reference', reservation.remaining_payment_reference,
      'remaining_payment_note', reservation.remaining_payment_note,
      'final_payment_amount', reservation.final_payment_amount,
      'reserved_at', reservation.reserved_at,
      'completed_at', reservation.completed_at,
      'cancelled_at', reservation.cancelled_at,
      'cancellation_reason', reservation.cancellation_reason,
      'sale_id', reservation.sale_id,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', item.id, 'line_kind', item.line_kind, 'product_id', item.product_id,
        'category_id', item.category_id, 'category_name', item.category_name,
        'product_name', item.product_name, 'unit_price_mxn', item.unit_price_mxn,
        'quantity', item.quantity, 'line_total_mxn', item.line_total_mxn
      ) order by item.id) from public.event_reservation_items as item where item.reservation_id = reservation.id), '[]'::jsonb)
    )
    from public.event_reservations as reservation
    where reservation.id = p_reservation_id
  ), '{}'::jsonb)
$$;

create or replace function public.event_reservation_projection(p_reservation_id uuid)
returns setof public.event_reservation_projection_row_v2
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select reservation.id, reservation.request_id, reservation.customer_name,
    reservation.customer_phone, reservation.customer_email, reservation.event_date,
    reservation.status, reservation.origin, reservation.payment_plan, reservation.total_mxn,
    reservation.declared_payment_amount, reservation.declared_payment_method,
    reservation.declared_payment_reference, reservation.confirmed_payment_amount,
    reservation.confirmed_payment_method, reservation.confirmed_payment_reference,
    reservation.confirmed_payment_note, reservation.payment_confirmed_at,
    reservation.payment_confirmed_by,
    case when reservation.status = 'pending' then 0 else reservation.remaining_payment_amount end,
    reservation.remaining_payment_method, reservation.remaining_payment_reference,
    reservation.remaining_payment_note, reservation.reserved_at, reservation.reserved_by,
    reservation.completed_at, reservation.cancelled_at, reservation.cancelled_by,
    reservation.cancellation_reason, reservation.sale_id, reservation.created_by,
    reservation.created_at, reservation.updated_at, reservation.admin_seen_at,
    reservation.admin_seen_by,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'line_kind', item.line_kind, 'product_id', item.product_id,
      'category_id', item.category_id, 'category_name', item.category_name,
      'product_name', item.product_name, 'unit_price_mxn', item.unit_price_mxn,
      'quantity', item.quantity, 'line_total_mxn', item.line_total_mxn
    ) order by item.id) from public.event_reservation_items as item where item.reservation_id = reservation.id), '[]'::jsonb),
    reservation.transfer_ticket_url, reservation.transfer_ticket_key
  from public.event_reservations as reservation
  where reservation.id = p_reservation_id
$$;

create or replace function public.event_set_transfer_ticket(
  p_reservation_id uuid,
  p_event_request_id uuid,
  p_payment_method text,
  p_transfer_ticket_url text,
  p_transfer_ticket_key text,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  reservation public.event_reservations%rowtype;
  normalized_url text := nullif(btrim(coalesce(p_transfer_ticket_url, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_transfer_ticket_key, '')), '');
begin
  if normalized_url is null and normalized_key is null then return; end if;
  if (normalized_url is null) <> (normalized_key is null) then raise exception 'event transfer ticket URL and key must be provided together'; end if;
  if lower(btrim(coalesce(p_payment_method, ''))) <> 'transfer' then raise exception 'event transfer ticket requires a transfer payment'; end if;
  if length(normalized_url) > 4096 or length(normalized_key) > 512 then raise exception 'event transfer ticket is too long'; end if;
  if normalized_key !~ ('^events/' || p_event_request_id::text || '/[A-Za-z0-9._-]+$') or normalized_key like '%..%' then raise exception 'event transfer ticket key does not belong to this event request'; end if;

  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.request_id is distinct from p_event_request_id then raise exception 'event transfer ticket request does not match the reservation'; end if;
  if reservation.transfer_ticket_key is not null and reservation.transfer_ticket_key <> normalized_key then raise exception 'request conflict'; end if;

  update public.event_reservations
  set transfer_ticket_url = normalized_url, transfer_ticket_key = normalized_key, updated_at = now()
  where id = reservation.id;
  if reservation.transfer_ticket_key is distinct from normalized_key then
    perform public.event_append_audit(reservation.id, p_operation, case when reservation.origin = 'public' then 'anonymous' else 'admin' end, auth.uid(), p_event_request_id, p_event_request_id, jsonb_build_object('transfer_ticket_key', normalized_key));
  end if;
end;
$$;

create function public.create_event_reservation_public(
  p_request_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text,
  p_event_date text, p_items jsonb, p_payment_plan text, p_declared_payment_amount numeric,
  p_declared_payment_method text, p_declared_payment_reference text,
  p_transfer_ticket_url text, p_transfer_ticket_key text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.create_event_reservation_public(
    p_request_id, p_customer_name, p_customer_phone, p_customer_email, p_event_date,
    p_items, p_payment_plan, p_declared_payment_amount, p_declared_payment_method,
    p_declared_payment_reference
  );
  perform public.event_set_transfer_ticket(
    (select reservation.id from public.event_reservations as reservation where reservation.request_id = p_request_id),
    p_request_id, p_declared_payment_method, p_transfer_ticket_url, p_transfer_ticket_key,
    'reservation.ticket_attached'
  );
  return query select * from public.event_reservation_projection((select reservation.id from public.event_reservations as reservation where reservation.request_id = p_request_id));
end;
$$;

create function public.create_event_reservation_admin(
  p_request_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text,
  p_event_date text, p_items jsonb, p_payment_plan text, p_declared_payment_amount numeric,
  p_declared_payment_method text, p_declared_payment_reference text, p_origin text,
  p_transfer_ticket_url text, p_transfer_ticket_key text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  perform public.create_event_reservation_admin(
    p_request_id, p_customer_name, p_customer_phone, p_customer_email, p_event_date,
    p_items, p_payment_plan, p_declared_payment_amount, p_declared_payment_method,
    p_declared_payment_reference, p_origin
  );
  perform public.event_set_transfer_ticket(
    (select reservation.id from public.event_reservations as reservation where reservation.request_id = p_request_id),
    p_request_id, p_declared_payment_method, p_transfer_ticket_url, p_transfer_ticket_key,
    'reservation.ticket_attached'
  );
  return query select * from public.event_reservation_projection((select reservation.id from public.event_reservations as reservation where reservation.request_id = p_request_id));
end;
$$;

create function public.reserve_event_reservation(
  p_request_id uuid, p_reservation_id uuid, p_payment_amount numeric,
  p_payment_method text, p_payment_reference text, p_payment_note text,
  p_transfer_ticket_url text, p_transfer_ticket_key text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  event_request_id uuid;
begin
  if p_transfer_ticket_key is not null or p_transfer_ticket_url is not null then
    select reservation.request_id into event_request_id
    from public.event_reservations as reservation
    where reservation.id = p_reservation_id;
    if event_request_id is null then raise exception 'event reservation not found'; end if;
    if lower(btrim(coalesce(p_payment_method, ''))) <> 'transfer' then raise exception 'event transfer ticket requires a transfer payment'; end if;
    if p_transfer_ticket_key is null or p_transfer_ticket_url is null then raise exception 'event transfer ticket URL and key must be provided together'; end if;
    if length(btrim(p_transfer_ticket_url)) > 4096 or length(btrim(p_transfer_ticket_key)) > 512 then raise exception 'event transfer ticket is too long'; end if;
    if btrim(p_transfer_ticket_key) !~ ('^events/' || event_request_id::text || '/[A-Za-z0-9._-]+$') or btrim(p_transfer_ticket_key) like '%..%' then raise exception 'event transfer ticket key does not belong to this event request'; end if;
  end if;

  perform public.reserve_event_reservation(
    p_request_id, p_reservation_id, p_payment_amount, p_payment_method,
    p_payment_reference, p_payment_note
  );
  if event_request_id is not null then
    perform public.event_set_transfer_ticket(
      p_reservation_id, event_request_id, p_payment_method,
      p_transfer_ticket_url, p_transfer_ticket_key, 'reservation.ticket_attached'
    );
  end if;
  return query select * from public.event_reservation_projection(p_reservation_id);
end;
$$;

revoke all on function public.event_reservation_snapshot(uuid),
  public.event_reservation_projection(uuid),
  public.event_set_transfer_ticket(uuid, uuid, text, text, text, text)
from public, anon, authenticated;

revoke all on function public.create_event_reservation_public(uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text),
  public.get_event_availability(date), public.get_event_reservation_public(uuid)
from public, anon, authenticated;
grant execute on function public.create_event_reservation_public(uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text),
  public.get_event_availability(date), public.get_event_reservation_public(uuid)
to anon, authenticated;

revoke all on function public.create_event_reservation_admin(uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text, text),
  public.list_event_reservations(boolean), public.mark_event_reservation_seen(uuid, uuid),
  public.reserve_event_reservation(uuid, uuid, numeric, text, text, text, text, text),
  public.cancel_event_reservation(uuid, uuid, text),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text),
  public.get_event_configuration(), public.set_event_capacity(uuid, integer)
from public, anon, authenticated;
grant execute on function public.create_event_reservation_admin(uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text, text),
  public.list_event_reservations(boolean), public.mark_event_reservation_seen(uuid, uuid),
  public.reserve_event_reservation(uuid, uuid, numeric, text, text, text, text, text),
  public.cancel_event_reservation(uuid, uuid, text),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text),
  public.get_event_configuration(), public.set_event_capacity(uuid, integer)
to authenticated;
