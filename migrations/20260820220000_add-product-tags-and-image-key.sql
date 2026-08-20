ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_key text;

GRANT INSERT (
  name,
  sku,
  category,
  retail_price_mxn,
  wholesale_price_mxn,
  active,
  tags,
  image_key,
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
  tags,
  image_key,
  image_url
)
ON public.products TO authenticated;
