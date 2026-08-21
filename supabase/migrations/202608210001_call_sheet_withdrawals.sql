alter table public.call_sheet_versions
  add column withdrawn_at timestamptz;

create policy call_sheet_versions_update_member on public.call_sheet_versions
  for update using (public.is_project_member(project_id));
