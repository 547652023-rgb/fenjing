begin;

select plan(12);

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

select * from finish();
rollback;
