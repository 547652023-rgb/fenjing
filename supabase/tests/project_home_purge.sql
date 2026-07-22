begin;

select plan(26);

select has_column('public', 'projects', 'purge_started_at');
select has_column('public', 'projects', 'permanent_delete_requested_at');
select has_function(
  'public',
  'claim_deleted_projects_for_purge',
  array['integer']
);
select has_function(
  'public',
  'finalize_deleted_project_purge',
  array['uuid']
);
select has_function(
  'public',
  'request_project_permanent_deletion',
  array['uuid']
);
select ok(
  pg_get_functiondef('public.request_project_permanent_deletion(uuid)'::regprocedure)
    ~* 'owner_id = auth.uid\(\)'
  and pg_get_functiondef('public.request_project_permanent_deletion(uuid)'::regprocedure)
    ~* 'project_deleted_at is null',
  'only an owner of a trashed project may request permanent deletion'
);
select ok(
  pg_get_functiondef('public.request_project_permanent_deletion(uuid)'::regprocedure)
    ~* 'project_requested_at is not null'
  and pg_get_functiondef('public.request_project_permanent_deletion(uuid)'::regprocedure)
    ~* 'return ''pending''',
  'duplicate permanent-deletion requests are idempotent'
);
select ok(
  pg_get_functiondef('public.claim_deleted_projects_for_purge(integer)'::regprocedure)
    !~* 'delete\s+from\s+storage\.objects'
  and pg_get_functiondef('public.finalize_deleted_project_purge(uuid)'::regprocedure)
    !~* 'delete\s+from\s+storage\.objects',
  'purge RPCs never delete Storage metadata directly'
);
select ok(
  pg_get_functiondef('public.claim_deleted_projects_for_purge(integer)'::regprocedure)
    ~* 'for update skip locked',
  'candidate projects are claimed under a row lock'
);
select ok(
  pg_get_functiondef('public.claim_deleted_projects_for_purge(integer)'::regprocedure)
    ~* '30 days',
  'candidate RPC enforces the retention period'
);
select ok(
  pg_get_functiondef('public.claim_deleted_projects_for_purge(integer)'::regprocedure)
    ~* 'permanent_delete_requested_at is not null',
  'owner-requested deletion is immediately eligible for a worker claim'
);
select ok(
  pg_get_functiondef('public.finalize_deleted_project_purge(uuid)'::regprocedure)
    ~* '30 days'
  and pg_get_functiondef('public.finalize_deleted_project_purge(uuid)'::regprocedure)
    ~* 'purge_started_at is not null',
  'finalization rechecks retention and an active purge claim'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_update_owner'
      and qual ~* 'purge_started_at IS NULL'
      and with_check ~* 'purge_started_at IS NULL'
  ),
  'owners cannot mutate a project after its purge claim'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_update_owner'
      and qual ~* 'permanent_delete_requested_at IS NULL'
      and with_check ~* 'permanent_delete_requested_at IS NULL'
  ),
  'owners cannot restore a project after permanent deletion is requested'
);
select ok(
  pg_get_functiondef('public.is_project_member(uuid)'::regprocedure)
    ~* 'purge_started_at IS NULL',
  'project membership access closes when purge starts'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storyboard_images_insert_members'
      and with_check ~* 'is_project_member'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storyboard_images_update_members'
      and qual ~* 'is_project_member'
      and with_check ~* 'is_project_member'
  ),
  'Storage uploads and updates use purge-aware project membership'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and cmd = 'DELETE'
  ),
  'authenticated users have no direct project hard-delete policy'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_deleted_projects_for_purge(integer)',
    'EXECUTE'
  ),
  'service role can claim purge candidates'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.finalize_deleted_project_purge(uuid)',
    'EXECUTE'
  ),
  'service role can finalize a purge'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_deleted_projects_for_purge(integer)',
    'EXECUTE'
  ),
  'authenticated users cannot claim purge candidates'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.finalize_deleted_project_purge(uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot finalize a purge'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_deleted_projects_for_purge(integer)',
    'EXECUTE'
  ),
  'anonymous users cannot claim purge candidates'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_deleted_project_purge(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot finalize a purge'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_project_permanent_deletion(uuid)',
    'EXECUTE'
  ),
  'authenticated owners can call the permanent-deletion request boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.request_project_permanent_deletion(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot request permanent deletion'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.request_project_permanent_deletion(uuid)',
    'EXECUTE'
  ),
  'the purge worker does not use the client request boundary'
);

select * from finish();
rollback;
