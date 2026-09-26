-- Public wholesale catalog projection. It intentionally excludes image keys and
-- every admin-only product field while keeping the existing POS contract intact.

create function public.list_public_wholesale_catalog()
returns table(
  product_id uuid,
  product_name text,
  category_id uuid,
  category_name text,
  retail_price_mxn numeric,
  wholesale_price_mxn numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    product.id,
    product.name,
    category.id,
    category.name,
    product.retail_price_mxn,
    product.wholesale_price_mxn
  from public.products as product
  join public.product_categories as category on category.id = product.category_id
  where product.active
  order by category.name, product.name, product.id
$$;

revoke all on function public.list_public_wholesale_catalog() from public, anon, authenticated;
grant execute on function public.list_public_wholesale_catalog() to anon, authenticated;
