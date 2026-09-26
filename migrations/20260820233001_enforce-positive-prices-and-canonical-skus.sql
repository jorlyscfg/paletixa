alter table public.products
  drop constraint if exists products_retail_price_non_negative,
  drop constraint if exists products_wholesale_price_non_negative;

do $$
begin
  if exists (
    select 1
    from public.products
    where retail_price_mxn <= 0 or wholesale_price_mxn <= 0
  ) then
    raise exception 'Cannot enforce positive product prices while invalid rows exist';
  end if;
end;
$$;

alter table public.products
  add constraint products_retail_price_positive check (retail_price_mxn > 0),
  add constraint products_wholesale_price_positive check (wholesale_price_mxn > 0);

create or replace function public.normalize_catalog_sku(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, pg_temp
as $$
  select regexp_replace(
    left(
      regexp_replace(
        regexp_replace(
          translate(
            upper(btrim(regexp_replace(value, '\s+', ' ', 'g'))),
            'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
            'AAAAAACEEEEIIIINOOOOOUUUUY'
          ),
          '[^A-Z0-9]+',
          '-',
          'g'
        ),
        '(^-+|-+$)',
        '',
        'g'
      ),
      80
    ),
    '-+$',
    '',
    'g'
  );
$$;

drop trigger if exists products_normalize_text on public.products;
drop index if exists public.products_normalized_sku_key;

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
  new.sku := public.normalize_catalog_sku(new.sku);

  if new.name = '' then
    raise exception 'Product name is required';
  end if;
  if new.sku = '' then
    raise exception 'SKU is required';
  end if;

  return new;
end;
$$;

create temp table catalog_sku_backfill_used (sku text primary key) on commit drop;

do $$
declare
  product record;
  base_sku text;
  candidate_sku text;
  suffix integer;
  suffix_text text;
begin
  for product in
    select id, sku, name
    from public.products
    order by id
  loop
    base_sku := coalesce(nullif(public.normalize_catalog_sku(product.sku), ''), nullif(public.normalize_catalog_sku(product.name), ''), 'SKU');
    candidate_sku := base_sku;
    suffix := 1;

    while exists (select 1 from pg_temp.catalog_sku_backfill_used where sku = candidate_sku) loop
      suffix := suffix + 1;
      suffix_text := case when suffix < 100 then lpad(suffix::text, 2, '0') else suffix::text end;
      candidate_sku := regexp_replace(left(base_sku, 80 - length(suffix_text) - 1), '-+$', '', 'g') || '-' || suffix_text;
    end loop;

    insert into pg_temp.catalog_sku_backfill_used(sku) values (candidate_sku);
    update public.products set sku = candidate_sku where id = product.id;
  end loop;
end;
$$;

create trigger products_normalize_text
before insert or update of name, sku on public.products
for each row execute function public.normalize_product_text();

alter table public.products
  add constraint products_sku_length check (length(sku) <= 80);

create unique index products_normalized_sku_key on public.products(lower(btrim(sku)));
