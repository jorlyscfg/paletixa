-- Recreate the applied wholesale item preparation function without changing
-- the already-applied category-line migration or any POS behavior.

create or replace function public.prepare_wholesale_order_items(p_items jsonb)
returns table(normalized_items jsonb, total_mxn numeric)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  item jsonb;
  line_kind text;
  product public.products%rowtype;
  category public.product_categories%rowtype;
  product_id uuid;
  target_category_id uuid;
  quantity integer;
  category_quantity integer;
  unit_price numeric;
  line_total numeric;
  category_product_count integer;
  category_retail_invalid_count integer;
  category_wholesale_invalid_count integer;
  category_retail_min numeric;
  category_retail_max numeric;
  category_wholesale_min numeric;
  category_wholesale_max numeric;
  calculated_total numeric := 0;
  prepared_items jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one wholesale order item is required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as elements(value)
    group by coalesce(value->>'line_kind', 'product'), coalesce(value->>'product_id', value->>'category_id')
    having count(*) > 1
  ) then
    raise exception 'duplicate wholesale order line';
  end if;

  for item in select value from jsonb_array_elements(p_items) as elements(value) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'wholesale order items must be objects';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(item) as keys(key)
      where keys.key not in ('line_kind', 'product_id', 'category_id', 'quantity')
    ) then
      raise exception 'wholesale order item contains unknown fields';
    end if;

    line_kind := coalesce(nullif(btrim(item->>'line_kind'), ''), 'product');
    if line_kind not in ('product', 'category') or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]*$' then
      raise exception 'wholesale order items require a valid line kind and positive integer quantity';
    end if;
    quantity := (item->>'quantity')::integer;

    if line_kind = 'product' then
      if jsonb_typeof(item->'product_id') <> 'string' or btrim(coalesce(item->>'product_id', '')) = '' then
        raise exception 'product ID is required';
      end if;
      product_id := (item->>'product_id')::uuid;
      select catalog_product.* into product
      from public.products as catalog_product
      where catalog_product.id = product_id and catalog_product.active
      for share;
       if not found then
         raise exception 'product not found or inactive';
       end if;
       select coalesce(sum((value->>'quantity')::integer), 0)
       into category_quantity
       from jsonb_array_elements(p_items) as elements(value)
       where coalesce(value->>'line_kind', 'product') = 'product'
         and (value->>'product_id')::uuid in (
           select category_product.id
           from public.products as category_product
           where category_product.category_id = product.category_id
         );
       select category_quantity + coalesce(sum((value->>'quantity')::integer), 0)
       into category_quantity
       from jsonb_array_elements(p_items) as elements(value)
       where coalesce(value->>'line_kind', 'product') = 'category'
         and (value->>'category_id')::uuid = product.category_id;
       unit_price := public.wholesale_unit_price_for_quantity(product.retail_price_mxn, product.wholesale_price_mxn, category_quantity);
      line_total := round(unit_price * quantity, 2);
      calculated_total := calculated_total + line_total;
      prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
        'line_kind', 'product',
        'product_id', product.id,
        'category_id', product.category_id,
        'category_name', null,
        'product_name', product.name,
        'unit_price_mxn', unit_price,
        'quantity', quantity,
        'line_total_mxn', line_total
      ));
    else
      if jsonb_typeof(item->'category_id') <> 'string' or btrim(coalesce(item->>'category_id', '')) = '' then
        raise exception 'category ID is required';
      end if;
      target_category_id := (item->>'category_id')::uuid;
      select category_row.* into category
      from public.product_categories as category_row
      where category_row.id = target_category_id;
      if not found then
        raise exception 'category not found';
      end if;
      select
        count(*)::integer,
        count(*) filter (where category_product.retail_price_mxn is null or category_product.retail_price_mxn <= 0)::integer,
        count(*) filter (where category_product.wholesale_price_mxn is null or category_product.wholesale_price_mxn <= 0)::integer,
        min(category_product.retail_price_mxn),
        max(category_product.retail_price_mxn),
        min(category_product.wholesale_price_mxn),
        max(category_product.wholesale_price_mxn)
      into category_product_count, category_retail_invalid_count, category_wholesale_invalid_count,
        category_retail_min, category_retail_max, category_wholesale_min, category_wholesale_max
      from public.products as category_product
      where category_product.category_id = target_category_id and category_product.active;
      if category_product_count = 0 then
        raise exception 'category has no active products';
      end if;
      if category_retail_invalid_count > 0 or category_retail_min is null or category_retail_max is null or category_retail_min <> category_retail_max then
        raise exception 'category price is ambiguous; active products must share the same positive retail price';
      end if;
      select coalesce(sum((value->>'quantity')::integer), 0)
      into category_quantity
      from jsonb_array_elements(p_items) as elements(value)
      where coalesce(value->>'line_kind', 'product') = 'category'
        and (value->>'category_id')::uuid = target_category_id;
      select category_quantity + coalesce(sum((value->>'quantity')::integer), 0)
      into category_quantity
      from jsonb_array_elements(p_items) as elements(value)
      where coalesce(value->>'line_kind', 'product') = 'product'
        and (value->>'product_id')::uuid in (
          select category_product.id
          from public.products as category_product
          where category_product.category_id = target_category_id
        );
      unit_price := case
        when category_quantity >= 10
          and category_wholesale_invalid_count = 0
          and category_wholesale_min is not null
          and category_wholesale_max is not null
          and category_wholesale_min = category_wholesale_max
          then category_wholesale_min
        else category_retail_min
      end;
      line_total := round(unit_price * quantity, 2);
      calculated_total := calculated_total + line_total;
      prepared_items := prepared_items || jsonb_build_array(jsonb_build_object(
        'line_kind', 'category',
        'product_id', null,
        'category_id', category.id,
        'category_name', category.name,
        'product_name', category.name,
        'unit_price_mxn', unit_price,
        'quantity', quantity,
        'line_total_mxn', line_total
      ));
    end if;
  end loop;

  return query select prepared_items, round(calculated_total, 2);
end;
$$;
