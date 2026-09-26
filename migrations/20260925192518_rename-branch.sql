create or replace function public.rename_branch(
  p_request_id uuid,
  p_branch_id uuid,
  p_name text
)
returns table(branch_id uuid, name text, result_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  normalized_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  payload_hash text;
  receipt public.branch_command_receipts%rowtype;
  changed public.branches%rowtype;
begin
  if not public.has_capability('branches.manage') then
    raise exception 'access denied';
  end if;
  if p_request_id is null then
    raise exception 'request id is required';
  end if;
  if p_branch_id is null then
    raise exception 'branch not found';
  end if;
  if normalized_name = '' or length(normalized_name) > 120 then
    raise exception 'invalid branch name';
  end if;

  payload_hash := encode(public.digest(convert_to('rename_branch|' || p_branch_id::text || '|' || normalized_name, 'utf8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_request_id::text, 0));
  select * into receipt
  from public.branch_command_receipts
  where actor_id = actor and request_id = p_request_id;
  if found then
    if receipt.operation <> 'rename_branch' or receipt.payload_hash <> payload_hash then
      raise exception 'request conflict';
    end if;
    return query
    select branch.id, branch.name, receipt.result_status
    from public.branches branch
    where branch.id = receipt.branch_id;
    return;
  end if;

  update public.branches
  set name = normalized_name,
      updated_at = case when name is distinct from normalized_name then now() else updated_at end
  where id = p_branch_id
  returning * into changed;
  if not found then
    raise exception 'branch not found';
  end if;

  insert into public.branch_command_receipts
  values (actor, p_request_id, 'rename_branch', payload_hash, changed.id, changed.status, now());
  return query select changed.id, changed.name, changed.status;
end;
$$;

revoke execute on function public.rename_branch(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rename_branch(uuid, uuid, text) to authenticated;
