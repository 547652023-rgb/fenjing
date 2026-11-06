# Storyboard recovery completion implementation plan

> Execute the approved four-item repair scope task by task; keep independent regression tests and report each result.

**Goal:** Preserve scene input after failed saves, recover stalled Excel exports and project loads, and keep selections stable across filters and unrelated edits.

**Architecture:** Keep the current React/gateway structure and existing visual system. Retain scene forms until a successful write, bound async reads/exports with cancellation and stale-result checks, and prune selections only against existing shots. No dependency additions or broad redesign.

**Spec:** User-approved findings in the preceding review and “现在开始修改”. Branch first, test each item, then merge/push/publish as previously authorized.

## Review focus
- A rejected scene write must retain typed name and notes and allow a retry without duplicate submissions.
- Cancelling or timing out an export must prevent a late download; missing resources must be visible before accepting an incomplete workbook.
- An old project read that resolves after a timeout/retry or unmount must not replace newer state.
- Realtime reloads must not discard retained scene form input or pending text edits.
- Hidden selected shots must remain selected through unrelated edits, while deleted shots must be removed from selection.

## Task 1: Preserve scene edits on failed save
- [ ] Reproduce save failure with the real workbench and fake gateway; assert form/input retained and retry saves server state. Test duplicate submission protection while pending.
- [ ] Update `StoryboardTable.tsx` scene editor to await completion and retain errors/input. Make `ProjectWorkbench.tsx` scene write failures propagate rather than reloading away the form draft; retain working state until confirmed.
- [ ] Run `pnpm exec vitest run src/workbench/ProjectWorkbench.test.tsx src/components/StoryboardTable.test.tsx src/components/ShootPlan.test.tsx` and commit.

## Task 2: Recover Excel export failures
- [ ] Reproduce missing-image feedback, hung resource timeout, cancellation and late-result cases in `excelExport.test.ts` and `ExportActions.test.tsx`.
- [ ] Extend existing export options/signal to Excel resource loading. Provide bounded resource/overall generation, cancel, retry and explicit acceptance for a missing-image workbook in `ExportActions.tsx`. Preserve exact generated workbook for acceptance. Include Logo failure reporting.
- [ ] Run export tests and commit. Excel and PDF cancellation/feedback must remain independent.

## Task 3: Recover stalled project loading
- [ ] Add fake-clock workbench regressions for initial load timeout, retry success, late response, unmount and retained local input on reload failure.
- [ ] Bound `reload` to 20 seconds using `withDeadline`, invalidate old reads, and offer retry/back controls on loading/error. Reuse the current draft merge path.
- [ ] Run workbench/realtime tests and commit.

## Task 4: Preserve hidden selections
- [ ] Reproduce selecting A, filtering A out, editing visible B and selected export/batch scope still containing A. Also check selected deleted shots are pruned.
- [ ] Change selection pruning in `StoryboardTable.tsx` to use all existing shots, retaining current across-filter selection behavior.
- [ ] Run table/workbench tests and commit.

## Delivery
- [ ] Fresh independent whole-branch review; address meaningful findings with regression tests.
- [ ] Full test suite, production build, diff check and UI detector. Record scope of manual checks honestly.
- [ ] Merge to `integration/storyboard-platform`, push, wait for Pages deployment success.

## Results
- Branch starts at `2fcdb6b`; baseline: 47 files / 350 tests passed.
- Task 1: RED reproduced closed/lost form on failed and pending writes; GREEN: 3 files / 96 tests passed. Scene form now awaits save, retains failure input and prevents duplicate submissions.
- Execution: independent Excel implementation delegated in parallel; source ownership is disjoint from workbench/table repairs.
