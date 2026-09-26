-- Extend the global sales receipt configuration without changing its owner or access boundary.

alter table public.sales_receipt_configuration
  add column if not exists company_phone text,
  add column if not exists company_email text,
  add column if not exists show_company_phone boolean not null default true,
  add column if not exists show_company_email boolean not null default true,
  add column if not exists show_customer_url boolean not null default true;

alter table public.sales_receipt_configuration_receipts
  add column if not exists result_company_phone text,
  add column if not exists result_company_email text,
  add column if not exists result_show_company_phone boolean not null default true,
  add column if not exists result_show_company_email boolean not null default true,
  add column if not exists result_show_customer_url boolean not null default true;

alter table public.sales_receipt_configuration_audit
  add column if not exists before_company_phone text,
  add column if not exists after_company_phone text,
  add column if not exists before_company_email text,
  add column if not exists after_company_email text,
  add column if not exists before_show_company_phone boolean not null default true,
  add column if not exists after_show_company_phone boolean not null default true,
  add column if not exists before_show_company_email boolean not null default true,
  add column if not exists after_show_company_email boolean not null default true,
  add column if not exists before_show_customer_url boolean not null default true,
  add column if not exists after_show_customer_url boolean not null default true;

-- Keep legacy writers and readers callable. Legacy writes leave the new fields as-is
-- and record their current values in the append-only receipt and audit rows.
create or replace function public.set_sales_receipt_configuration(
  p_request_id uuid,
  p_logo_key text,
  p_show_logo boolean,
  p_show_branch boolean,
  p_show_cashier boolean,
  p_show_customer boolean,
  p_show_payment_method boolean
)
returns table(
  logo_key text,
  show_logo boolean,
  show_branch boolean,
  show_cashier boolean,
  show_customer boolean,
  show_payment_method boolean,
  owner_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_logo_key text := nullif(btrim(p_logo_key), '');
  payload_hash text;
  existing_receipt public.sales_receipt_configuration_receipts%rowtype;
  configuration public.sales_receipt_configuration%rowtype;
  changed_at timestamptz;
begin
  if not public.has_capability('configuration.manage') then
    raise exception 'access denied';
  end if;
  if p_request_id is null then raise exception 'request ID is required'; end if;
  if normalized_logo_key is not null and (
    length(normalized_logo_key) > 512
    or normalized_logo_key !~ '^receipts/[A-Za-z0-9._-]+$'
    or normalized_logo_key like '%..%'
  ) then raise exception 'sales receipt logo key is invalid'; end if;
  if p_show_logo is null or p_show_branch is null or p_show_cashier is null
    or p_show_customer is null or p_show_payment_method is null then
    raise exception 'sales receipt visibility values are required';
  end if;

  payload_hash := encode(public.digest(convert_to(
    'set-sales-receipt-configuration|' || coalesce(normalized_logo_key, '') || '|' ||
    p_show_logo::text || '|' || p_show_branch::text || '|' || p_show_cashier::text || '|' ||
    p_show_customer::text || '|' || p_show_payment_method::text,
    'utf8'
  ), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('sales-receipt-configuration:' || p_request_id::text, 0));
  select * into existing_receipt
  from public.sales_receipt_configuration_receipts as receipt
  where receipt.request_id = p_request_id
  for update;
  if found then
    if existing_receipt.actor_id is distinct from actor or existing_receipt.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query select existing_receipt.result_logo_key, existing_receipt.result_show_logo,
      existing_receipt.result_show_branch, existing_receipt.result_show_cashier,
      existing_receipt.result_show_customer, existing_receipt.result_show_payment_method,
      existing_receipt.result_owner_id, existing_receipt.result_updated_at;
    return;
  end if;

  select * into configuration
  from public.sales_receipt_configuration
  where singleton
  for update;
  if not found then raise exception 'sales receipt configuration is unavailable'; end if;
  changed_at := now();

  insert into public.sales_receipt_configuration_receipts(
    request_id, actor_id, payload_hash, result_logo_key, result_show_logo,
    result_show_branch, result_show_cashier, result_show_customer,
    result_show_payment_method, result_company_phone, result_company_email,
    result_show_company_phone, result_show_company_email, result_show_customer_url,
    result_owner_id, result_updated_at
  ) values (
    p_request_id, actor, payload_hash, normalized_logo_key, p_show_logo,
    p_show_branch, p_show_cashier, p_show_customer, p_show_payment_method,
    configuration.company_phone, configuration.company_email, configuration.show_company_phone,
    configuration.show_company_email, configuration.show_customer_url,
    configuration.owner_id, changed_at
  );

  update public.sales_receipt_configuration
  set logo_key = normalized_logo_key,
      show_logo = p_show_logo,
      show_branch = p_show_branch,
      show_cashier = p_show_cashier,
      show_customer = p_show_customer,
      show_payment_method = p_show_payment_method,
      updated_by = actor,
      updated_at = changed_at
  where singleton;

  insert into public.sales_receipt_configuration_audit(
    actor_id, request_id, payload_hash, before_logo_key, after_logo_key,
    before_show_logo, after_show_logo, before_show_branch, after_show_branch,
    before_show_cashier, after_show_cashier, before_show_customer, after_show_customer,
    before_show_payment_method, after_show_payment_method, before_company_phone,
    after_company_phone, before_company_email, after_company_email, before_show_company_phone,
    after_show_company_phone,
    before_show_company_email, after_show_company_email, before_show_customer_url,
    after_show_customer_url
  ) values (
    actor, p_request_id, payload_hash, configuration.logo_key, normalized_logo_key,
    configuration.show_logo, p_show_logo, configuration.show_branch, p_show_branch,
    configuration.show_cashier, p_show_cashier, configuration.show_customer, p_show_customer,
    configuration.show_payment_method, p_show_payment_method, configuration.company_phone,
    configuration.company_phone, configuration.company_email, configuration.company_email,
    configuration.show_company_phone,
    configuration.show_company_phone, configuration.show_company_email, configuration.show_company_email,
    configuration.show_customer_url, configuration.show_customer_url
  );

  return query select normalized_logo_key, p_show_logo, p_show_branch, p_show_cashier,
    p_show_customer, p_show_payment_method, configuration.owner_id, changed_at;
end
$$;

-- New callers use the additive overload so the legacy RPC contract remains available.
create function public.set_sales_receipt_configuration(
  p_request_id uuid,
  p_logo_key text,
  p_show_logo boolean,
  p_show_branch boolean,
  p_show_cashier boolean,
  p_show_customer boolean,
  p_show_payment_method boolean,
  p_company_phone text,
  p_company_email text,
  p_show_company_phone boolean,
  p_show_company_email boolean,
  p_show_customer_url boolean
)
returns table(
  logo_key text,
  show_logo boolean,
  show_branch boolean,
  show_cashier boolean,
  show_customer boolean,
  show_payment_method boolean,
  company_phone text,
  company_email text,
  show_company_phone boolean,
  show_company_email boolean,
  show_customer_url boolean,
  owner_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_logo_key text := nullif(btrim(p_logo_key), '');
  normalized_company_phone text := nullif(btrim(coalesce(p_company_phone, '')), '');
  normalized_company_email text := nullif(btrim(coalesce(p_company_email, '')), '');
  payload_hash text;
  existing_receipt public.sales_receipt_configuration_receipts%rowtype;
  configuration public.sales_receipt_configuration%rowtype;
  changed_at timestamptz;
begin
  if not public.has_capability('configuration.manage') then
    raise exception 'access denied';
  end if;
  if p_request_id is null then raise exception 'request ID is required'; end if;
  if normalized_logo_key is not null and (
    length(normalized_logo_key) > 512
    or normalized_logo_key !~ '^receipts/[A-Za-z0-9._-]+$'
    or normalized_logo_key like '%..%'
  ) then raise exception 'sales receipt logo key is invalid'; end if;
  if normalized_company_phone is not null and length(normalized_company_phone) > 128 then
    raise exception 'sales receipt company phone is invalid';
  end if;
  if normalized_company_email is not null and length(normalized_company_email) > 320 then
    raise exception 'sales receipt company email is invalid';
  end if;
  if p_show_logo is null or p_show_branch is null or p_show_cashier is null
    or p_show_customer is null or p_show_payment_method is null
    or p_show_company_phone is null or p_show_company_email is null
    or p_show_customer_url is null then
    raise exception 'sales receipt visibility values are required';
  end if;

  payload_hash := encode(public.digest(convert_to(
    'set-sales-receipt-configuration-v2|' || coalesce(normalized_logo_key, '') || '|' ||
    p_show_logo::text || '|' || p_show_branch::text || '|' || p_show_cashier::text || '|' ||
    p_show_customer::text || '|' || p_show_payment_method::text || '|' ||
    coalesce(normalized_company_phone, '') || '|' || coalesce(normalized_company_email, '') || '|' ||
    p_show_company_phone::text || '|' || p_show_company_email::text || '|' ||
    p_show_customer_url::text,
    'utf8'
  ), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('sales-receipt-configuration:' || p_request_id::text, 0));
  select * into existing_receipt
  from public.sales_receipt_configuration_receipts as receipt
  where receipt.request_id = p_request_id
  for update;
  if found then
    if existing_receipt.actor_id is distinct from actor or existing_receipt.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query select existing_receipt.result_logo_key, existing_receipt.result_show_logo,
      existing_receipt.result_show_branch, existing_receipt.result_show_cashier,
      existing_receipt.result_show_customer, existing_receipt.result_show_payment_method,
      existing_receipt.result_company_phone, existing_receipt.result_company_email,
      existing_receipt.result_show_company_phone, existing_receipt.result_show_company_email,
      existing_receipt.result_show_customer_url,
      existing_receipt.result_owner_id, existing_receipt.result_updated_at;
    return;
  end if;

  select * into configuration
  from public.sales_receipt_configuration
  where singleton
  for update;
  if not found then raise exception 'sales receipt configuration is unavailable'; end if;
  changed_at := now();

  insert into public.sales_receipt_configuration_receipts(
    request_id, actor_id, payload_hash, result_logo_key, result_show_logo,
    result_show_branch, result_show_cashier, result_show_customer,
    result_show_payment_method, result_company_phone, result_company_email,
    result_show_company_phone, result_show_company_email, result_show_customer_url,
    result_owner_id, result_updated_at
  ) values (
    p_request_id, actor, payload_hash, normalized_logo_key, p_show_logo,
    p_show_branch, p_show_cashier, p_show_customer, p_show_payment_method,
    normalized_company_phone, normalized_company_email, p_show_company_phone,
    p_show_company_email, p_show_customer_url,
    configuration.owner_id, changed_at
  );

  update public.sales_receipt_configuration
  set logo_key = normalized_logo_key,
      company_phone = normalized_company_phone,
      company_email = normalized_company_email,
      show_logo = p_show_logo,
      show_branch = p_show_branch,
      show_cashier = p_show_cashier,
      show_customer = p_show_customer,
      show_payment_method = p_show_payment_method,
      show_company_phone = p_show_company_phone,
      show_company_email = p_show_company_email,
      show_customer_url = p_show_customer_url,
      updated_by = actor,
      updated_at = changed_at
  where singleton;

  insert into public.sales_receipt_configuration_audit(
    actor_id, request_id, payload_hash, before_logo_key, after_logo_key,
    before_show_logo, after_show_logo, before_show_branch, after_show_branch,
    before_show_cashier, after_show_cashier, before_show_customer, after_show_customer,
    before_show_payment_method, after_show_payment_method, before_company_phone,
    after_company_phone, before_company_email, after_company_email, before_show_company_phone,
    after_show_company_phone,
    before_show_company_email, after_show_company_email, before_show_customer_url,
    after_show_customer_url
  ) values (
    actor, p_request_id, payload_hash, configuration.logo_key, normalized_logo_key,
    configuration.show_logo, p_show_logo, configuration.show_branch, p_show_branch,
    configuration.show_cashier, p_show_cashier, configuration.show_customer, p_show_customer,
    configuration.show_payment_method, p_show_payment_method, configuration.company_phone,
    normalized_company_phone, configuration.company_email, normalized_company_email,
    configuration.show_company_phone,
    p_show_company_phone, configuration.show_company_email, p_show_company_email,
    configuration.show_customer_url, p_show_customer_url
  );

  return query select normalized_logo_key, p_show_logo, p_show_branch, p_show_cashier,
    p_show_customer, p_show_payment_method, normalized_company_phone,
    normalized_company_email, p_show_company_phone,
    p_show_company_email, p_show_customer_url, configuration.owner_id, changed_at;
end
$$;

-- The read response is an additive superset; existing name-based readers can
-- continue consuming the original fields while new readers get contact data.
drop function if exists public.get_sales_receipt_configuration();
create function public.get_sales_receipt_configuration()
returns table(
  logo_key text,
  show_logo boolean,
  show_branch boolean,
  show_cashier boolean,
  show_customer boolean,
  show_payment_method boolean,
  company_phone text,
  company_email text,
  show_company_phone boolean,
  show_company_email boolean,
  show_customer_url boolean,
  owner_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.sales_receipt_configuration_read_allowed() then
    raise exception 'access denied';
  end if;
  return query
  select configuration.logo_key, configuration.show_logo, configuration.show_branch,
    configuration.show_cashier, configuration.show_customer, configuration.show_payment_method,
    configuration.company_phone, configuration.company_email, configuration.show_company_phone,
    configuration.show_company_email,
    configuration.show_customer_url, configuration.owner_id, configuration.updated_at
  from public.sales_receipt_configuration as configuration
  where configuration.singleton;
end
$$;

revoke all on function public.sales_receipt_configuration_append_only_guard(),
  public.sales_receipt_configuration_read_allowed(),
  public.get_sales_receipt_configuration(),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean, text, text, boolean, boolean, boolean)
from public, anon, authenticated;

grant execute on function public.get_sales_receipt_configuration(),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean, text, text, boolean, boolean, boolean)
to authenticated;
