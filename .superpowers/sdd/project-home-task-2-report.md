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
