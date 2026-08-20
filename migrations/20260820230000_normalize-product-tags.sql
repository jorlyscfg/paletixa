create table public.product_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_tags_name_not_blank check (length(btrim(name)) > 0),
  constraint product_tags_name_length check (length(name) <= 48),
  constraint product_tags_normalized_name_not_blank check (length(btrim(normalized_name)) > 0),
  constraint product_tags_normalized_name_length check (length(normalized_name) <= 48),
  constraint product_tags_normalized_name_key unique (normalized_name)
);

create function public.canonicalize_product_tag_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.name is null then
    raise exception 'Tag name is required';
  end if;

  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
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

create trigger product_tags_canonicalize_name
before insert or update on public.product_tags
for each row execute function public.canonicalize_product_tag_name();

create trigger product_tags_updated_at
before update on public.product_tags
for each row execute function system.update_updated_at();

create table public.product_tag_assignments (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.product_tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create index product_tag_assignments_tag_id_idx on public.product_tag_assignments(tag_id);

-- Preserve valid legacy values before removing the array column. Values that
-- cannot satisfy the new catalog constraints are intentionally skipped.
insert into public.product_tags(name)
select distinct canonical.name
from public.products p
cross join lateral (
  select btrim(regexp_replace(raw_tag, '\s+', ' ', 'g')) as name
  from unnest(coalesce(p.tags, '{}'::text[])) as legacy(raw_tag)
) canonical
where canonical.name <> ''
  and length(canonical.name) <= 48
on conflict (normalized_name) do nothing;

insert into public.product_tag_assignments(product_id, tag_id)
select distinct p.id, t.id
from public.products p
cross join lateral (
  select btrim(regexp_replace(raw_tag, '\s+', ' ', 'g')) as name
  from unnest(coalesce(p.tags, '{}'::text[])) as legacy(raw_tag)
) canonical
join public.product_tags t on t.normalized_name = lower(canonical.name)
where canonical.name <> ''
  and length(canonical.name) <= 48
on conflict (product_id, tag_id) do nothing;

alter table public.products drop column tags;

alter table public.product_tags enable row level security;
alter table public.product_tag_assignments enable row level security;

create policy product_tags_catalog_select on public.product_tags
for select to authenticated
using (public.has_capability('catalog.manage'));

create policy product_tag_assignments_catalog_select on public.product_tag_assignments
for select to authenticated
using (public.has_capability('catalog.manage'));

revoke all on public.product_tags from anon, authenticated;
revoke all on public.product_tag_assignments from anon, authenticated;
grant select on public.product_tags to authenticated;
grant select on public.product_tag_assignments to authenticated;

create function public.sync_product_tags(p_product_id uuid, p_tags jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  canonical_tags jsonb;
begin
  if not public.has_capability('catalog.manage') then
    raise exception 'Catalog management capability is required';
  end if;
  if p_product_id is null or not exists (
    select 1 from public.products where id = p_product_id
  ) then
    raise exception 'Product not found';
  end if;
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' then
    raise exception 'Tags must be a JSON array';
  end if;
  if jsonb_array_length(p_tags) > 20 then
    raise exception 'Tags cannot contain more than 20 tags';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_tags) as tag_items(item)
    where jsonb_typeof(tag_items.item) <> 'string'
  ) then
    raise exception 'Tags must contain only strings';
  end if;

  select coalesce(jsonb_agg(to_jsonb(normalized.name) order by normalized.normalized_name), '[]'::jsonb)
  into canonical_tags
  from (
    select distinct on (lower(cleaned.name))
      cleaned.name,
      lower(cleaned.name) as normalized_name
    from (
      select btrim(regexp_replace(value, '\s+', ' ', 'g')) as name
      from jsonb_array_elements_text(p_tags) as raw_tags(value)
    ) cleaned
    where cleaned.name <> ''
    order by lower(cleaned.name), cleaned.name
  ) normalized;

  if exists (
    select 1
    from jsonb_array_elements_text(canonical_tags) as canonical_values(value)
    where length(canonical_values.value) > 48
  ) then
    raise exception 'Tags cannot contain tags longer than 48 characters';
  end if;

  insert into public.product_tags(name)
  select value
  from jsonb_array_elements_text(canonical_tags) as canonical_values(value)
  on conflict (normalized_name) do update
    set name = public.product_tags.name;

  delete from public.product_tag_assignments
  where product_id = p_product_id;

  insert into public.product_tag_assignments(product_id, tag_id)
  select p_product_id, tags.id
  from public.product_tags tags
  join jsonb_array_elements_text(canonical_tags) as canonical_values(value)
    on tags.normalized_name = lower(canonical_values.value)
  on conflict (product_id, tag_id) do nothing;
end;
$$;

revoke all on function public.sync_product_tags(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_product_tags(uuid, jsonb) to authenticated;
