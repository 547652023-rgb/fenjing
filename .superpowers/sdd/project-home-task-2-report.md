# Project Home Task 2 Report

## Status

Task 2 implements the project-home gateway contract in both fake and Supabase
backends. The intended commit message is:

```text
feat: add project home gateway
```

No migration was applied and no Supabase environment was mutated.

## Files

- `src/data/gateway.ts`
- `src/data/fakeGateway.ts`
- `src/data/fakeGateway.test.ts`
- `src/data/supabaseGateway.ts`
- `src/data/supabaseGateway.test.ts`
- `src/projects/ProjectDashboard.tsx`
- `src/projects/TemplateLibrary.test.tsx`

The two project files are minimal compatibility updates required by the Task 1
`ProjectSummary` expansion and Task 2 soft-delete semantics: the legacy
dashboard hides trashed summaries until the recycle-bin UI task lands, and the
typed template fixtures now contain the required home metadata.

The pre-existing `pnpm-lock.yaml` modification and untracked
`pnpm-workspace.yaml` were preserved and excluded.

## TDD evidence

### Initial RED

After adding the fake and Supabase home-gateway tests first, this requested
command exited 1:

```sh
pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run
```

Vitest reported 7 expected feature-missing failures: absent folder, icon,
trash, and permanent-finalization methods; fake `deleteProject()` still hard
deleted; and Supabase did not defensively filter a collaborator's trashed
project. The remaining 119 tests passed.

### RLS zero-row RED

A follow-up permission audit added a regression test for an editor restoring a
trashed project. The focused command exited 1 because the RLS-filtered
zero-row update resolved successfully instead of rejecting:

```sh
pnpm exec vitest --run src/data/supabaseGateway.test.ts
```

The implementation now requests an exact update count for trash transitions
and maps count zero to `GatewayError("forbidden")`.

## Implemented behavior

- Added every Task 2 method to `StoryboardGateway`.
- Fake folders, project assignments, and home settings are held in maps keyed
  by user ID. Folder deletion removes only that user's assignments.
- Supabase folder, assignment, and home-setting methods use the RLS-scoped
  project-home tables and include the authenticated user ID in writes.
- Project icons are stored as shared project metadata.
- Fake and Supabase project lists expose trashed projects only to their owner;
  collaborators lose load/list and assignment visibility until restore.
- Trash and restore are owner-only. The fake enforces ownership directly;
  Supabase relies on RLS and rejects both policy errors and zero-row updates.
- `deleteProject()` remains a soft-delete compatibility path in both gateways.
- Both ordinary gateways fail closed for `permanentlyDeleteProject()` because
  hard deletion belongs to the Storage-first purge worker.
- Custom templates sourced from trashed projects are hidden from collaborators
  in the fake, matching production template RLS.

## Permanent-delete security boundary

Task 1 removed the authenticated project DELETE policy and established
`finalize_deleted_project_purge(uuid)` as the sole relational hard-delete path.
Calling that finalizer directly from the browser gateway would both fail its
`service_role` grant and bypass the worker's Storage-removal-first sequence.
Accordingly, ordinary fake and Supabase gateway implementations reject
`permanentlyDeleteProject()` without calling an RPC or table `.delete()`. The
existing purge worker remains the only caller of the finalization RPC after it
has removed project files.

## Independent review

An independent read-only reviewer found two Important issues: the initial
authenticated finalizer call bypassed the worker boundary, and fake template
listing used raw membership after trash. Both were reproduced with failing
tests and fixed. A follow-up review was requested against the corrected diff.

## Verification

Immediately before commit, this command exited 0:

```sh
pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run \
  && pnpm build \
  && git diff --check
```

Because this repository's pnpm/Vitest forwarding discovers the full suite, the
requested test command passed all 27 files and all 128 tests. `tsc --noEmit`
and the Vite production build completed successfully, and `git diff --check`
reported no whitespace errors.

## P1 follow-up: owner permanent-deletion requests

The permanent-delete boundary now lets a project owner request deletion of an
already-trashed project without giving the browser access to either relational
hard deletion or Storage deletion. `permanentlyDeleteProject()` calls only
`request_project_permanent_deletion(uuid)` and returns `requested` for the first
request or `pending` for an idempotent duplicate. The fake gateway mirrors this
contract; editors and requests for active projects are rejected.

Migration `202607220004_permanent_delete_requests.sql` stores a durable
`permanent_delete_requested_at` marker that project summaries expose for a
future recycle-bin status. Its security-definer request RPC locks the project,
checks `owner_id = auth.uid()` and `deleted_at is not null`, and is executable
only by `authenticated`. Once marked, the owner update policy denies restore.

The existing service-role Edge worker remains unchanged. Its claim RPC now
treats requested projects as immediately eligible, then the worker follows the
existing claim → recursive Storage removal → finalize sequence. The finalizer
accepts either an expired trash record or an owner-requested record, but still
requires an active claim. The browser gateway never calls the claim/finalizer
RPCs and never calls table `.delete()`.

### P1 TDD and verification evidence

The focused RED command was run before implementation:

```sh
pnpm exec vitest --run src/data/fakeGateway.test.ts \
  src/data/supabaseGateway.test.ts src/data/projectPurge.contract.test.ts
```

It exited 1: both gateways still rejected owners, and the new request migration
did not exist. After the minimal implementation, the same focused command
passed 3 files and 35 tests.

Fresh full verification then exited 0:

```sh
pnpm exec vitest --run && pnpm build && git diff --check
```

Result: 27 files and 132 tests passed; TypeScript and the Vite production build
completed; the diff had no whitespace errors. Contract tests cover the request
RPC restrictions/idempotency, immediate worker eligibility, restore denial,
durable status mapping, and the unchanged claim/Storage/finalize Edge path.
The pgTAP file was extended with the equivalent database assertions, but this
environment has no Supabase CLI or `psql`, so pgTAP was not executed locally.

An independent read-only review of the final request boundary, SQL privileges,
RLS/concurrency behavior, worker eligibility, and gateway API reported no
Critical or Important findings.

The pre-existing modified `pnpm-lock.yaml` and untracked `pnpm-workspace.yaml`
remain unstaged and unchanged by this follow-up.
