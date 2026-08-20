ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

GRANT INSERT (
  name,
  sku,
  category,
  retail_price_mxn,
  wholesale_price_mxn,
  active,
  image_url
)
ON public.products TO authenticated;

GRANT UPDATE (
  name,
  sku,
  category,
  retail_price_mxn,
  wholesale_price_mxn,
  active,
  image_url
)
ON public.products TO authenticated;
