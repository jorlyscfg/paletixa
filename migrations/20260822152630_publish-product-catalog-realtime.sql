insert into realtime.channels (pattern, description, enabled)
values ('products', 'Product catalog changes for cashier workspaces', true)
on conflict (pattern) do update
set description = excluded.description,
    enabled = excluded.enabled;

create or replace function public.publish_product_catalog_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_table_name = 'product_tag_assignments' then
    if tg_op = 'DELETE' then
      perform realtime.publish(
        'products',
        'catalog_changed',
        jsonb_build_object(
          'table', tg_table_name,
          'operation', tg_op,
          'product_id', old.product_id::text,
          'tag_id', old.tag_id::text
        )
      );
    else
      perform realtime.publish(
        'products',
        'catalog_changed',
        jsonb_build_object(
          'table', tg_table_name,
          'operation', tg_op,
          'product_id', new.product_id::text,
          'tag_id', new.tag_id::text
        )
      );
    end if;
  elsif tg_op = 'DELETE' then
    perform realtime.publish(
      'products',
      'catalog_changed',
      jsonb_build_object(
        'table', tg_table_name,
        'operation', tg_op,
        'id', old.id::text
      )
    );
  else
    perform realtime.publish(
      'products',
      'catalog_changed',
      jsonb_build_object(
        'table', tg_table_name,
        'operation', tg_op,
        'id', new.id::text
      )
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists products_catalog_changed on public.products;
create trigger products_catalog_changed
after insert or update or delete on public.products
for each row execute function public.publish_product_catalog_changed();

drop trigger if exists product_categories_catalog_changed on public.product_categories;
create trigger product_categories_catalog_changed
after insert or update or delete on public.product_categories
for each row execute function public.publish_product_catalog_changed();

drop trigger if exists product_tags_catalog_changed on public.product_tags;
create trigger product_tags_catalog_changed
after insert or update or delete on public.product_tags
for each row execute function public.publish_product_catalog_changed();

drop trigger if exists product_tag_assignments_catalog_changed on public.product_tag_assignments;
create trigger product_tag_assignments_catalog_changed
after insert or update or delete on public.product_tag_assignments
for each row execute function public.publish_product_catalog_changed();
