# 导出品牌信息与画面纵向多图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为分镜项目保存画幅比例，并在网页、Excel、PDF 中将画面列的最多 5 张图片纵向排列，同时支持本次导出临时 Logo 和第一页项目信息。

**Architecture:** 项目元数据新增持久化 `aspectRatio`，由项目设置组件编辑并通过现有网关保存。导出层使用一个内存导出配置对象，Excel/PDF 共用项目名称、画幅比例、镜头总数和临时 Logo；Logo 不进入项目模型或 Supabase。图片布局由 `ImageCell`、PDF Canvas 渲染器和 XLSX 图片锚点分别实现，但都遵循同一纵向顺序。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Supabase、浏览器 File/Canvas API、手写 XLSX/ZIP 生成器。

## Global Constraints

- 画幅比例保存在项目设置中，默认 `16:9`；预设 `16:9`、`9:16`、`4:3`、`1:1`、`2.35:1`，并支持自定义比例。
- 导出第一页顶部显示项目名称、画幅比例、镜头总数；不增加独立封面页。
- Logo 只用于本次导出，不上传、不保存、不进入实时协作数据；PDF 每页和 Excel 每个打印分页显示 Logo。
- 画面列最多 5 张图片，网页、Excel、PDF 均按上传顺序纵向排列并允许拉伸；参考列最多 1 张。
- 导出只读取当前项目，不修改项目、镜头或远程图片。
- 保持现有依赖，不引入运行时 CDN 或服务端导出任务。

---

### Task 1: 增加画幅比例项目元数据

**Files:**
- Create: `supabase/migrations/202607210001_project_aspect_ratio.sql`
- Modify: `src/domain/storyboard.ts`
- Modify: `src/domain/models.ts`
- Modify: `src/data/gateway.ts`
- Modify: `src/data/fakeGateway.ts`
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/data/fakeGateway.test.ts`
- Modify: `src/data/supabaseGateway.test.ts`
- Modify: `src/domain/storyboard.test.ts`

**Interfaces:**
- Produce `ASPECT_RATIO_OPTIONS`, `DEFAULT_ASPECT_RATIO`, `StoryboardProject.aspectRatio`, and `ProjectMetaPatch.aspectRatio`.
- `StoryboardGateway.saveProjectMeta` accepts `aspectRatio` without changing existing callers.

- [ ] **Step 1: Write failing domain tests**

Add tests asserting `createProject().aspectRatio === "16:9"`, the five preset values are exposed, and `normalizeAspectRatio` rejects an empty value while accepting a custom value such as `2.00:1`.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm test -- src/domain/storyboard.test.ts`

Expected: FAIL because the aspect-ratio constants/property/helper do not exist.

- [ ] **Step 3: Implement the domain model**

Add:

```ts
export const DEFAULT_ASPECT_RATIO = "16:9";
export const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "4:3", "1:1", "2.35:1"] as const;
export type AspectRatioPreset = (typeof ASPECT_RATIO_OPTIONS)[number];

export function normalizeAspectRatio(value: string): string {
  const normalized = value.trim().normalize("NFKC");
  if (!normalized) throw new Error("Aspect ratio is required");
  return normalized;
}
```

Add `aspectRatio` to `StoryboardProject`, set it in `createProject`, and add it to `ProjectMetaPatch`.

- [ ] **Step 4: Extend both gateways**

Make the fake gateway clone and persist `aspectRatio`. Make Supabase `loadProject` select `aspect_ratio` with fallback `row.aspect_ratio || DEFAULT_ASPECT_RATIO`; include `aspectRatio` in `saveProjectMeta` updates. Add the migration:

```sql
alter table public.projects
  add column if not exists aspect_ratio text not null default '16:9';
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/domain/storyboard.test.ts src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts`

Expected: PASS. Commit: `git add supabase/migrations/202607210001_project_aspect_ratio.sql src/domain src/data && git commit -m "feat: persist project aspect ratio"`.

### Task 2: Add project aspect-ratio settings UI

**Files:**
- Create: `src/workbench/ProjectSettings.tsx`
- Create: `src/workbench/ProjectSettings.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/styles.css`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`

**Interfaces:**
- `ProjectSettings` receives `project`, `onChange(ProjectUpdate)`, and `onClose()`.
- Uses the domain constants from Task 1 and saves through the existing `updateProject` path.

- [ ] **Step 1: Write failing component tests**

Test that the dialog shows the current ratio, selecting `9:16` calls `onChange` with `aspectRatio: "9:16"`, selecting custom reveals an input, and submitting an empty custom value shows a Chinese error without calling `onChange`.

- [ ] **Step 2: Run the focused test**

Run: `pnpm test -- src/workbench/ProjectSettings.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the dialog**

Use a native `dialog` consistent with `FieldSettings`. Presets are a `select`; custom mode uses a text input and a “保存” button. Call `onChange((current) => ({ ...current, aspectRatio: normalizeAspectRatio(value) }))` only after validation.

- [ ] **Step 4: Wire it into the workbench**

Add a `项目设置` button beside `字段设置`, a `showProjectSettings` state, and render the dialog. The existing debounced metadata save must persist the ratio.

- [ ] **Step 5: Add styles, run tests, and commit**

Run: `pnpm test -- src/workbench/ProjectSettings.test.tsx src/workbench/ProjectWorkbench.test.tsx`

Expected: PASS. Commit: `git add src/workbench src/styles.css && git commit -m "feat: add project aspect ratio settings"`.

### Task 3: Change workbench multi-image cells to vertical layout

**Files:**
- Modify: `src/components/ImageCell.tsx`
- Modify: `src/components/StoryboardTable.tsx`
- Modify: `src/styles.css`
- Modify: `src/components/StoryboardTable.test.tsx`
- Modify: `src/components/OnlineImageCell.test.tsx`

**Interfaces:**
- Keep `ImageCellProps`, upload/remove callbacks, the 5-image limit, and image position serialization unchanged.
- The layout component must render image items in input order and expose the same accessible labels.

- [ ] **Step 1: Write failing layout tests**

Render a local `ImageCell` with three serialized images and assert the three image labels occur in order, the count is `3/5`, and the upload label remains after the image list. Assert a five-image cell does not render an additional upload input.

- [ ] **Step 2: Run the focused tests**

Run: `pnpm test -- src/components/StoryboardTable.test.tsx src/components/OnlineImageCell.test.tsx`

Expected: FAIL for the new vertical-layout class/structure assertions.

- [ ] **Step 3: Implement the vertical container**

Replace the multi-image horizontal flex layout with a column layout. Keep each item full width, assign a stable minimum slot height, and remove the fixed parent overflow that clips stacked images. Keep `object-fit: fill`.

- [ ] **Step 4: Update table row sizing**

Remove the fixed `height: 160px` for image cells. Use a CSS custom property or item-count class so the row grows with image count and upload state. Keep the upload card at the end and preserve retry/error messages.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/components/StoryboardTable.test.tsx src/components/OnlineImageCell.test.tsx`

Expected: PASS. Commit: `git add src/components src/styles.css && git commit -m "feat: stack frame images vertically"`.

### Task 4: Create shared export configuration and dialog

**Files:**
- Modify: `src/export/storyboardExport.ts`
- Modify: `src/export/ExportActions.tsx`
- Create: `src/export/ExportActions.test.tsx` (or extend existing file)
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Add `ExportProjectInfo` with `title`, `aspectRatio`, and `shotCount`.
- Add `ExportOptions` with optional temporary `logo: ExportLogo`.
- `exportStoryboardPdf(project, options)` and `exportStoryboardExcel(project, options)` receive the same options shape.

- [ ] **Step 1: Write failing export-dialog tests**

Test the unified export button opens a dialog showing project name, ratio, and shot count; choosing a logo shows a preview; removing it clears the preview; PDF/Excel callbacks receive the same in-memory logo; closing clears the temporary selection; export failure keeps the dialog open and shows an error.

- [ ] **Step 2: Run the focused test**

Run: `pnpm test -- src/export/ExportActions.test.tsx`

Expected: FAIL because the unified dialog and options types do not exist.

- [ ] **Step 3: Implement the in-memory logo lifecycle**

Use a local `File` input, validate `image/png`, `image/jpeg`, or `image/webp`, create an object URL for preview, and revoke it in cleanup when replaced, removed, closed, or after successful export. Never call the gateway or store the logo in project state.

- [ ] **Step 4: Wire both exporters**

Replace the two immediate buttons with one `导出文件` button that opens the dialog. Keep separate `导出 Excel` and `导出 PDF` actions inside the dialog and pass the same `ExportOptions` object.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/export/ExportActions.test.tsx src/export/storyboardExport.test.ts`

Expected: PASS. Commit: `git add src/export src/workbench/ProjectWorkbench.tsx src/styles.css && git commit -m "feat: add temporary logo export settings"`.

### Task 5: Update PDF export metadata, logo, and vertical images

**Files:**
- Modify: `src/export/pdfExport.ts`
- Modify: `src/export/pdfExport.test.ts`
- Modify: `src/export/storyboardExport.ts`

**Interfaces:**
- `renderPdfPages(model, dependencies, options)` renders `ExportOptions.logo` on every page.
- `PdfLayout` includes the metadata height and vertical image slot calculations.

- [ ] **Step 1: Write failing PDF tests**

Add tests asserting the layout model carries `aspectRatio` and `shotCount`, the first page reserves metadata space, a five-image row has five vertical image slots, and a logo dependency is requested for every rendered page.

- [ ] **Step 2: Run the focused test**

Run: `pnpm test -- src/export/pdfExport.test.ts`

Expected: FAIL because the renderer has no options or vertical slot layout.

- [ ] **Step 3: Implement first-page metadata and per-page logo**

Reserve a metadata block on page one, draw `项目名称`, `画幅比例`, and `镜头总数`, and draw the decoded logo at the top-right of every canvas before the table. No logo means no drawing call.

- [ ] **Step 4: Implement vertical image drawing and pagination**

Change `drawImageCell` to divide the cell height into `images.length` stacked slots. Compute row height from image count and slot height. If a row exceeds the remaining page body, emit continuation segments without dropping later image slots; keep failed-image placeholders per slot.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/export/pdfExport.test.ts src/export/storyboardExport.test.ts`

Expected: PASS. Commit: `git add src/export/pdfExport.ts src/export/pdfExport.test.ts src/export/storyboardExport.ts && git commit -m "feat: brand PDF exports and stack images"`.

### Task 6: Update Excel export metadata, print header, and vertical images

**Files:**
- Modify: `src/export/excelExport.ts`
- Modify: `src/export/excelExport.test.ts`
- Modify: `src/export/zip.test.ts` if package fixtures need updates

**Interfaces:**
- `buildXlsxPackage(model, loadImage, createFailurePlaceholder, imageDependencies, options)` accepts the shared temporary logo.
- Generated package includes metadata rows, print settings, and image relationships for the logo and shot cells.

- [ ] **Step 1: Write failing XLSX tests**

Assert the worksheet contains project name, aspect ratio, and shot count before the header row; assert a five-image cell creates five anchors with the same column and increasing vertical offsets; assert logo bytes and a header relationship are present when options include a logo.

- [ ] **Step 2: Run the focused test**

Run: `pnpm test -- src/export/excelExport.test.ts src/export/zip.test.ts`

Expected: FAIL because metadata rows, vertical anchors, and logo relationships are absent.

- [ ] **Step 3: Add metadata and print settings**

Update worksheet XML to place the three metadata values above the table, freeze panes below them, set landscape/page margins, and repeat the table header row on print pages.

- [ ] **Step 4: Add a print-page header Logo**

Embed the temporary logo in `xl/media`, add the required drawing/VML relationship, and set the worksheet header/footer to reference it in the right header position. Omit all logo parts when no logo is supplied.

- [ ] **Step 5: Change image anchors to vertical slots**

For each image in a cell, keep the same column and split the row's vertical EMU range into equal slots. Set the row height to the vertical stack height while keeping the reference field at one slot.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test -- src/export/excelExport.test.ts src/export/zip.test.ts`

Expected: PASS. Commit: `git add src/export/excelExport.ts src/export/excelExport.test.ts src/export/zip.test.ts && git commit -m "feat: brand Excel exports and stack images"`.

### Task 7: Integration verification and deployment handoff

**Files:**
- Modify: `README.md` if export/settings usage needs documentation.
- Modify: relevant test files only if integration findings require targeted fixes.

- [ ] **Step 1: Run the complete automated suite**

Run: `pnpm test -- --run`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck and production build**

Run: `pnpm build`

Expected: TypeScript exits successfully and Vite creates `dist/`.

- [ ] **Step 3: Inspect generated files manually**

Use a test project containing 0, 1, and 5 frame images. Open PDF and Excel/print preview and verify the first-page metadata, per-page Logo, vertical image order, stretched image fill, Chinese text, and page breaks.

- [ ] **Step 4: Commit integration documentation**

If README usage changed, run `git add README.md` and commit with `docs: document branded exports`; otherwise leave source commits unchanged.

## Self-review checklist

- Every requirement in `docs/superpowers/specs/2026-07-21-export-branding-and-vertical-images-design.md` maps to a task above.
- No task stores or uploads the temporary Logo.
- `aspectRatio` is named consistently across domain, gateway, database, and export model.
- Both export formats and the workbench use upload order and a five-image maximum.
- Focused tests precede each implementation step, and the complete suite/build run at the end.
