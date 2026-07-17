begin;

select plan(13);

select has_table('public', 'profiles');
select has_table('public', 'projects');
select has_table('public', 'project_members');
select has_table('public', 'fields');
select has_table('public', 'field_options');
select has_table('public', 'shots');
select row_security_active('public', 'projects');
select row_security_active('public', 'project_members');
select row_security_active('public', 'shots');
select has_function('public', 'is_project_member', array['uuid']);
select has_function('public', 'invite_project_member', array['uuid', 'text']);
select has_function('public', 'reorder_project_shots', array['uuid', 'uuid[]']);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_read_members'
      and qual like '%owner_id%auth.uid()%'
  ),
  'project owners can read an inserted row before membership seeding completes'
);

select * from finish();
rollback;
