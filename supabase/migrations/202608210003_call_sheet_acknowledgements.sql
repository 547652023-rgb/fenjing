create table public.call_sheet_acknowledgements (
  call_sheet_version_id uuid not null references public.call_sheet_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (call_sheet_version_id, user_id)
);

alter table public.call_sheet_acknowledgements enable row level security;

create policy call_sheet_acknowledgements_select_member on public.call_sheet_acknowledgements
  for select using (exists (select 1 from public.call_sheet_versions v where v.id = call_sheet_version_id and public.is_project_member(v.project_id)));

create policy call_sheet_acknowledgements_insert_self on public.call_sheet_acknowledgements
  for insert with check (user_id = auth.uid() and exists (select 1 from public.call_sheet_versions v where v.id = call_sheet_version_id and v.withdrawn_at is null and public.is_project_member(v.project_id)));
