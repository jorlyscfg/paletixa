-- Global sales receipt presentation settings and private logo references.

create table public.sales_receipt_configuration (
  singleton boolean primary key default true check (singleton),
  logo_key text,
  show_logo boolean not null default true,
  show_branch boolean not null default true,
  show_cashier boolean not null default true,
  show_customer boolean not null default true,
  show_payment_method boolean not null default true,
  owner_id uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint sales_receipt_configuration_logo_key_check check (
    logo_key is null
    or (length(logo_key) between 1 and 512 and logo_key ~ '^receipts/[A-Za-z0-9._-]+$' and logo_key not like '%..%')
  )
);

insert into public.sales_receipt_configuration(singleton, owner_id, updated_by)
select true, configuration.owner_id, configuration.updated_by
from public.event_configuration as configuration
where configuration.singleton
on conflict (singleton) do nothing;

do $$
begin
  if not exists (select 1 from public.sales_receipt_configuration where singleton) then
    raise exception 'cannot establish the global sales receipt configuration owner';
  end if;
end
$$;

create table public.sales_receipt_configuration_receipts (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  payload_hash text not null,
  result_logo_key text,
  result_show_logo boolean not null,
  result_show_branch boolean not null,
  result_show_cashier boolean not null,
  result_show_customer boolean not null,
  result_show_payment_method boolean not null,
  result_owner_id uuid not null references auth.users(id) on delete restrict,
  result_updated_at timestamptz not null,
  result_status text not null default 'created' check (result_status = 'created'),
  created_at timestamptz not null default now()
);

create table public.sales_receipt_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null references public.sales_receipt_configuration_receipts(request_id) on delete restrict,
  payload_hash text not null,
  before_logo_key text,
  after_logo_key text,
  before_show_logo boolean not null,
  after_show_logo boolean not null,
  before_show_branch boolean not null,
  after_show_branch boolean not null,
  before_show_cashier boolean not null,
  after_show_cashier boolean not null,
  before_show_customer boolean not null,
  after_show_customer boolean not null,
  before_show_payment_method boolean not null,
  after_show_payment_method boolean not null,
  created_at timestamptz not null default now(),
  unique (request_id)
);

create or replace function public.sales_receipt_configuration_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

create trigger sales_receipt_configuration_receipts_append_only
before update or delete on public.sales_receipt_configuration_receipts
for each row execute function public.sales_receipt_configuration_append_only_guard();

create trigger sales_receipt_configuration_audit_append_only
before update or delete on public.sales_receipt_configuration_audit
for each row execute function public.sales_receipt_configuration_append_only_guard();

create or replace function public.sales_receipt_configuration_read_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select auth.uid() is not null and (
    public.has_capability('configuration.manage')
    or public.has_capability('sales.record')
    or public.has_capability('pos.use')
  )
$$;

create or replace function public.get_sales_receipt_configuration()
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
begin
  if not public.sales_receipt_configuration_read_allowed() then
    raise exception 'access denied';
  end if;
  return query
  select configuration.logo_key, configuration.show_logo, configuration.show_branch,
    configuration.show_cashier, configuration.show_customer, configuration.show_payment_method,
    configuration.owner_id, configuration.updated_at
  from public.sales_receipt_configuration as configuration
  where configuration.singleton;
end
$$;

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
    result_show_payment_method, result_owner_id, result_updated_at
  ) values (
    p_request_id, actor, payload_hash, normalized_logo_key, p_show_logo,
    p_show_branch, p_show_cashier, p_show_customer, p_show_payment_method,
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
    before_show_payment_method, after_show_payment_method
  ) values (
    actor, p_request_id, payload_hash, configuration.logo_key, normalized_logo_key,
    configuration.show_logo, p_show_logo, configuration.show_branch, p_show_branch,
    configuration.show_cashier, p_show_cashier, configuration.show_customer, p_show_customer,
    configuration.show_payment_method, p_show_payment_method
  );

  return query select normalized_logo_key, p_show_logo, p_show_branch, p_show_cashier,
    p_show_customer, p_show_payment_method, configuration.owner_id, changed_at;
end
$$;

alter table public.sales_receipt_configuration enable row level security;
alter table public.sales_receipt_configuration_receipts enable row level security;
alter table public.sales_receipt_configuration_audit enable row level security;

revoke all on public.sales_receipt_configuration,
  public.sales_receipt_configuration_receipts,
  public.sales_receipt_configuration_audit
from public, anon, authenticated;

revoke all on function public.sales_receipt_configuration_append_only_guard(),
  public.sales_receipt_configuration_read_allowed(),
  public.get_sales_receipt_configuration(),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean)
from public, anon, authenticated;

grant execute on function public.get_sales_receipt_configuration(),
  public.set_sales_receipt_configuration(uuid, text, boolean, boolean, boolean, boolean, boolean)
to authenticated;
