-- Keep one public RPC signature for each Event mutation while retaining the
-- original implementations behind non-executable internal names.

alter function public.create_event_reservation_public(
  uuid, text, text, text, text, jsonb, text, numeric, text, text
) rename to create_event_reservation_public_legacy;

alter function public.create_event_reservation_admin(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text
) rename to create_event_reservation_admin_legacy;

alter function public.reserve_event_reservation(
  uuid, uuid, numeric, text, text, text
) rename to reserve_event_reservation_legacy;

revoke all on function public.create_event_reservation_public_legacy(
  uuid, text, text, text, text, jsonb, text, numeric, text, text
), public.create_event_reservation_admin_legacy(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text
), public.reserve_event_reservation_legacy(
  uuid, uuid, numeric, text, text, text
) from public, anon, authenticated;

create or replace function public.create_event_reservation_public(
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
  perform public.create_event_reservation_public_legacy(
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

create or replace function public.create_event_reservation_admin(
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
  perform public.create_event_reservation_admin_legacy(
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

create or replace function public.reserve_event_reservation(
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

  perform public.reserve_event_reservation_legacy(
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

revoke all on function public.create_event_reservation_public(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text
), public.create_event_reservation_admin(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text, text
), public.reserve_event_reservation(
  uuid, uuid, numeric, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_event_reservation_public(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text
) to anon, authenticated;

grant execute on function public.create_event_reservation_admin(
  uuid, text, text, text, text, jsonb, text, numeric, text, text, text, text, text
), public.reserve_event_reservation(
  uuid, uuid, numeric, text, text, text, text, text
) to authenticated;
