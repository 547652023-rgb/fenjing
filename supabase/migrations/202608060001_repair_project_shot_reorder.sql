-- Re-apply deterministic ordering for existing online projects.
-- This migration is safe to execute after the initial storyboard schema.
create or replace function public.reorder_project_shots(
  p_project_id uuid,
  p_ordered_shot_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_count integer;
begin
  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  perform 1
  from public.shots
  where project_id = p_project_id
  for update;

  select count(*) into expected_count
  from public.shots
  where project_id = p_project_id;

  if expected_count <> cardinality(p_ordered_shot_ids)
     or cardinality(p_ordered_shot_ids) <> (
       select count(distinct shot_id) from unnest(p_ordered_shot_ids) shot_id
     )
     or exists (
       select 1
       from public.shots
       where project_id = p_project_id
         and not (id = any(p_ordered_shot_ids))
     ) then
    raise exception using errcode = '40001', message = 'shot_order_conflict';
  end if;

  -- Move every row out of the unique (project_id, position) range first.
  update public.shots
  set position = position + expected_count + 1
  where project_id = p_project_id;

  -- Apply the complete requested order in one deterministic update.
  with ordered_shots as (
    select shot_id, ordinality - 1 as position
    from unnest(p_ordered_shot_ids) with ordinality as ordered(shot_id, ordinality)
  )
  update public.shots as shot
  set
    position = ordered_shots.position,
    values = jsonb_set(
      coalesce(shot.values, '{}'::jsonb),
      '{shotNumber}',
      to_jsonb((ordered_shots.position + 1)::text),
      true
    )
  from ordered_shots
  where shot.project_id = p_project_id
    and shot.id = ordered_shots.shot_id;
end;
$$;

grant execute on function public.reorder_project_shots(uuid, uuid[]) to authenticated;
