create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true
);
create table public.roles (id uuid primary key default gen_random_uuid(), key text not null unique);
create table public.capabilities (id uuid primary key default gen_random_uuid(), key text not null unique);
create table public.role_capabilities (
  role_id uuid references public.roles(id) on delete cascade,
  capability_id uuid references public.capabilities(id) on delete cascade,
  primary key(role_id,capability_id)
);
create table public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  primary key(user_id,role_id)
);
create table public.branches (
  id uuid primary key default gen_random_uuid(), name text not null,
  status text not null default 'active' check(status in ('active','suspended')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index branches_normalized_name_key on public.branches(lower(btrim(name)));
create table public.bootstrap_receipt (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null references auth.users(id), change_ref text not null unique,
  created_at timestamptz not null default now()
);
create table public.branch_command_receipts (
  actor_id uuid not null references auth.users(id), request_id uuid not null,
  operation text not null, payload_hash text not null,
  branch_id uuid not null references public.branches(id), result_status text not null,
  created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
create index user_roles_user_id_idx on public.user_roles(user_id);

insert into public.roles(key) values ('admin') on conflict do nothing;
insert into public.capabilities(key) values ('branches.manage') on conflict do nothing;
insert into public.role_capabilities(role_id,capability_id)
select r.id,c.id from public.roles r,public.capabilities c
where r.key='admin' and c.key='branches.manage' on conflict do nothing;

create function public.has_capability(required text) returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select exists(
    select 1 from auth.users u join public.profiles p on p.user_id=u.id
    join public.user_roles ur on ur.user_id=u.id
    join public.role_capabilities rc on rc.role_id=ur.role_id
    join public.capabilities c on c.id=rc.capability_id
    where u.id=auth.uid() and p.is_active and c.key=required and
      case when to_jsonb(u) ? 'email_confirmed_at'
        then nullif(to_jsonb(u)->>'email_confirmed_at','') is not null
        else coalesce((to_jsonb(u)->>'email_verified')::boolean,false) end
  )
$$;

create function public.get_admin_context()
returns table(authorized boolean,capabilities text[]) language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
  select public.has_capability('branches.manage'),
    case when public.has_capability('branches.manage') then array['branches.manage']::text[] else '{}'::text[] end
$$;

create function public.bootstrap_first_admin(p_user_id uuid,p_change_ref text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare existing public.bootstrap_receipt%rowtype; admin_role uuid;
begin
  lock table public.bootstrap_receipt in exclusive mode;
  select * into existing from public.bootstrap_receipt limit 1;
  if found then
    if existing.change_ref=p_change_ref and existing.user_id=p_user_id then return true; end if;
    if existing.change_ref=p_change_ref then raise exception 'bootstrap conflict'; end if;
    raise exception 'bootstrap consumed';
  end if;
  if not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
    where u.id=p_user_id and p.is_active and
      case when to_jsonb(u) ? 'email_confirmed_at'
        then nullif(to_jsonb(u)->>'email_confirmed_at','') is not null
        else coalesce((to_jsonb(u)->>'email_verified')::boolean,false) end)
  then raise exception 'target is not eligible'; end if;
  select id into strict admin_role from public.roles where key='admin';
  insert into public.user_roles values(p_user_id,admin_role) on conflict do nothing;
  insert into public.bootstrap_receipt(user_id,change_ref) values(p_user_id,p_change_ref);
  return true;
end $$;

create function public.revoke_admin_access(p_user_id uuid) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
begin
  delete from public.user_roles ur using public.roles r
  where ur.role_id=r.id and r.key='admin' and ur.user_id=p_user_id;
  return found;
end $$;

create function public.reassign_admin_access(p_from uuid,p_to uuid) returns boolean language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare admin_role uuid;
begin
  if not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
    where u.id=p_to and p.is_active and
      case when to_jsonb(u) ? 'email_confirmed_at'
        then nullif(to_jsonb(u)->>'email_confirmed_at','') is not null
        else coalesce((to_jsonb(u)->>'email_verified')::boolean,false) end)
  then raise exception 'target is not eligible'; end if;
  select id into strict admin_role from public.roles where key='admin';
  delete from public.user_roles where user_id=p_from and role_id=admin_role;
  if not found then raise exception 'source is not admin'; end if;
  insert into public.user_roles values(p_to,admin_role) on conflict do nothing;
  return true;
end $$;

create function public.create_branch(p_request_id uuid,p_name text)
returns table(branch_id uuid,name text,result_status text) language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); normalized text:=btrim(regexp_replace(p_name,'\s+',' ','g'));
  hash text; receipt public.branch_command_receipts%rowtype; made public.branches%rowtype;
begin
  if not public.has_capability('branches.manage') then raise exception 'access denied'; end if;
  if normalized='' or length(normalized)>120 then raise exception 'invalid branch name'; end if;
  hash:=encode(public.digest(convert_to('create_branch|'||normalized,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
  select * into receipt from public.branch_command_receipts where actor_id=actor and request_id=p_request_id;
  if found then
    if receipt.operation<>'create_branch' or receipt.payload_hash<>hash then raise exception 'request conflict'; end if;
    return query select b.id,b.name,receipt.result_status from public.branches b where b.id=receipt.branch_id; return;
  end if;
  insert into public.branches(name) values(normalized) returning * into made;
  insert into public.branch_command_receipts values(actor,p_request_id,'create_branch',hash,made.id,made.status,now());
  return query select made.id,made.name,made.status;
end $$;

create function public.set_branch_status(p_request_id uuid,p_branch_id uuid,p_status text)
returns table(branch_id uuid,name text,result_status text) language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid(); wanted text:=lower(btrim(p_status)); hash text;
  receipt public.branch_command_receipts%rowtype; changed public.branches%rowtype;
begin
  if not public.has_capability('branches.manage') then raise exception 'access denied'; end if;
  if wanted not in ('active','suspended') then raise exception 'invalid status'; end if;
  hash:=encode(public.digest(convert_to('set_branch_status|'||p_branch_id::text||'|'||wanted,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
  select * into receipt from public.branch_command_receipts where actor_id=actor and request_id=p_request_id;
  if found then
    if receipt.operation<>'set_branch_status' or receipt.payload_hash<>hash then raise exception 'request conflict'; end if;
    return query select b.id,b.name,receipt.result_status from public.branches b where b.id=receipt.branch_id; return;
  end if;
  update public.branches set status=wanted,updated_at=case when status=wanted then updated_at else now() end
    where id=p_branch_id returning * into changed;
  if not found then raise exception 'branch not found'; end if;
  insert into public.branch_command_receipts values(actor,p_request_id,'set_branch_status',hash,changed.id,changed.status,now());
  return query select changed.id,changed.name,changed.status;
end $$;

create function public.assert_branch_active(p_branch_id uuid) returns void language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
begin
  if not exists(select 1 from public.branches where id=p_branch_id and status='active')
  then raise exception 'branch unavailable'; end if;
end $$;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.capabilities enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.user_roles enable row level security;
alter table public.branches enable row level security;
alter table public.bootstrap_receipt enable row level security;
alter table public.branch_command_receipts enable row level security;
create policy branches_capability_select on public.branches for select to authenticated
using(public.has_capability('branches.manage'));

revoke all on public.profiles,public.roles,public.capabilities,public.role_capabilities,public.user_roles,
  public.branches,public.bootstrap_receipt,public.branch_command_receipts from anon,authenticated;
grant select on public.branches to authenticated;
revoke execute on function public.has_capability(text),public.get_admin_context(),
  public.bootstrap_first_admin(uuid,text),public.revoke_admin_access(uuid),public.reassign_admin_access(uuid,uuid),
  public.create_branch(uuid,text),public.set_branch_status(uuid,uuid,text),public.assert_branch_active(uuid) from public,anon,authenticated;
grant execute on function public.has_capability(text),public.get_admin_context(),
  public.create_branch(uuid,text),public.set_branch_status(uuid,uuid,text) to authenticated;
