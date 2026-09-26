create or replace function public.update_employee(
  p_user_id uuid,
  p_username text,
  p_display_name text,
  p_branch_id uuid
)
returns table(
  employee_user_id uuid,
  username text,
  display_name text,
  branch_id uuid,
  branch_name text,
  employee_status text,
  branch_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  normalized_username text := lower(btrim(p_username));
  normalized_display_name text := btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g'));
  target_employee public.employee_identities%rowtype;
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  if p_user_id is null then
    raise exception 'employee not found';
  end if;
  select * into target_employee
  from public.employee_identities
  where user_id = p_user_id;
  if not found then
    raise exception 'employee not found';
  end if;
  if normalized_username is null
    or normalized_username !~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$'
    or length(normalized_username) < 3
    or length(normalized_username) > 32 then
    raise exception 'invalid employee username';
  end if;
  if normalized_display_name = '' or length(normalized_display_name) > 120 then
    raise exception 'invalid employee display name';
  end if;
  if not exists (
    select 1 from public.branches where id = p_branch_id and status = 'active'
  ) then
    raise exception 'branch unavailable';
  end if;
  if exists (
    select 1 from public.employee_identities
    where lower(username) = normalized_username and user_id <> p_user_id
  ) or exists (
    select 1 from auth.users
    where lower(email) = normalized_username || '@employees.paletixa.internal' and id <> p_user_id
  ) then
    raise exception 'employee username already exists' using errcode = '23505';
  end if;

  update public.employee_identities
  set username = normalized_username,
      display_name = normalized_display_name,
      updated_at = now()
  where user_id = p_user_id;
  update public.employee_branch_assignments
  set branch_id = p_branch_id,
      updated_at = now()
  where user_id = p_user_id;
  if not found then
    raise exception 'employee branch assignment not found';
  end if;
  update auth.users
  set email = normalized_username || '@employees.paletixa.internal',
      profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('name', normalized_display_name),
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'employee auth user not found';
  end if;

  return query
  select employee.user_id, employee.username, employee.display_name,
    assignment.branch_id, branch.name, employee.status, branch.status
  from public.employee_identities employee
  join public.employee_branch_assignments assignment on assignment.user_id = employee.user_id
  join public.branches branch on branch.id = assignment.branch_id
  where employee.user_id = p_user_id;
end;
$$;

create or replace function public.set_employee_password(
  p_user_id uuid,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  if p_password is null or length(p_password) < 6 or length(p_password) > 128 then
    raise exception 'password must contain 6 to 128 characters';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.employee_identities where user_id = p_user_id
  ) then
    raise exception 'employee not found';
  end if;
  update auth.users
  set password = public.crypt(p_password, public.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'employee auth user not found';
  end if;
  return true;
end;
$$;

revoke execute on function public.update_employee(uuid, text, text, uuid),
  public.set_employee_password(uuid, text)
from public, anon, authenticated;
grant execute on function public.update_employee(uuid, text, text, uuid),
  public.set_employee_password(uuid, text)
to authenticated;
