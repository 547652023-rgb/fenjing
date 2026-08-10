# Storyboard Platform Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate every verified storyboard-platform change into one tested integration branch without overwriting active or historical workspaces.

**Architecture:** `integration/storyboard-platform` starts from `origin/agent/next-optimization`, which contains the current production-workflow line. Changes from `agent/add-storyboard-saas-design` are merged through Git and resolved in the integration worktree; unfinished local changes are admitted only as explicit reviewed patches. Database migrations are tracked separately because code integration cannot prove they ran in Supabase.

**Tech Stack:** Git worktrees, pnpm, Vitest, TypeScript, Vite, Supabase migrations.

## Global Constraints

- Do not force-push, delete branches, reset, or clean any source workspace.
- Do not merge while an active source task is still modifying its branch.
- Keep each accepted source attributable to its original commit or a dedicated integration commit.
- Require `pnpm test --run` and `pnpm build` after every conflict-resolution batch and before deployment.
- Treat `._*` files as macOS metadata, not product source; do not commit them.

---

### Task 1: Freeze and inventory sources

**Files:**
- Create: `docs/integration/2026-08-10-source-inventory.md`
- Read: all source worktree Git status, refs, and commit ranges

- [x] Record every source worktree, branch/ref, HEAD commit, uncommitted file, and owner task.
- [x] Obtain a stop-and-state report from the active `优化分镜平台界面 (2)` task before accepting its HEAD.
- [x] Capture the old worktree's uncommitted diff as a reviewed patch summary outside the source worktree; do not modify that workspace.
- [x] Classify each source as: merge, patch-review, migration-review, metadata-ignore, or no-code.
- [ ] Commit the inventory only after it accurately references all sources.

### Task 2: Receive the completed optimization line

**Files:**
- Modify: Git history only
- Test: `pnpm test --run`; `pnpm build`

- [ ] Compare `origin/agent/next-optimization` with the frozen `/Volumes/2T/辽超ai/图片/fenjing` HEAD.
- [ ] If the source has non-remote commits, fetch or receive the exact commit by hash; never copy source files over the integration worktree.
- [ ] Verify the accepted optimization commit range is included in the integration branch.
- [ ] Run the full test suite and production build.
- [ ] Commit only conflict resolutions, if Git creates any.

### Task 3: Merge storyboard design and export work

**Files:**
- Modify: Git history and only files in Git's conflict list
- Test: `pnpm test --run`; `pnpm build`

- [ ] Merge `origin/agent/add-storyboard-saas-design` into `integration/storyboard-platform` without committing automatically.
- [ ] Resolve each conflict by preserving both independently shipped behaviours: production workflow/custom fields and reference-image/export behaviour.
- [ ] Add a focused test when a conflict affects `StoryboardTable`, `ExportActions`, `pdfExport`, or `styles.css`.
- [ ] Run full tests and build; inspect the final diff before committing the merge.
- [ ] Create one merge commit with both parents retained.

### Task 4: Review unfinished local changes and migrations

**Files:**
- Review: exported legacy patch, `supabase/migrations/`, `src/data/supabaseGateway.ts`
- Create: `docs/integration/2026-08-10-migration-ledger.md`

- [ ] Review the legacy test/lockfile patch independently; accept only changes that have a matching intended behaviour and passing tests.
- [ ] Keep `pnpm-workspace.yaml` out unless it is necessary for a reproducible project command and is reviewed separately.
- [ ] Build a migration ledger with filename, Git commit, local presence, and Supabase execution status.
- [ ] Do not claim an online migration is applied without database-side evidence.
- [ ] Run full tests and build after any accepted patch, then commit the patch and ledger separately.

### Task 5: Release readiness and single deployment source

**Files:**
- Modify: `README.md` only if deployment branch instructions are inaccurate
- Test: `pnpm test --run`; `pnpm build`

- [ ] Verify the integration branch contains both source branch tips with `git merge-base --is-ancestor`.
- [ ] Run fresh full tests and build; record exact pass counts and build result in the inventory.
- [ ] Compare migration ledger with the target Supabase project before deploying.
- [ ] Push and deploy only this integration branch after a human-visible summary of accepted and excluded work.

### Task 6: Branch conformance audit

**Files:**
- Create: `docs/integration/2026-08-10-conformance-matrix.md`
- Test: every source worktree with `pnpm test --run` and `pnpm build`

- [x] Run the test suite and production build in each frozen source and the integration worktree; record exact outcomes.
- [ ] Map each feature to its source commit, automated test, and integration presence.
- [ ] Reproduce each feature gap before changing production code.
- [ ] Write a failing regression test for every confirmed integration defect, then implement the minimal fix.
- [ ] Re-run all tests, build, and relevant browser workflows before accepting the final merge.
