alter table public.projects
  add column default_view jsonb;

create or replace function public.set_storyboard_project_default_view(
  p_project_id uuid,
  p_default_view jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_project_owner(p_project_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.projects
  set default_view = p_default_view
  where id = p_project_id;
end;
$$;

revoke all on function public.set_storyboard_project_default_view(uuid, jsonb) from public;
grant execute on function public.set_storyboard_project_default_view(uuid, jsonb) to authenticated;
