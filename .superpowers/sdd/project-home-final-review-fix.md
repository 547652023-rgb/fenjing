# Project Home Final Review Fix

Date: 2026-07-22

## Addressed findings

- Personal folder assignment is available on every active visible project card, including invited/editor projects. Rename, icon, trash, restore, and permanent-delete controls remain owner-only.
- `ProjectSummary` now carries `aspectRatio`. Fake and Supabase summary mappings populate it, and project cards render it directly without calling `loadProject()` for every card.
- The project home now has a `640px` phone breakpoint. It removes the desktop body minimum width, stacks the header/sidebar/filter/card layout, makes the sidebar non-sticky, and permits action rows to wrap.

## TDD evidence

The regression tests were added first and observed failing for the intended reasons:

- invited project cards did not expose personal folder assignment;
- dashboard startup called `loadProject()` once per card;
- fake/Supabase summaries omitted `aspectRatio`;
- the stylesheet retained `body { min-width: 960px }` and had no phone breakpoint.

After the implementation, the focused command passed 34 tests:

```text
pnpm exec vitest run src/projects/ProjectDashboard.test.tsx src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts src/styles.test.js
Test Files  4 passed (4)
Tests       34 passed (34)
```

## Release gate

No real Supabase runtime deployment was attempted in this workspace. Before release, deploy the existing migrations to a staging Supabase project and verify the generated REST query accepts the summary projection (including `aspect_ratio`), editor-owned folder assignment/upsert and removal succeed under live RLS, owner-only project actions remain inaccessible to editors, and the project home is manually checked at representative phone widths in a real browser.

## Final verification

Fresh final verification completed successfully:

```text
pnpm exec vitest run
Test Files  29 passed (29)
Tests       140 passed (140)

pnpm build
tsc --noEmit && vite build
88 modules transformed
build completed successfully
```
