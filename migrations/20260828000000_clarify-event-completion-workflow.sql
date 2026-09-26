-- Make Event completion authoritative for the database date and daily cart
-- allocation while retaining nullable legacy payment-reference storage.

alter table public.event_reservations
  add column cart_allocated boolean not null default false,
  add column remaining_transfer_ticket_url text,
  add column remaining_transfer_ticket_key text;

update public.event_reservations
set cart_allocated = true
where status in ('reserved', 'completed');

alter table public.event_reservations
  add constraint event_reservations_cart_allocated_status_check
    check (not cart_allocated or status in ('reserved', 'completed')),
  add constraint event_reservations_remaining_transfer_ticket_pair_check
    check ((remaining_transfer_ticket_url is null) = (remaining_transfer_ticket_key is null)),
  add constraint event_reservations_remaining_transfer_ticket_url_check
    check (remaining_transfer_ticket_url is null or length(btrim(remaining_transfer_ticket_url)) between 1 and 4096),
  add constraint event_reservations_remaining_transfer_ticket_key_check
    check (
      remaining_transfer_ticket_key is null
      or (
        length(remaining_transfer_ticket_key) between 1 and 512
        and remaining_transfer_ticket_key ~ ('^events/' || request_id::text || '/[A-Za-z0-9._-]+$')
        and remaining_transfer_ticket_key not like '%..%'
      )
    ),
  add constraint event_reservations_remaining_transfer_ticket_method_check
    check (remaining_transfer_ticket_key is null or remaining_payment_method = 'transfer');

create index event_reservations_allocated_date_status_idx
  on public.event_reservations(event_date, status)
  where status in ('reserved', 'completed') and cart_allocated = true;

alter type public.event_reservation_projection_row_v2 add attribute cart_allocated boolean;

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
      'cart_allocated', reservation.cart_allocated,
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
      'remaining_transfer_ticket_url', reservation.remaining_transfer_ticket_url,
      'remaining_transfer_ticket_key', reservation.remaining_transfer_ticket_key,
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

-- The public projection keeps the historical composite shape but no longer
-- returns the legacy remaining-payment reference or the private final receipt.
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
    reservation.remaining_payment_method, null::text, reservation.remaining_payment_note,
    reservation.reserved_at, reservation.reserved_by, reservation.completed_at,
    reservation.cancelled_at, reservation.cancelled_by, reservation.cancellation_reason,
    reservation.sale_id, reservation.created_by, reservation.created_at,
    reservation.updated_at, reservation.admin_seen_at, reservation.admin_seen_by,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'line_kind', item.line_kind, 'product_id', item.product_id,
      'category_id', item.category_id, 'category_name', item.category_name,
      'product_name', item.product_name, 'unit_price_mxn', item.unit_price_mxn,
      'quantity', item.quantity, 'line_total_mxn', item.line_total_mxn
    ) order by item.id) from public.event_reservation_items as item where item.reservation_id = reservation.id), '[]'::jsonb),
    reservation.transfer_ticket_url, reservation.transfer_ticket_key,
    reservation.cart_allocated
  from public.event_reservations as reservation
  where reservation.id = p_reservation_id
$$;

create type public.event_reservation_admin_projection_row_v3 as (
  reservation_id uuid,
  request_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  event_date date,
  status text,
  origin text,
  payment_plan text,
  total_mxn numeric,
  declared_payment_amount numeric,
  declared_payment_method text,
  declared_payment_reference text,
  confirmed_payment_amount numeric,
  confirmed_payment_method text,
  confirmed_payment_reference text,
  confirmed_payment_note text,
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid,
  remaining_payment_amount numeric,
  remaining_payment_method text,
  remaining_payment_note text,
  reserved_at timestamptz,
  reserved_by uuid,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  sale_id uuid,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  admin_seen_at timestamptz,
  admin_seen_by uuid,
  items jsonb,
  transfer_ticket_url text,
  transfer_ticket_key text,
  cart_allocated boolean,
  remaining_transfer_ticket_url text,
  remaining_transfer_ticket_key text
);

create or replace function public.event_reservation_admin_projection(p_reservation_id uuid)
returns setof public.event_reservation_admin_projection_row_v3
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
    reservation.remaining_payment_method, reservation.remaining_payment_note,
    reservation.reserved_at, reservation.reserved_by, reservation.completed_at,
    reservation.cancelled_at, reservation.cancelled_by, reservation.cancellation_reason,
    reservation.sale_id, reservation.created_by, reservation.created_at,
    reservation.updated_at, reservation.admin_seen_at, reservation.admin_seen_by,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'line_kind', item.line_kind, 'product_id', item.product_id,
      'category_id', item.category_id, 'category_name', item.category_name,
      'product_name', item.product_name, 'unit_price_mxn', item.unit_price_mxn,
      'quantity', item.quantity, 'line_total_mxn', item.line_total_mxn
    ) order by item.id) from public.event_reservation_items as item where item.reservation_id = reservation.id), '[]'::jsonb),
    reservation.transfer_ticket_url, reservation.transfer_ticket_key,
    reservation.cart_allocated, reservation.remaining_transfer_ticket_url,
    reservation.remaining_transfer_ticket_key
  from public.event_reservations as reservation
  where reservation.id = p_reservation_id
$$;

create or replace function public.get_event_availability(p_event_date date)
returns table(event_date date, capacity_limit integer, allocated_count bigint, available_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  limit_count integer := public.event_capacity_limit();
  allocated bigint;
begin
  if p_event_date is null then raise exception 'event date is required'; end if;
  select count(*) into allocated
  from public.event_reservations as reservation
  where reservation.event_date = p_event_date
    and reservation.status in ('reserved', 'completed')
    and reservation.cart_allocated = true;
  return query select p_event_date, limit_count, allocated, greatest(limit_count - allocated::integer, 0);
end;
$$;

-- Keep the historical implementation name private, but make its capacity and
-- state updates honor the server-maintained allocation flag.
create or replace function public.reserve_event_reservation_legacy(
  p_request_id uuid, p_reservation_id uuid, p_payment_amount numeric,
  p_payment_method text, p_payment_reference text, p_payment_note text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  reservation public.event_reservations%rowtype;
  normalized_method text := lower(btrim(coalesce(p_payment_method, '')));
  normalized_reference text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  normalized_note text := nullif(btrim(coalesce(p_payment_note, '')), '');
  payload_hash text;
  allocated bigint;
  limit_count integer;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation identifiers are required'; end if;
  if p_payment_amount is null or p_payment_amount <= 0 then raise exception 'confirmed payment amount must be positive'; end if;
  if normalized_method not in ('cash', 'transfer') then raise exception 'confirmed payment method is invalid'; end if;
  if normalized_reference is not null and length(normalized_reference) > 160 then raise exception 'payment reference is too long'; end if;
  if normalized_note is not null and length(normalized_note) > 500 then raise exception 'payment note is too long'; end if;
  payload_hash := encode(public.digest(convert_to('reserve|' || p_reservation_id::text || '|' || round(p_payment_amount, 2)::text || '|' || normalized_method || '|' || coalesce(normalized_reference, '') || '|' || coalesce(normalized_note, ''), 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-reservation:' || p_reservation_id::text, 0));
  if public.event_reservation_mutation_replayed(p_request_id, 'reserve', p_reservation_id, payload_hash) then
    return query select * from public.event_reservation_projection(p_reservation_id);
    return;
  end if;
  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.status <> 'pending' then raise exception 'only pending reservations can be reserved'; end if;
  if reservation.payment_plan = 'full' and round(p_payment_amount, 2) <> reservation.total_mxn then raise exception 'full payment must cover the reservation total'; end if;
  if reservation.payment_plan = 'advance' and round(p_payment_amount, 2) >= reservation.total_mxn then raise exception 'advance payment must be less than the reservation total'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || reservation.event_date::text, 0));
  limit_count := public.event_capacity_limit();
  select count(*) into allocated
  from public.event_reservations as current_reservation
  where current_reservation.event_date = reservation.event_date
    and current_reservation.status in ('reserved', 'completed')
    and current_reservation.cart_allocated = true;
  if allocated >= limit_count then raise exception 'event date is at capacity'; end if;
  insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash)
  values (p_request_id, 'reserve', reservation.id, payload_hash);
  update public.event_reservations
  set status = 'reserved', cart_allocated = true,
      confirmed_payment_amount = round(p_payment_amount, 2), confirmed_payment_method = normalized_method,
      confirmed_payment_reference = normalized_reference, confirmed_payment_note = normalized_note,
      payment_confirmed_at = now(), payment_confirmed_by = actor,
      remaining_payment_amount = round(total_mxn - p_payment_amount, 2),
      reserved_at = now(), reserved_by = actor, updated_at = now()
  where id = reservation.id
  returning * into reservation;
  perform public.event_append_audit(reservation.id, 'reservation.reserved', 'admin', actor, p_request_id, p_request_id, jsonb_build_object(
    'capacity_limit', limit_count, 'allocated_before', allocated, 'allocated_after', allocated + 1,
    'cart_allocated', true, 'payment_amount', reservation.confirmed_payment_amount,
    'payment_method', reservation.confirmed_payment_method
  ));
  return query select * from public.event_reservation_projection(reservation.id);
end;
$$;

drop function if exists public.list_event_reservations(boolean);
create function public.list_event_reservations(p_include_cancelled boolean default true)
returns setof public.event_reservation_admin_projection_row_v3
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  return query
  select projection.*
  from public.event_reservations as reservation
  cross join lateral public.event_reservation_admin_projection(reservation.id) as projection
  where p_include_cancelled or reservation.status <> 'cancelled'
  order by reservation.created_at desc, reservation.id desc;
end;
$$;

drop function if exists public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text);
create function public.complete_event_reservation(
  p_request_id uuid,
  p_reservation_id uuid,
  p_reason text,
  p_remaining_payment_amount numeric,
  p_remaining_payment_method text,
  p_remaining_payment_note text,
  p_remaining_transfer_ticket_url text,
  p_remaining_transfer_ticket_key text,
  p_confirm_date_change boolean,
  p_allow_without_cart boolean
)
returns setof public.event_reservation_admin_projection_row_v3
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  reservation public.event_reservations%rowtype;
  original_date date;
  actual_date date := current_date;
  before_snapshot jsonb;
  made_sale_id uuid;
  balance numeric;
  final_amount numeric := round(coalesce(p_remaining_payment_amount, 0), 2);
  final_method text := nullif(lower(btrim(coalesce(p_remaining_payment_method, ''))), '');
  final_note text := nullif(btrim(coalesce(p_remaining_payment_note, '')), '');
  final_ticket_url text := nullif(btrim(coalesce(p_remaining_transfer_ticket_url, '')), '');
  final_ticket_key text := nullif(btrim(coalesce(p_remaining_transfer_ticket_key, '')), '');
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  payload_hash text;
  target_allocated bigint := null;
  limit_count integer := public.event_capacity_limit();
  available_count integer := null;
  capacity_result text := 'same_date_existing_allocation';
  date_changed boolean;
  cart_allocated_after boolean;
  no_cart_override boolean := false;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation completion identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  if p_confirm_date_change is null or p_allow_without_cart is null then raise exception 'completion date confirmations are required'; end if;
  if (final_ticket_url is null) <> (final_ticket_key is null) then raise exception 'remaining transfer ticket URL and key must be provided together'; end if;
  if final_ticket_url is not null and (length(final_ticket_url) > 4096 or length(final_ticket_key) > 512) then raise exception 'remaining transfer ticket is too long'; end if;
  if final_ticket_key is not null and (final_ticket_key !~ ('^events/' || p_request_id::text || '/[A-Za-z0-9._-]+$') or final_ticket_key like '%..%') then raise exception 'remaining transfer ticket key does not belong to this event request'; end if;
  if final_ticket_key is not null and final_method <> 'transfer' then raise exception 'remaining transfer ticket requires a transfer payment'; end if;

  payload_hash := encode(public.digest(convert_to(
    'complete|' || p_reservation_id::text || '|' || final_amount::text || '|' || coalesce(final_method, '') || '|' || coalesce(final_note, '') || '|' || coalesce(final_ticket_key, '') || '|' || p_confirm_date_change::text || '|' || p_allow_without_cart::text || '|' || normalized_reason,
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-reservation:' || p_reservation_id::text, 0));
  if public.event_reservation_mutation_replayed(p_request_id, 'complete', p_reservation_id, payload_hash) then
    return query select * from public.event_reservation_admin_projection(p_reservation_id);
    return;
  end if;

  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.status <> 'reserved' then raise exception 'only reserved reservations can be completed'; end if;
  original_date := reservation.event_date;
  date_changed := original_date <> actual_date;

  if not date_changed then
    if p_confirm_date_change or p_allow_without_cart then raise exception 'date change confirmations must be false for the reserved date'; end if;
    if not reservation.cart_allocated then raise exception 'reserved event has no cart allocation'; end if;
    cart_allocated_after := true;
  else
    if not p_confirm_date_change then raise exception 'event reservation date change requires confirmation'; end if;

    -- Lock both capacity keys in deterministic order so the target check and
    -- date move remain atomic with concurrent reserve/complete operations.
    if original_date < actual_date then
      perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || original_date::text, 0));
      perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || actual_date::text, 0));
    else
      perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || actual_date::text, 0));
      perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || original_date::text, 0));
    end if;

    select count(*) into target_allocated
    from public.event_reservations as current_reservation
    where current_reservation.event_date = actual_date
      and current_reservation.status in ('reserved', 'completed')
      and current_reservation.cart_allocated = true;
    available_count := greatest(limit_count - target_allocated::integer, 0);
    if available_count > 0 then
      if p_allow_without_cart then raise exception 'event date has cart capacity; no-cart override is not allowed'; end if;
      capacity_result := 'available';
      cart_allocated_after := true;
    else
      capacity_result := 'full';
      if not p_allow_without_cart then raise exception 'event date is at capacity; confirm completion without a cart'; end if;
      cart_allocated_after := false;
      no_cart_override := true;
    end if;
  end if;

  balance := reservation.remaining_payment_amount;
  if balance > 0 then
    if final_amount <> balance then raise exception 'remaining payment must equal the outstanding balance'; end if;
    if final_method not in ('cash', 'transfer') then raise exception 'remaining payment method is required'; end if;
    if final_note is not null and length(final_note) > 500 then raise exception 'remaining payment note is too long'; end if;
  elsif final_amount <> 0 or final_method is not null or final_ticket_key is not null then
    raise exception 'a fully paid reservation cannot receive a remaining payment';
  elsif final_note is not null and length(final_note) > 500 then
    raise exception 'remaining payment note is too long';
  end if;

  before_snapshot := public.event_reservation_snapshot(reservation.id);
  insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash)
  values (p_request_id, 'complete', reservation.id, payload_hash);

  -- Move the reservation before creating the sale so both the sale context and
  -- the direct-event-sale guard observe the authoritative actual date.
  update public.event_reservations
  set event_date = actual_date,
      cart_allocated = cart_allocated_after,
      updated_at = now()
  where id = reservation.id
  returning * into reservation;

  insert into public.sales(created_by, request_id, channel, total_mxn, payload_hash, business_context)
  values (
    actor, p_request_id, 'event', reservation.total_mxn, payload_hash,
    jsonb_build_object(
      'event_reservation_id', reservation.id,
      'original_event_date', original_date,
      'actual_event_date', actual_date,
      'event_date', actual_date,
      'date_changed', date_changed,
      'date_change_confirmed', p_confirm_date_change,
      'capacity_result', capacity_result,
      'capacity_limit', limit_count,
      'allocated_before', target_allocated,
      'available_count', available_count,
      'cart_allocated', cart_allocated_after,
      'no_cart_override', no_cart_override,
      'customer_name', reservation.customer_name,
      'phone', reservation.customer_phone,
      'customer_email', reservation.customer_email,
      'payment_plan', reservation.payment_plan,
      'initial_payment_amount', reservation.confirmed_payment_amount,
      'initial_payment_method', reservation.confirmed_payment_method,
      'remaining_payment_amount', final_amount,
      'remaining_payment_method', final_method,
      'remaining_transfer_ticket_key', final_ticket_key,
      'total_mxn', reservation.total_mxn
    )
  ) returning id into made_sale_id;

  insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn)
  select made_sale_id, item.line_kind, item.product_id, item.category_id, item.category_name, item.product_name, item.unit_price_mxn, item.quantity, item.line_total_mxn
  from public.event_reservation_items as item where item.reservation_id = reservation.id;

  update public.event_reservations
  set status = 'completed', completed_at = now(), sale_id = made_sale_id,
      final_payment_amount = final_amount, remaining_payment_amount = 0,
      remaining_payment_method = final_method, remaining_payment_reference = null,
      remaining_payment_note = final_note,
      remaining_transfer_ticket_url = final_ticket_url,
      remaining_transfer_ticket_key = final_ticket_key,
      updated_at = now()
  where id = reservation.id
  returning * into reservation;

  perform public.event_append_audit(reservation.id, 'reservation.completed', 'admin', actor, p_request_id, p_request_id, jsonb_build_object(
    'sale_id', made_sale_id,
    'original_event_date', original_date,
    'actual_event_date', actual_date,
    'date_changed', date_changed,
    'date_change_confirmed', p_confirm_date_change,
    'capacity_result', capacity_result,
    'capacity_limit', limit_count,
    'allocated_before', target_allocated,
    'available_count', available_count,
    'cart_allocated', cart_allocated_after,
    'no_cart_override', no_cart_override,
    'remaining_transfer_ticket_key', final_ticket_key,
    'full_total', reservation.total_mxn,
    'remaining_payment_amount', final_amount,
    'remaining_payment_method', final_method,
    'reason', normalized_reason,
    'before', before_snapshot
  ));
  return query select * from public.event_reservation_admin_projection(reservation.id);
end;
$$;

revoke all on function public.event_reservation_admin_projection(uuid),
  public.reserve_event_reservation_legacy(uuid, uuid, numeric, text, text, text),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text, text, boolean, boolean)
from public, anon, authenticated;

revoke all on function public.list_event_reservations(boolean)
from public, anon, authenticated;

grant execute on function public.list_event_reservations(boolean),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text, text, boolean, boolean)
to authenticated;
