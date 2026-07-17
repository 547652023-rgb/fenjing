-- Owners must be able to read the row returned by INSERT before the
-- AFTER INSERT trigger has created their project_members row.
drop policy if exists projects_read_members on public.projects;

create policy projects_read_members on public.projects
for select using (owner_id = auth.uid() or public.is_project_member(id));
