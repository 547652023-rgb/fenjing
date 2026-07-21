# Task 3 Report: Add template selection and template library UI

## Status

Complete. Task 3 was implemented with red/green TDD and committed as `d607d8a` (`feat: add template picker and library`).

## Changes

- Added an accessible `TemplatePicker` that defaults to a blank project and supports built-in and permitted shared templates. It can be used with only `templates/onSelect` or as a controlled picker from the dashboard.
- Updated project creation to load available templates, select a template snapshot, and use `"项目"` when no title is entered. Blank creation preserves the one-argument gateway call.
- Added a Chinese template-library dialog with a template name field and a source-project selector populated only from the member-visible project summaries supplied by the dashboard.
- Added custom shared-template creation, update-from-source-project, and confirmed deletion flows. Built-in templates are rendered read-only and never receive edit or delete controls.
- Added Chinese validation and operation failure messages, selection-state styling, template cards, and library dialog styling.
- Added UI coverage for blank/built-in/shared selection, template-backed project creation, visible source projects, built-in read-only behavior, custom updates, and destructive confirmation.

## TDD Evidence

### Initial RED

Command run before production implementation:

```text
pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run
exit 1
```

Observed expected failures:

- `TemplateLibrary.test.tsx` could not resolve the missing `./TemplateLibrary` module.
- `ProjectDashboard.test.tsx` could not find the `宣传片` radio because the creation form had no template picker.
- Vitest summary: 2 failed files, 23 passed files; 1 failed test, 96 passed tests.

### Picker compatibility RED

After reviewing the brief's `TemplatePicker({ templates, onSelect })` interface, a test was added for its uncontrolled default and all selection categories:

```text
pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run
exit 1
```

The expected failure showed that `空白项目` was not checked when no controlled `value` prop was supplied. The component was then updated to support both uncontrolled and controlled usage.

### Final GREEN

Fresh post-commit verification:

```text
pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run
exit 0
25 test files passed
101 tests passed
```

The repository's Vitest script executes all test files with this exact requested command.

Additional verification:

```text
pnpm run build
exit 0
tsc --noEmit passed
vite build passed (86 modules transformed)
```

`git diff --cached --check` passed before commit.

## Commit

- `d607d8a feat: add template picker and library`

The commit contains only:

- `src/projects/ProjectDashboard.test.tsx`
- `src/projects/ProjectDashboard.tsx`
- `src/projects/TemplateLibrary.test.tsx`
- `src/projects/TemplateLibrary.tsx`
- `src/projects/TemplatePicker.tsx`
- `src/styles.css`

## Concerns / Follow-up

- No functional blockers remain.
- Template visibility relies on the completed gateway contract: `listTemplates()` supplies only built-ins and member-permitted shared templates, while `listProjects()` supplies only projects visible to the current member.
- Automated accessibility and interaction tests plus the production build were run; no separate live-browser visual pass was performed.
- The pre-existing modified `pnpm-lock.yaml` and untracked `pnpm-workspace.yaml` were preserved and were not staged or committed.

---

# Task 3 Accessibility Follow-up Report

## Status

Complete. This follow-up addresses the Task 3 review findings for the template dialog and picker accessibility.

## Root Cause

`TemplateLibrary` rendered an already-open `<dialog>` rather than calling the native `showModal()` API. It therefore did not receive browser modal behavior (including background inertness and modal focus handling), did not set initial focus, and had no cancellation handler. `TemplatePicker` marked its provenance text as `aria-hidden`, so built-in and shared templates with the same name had identical accessible names.

## Fixes

- `TemplateLibrary` now opens via `showModal()`, which makes the native dialog modal and prevents background keyboard interaction.
- The close button receives initial focus. On close or cancellation, focus returns to the element that launched the dialog when it remains connected.
- Escape and the dialog `cancel` event invoke `onClose`; the close button continues to do so.
- The dialog exposes `aria-modal="true"` and remains labelled by its heading.
- `TemplatePicker` keeps the descriptive and provenance text in the accessibility tree, so duplicate names are distinguishable as, for example, “专业内置模板” and “专业共享模板”.
- Existing picker/dashboard tests were updated to query the now-complete accessible names.

## TDD Evidence

New focused regression tests were added before implementation and run with:

```text
pnpm test -- src/projects/TemplateLibrary.test.tsx --run
exit 1
```

The expected RED run reported three failures:

- duplicate built-in/shared template names could not be distinguished by accessible name;
- `showModal()` was not called;
- focus remained on the launcher rather than moving to the close control.

After the implementation, the focused test run was green.

## Final Verification

```text
pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run
exit 0
25 test files passed
104 tests passed

pnpm build
exit 0
tsc --noEmit passed
vite build passed (86 modules transformed)
```

`git diff --check` also passed before commit.

## Commit

- `fix: improve template dialog accessibility`

## Concerns / Follow-up

- Native `showModal()` provides the actual browser-level background inertness; the jsdom regression test verifies that this API is invoked and that the dialog declares its modal state.
- The pre-existing modified `pnpm-lock.yaml` and untracked `pnpm-workspace.yaml` remain preserved and are excluded from this follow-up commit.
