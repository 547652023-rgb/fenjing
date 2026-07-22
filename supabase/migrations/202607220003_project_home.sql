alter table public.projects
  add column icon text check (char_length(icon) <= 16),
  add column deleted_at timestamptz,
  add column purge_started_at timestamptz
    check (purge_started_at is null or deleted_at is not null);

create index projects_deleted_at_idx
  on public.projects(deleted_at)
  where deleted_at is not null;

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.project_folder_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  folder_id uuid not null references public.project_folders(id) on delete cascade,
  primary key (user_id, project_id)
);

create index project_folder_assignments_folder_id_idx
  on public.project_folder_assignments(folder_id);

create table public.project_home_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sort_by text not null default 'updated' check (sort_by in ('updated', 'created', 'name')),
  updated_at timestamptz not null default now()
);

create trigger project_folders_set_updated_at
before update on public.project_folders
for each row execute function public.set_updated_at();

create trigger project_home_settings_set_updated_at
before update on public.project_home_settings
for each row execute function public.set_updated_at();

-- Owners retain access to trashed projects until purge starts, while
-- collaborators lose access until the owner restores the project. The purge
-- claim closes every policy that depends on this helper, including Storage
-- object writes, before the worker lists the project's files.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects project
    where project.id = p_project_id
      and project.purge_started_at is null
      and (
        project.owner_id = auth.uid()
        or (
          project.deleted_at is null
          and exists (
            select 1
            from public.project_members membership
            where membership.project_id = project.id
              and membership.user_id = auth.uid()
          )
        )
      )
  );
$$;

drop policy if exists projects_read_members on public.projects;
create policy projects_read_members on public.projects
for select using (public.is_project_member(id));

drop policy if exists projects_update_members on public.projects;
create policy projects_update_active_members on public.projects
for update
using (deleted_at is null and public.is_project_member(id))
with check (deleted_at is null and public.is_project_member(id));

drop policy if exists projects_delete_owner on public.projects;

create policy projects_update_owner on public.projects
for update
using (purge_started_at is null and public.is_project_owner(id))
with check (purge_started_at is null and owner_id = auth.uid());

-- Keep ownership immutable through direct table updates. RLS then safely makes
-- deleted_at transitions owner-only without an editor claiming ownership in
-- the same statement.
revoke update on public.projects from authenticated;
grant update (title, aspect_ratio, icon, deleted_at) on public.projects to authenticated;

drop policy if exists members_read_members on public.project_members;
create policy members_read_members on public.project_members
for select using (public.is_project_member(project_id));

drop policy if exists fields_read_members on public.fields;
create policy fields_read_members on public.fields
for select using (public.is_project_member(project_id));

drop policy if exists shots_read_members on public.shots;
create policy shots_read_members on public.shots
for select using (public.is_project_member(project_id));

drop policy if exists storyboard_images_read_members on storage.objects;
create policy storyboard_images_read_members on storage.objects
for select to authenticated
using (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);

alter table public.project_folders enable row level security;
alter table public.project_folder_assignments enable row level security;
alter table public.project_home_settings enable row level security;

create policy project_folders_manage_self on public.project_folders
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy project_folder_assignments_manage_self
on public.project_folder_assignments
for all to authenticated
using (
  user_id = auth.uid()
  and public.is_project_member(project_id)
)
with check (
  user_id = auth.uid()
  and public.is_project_member(project_id)
  and exists (
    select 1
    from public.project_folders folder
    where folder.id = folder_id
      and folder.user_id = auth.uid()
  )
);

create policy project_home_settings_manage_self on public.project_home_settings
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

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
    where project.deleted_at < now() - interval '30 days'
      and (
        project.purge_started_at is null
        or project.purge_started_at < now() - interval '15 minutes'
      )
    order by project.deleted_at, project.id
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
    and deleted_at < now() - interval '30 days'
    and purge_started_at is not null;

  return found;
end;
$$;

revoke all on function public.claim_deleted_projects_for_purge(integer) from public;
revoke all on function public.claim_deleted_projects_for_purge(integer) from anon, authenticated;
grant execute on function public.claim_deleted_projects_for_purge(integer) to service_role;

revoke all on function public.finalize_deleted_project_purge(uuid) from public;
revoke all on function public.finalize_deleted_project_purge(uuid) from anon, authenticated;
grant execute on function public.finalize_deleted_project_purge(uuid) to service_role;
