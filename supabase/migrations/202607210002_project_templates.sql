create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  source_project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_templates_source_project_id_idx
  on public.project_templates(source_project_id);

create trigger project_templates_set_updated_at
before update on public.project_templates
for each row execute function public.set_updated_at();

alter table public.project_templates enable row level security;

create policy project_templates_read_members on public.project_templates
for select using (public.is_project_member(source_project_id));

create policy project_templates_insert_members on public.project_templates
for insert with check (public.is_project_member(source_project_id));

create policy project_templates_update_members on public.project_templates
for update using (public.is_project_member(source_project_id))
with check (public.is_project_member(source_project_id));

create policy project_templates_delete_members on public.project_templates
for delete using (public.is_project_member(source_project_id));
