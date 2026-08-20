create or replace function public.normalize_catalog_text(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when cleaned.value = '' then ''
    else upper(left(cleaned.value, 1)) || substr(cleaned.value, 2)
  end
  from (
    select lower(btrim(regexp_replace(value, '\s+', ' ', 'g'))) as value
  ) cleaned;
$$;

create or replace function public.canonicalize_product_category_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.name is null then
    raise exception 'Category name is required';
  end if;

  new.name := public.normalize_catalog_text(new.name);
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

create or replace function public.canonicalize_product_tag_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.name is null then
    raise exception 'Tag name is required';
  end if;

  new.name := public.normalize_catalog_text(new.name);
  if new.name = '' then
    raise exception 'Tag name is required';
  end if;
  if length(new.name) > 48 then
    raise exception 'Tag name cannot exceed 48 characters';
  end if;

  new.normalized_name := lower(new.name);
  return new;
end;
$$;

create or replace function public.normalize_product_text()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.name is null then
    raise exception 'Product name is required';
  end if;
  if new.sku is null then
    raise exception 'SKU is required';
  end if;

  new.name := public.normalize_catalog_text(new.name);
  new.sku := public.normalize_catalog_text(new.sku);

  if new.name = '' then
    raise exception 'Product name is required';
  end if;
  if new.sku = '' then
    raise exception 'SKU is required';
  end if;

  return new;
end;
$$;

create trigger products_normalize_text
before insert or update of name, sku on public.products
for each row execute function public.normalize_product_text();
