create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null,
  category text not null,
  retail_price_mxn numeric(12,2) not null,
  wholesale_price_mxn numeric(12,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_sku_not_blank check (length(btrim(sku)) > 0),
  constraint products_category_not_blank check (length(btrim(category)) > 0),
  constraint products_retail_price_non_negative check (retail_price_mxn >= 0),
  constraint products_wholesale_price_non_negative check (wholesale_price_mxn >= 0)
);

create unique index products_normalized_sku_key on public.products(lower(btrim(sku)));
create index products_active_name_idx on public.products(active, name);

insert into public.capabilities(key) values ('catalog.manage') on conflict do nothing;
insert into public.role_capabilities(role_id, capability_id)
select r.id, c.id
from public.roles r, public.capabilities c
where r.key = 'admin' and c.key = 'catalog.manage'
on conflict do nothing;

create trigger products_updated_at
before update on public.products
for each row execute function system.update_updated_at();

alter table public.products enable row level security;

create policy products_catalog_select on public.products
for select to authenticated
using (public.has_capability('catalog.manage'));

create policy products_catalog_insert on public.products
for insert to authenticated
with check (public.has_capability('catalog.manage'));

create policy products_catalog_update on public.products
for update to authenticated
using (public.has_capability('catalog.manage'))
with check (public.has_capability('catalog.manage'));

revoke all on public.products from anon, authenticated;
grant select on public.products to authenticated;
grant insert (name, sku, category, retail_price_mxn, wholesale_price_mxn, active)
on public.products to authenticated;
grant update (name, sku, category, retail_price_mxn, wholesale_price_mxn, active)
on public.products to authenticated;
