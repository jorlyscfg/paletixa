alter table public.products
  drop constraint if exists products_wholesale_price_positive,
  drop constraint if exists products_wholesale_price_non_negative;

alter table public.products
  add constraint products_wholesale_price_non_negative check (wholesale_price_mxn >= 0);
