create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create unique index project_one_owner
  on public.project_members(project_id)
  where role = 'owner';

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  field_key text not null,
  label text not null check (char_length(trim(label)) between 1 and 100),
  field_type text not null check (
    field_type in ('text', 'number', 'date', 'singleSelect', 'multiSelect', 'person', 'image')
  ),
  visible boolean not null default true,
  position integer not null check (position >= 0),
  allow_custom_value boolean not null default false,
  unique (project_id, field_key),
  unique (project_id, position)
);

create table public.field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  value text not null check (char_length(trim(value)) between 1 and 200),
  position integer not null check (position >= 0),
  unique (field_id, value),
  unique (field_id, position)
);

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position >= 0),
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create index project_members_user_id_idx on public.project_members(user_id);
create index fields_project_id_idx on public.fields(project_id);
create index field_options_field_id_idx on public.field_options(field_id);
create index shots_project_id_position_idx on public.shots(project_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.bump_shot_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger shots_bump_version
before update on public.shots
for each row execute function public.bump_shot_version();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members membership
    where membership.project_id = p_project_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
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
      and project.owner_id = auth.uid()
  );
$$;

create or replace function public.seed_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shot_size_field_id uuid;
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.fields (project_id, field_key, label, field_type, visible, position, allow_custom_value)
  values
    (new.id, 'shotNumber', '镜号', 'number', true, 0, false),
    (new.id, 'frame', '画面', 'image', true, 1, false),
    (new.id, 'reference', '参考', 'image', true, 2, false),
    (new.id, 'shotSize', '景别', 'singleSelect', true, 3, false),
    (new.id, 'durationSeconds', '时长（秒）', 'number', true, 4, false),
    (new.id, 'content', '内容', 'text', true, 5, false),
    (new.id, 'notes', '备注', 'text', true, 6, false),
    (new.id, 'scene', '场景', 'text', true, 7, false),
    (new.id, 'sound', '声音', 'text', true, 8, false),
    (new.id, 'cameraAngle', '摄影机角度', 'text', true, 9, false),
    (new.id, 'cameraMove', '运镜', 'text', true, 10, false),
    (new.id, 'cameraGear', '摄影机装备', 'text', true, 11, false),
    (new.id, 'lens', '镜头焦段', 'text', true, 12, false),
    (new.id, 'sceneNumber', '场号', 'text', true, 13, false);

  select id into shot_size_field_id
  from public.fields
  where project_id = new.id and field_key = 'shotSize';

  insert into public.field_options (field_id, value, position)
  values
    (shot_size_field_id, '大远景', 0),
    (shot_size_field_id, '远景', 1),
    (shot_size_field_id, '全景', 2),
    (shot_size_field_id, '中景', 3),
    (shot_size_field_id, '近景', 4),
    (shot_size_field_id, '特写', 5);

  insert into public.shots (project_id, position, values)
  values (new.id, 0, jsonb_build_object('shotNumber', '1'));
  return new;
end;
$$;

create trigger on_project_created
after insert on public.projects
for each row execute function public.seed_new_project();

create or replace function public.invite_project_member(p_project_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare invited_user_id uuid;
begin
  if not public.is_project_owner(p_project_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select id into invited_user_id
  from public.profiles
  where email = lower(trim(p_email));

  if invited_user_id is null then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, invited_user_id, 'editor')
  on conflict (project_id, user_id) do nothing;
end;
$$;

create or replace function public.reorder_project_shots(
  p_project_id uuid,
  p_ordered_shot_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  index_value integer;
  expected_count integer;
begin
  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  perform 1
  from public.shots
  where project_id = p_project_id
  for update;

  select count(*) into expected_count
  from public.shots
  where project_id = p_project_id;

  if expected_count <> cardinality(p_ordered_shot_ids)
     or cardinality(p_ordered_shot_ids) <> (
       select count(distinct shot_id) from unnest(p_ordered_shot_ids) shot_id
     )
     or exists (
       select 1
       from public.shots
       where project_id = p_project_id
         and not (id = any(p_ordered_shot_ids))
     ) then
    raise exception using errcode = '40001', message = 'shot_order_conflict';
  end if;

  update public.shots
  set position = position + expected_count + 1
  where project_id = p_project_id;

  for index_value in 1..cardinality(p_ordered_shot_ids) loop
    update public.shots
    set position = index_value - 1,
        values = jsonb_set(values, '{shotNumber}', to_jsonb(index_value::text), true)
    where id = p_ordered_shot_ids[index_value]
      and project_id = p_project_id;
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.fields enable row level security;
alter table public.field_options enable row level security;
alter table public.shots enable row level security;

create policy profiles_read_self on public.profiles
for select using (id = auth.uid());

create policy projects_read_members on public.projects
for select using (public.is_project_member(id));
create policy projects_create_self on public.projects
for insert with check (owner_id = auth.uid());
create policy projects_update_members on public.projects
for update using (public.is_project_member(id)) with check (public.is_project_member(id));
create policy projects_delete_owner on public.projects
for delete using (public.is_project_owner(id));

create policy members_read_members on public.project_members
for select using (public.is_project_member(project_id));
create policy members_insert_owner on public.project_members
for insert with check (public.is_project_owner(project_id));
create policy members_delete_owner on public.project_members
for delete using (public.is_project_owner(project_id) and role <> 'owner');

create policy fields_read_members on public.fields
for select using (public.is_project_member(project_id));
create policy fields_write_members on public.fields
for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

create policy field_options_read_members on public.field_options
for select using (
  exists (
    select 1 from public.fields field
    where field.id = field_id and public.is_project_member(field.project_id)
  )
);
create policy field_options_write_members on public.field_options
for all using (
  exists (
    select 1 from public.fields field
    where field.id = field_id and public.is_project_member(field.project_id)
  )
) with check (
  exists (
    select 1 from public.fields field
    where field.id = field_id and public.is_project_member(field.project_id)
  )
);

create policy shots_read_members on public.shots
for select using (public.is_project_member(project_id));
create policy shots_write_members on public.shots
for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

insert into storage.buckets (id, name, public)
values ('storyboard-images', 'storyboard-images', false)
on conflict (id) do update set public = false;

create policy storyboard_images_read_members on storage.objects
for select to authenticated
using (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);
create policy storyboard_images_insert_members on storage.objects
for insert to authenticated
with check (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);
create policy storyboard_images_update_members on storage.objects
for update to authenticated
using (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);
create policy storyboard_images_delete_members on storage.objects
for delete to authenticated
using (
  bucket_id = 'storyboard-images'
  and public.is_project_member(((storage.foldername(name))[1])::uuid)
);

do $$
begin
  alter publication supabase_realtime add table
    public.projects,
    public.project_members,
    public.fields,
    public.field_options,
    public.shots;
exception
  when duplicate_object then null;
end;
$$;

revoke all on function public.invite_project_member(uuid, text) from public;
grant execute on function public.invite_project_member(uuid, text) to authenticated;
grant execute on function public.reorder_project_shots(uuid, uuid[]) to authenticated;
