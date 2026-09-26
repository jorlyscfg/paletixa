-- The initial Event migration is already applied on dev. Keep its two nullable
-- columns only as legacy storage for any historical rows, but remove them from
-- the active reservation contract, projections, hashes, and sale context.

alter table public.event_reservations
  alter column event_name drop not null,
  alter column responsible_name drop not null;

alter table public.event_reservations
  drop constraint if exists event_reservations_event_name_check,
  drop constraint if exists event_reservations_responsible_name_check;

drop function if exists public.create_event_reservation_public(uuid, text, text, text, text, text, text, jsonb, text, numeric, text, text);
drop function if exists public.create_event_reservation_admin(uuid, text, text, text, text, text, text, jsonb, text, numeric, text, text, text);
drop function if exists public.get_event_reservation_public(uuid);
drop function if exists public.list_event_reservations(boolean);
drop function if exists public.mark_event_reservation_seen(uuid, uuid);
drop function if exists public.reserve_event_reservation(uuid, uuid, numeric, text, text, text);
drop function if exists public.cancel_event_reservation(uuid, uuid, text);
drop function if exists public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text);
drop function if exists public.event_reservation_projection(uuid);
drop function if exists public.create_event_reservation_internal(uuid, uuid, text, text, text, text, text, text, text, jsonb, text, numeric, text, text);

create type public.event_reservation_projection_row_v2 as (
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
  remaining_payment_reference text,
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
  items jsonb
);

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
    ) order by item.id) from public.event_reservation_items as item where item.reservation_id = reservation.id), '[]'::jsonb)
  from public.event_reservations as reservation
  where reservation.id = p_reservation_id
$$;

create or replace function public.create_event_reservation_internal(
  p_request_id uuid,
  p_actor uuid,
  p_origin text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_event_date text,
  p_items jsonb,
  p_payment_plan text,
  p_declared_payment_amount numeric,
  p_declared_payment_method text,
  p_declared_payment_reference text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  normalized_name text := btrim(regexp_replace(coalesce(p_customer_name, ''), '\s+', ' ', 'g'));
  normalized_phone text;
  normalized_email text := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  normalized_date date;
  normalized_plan text := lower(btrim(coalesce(p_payment_plan, '')));
  normalized_method text := lower(btrim(coalesce(p_declared_payment_method, '')));
  normalized_reference text := nullif(btrim(coalesce(p_declared_payment_reference, '')), '');
  prepared jsonb;
  total numeric;
  payload_hash text;
  existing public.event_reservations%rowtype;
  made public.event_reservations%rowtype;
begin
  if p_request_id is null then raise exception 'request ID is required'; end if;
  if p_origin not in ('public', 'whatsapp', 'phone', 'other') then raise exception 'reservation origin is invalid'; end if;
  if (p_origin = 'public' and p_actor is not null) or (p_origin <> 'public' and p_actor is null) then raise exception 'reservation origin actor is invalid'; end if;
  if normalized_name = '' or length(normalized_name) > 160 then raise exception 'customer name is invalid'; end if;
  normalized_phone := public.normalize_wholesale_mobile(p_customer_phone);
  if normalized_email is not null and (length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'customer email is invalid'; end if;
  if p_event_date is null or p_event_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'event date must be an ISO date'; end if;
  begin normalized_date := p_event_date::date; exception when others then raise exception 'event date must be an ISO date'; end;
  if to_char(normalized_date, 'YYYY-MM-DD') <> p_event_date or normalized_date < current_date then raise exception 'event date must be today or a future date'; end if;
  if normalized_plan not in ('advance', 'full') then raise exception 'event payment plan is invalid'; end if;
  if normalized_method not in ('cash', 'transfer') then raise exception 'declared payment method is invalid'; end if;
  if p_declared_payment_amount is null or p_declared_payment_amount <= 0 then raise exception 'declared payment amount must be positive'; end if;
  if normalized_reference is not null and length(normalized_reference) > 160 then raise exception 'declared payment reference is too long'; end if;

  select normalized_items, total_mxn into prepared, total from public.prepare_wholesale_order_items(p_items);
  if normalized_plan = 'full' and round(p_declared_payment_amount, 2) <> round(total, 2) then raise exception 'full payment must cover the reservation total'; end if;
  if normalized_plan = 'advance' and round(p_declared_payment_amount, 2) >= round(total, 2) then raise exception 'advance payment must be less than the reservation total'; end if;
  payload_hash := encode(public.digest(convert_to(
    'create-event-reservation|' || coalesce(p_actor::text, 'anonymous') || '|' || p_origin || '|' || normalized_name || '|' || normalized_phone || '|' || coalesce(normalized_email, '') || '|' || p_event_date || '|' || prepared::text || '|' || normalized_plan || '|' || round(p_declared_payment_amount, 2)::text || '|' || normalized_method || '|' || coalesce(normalized_reference, ''),
    'utf8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-create:' || p_request_id::text, 0));
  select * into existing from public.event_reservations where request_id = p_request_id for update;
  if found then
    if existing.payload_hash is distinct from payload_hash then raise exception 'request conflict'; end if;
    return existing.id;
  end if;

  insert into public.event_reservations(
    request_id, created_by, origin, status, event_date,
    customer_name, customer_phone, customer_email, payment_plan, total_mxn,
    declared_payment_amount, declared_payment_method, declared_payment_reference, payload_hash
  ) values (
    p_request_id, p_actor, p_origin, 'pending', normalized_date,
    normalized_name, normalized_phone, normalized_email, normalized_plan, total,
    round(p_declared_payment_amount, 2), normalized_method, normalized_reference, payload_hash
  ) returning * into made;
  insert into public.event_reservation_items(
    reservation_id, line_kind, product_id, category_id, category_name, product_name,
    unit_price_mxn, quantity, line_total_mxn
  )
  select made.id, coalesce(item->>'line_kind', 'product'), (item->>'product_id')::uuid,
    (item->>'category_id')::uuid, item->>'category_name', item->>'product_name',
    (item->>'unit_price_mxn')::numeric, (item->>'quantity')::integer, (item->>'line_total_mxn')::numeric
  from jsonb_array_elements(prepared) as elements(item);
  perform public.event_append_audit(made.id, 'reservation.created', case when p_origin = 'public' then 'anonymous' else 'admin' end, p_actor, p_request_id, p_request_id, jsonb_build_object('origin', p_origin, 'status', 'pending'));
  return made.id;
end;
$$;

create function public.create_event_reservation_public(
  p_request_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text,
  p_event_date text, p_items jsonb, p_payment_plan text, p_declared_payment_amount numeric,
  p_declared_payment_method text, p_declared_payment_reference text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare reservation_id uuid;
begin
  reservation_id := public.create_event_reservation_internal(
    p_request_id, null, 'public', p_customer_name, p_customer_phone, p_customer_email,
    p_event_date, p_items, p_payment_plan, p_declared_payment_amount,
    p_declared_payment_method, p_declared_payment_reference
  );
  return query select * from public.event_reservation_projection(reservation_id);
end;
$$;

create function public.create_event_reservation_admin(
  p_request_id uuid, p_customer_name text, p_customer_phone text, p_customer_email text,
  p_event_date text, p_items jsonb, p_payment_plan text, p_declared_payment_amount numeric,
  p_declared_payment_method text, p_declared_payment_reference text, p_origin text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare reservation_id uuid; actor uuid := auth.uid();
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_origin = 'public' then raise exception 'admin reservations require an internal origin'; end if;
  reservation_id := public.create_event_reservation_internal(
    p_request_id, actor, lower(btrim(coalesce(p_origin, ''))), p_customer_name, p_customer_phone, p_customer_email,
    p_event_date, p_items, p_payment_plan, p_declared_payment_amount,
    p_declared_payment_method, p_declared_payment_reference
  );
  return query select * from public.event_reservation_projection(reservation_id);
end;
$$;

create function public.get_event_reservation_public(p_request_id uuid)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare reservation_id uuid;
begin
  select reservation.id into reservation_id from public.event_reservations as reservation where reservation.request_id = p_request_id;
  if reservation_id is null then raise exception 'event reservation not found'; end if;
  return query select * from public.event_reservation_projection(reservation_id);
end;
$$;

create function public.list_event_reservations(p_include_cancelled boolean default true)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  return query
  select projection.*
  from public.event_reservations as reservation
  cross join lateral public.event_reservation_projection(reservation.id) as projection
  where p_include_cancelled or reservation.status <> 'cancelled'
  order by reservation.created_at desc, reservation.id desc;
end;
$$;

create function public.mark_event_reservation_seen(p_request_id uuid, p_reservation_id uuid)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare actor uuid := auth.uid(); reservation public.event_reservations%rowtype; before_snapshot jsonb;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation seen identifiers are required'; end if;
  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  before_snapshot := public.event_reservation_snapshot(reservation.id);
  update public.event_reservations
  set admin_seen_at = coalesce(admin_seen_at, now()), admin_seen_by = coalesce(admin_seen_by, actor), updated_at = now()
  where id = reservation.id
  returning * into reservation;
  perform public.event_append_audit(reservation.id, 'reservation.seen', 'admin', actor, p_request_id, p_request_id, jsonb_build_object('admin_seen_at', reservation.admin_seen_at));
  return query select * from public.event_reservation_projection(reservation.id);
end;
$$;

create function public.reserve_event_reservation(
  p_request_id uuid, p_reservation_id uuid, p_payment_amount numeric,
  p_payment_method text, p_payment_reference text, p_payment_note text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid(); reservation public.event_reservations%rowtype; before_snapshot jsonb;
  normalized_method text := lower(btrim(coalesce(p_payment_method, '')));
  normalized_reference text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  normalized_note text := nullif(btrim(coalesce(p_payment_note, '')), '');
  payload_hash text; allocated bigint; limit_count integer;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation identifiers are required'; end if;
  if p_payment_amount is null or p_payment_amount <= 0 then raise exception 'confirmed payment amount must be positive'; end if;
  if normalized_method not in ('cash', 'transfer') then raise exception 'confirmed payment method is invalid'; end if;
  if normalized_reference is not null and length(normalized_reference) > 160 then raise exception 'payment reference is too long'; end if;
  if normalized_note is not null and length(normalized_note) > 500 then raise exception 'payment note is too long'; end if;
  payload_hash := encode(public.digest(convert_to('reserve|' || p_reservation_id::text || '|' || round(p_payment_amount, 2)::text || '|' || normalized_method || '|' || coalesce(normalized_reference, '') || '|' || coalesce(normalized_note, ''), 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-reservation:' || p_reservation_id::text, 0));
  if public.event_reservation_mutation_replayed(p_request_id, 'reserve', p_reservation_id, payload_hash) then return query select * from public.event_reservation_projection(p_reservation_id); return; end if;
  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.status <> 'pending' then raise exception 'only pending reservations can be reserved'; end if;
  if reservation.payment_plan = 'full' and round(p_payment_amount, 2) <> reservation.total_mxn then raise exception 'full payment must cover the reservation total'; end if;
  if reservation.payment_plan = 'advance' and round(p_payment_amount, 2) >= reservation.total_mxn then raise exception 'advance payment must be less than the reservation total'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || reservation.event_date::text, 0));
  limit_count := public.event_capacity_limit();
  select count(*) into allocated from public.event_reservations as current_reservation where current_reservation.event_date = reservation.event_date and current_reservation.status in ('reserved', 'completed');
  if allocated >= limit_count then raise exception 'event date is at capacity'; end if;
  before_snapshot := public.event_reservation_snapshot(reservation.id);
  insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash) values (p_request_id, 'reserve', reservation.id, payload_hash);
  update public.event_reservations
  set status = 'reserved', confirmed_payment_amount = round(p_payment_amount, 2), confirmed_payment_method = normalized_method,
      confirmed_payment_reference = normalized_reference, confirmed_payment_note = normalized_note,
      payment_confirmed_at = now(), payment_confirmed_by = actor, remaining_payment_amount = round(total_mxn - p_payment_amount, 2),
      reserved_at = now(), reserved_by = actor, updated_at = now()
  where id = reservation.id
  returning * into reservation;
  perform public.event_append_audit(reservation.id, 'reservation.reserved', 'admin', actor, p_request_id, p_request_id, jsonb_build_object('capacity_limit', limit_count, 'allocated_before', allocated, 'allocated_after', allocated + 1, 'payment_amount', reservation.confirmed_payment_amount, 'payment_method', reservation.confirmed_payment_method));
  return query select * from public.event_reservation_projection(reservation.id);
end;
$$;

create function public.cancel_event_reservation(p_request_id uuid, p_reservation_id uuid, p_reason text)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare actor uuid := auth.uid(); reservation public.event_reservations%rowtype; before_snapshot jsonb; normalized_reason text := nullif(btrim(coalesce(p_reason, '')), ''); payload_hash text;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation cancellation identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  payload_hash := encode(public.digest(convert_to('cancel|' || p_reservation_id::text || '|' || normalized_reason, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-reservation:' || p_reservation_id::text, 0));
  if public.event_reservation_mutation_replayed(p_request_id, 'cancel', p_reservation_id, payload_hash) then return query select * from public.event_reservation_projection(p_reservation_id); return; end if;
  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.status not in ('pending', 'reserved') then raise exception 'only pending or reserved reservations can be cancelled'; end if;
  if reservation.status = 'reserved' then perform pg_advisory_xact_lock(hashtextextended('event-capacity:' || reservation.event_date::text, 0)); end if;
  before_snapshot := public.event_reservation_snapshot(reservation.id);
  insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash) values (p_request_id, 'cancel', reservation.id, payload_hash);
  update public.event_reservations
  set status = 'cancelled', cancelled_at = now(), cancelled_by = actor, cancellation_reason = normalized_reason, updated_at = now()
  where id = reservation.id
  returning * into reservation;
  perform public.event_append_audit(reservation.id, 'reservation.cancelled', 'admin', actor, p_request_id, p_request_id, jsonb_build_object('reason', normalized_reason, 'capacity_released', before_snapshot->>'status' = 'reserved'));
  return query select * from public.event_reservation_projection(reservation.id);
end;
$$;

create function public.complete_event_reservation(
  p_request_id uuid, p_reservation_id uuid, p_reason text,
  p_remaining_payment_amount numeric, p_remaining_payment_method text,
  p_remaining_payment_reference text, p_remaining_payment_note text
)
returns setof public.event_reservation_projection_row_v2
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid(); reservation public.event_reservations%rowtype; before_snapshot jsonb; made_sale_id uuid;
  balance numeric; final_amount numeric := round(coalesce(p_remaining_payment_amount, 0), 2);
  final_method text := nullif(lower(btrim(coalesce(p_remaining_payment_method, ''))), '');
  final_reference text := nullif(btrim(coalesce(p_remaining_payment_reference, '')), '');
  final_note text := nullif(btrim(coalesce(p_remaining_payment_note, '')), '');
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), ''); payload_hash text;
begin
  if not public.event_admin_allowed() then raise exception 'access denied'; end if;
  if p_request_id is null or p_reservation_id is null then raise exception 'reservation completion identifiers are required'; end if;
  if normalized_reason is null or length(normalized_reason) > 500 then raise exception 'a reason is required'; end if;
  payload_hash := encode(public.digest(convert_to('complete|' || p_reservation_id::text || '|' || final_amount::text || '|' || coalesce(final_method, '') || '|' || coalesce(final_reference, '') || '|' || coalesce(final_note, '') || '|' || normalized_reason, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('event-reservation:' || p_reservation_id::text, 0));
  if public.event_reservation_mutation_replayed(p_request_id, 'complete', p_reservation_id, payload_hash) then return query select * from public.event_reservation_projection(p_reservation_id); return; end if;
  select * into reservation from public.event_reservations where id = p_reservation_id for update;
  if not found then raise exception 'event reservation not found'; end if;
  if reservation.status <> 'reserved' then raise exception 'only reserved reservations can be completed'; end if;
  if reservation.event_date <> current_date then raise exception 'event reservation can only be completed on its delivery date'; end if;
  balance := reservation.remaining_payment_amount;
  if balance > 0 then
    if final_amount <> balance then raise exception 'remaining payment must equal the outstanding balance'; end if;
    if final_method not in ('cash', 'transfer') then raise exception 'remaining payment method is required'; end if;
    if final_reference is not null and length(final_reference) > 160 then raise exception 'remaining payment reference is too long'; end if;
    if final_note is not null and length(final_note) > 500 then raise exception 'remaining payment note is too long'; end if;
  elsif final_amount <> 0 or final_method is not null or final_reference is not null then
    raise exception 'a fully paid reservation cannot receive a remaining payment';
  end if;
  before_snapshot := public.event_reservation_snapshot(reservation.id);
  insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash) values (p_request_id, 'complete', reservation.id, payload_hash);
  insert into public.sales(created_by, request_id, channel, total_mxn, payload_hash, business_context)
  values (
    actor, p_request_id, 'event', reservation.total_mxn, payload_hash,
    jsonb_build_object(
      'event_reservation_id', reservation.id, 'event_date', reservation.event_date,
      'customer_name', reservation.customer_name, 'phone', reservation.customer_phone,
      'customer_email', reservation.customer_email, 'payment_plan', reservation.payment_plan,
      'initial_payment_amount', reservation.confirmed_payment_amount,
      'initial_payment_method', reservation.confirmed_payment_method,
      'remaining_payment_amount', final_amount, 'remaining_payment_method', final_method,
      'total_mxn', reservation.total_mxn
    )
  ) returning id into made_sale_id;
  insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn)
  select made_sale_id, item.line_kind, item.product_id, item.category_id, item.category_name, item.product_name, item.unit_price_mxn, item.quantity, item.line_total_mxn
  from public.event_reservation_items as item where item.reservation_id = reservation.id;
  update public.event_reservations
  set status = 'completed', completed_at = now(), sale_id = made_sale_id, final_payment_amount = final_amount,
      remaining_payment_amount = 0, remaining_payment_method = final_method,
      remaining_payment_reference = final_reference, remaining_payment_note = final_note, updated_at = now()
  where id = reservation.id
  returning * into reservation;
  perform public.event_append_audit(reservation.id, 'reservation.completed', 'admin', actor, p_request_id, p_request_id, jsonb_build_object('sale_id', made_sale_id, 'full_total', reservation.total_mxn, 'remaining_payment_amount', final_amount, 'remaining_payment_method', final_method, 'reason', normalized_reason));
  return query select * from public.event_reservation_projection(reservation.id);
end;
$$;

create or replace function public.report_sales_detail(
  p_from timestamptz, p_to timestamptz, p_limit integer default 100
)
returns table(
  sale_id uuid, sale_date timestamptz, channel text, total_mxn numeric,
  product_name text, quantity integer, line_total_mxn numeric, context_label text,
  line_kind text, category_id uuid, category_name text,
  event_date date, contact_name text, contact_phone text, contact_email text,
  initial_payment_amount numeric, initial_payment_method text,
  final_payment_amount numeric, final_payment_method text, reservation_status text
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
      case sale.channel when 'event' then coalesce(nullif(btrim(sale.business_context ->> 'customer_name'), ''), reservation.customer_name) else nullif(btrim(sale.business_context ->> 'customer_name'), '') end as context_label,
      reservation.event_date, reservation.customer_name, reservation.customer_phone, reservation.customer_email,
      reservation.confirmed_payment_amount, reservation.confirmed_payment_method,
      reservation.final_payment_amount, reservation.remaining_payment_method, reservation.status
    from public.sales as sale
    left join public.event_reservations as reservation on reservation.sale_id = sale.id
    where sale.created_at >= p_from and sale.created_at < p_to
      and not exists (select 1 from public.sale_reversals as reversal where reversal.sale_id = sale.id)
    order by sale.created_at desc, sale.id desc
    limit p_limit
  )
  select selected_sales.id, selected_sales.created_at, selected_sales.channel, selected_sales.total_mxn,
    item.product_name, item.quantity, item.line_total_mxn, selected_sales.context_label,
    item.line_kind, item.category_id, item.category_name, selected_sales.event_date,
    selected_sales.customer_name, selected_sales.customer_phone, selected_sales.customer_email,
    selected_sales.confirmed_payment_amount, selected_sales.confirmed_payment_method,
    selected_sales.final_payment_amount, selected_sales.remaining_payment_method, selected_sales.status
  from selected_sales
  join public.sale_items as item on item.sale_id = selected_sales.id
  order by selected_sales.created_at desc, selected_sales.id desc, item.id;
end;
$$;

revoke all on function public.event_reservation_snapshot(uuid),
  public.event_reservation_projection(uuid),
  public.create_event_reservation_internal(uuid, uuid, text, text, text, text, text, jsonb, text, numeric, text, text)
from public, anon, authenticated;

revoke all on function public.create_event_reservation_public(uuid, text, text, text, text, jsonb, text, numeric, text, text),
  public.get_event_availability(date), public.get_event_reservation_public(uuid)
from public, anon, authenticated;
grant execute on function public.create_event_reservation_public(uuid, text, text, text, text, jsonb, text, numeric, text, text),
  public.get_event_availability(date), public.get_event_reservation_public(uuid)
to anon, authenticated;

revoke all on function public.create_event_reservation_admin(uuid, text, text, text, text, jsonb, text, numeric, text, text, text),
  public.list_event_reservations(boolean), public.mark_event_reservation_seen(uuid, uuid),
  public.reserve_event_reservation(uuid, uuid, numeric, text, text, text),
  public.cancel_event_reservation(uuid, uuid, text),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text),
  public.get_event_configuration(), public.set_event_capacity(uuid, integer)
from public, anon, authenticated;
grant execute on function public.create_event_reservation_admin(uuid, text, text, text, text, jsonb, text, numeric, text, text, text),
  public.list_event_reservations(boolean), public.mark_event_reservation_seen(uuid, uuid),
  public.reserve_event_reservation(uuid, uuid, numeric, text, text, text),
  public.cancel_event_reservation(uuid, uuid, text),
  public.complete_event_reservation(uuid, uuid, text, numeric, text, text, text),
  public.get_event_configuration(), public.set_event_capacity(uuid, integer)
to authenticated;

revoke execute on function public.report_sales_detail(timestamptz, timestamptz, integer)
from public, anon, authenticated;
grant execute on function public.report_sales_detail(timestamptz, timestamptz, integer) to authenticated;
