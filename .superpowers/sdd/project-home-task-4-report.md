# Project Home Task 4 Report

## Status

Task 4 is implemented with red/green TDD. The recycle-bin dashboard now uses
the existing soft-delete and queued permanent-deletion gateway contract. The
intended scoped commit message is:

```text
feat: add project recycle bin
```

## Files

- `src/projects/ProjectDashboard.tsx`
- `src/projects/ProjectDashboard.test.tsx`
- `src/styles.css`
- `docs/superpowers/plans/2026-07-22-project-home.md`
- `.superpowers/sdd/project-home-task-4-report.md`

The tracked project-home plan was corrected to describe permanent deletion as
a safe asynchronous request recorded by `permanentDeleteRequestedAt`, rather
than a browser hard-delete operation.

The pre-existing modified `pnpm-lock.yaml` and untracked
`pnpm-workspace.yaml` were preserved and excluded from the scoped commit.

## TDD evidence

### Initial RED

The dashboard tests were changed before production code to require owner-only
move-to-trash, restore, confirmed permanent-delete request, 30-day retention
copy, pending status, and editor control absence. This requested command then
exited 1:

```sh
pnpm test -- src/projects/ProjectDashboard.test.tsx --run
```

Vitest reported the three expected feature-missing failures:

- no `移入回收站` control existed on an owned normal card;
- a trashed card had neither its 30-day explanation nor restore control;
- a trashed card had no confirmed permanent-delete request control or pending
  state.

The remaining 136 tests passed. The failure was caused by missing recycle-bin
UI behavior, not by setup, type, or syntax errors.

### GREEN

After the minimal dashboard implementation and a strengthened cancellation
assertion, the same command exited 0. This repository's pnpm/Vitest argument
forwarding discovers the full suite, so the focused command reported 28 test
files and 139 tests passing.

## Implemented behavior

- Owned normal cards expose `移入回收站`, which calls only
  `moveProjectToTrash()`. The dashboard no longer calls `deleteProject()` from
  a normal card and never calls `permanentlyDeleteProject()` there.
- Trashed owner cards explain that projects remain in the recycle bin for 30
  days before the system automatically deletes them.
- Owners can restore an eligible trashed project through `restoreProject()`;
  refresh removes the restored card from the recycle-bin scope while keeping
  the project identifier and personal folder assignment in the gateway.
- `彻底删除` first requires a dedicated confirmation. Cancellation performs no
  gateway call. Confirmation calls only `permanentlyDeleteProject()`, which is
  the pre-existing safe request/queue API rather than a hard-delete API.
- When `permanentDeleteRequestedAt` is present, the card shows
  `彻底删除请求处理中，期间无法恢复` and removes both restore and duplicate
  deletion-request controls.
- Editor cards remain openable but expose none of the move, restore, permanent
  request, rename, folder-assignment, or icon-edit controls.
- Error messages distinguish move, restore, and request-submission failures.

## Verification

Fresh full verification immediately before the scoped diff review exited 0:

```sh
pnpm test -- --run && pnpm build && git diff --check
```

Results:

- 28 test files passed;
- 139 tests passed;
- `tsc --noEmit` passed;
- Vite built 88 modules successfully;
- `git diff --check` reported no whitespace errors.

The final source audit found dashboard references only to
`moveProjectToTrash`, `restoreProject`, and `permanentlyDeleteProject`; there
is no `deleteProject` call in `ProjectDashboard.tsx`.

## Scope and follow-up

- No gateway, migration, RLS, Edge worker, or package-manager file was changed
  by Task 4.
- The permanent-deletion worker remains responsible for claim, recursive
  Storage removal, and relational finalization. This UI only submits the safe
  owner request and displays its durable pending state.
- No live-browser visual pass was performed; React accessibility/interaction
  coverage and the production build were run.
