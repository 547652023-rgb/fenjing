create table public.call_sheet_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  shoot_date date not null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  unique (project_id, shoot_date, version_number)
);

create index call_sheet_versions_project_date_idx on public.call_sheet_versions(project_id, shoot_date, version_number desc);

alter table public.call_sheet_versions enable row level security;

create policy call_sheet_versions_select_member on public.call_sheet_versions
  for select using (public.is_project_member(project_id));
create policy call_sheet_versions_insert_member on public.call_sheet_versions
  for insert with check (public.is_project_member(project_id));
