create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint product_categories_name_length check (length(name) <= 120),
  constraint product_categories_normalized_name_not_blank check (length(normalized_name) > 0),
  constraint product_categories_normalized_name_length check (length(normalized_name) <= 120),
  constraint product_categories_normalized_name_key unique (normalized_name)
);

create function public.canonicalize_product_category_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.name is null then
    raise exception 'Category name is required';
  end if;

  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.name = '' then
    raise exception 'Category name is required';
  end if;
  if length(new.name) > 120 then
    raise exception 'Category name cannot exceed 120 characters';
  end if;

  new.normalized_name := lower(new.name);
  return new;
end;
$$;

create trigger product_categories_canonicalize_name
before insert or update on public.product_categories
for each row execute function public.canonicalize_product_category_name();

create trigger product_categories_updated_at
before update on public.product_categories
for each row execute function system.update_updated_at();

alter table public.product_categories enable row level security;

create policy product_categories_catalog_select on public.product_categories
for select to authenticated
using (public.has_capability('catalog.manage'));

create policy product_categories_catalog_insert on public.product_categories
for insert to authenticated
with check (public.has_capability('catalog.manage'));

create policy product_categories_catalog_update on public.product_categories
for update to authenticated
using (public.has_capability('catalog.manage'))
with check (public.has_capability('catalog.manage'));

create policy product_categories_catalog_delete on public.product_categories
for delete to authenticated
using (public.has_capability('catalog.manage'));

revoke all on public.product_categories from anon, authenticated;
grant select on public.product_categories to authenticated;
grant insert (name) on public.product_categories to authenticated;
grant update (name) on public.product_categories to authenticated;
grant delete on public.product_categories to authenticated;

alter table public.products add column category_id uuid;

insert into public.product_categories(name)
select distinct btrim(regexp_replace(category, '\s+', ' ', 'g'))
from public.products
where category is not null and btrim(category) <> ''
on conflict (normalized_name) do nothing;

update public.products p
set category_id = c.id
from public.product_categories c
where c.normalized_name = lower(btrim(regexp_replace(p.category, '\s+', ' ', 'g')));

do $$
begin
  if exists (select 1 from public.products where category_id is null) then
    raise exception 'Product category backfill left products without a category';
  end if;
end;
$$;

alter table public.products
  add constraint products_category_id_fkey foreign key (category_id)
  references public.product_categories(id) on delete restrict;

alter table public.products alter column category_id set not null;
create index products_category_id_idx on public.products(category_id);

revoke insert (category) on public.products from authenticated;
revoke update (category) on public.products from authenticated;
alter table public.products drop constraint if exists products_category_not_blank;
alter table public.products drop column category;

grant insert (
  name,
  sku,
  category_id,
  retail_price_mxn,
  wholesale_price_mxn,
  active,
  tags,
  image_key,
  image_url
)
on public.products to authenticated;

grant update (
  name,
  sku,
  category_id,
  retail_price_mxn,
  wholesale_price_mxn,
  active,
  tags,
  image_key,
  image_url
)
on public.products to authenticated;
