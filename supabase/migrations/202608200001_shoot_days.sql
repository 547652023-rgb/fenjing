create table public.shoot_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null default '未命名拍摄日',
  shoot_date date,
  location text not null default '',
  call_time text not null default '',
  wrap_time text not null default '',
  coordinator text not null default '',
  notes text not null default '',
  unique (project_id, position)
);

alter table public.shots
  add column shoot_day_id uuid references public.shoot_days(id) on delete set null,
  add column shoot_order integer not null default 0 check (shoot_order >= 0);

create index shoot_days_project_id_position_idx on public.shoot_days(project_id, position);
create index shots_shoot_day_id_order_idx on public.shots(shoot_day_id, shoot_order);

alter table public.shoot_days enable row level security;

create policy shoot_days_select_member on public.shoot_days
  for select using (public.is_project_member(project_id));
create policy shoot_days_insert_member on public.shoot_days
  for insert with check (public.is_project_member(project_id));
create policy shoot_days_update_member on public.shoot_days
  for update using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy shoot_days_delete_member on public.shoot_days
  for delete using (public.is_project_member(project_id));

alter publication supabase_realtime add table public.shoot_days;
