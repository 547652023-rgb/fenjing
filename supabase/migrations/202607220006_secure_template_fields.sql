-- Apply template fields inside the database.  A freshly-created project's
-- membership and its RLS policies are established by a trigger, but replacing
-- fields from the browser can race that setup.  The function verifies the
-- caller is a project member and performs the replacement atomically.
create or replace function public.replace_storyboard_project_fields(
  p_project_id uuid,
  p_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  field_item record;
  inserted_field_id uuid;
begin
  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501', message = 'not_project_member';
  end if;

  delete from public.fields where project_id = p_project_id;

  for field_item in
    select *
    from jsonb_to_recordset(coalesce(p_fields, '[]'::jsonb)) as value(
      field_key text,
      label text,
      field_type text,
      visible boolean,
      position integer,
      allow_custom_value boolean,
      options jsonb
    )
  loop
    insert into public.fields (
      project_id, field_key, label, field_type, visible, position, allow_custom_value
    )
    values (
      p_project_id,
      field_item.field_key,
      field_item.label,
      field_item.field_type,
      coalesce(field_item.visible, true),
      field_item.position,
      coalesce(field_item.allow_custom_value, false)
    )
    returning id into inserted_field_id;

    insert into public.field_options (field_id, value, position)
    select inserted_field_id, option_value, option_position - 1
    from jsonb_array_elements_text(coalesce(field_item.options, '[]'::jsonb))
      with ordinality as option_rows(option_value, option_position);
  end loop;
end;
$$;

revoke all on function public.replace_storyboard_project_fields(uuid, jsonb) from public;
revoke all on function public.replace_storyboard_project_fields(uuid, jsonb) from anon, service_role;
grant execute on function public.replace_storyboard_project_fields(uuid, jsonb) to authenticated;
