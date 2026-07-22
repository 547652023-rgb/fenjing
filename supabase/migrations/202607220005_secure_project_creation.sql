-- Create projects inside the database so the owner is always the authenticated
-- caller. This avoids relying on a browser-supplied owner_id in an RLS check.
create or replace function public.create_storyboard_project(
  p_title text,
  p_aspect_ratio text default null
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_project public.projects;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  insert into public.projects (title, owner_id, aspect_ratio)
  values (
    trim(p_title),
    auth.uid(),
    coalesce(nullif(trim(p_aspect_ratio), ''), '16:9')
  )
  returning * into created_project;

  return created_project;
end;
$$;

revoke all on function public.create_storyboard_project(text, text) from public;
revoke all on function public.create_storyboard_project(text, text) from anon, service_role;
grant execute on function public.create_storyboard_project(text, text) to authenticated;
