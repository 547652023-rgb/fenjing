alter table public.projects
  add column permanent_delete_requested_at timestamptz
    check (permanent_delete_requested_at is null or deleted_at is not null);

create index projects_permanent_delete_requested_at_idx
  on public.projects(permanent_delete_requested_at)
  where permanent_delete_requested_at is not null;

-- Browser clients may only request deletion. The service-role worker remains
-- responsible for claiming the row, removing Storage objects, and finalizing
-- the relational delete.
create or replace function public.request_project_permanent_deletion(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_deleted_at timestamptz;
  project_requested_at timestamptz;
  project_purge_started_at timestamptz;
begin
  select project.deleted_at,
         project.permanent_delete_requested_at,
         project.purge_started_at
  into project_deleted_at, project_requested_at, project_purge_started_at
  from public.projects project
  where project.id = p_project_id
    and project.owner_id = auth.uid()
  for update;

  if not found or project_deleted_at is null then
    raise exception using
      errcode = '42501',
      message = 'project_not_trashed_or_not_owned';
  end if;

  if project_requested_at is not null or project_purge_started_at is not null then
    return 'pending';
  end if;

  update public.projects
  set permanent_delete_requested_at = now()
  where id = p_project_id;

  return 'requested';
end;
$$;

revoke all on function public.request_project_permanent_deletion(uuid) from public;
revoke all on function public.request_project_permanent_deletion(uuid) from anon, authenticated, service_role;
grant execute on function public.request_project_permanent_deletion(uuid) to authenticated;

-- Once a permanent-deletion request exists, direct owner updates (including
-- restore) stop. The security-definer request function above is the only
-- authenticated path that can set the request marker.
drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner on public.projects
for update
using (
  purge_started_at is null
  and permanent_delete_requested_at is null
  and public.is_project_owner(id)
)
with check (
  purge_started_at is null
  and permanent_delete_requested_at is null
  and owner_id = auth.uid()
);

create or replace function public.claim_deleted_projects_for_purge(p_limit integer default 100)
returns table(project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select project.id
    from public.projects project
    where (
        project.deleted_at < now() - interval '30 days'
        or project.permanent_delete_requested_at is not null
      )
      and (
        project.purge_started_at is null
        or project.purge_started_at < now() - interval '15 minutes'
      )
    order by coalesce(project.permanent_delete_requested_at, project.deleted_at), project.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.projects project
  set purge_started_at = now()
  from candidates
  where project.id = candidates.id
  returning project.id;
end;
$$;

create or replace function public.finalize_deleted_project_purge(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.projects
  where id = p_project_id
    and (
      deleted_at < now() - interval '30 days'
      or permanent_delete_requested_at is not null
    )
    and purge_started_at is not null;

  return found;
end;
$$;
