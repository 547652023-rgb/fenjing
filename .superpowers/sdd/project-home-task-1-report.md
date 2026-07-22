# Project Home Task 1 Report

## Status

Task 1 is implemented and committed as:

```text
e129588 feat: add project home schema
```

No migration was applied to a local, remote, or real Supabase instance.

## Files committed

- `src/domain/models.ts`
- `src/data/supabaseGateway.test.ts`
- `src/data/supabaseGateway.ts`
- `supabase/migrations/202607220003_project_home.sql`

The brief's file list and sample `git add` command omit
`src/data/supabaseGateway.ts`, but the required mapping test cannot pass without
changing `listProjects()`. The commit therefore includes the minimal production
mapper/query change, plus matching metadata on the existing `createProject()`
return value so that implementation does not leave an additional type error in
the same gateway.

Pre-existing user-owned changes to `pnpm-lock.yaml` and the untracked
`pnpm-workspace.yaml` were preserved and were not staged or committed.

## TDD evidence

### RED

After adding only `maps project home metadata from Supabase rows`, ran:

```sh
pnpm test -- src/data/supabaseGateway.test.ts --run
```

Result: exit 1. Vitest reported 1 failed and 110 passed tests. The assertion
failed because the returned project contained the existing seven summary
properties but omitted `icon`, `shotCount`, and `createdAt`, which is the
expected feature-missing failure.

### GREEN

After implementing the mapper and schema, ran the same requested command.
Final pre-commit result: exit 0, 26 test files passed and 111 tests passed.

```text
Test Files  26 passed (26)
Tests       111 passed (111)
```

Although the command names one test file, this repository's pnpm/Vitest
argument forwarding caused Vitest to discover all 26 test files. This gives
full-suite runtime coverage for the current tests.

`git diff --cached --check` also exited 0 before commit.

## Implemented model and mapping

- `ProjectSummary` now requires shared `icon`, `shotCount`, `createdAt`, and
  nullable `deletedAt` metadata.
- Added `ProjectFolder` and `ProjectHomeSettings` domain types.
- `listProjects()` selects and maps project metadata plus the RLS-filtered
  `shots(count)` relationship.
- `createProject()` returns the same complete `ProjectSummary` shape and uses
  the template shot count after snapshot replacement.

## Database and policy implementation

- Added nullable project `icon` and `deleted_at`, including a partial trash
  index.
- Added per-user `project_folders`, `project_folder_assignments`, and
  `project_home_settings` tables with RLS enabled.
- Folder and sort-setting policies compare `user_id` with `auth.uid()`.
- Assignment policies additionally require access to the referenced project
  and ownership of the referenced personal folder. An editor's assignment row
  remains stored while a project is trashed but is not readable; it becomes
  visible again after restore.
- Replaced `is_project_member(uuid)` so owners retain access to trashed project
  data while editors only have access when `deleted_at is null`.
- Recreated project, member, field, shot, and storage read policies against that
  predicate. Existing field-option, field/shot write, template, and storage
  write policies also call the replaced predicate, so editors lose both read
  and write access across those dependent resources while the project is
  trashed.
- Split project updates into active-member and owner policies. Direct project
  updates for `authenticated` are column-limited to `title`, `aspect_ratio`,
  `icon`, and `deleted_at`, keeping `owner_id` immutable and preventing an
  editor from claiming ownership in the same statement to bypass owner-only
  trash checks.
- Added `purge_deleted_projects()` as a security-definer function. It removes
  storyboard image objects before deleting projects older than 30 days, then
  returns the number of purged projects. Default/public, anonymous, and
  authenticated execution are revoked; execution is granted only to
  `service_role` for scheduling.

The project Emoji is stored on the shared project row and is therefore visible
to all active members. Personal folders, assignments, and sort settings remain
isolated by user.

## Build concern for later tasks

Ran:

```sh
pnpm build
```

Result: exit 1 during `tsc --noEmit`; Vite did not run. The remaining errors are
expected cross-task fallout from making the four new `ProjectSummary` fields
required:

- `src/data/fakeGateway.ts:442` lacks the new fields. Task 2 explicitly owns
  the fake gateway home metadata work.
- `src/projects/TemplateLibrary.test.tsx:12` and `:21` fixtures lack the new
  fields. Project UI/fixture updates are outside Task 1 and are covered by the
  later home tasks.

The earlier same-gateway type error in `SupabaseStoryboardGateway.createProject`
was resolved in this commit. No unrelated files were changed to mask the
remaining planned integration work.

## Verification limits

The SQL migration was reviewed statically only. It was deliberately not run
against Supabase, per the task instruction. Database integration/policy tests
will still be needed in a disposable local Supabase environment before release.

## P1 review fix: safe Storage purge

This section supersedes the earlier `purge_deleted_projects()` description.
The review correctly identified that deleting `storage.objects` rows in SQL
bypasses the Storage service and can orphan the physical objects. The purge is
now split across a service-role-only database contract and a Supabase Edge
Function:

- `claim_deleted_projects_for_purge(integer)` returns a bounded batch of
  projects past the 30-day retention period and sets `purge_started_at` under
  `FOR UPDATE SKIP LOCKED`.
- A project-level check constraint prevents restoration after a purge claim.
  The owner update policy also blocks all user mutations once claimed, so a
  caller cannot move `deleted_at` forward while deletion is in flight. Failed
  work can be reclaimed after a 15-minute lease, while partial Storage deletion
  remains safe to retry.
- `purge-deleted-projects` recursively lists the project's Storage prefix and
  calls the Storage API `remove()` in batches before invoking
  `finalize_deleted_project_purge(uuid)`.
- Finalization rechecks both retention eligibility and the purge claim before
  deleting the relational project. No database function deletes from
  `storage.objects`.
- Both RPCs revoke execution from public, `anon`, and `authenticated`, granting
  it only to `service_role`. The Edge Function uses the caller's Authorization
  header for both RPC and Storage calls, so a user token cannot elevate into
  the cleanup path.
- `supabase/functions/purge-deleted-projects/README.md` documents deployment,
  service-role invocation, secret handling, and scheduling/retry requirements.

### Review-fix TDD evidence

RED was observed with:

```sh
pnpm test -- --run src/data/projectPurge.contract.test.ts
```

Vitest exited 1 because the new purge module did not exist. After the minimal
implementation, the precise focused command passed:

```sh
pnpm exec vitest --run src/data/projectPurge.contract.test.ts
```

Result: 1 test file passed, 5 tests passed. Coverage includes recursive object
discovery, Storage-before-database ordering, retaining the project on Storage
failure, blocking claimed-project mutations, and the migration's
no-direct-Storage-delete/service-role contract.

The full suite also passed:

```sh
pnpm exec vitest --run
```

Result: 27 test files passed, 116 tests passed.

A focused pgTAP contract test was added at
`supabase/tests/project_home_purge.sql`. It checks the RPC definitions,
retention/claim contract, absence of direct Storage metadata deletion, and
service-role-only privileges. The current environment has neither Supabase CLI,
Deno, nor `psql`, so the pgTAP test and deployed Edge runtime were not executed
locally.

`pnpm build` still exits 1 on the same three pre-existing cross-task
`ProjectSummary` fixture/mapper errors recorded above (`fakeGateway.ts` and two
`TemplateLibrary.test.tsx` fixtures). The new purge test and shared purge module
type-check before those unchanged errors are reported.

The user-owned `pnpm-lock.yaml` and untracked `pnpm-workspace.yaml` remain
unstaged and unmodified by this review fix.
