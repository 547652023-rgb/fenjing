create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null default '未命名场次',
  int_ext text not null default '' check (int_ext in ('', 'INT', 'EXT', 'INT/EXT')),
  day_night text not null default '' check (day_night in ('', 'DAY', 'NIGHT')),
  target_duration_seconds text not null default '',
  shoot_date date,
  notes text not null default '',
  collapsed boolean not null default false,
  unique (project_id, position)
);

alter table public.shots
  add column scene_id uuid references public.scenes(id) on delete set null;

create index scenes_project_id_position_idx on public.scenes(project_id, position);
create index shots_scene_id_idx on public.shots(scene_id);

alter table public.scenes enable row level security;

create policy scenes_select_member on public.scenes
  for select using (public.is_project_member(project_id));
create policy scenes_insert_member on public.scenes
  for insert with check (public.is_project_member(project_id));
create policy scenes_update_member on public.scenes
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy scenes_delete_member on public.scenes
  for delete using (public.is_project_member(project_id));

do $$
begin
  alter publication supabase_realtime add table public.scenes;
exception
  when duplicate_object then null;
end $$;
