create or replace function public.can_use_pos()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.has_capability('pos.use')
    and public.get_cashier_branch_id() is not null
$$;

revoke all on function public.can_use_pos() from public, anon, authenticated;
grant execute on function public.can_use_pos() to authenticated;

drop policy products_pos_active_select on public.products;
create policy products_pos_active_select on public.products
for select to authenticated
using (public.can_use_pos() and active);

drop policy product_categories_pos_select on public.product_categories;
create policy product_categories_pos_select on public.product_categories
for select to authenticated
using (public.can_use_pos());
