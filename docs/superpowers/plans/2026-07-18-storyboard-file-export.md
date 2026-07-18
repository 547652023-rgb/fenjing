# 分镜工作台文件导出实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在分镜工作台中加入可直接下载、包含可见自定义列与分镜图片的 Excel 和 PDF 导出。

**Architecture:** 先把当前项目转换成独立、只读的导出模型。Excel 由原生 Office Open XML 文件和无压缩 ZIP 容器组成；PDF 由浏览器 Canvas 渲染分镜页面，再封装成标准 PDF。工作台只负责触发导出和显示状态，导出失败不会修改项目或影响多人协作保存。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、浏览器 Canvas、Office Open XML、PDF 1.4

## Global Constraints

- 导出完全在浏览器完成，不新增服务器、Supabase 表或后台任务。
- 只导出可见字段，字段和镜头顺序与工作台一致。
- “画面”每格最多 5 张图片，“参考”每格最多 1 张图片；图片在单元格内横向等分并拉伸。
- 单张图片加载失败时继续生成文件，并在对应单元格显示“图片加载失败”。
- 空项目生成包含表头的有效文件。
- 能打开项目工作台的成员均可导出。
- 不新增第三方运行时依赖、外部 CDN 或服务器端导出服务。

---

### Task 1: 导出模型与安全文件名

**Files:**
- Create: `src/export/storyboardExport.ts`
- Test: `src/export/storyboardExport.test.ts`

**Interfaces:**
- Consumes: `StoryboardProject`、`FieldDefinition`、`RemoteImage`。
- Produces: `ExportModel`、`ExportCell`、`buildExportModel(project)`、`exportFilename(project, extension, date?)`。

- [ ] **Step 1: 写导出模型失败测试**

Create `src/export/storyboardExport.test.ts` with tests equivalent to:

```ts
import { createProject } from "../domain/storyboard";
import { buildExportModel, exportFilename } from "./storyboardExport";

it("exports visible fields and shots in workbench order", () => {
  const project = createProject();
  project.title = "广告/片";
  project.fields = project.fields
    .map((field) => field.id === "reference" ? { ...field, visible: false } : field)
    .reverse()
    .map((field, order) => ({ ...field, order }));
  project.shots = [
    { id: "b", values: { shotNumber: "1", content: "第一镜" } },
    { id: "a", values: { shotNumber: "2", content: "第二镜" } },
  ];

  const model = buildExportModel(project);

  expect(model.fields.map(({ id }) => id)).not.toContain("reference");
  expect(model.fields.map(({ order }) => order)).toEqual(
    [...model.fields.map(({ order }) => order)].sort((a, b) => a - b),
  );
  expect(model.rows.map((row) => row.shotId)).toEqual(["b", "a"]);
  expect(model.rows[0].cells.find((cell) => cell.fieldId === "content")?.text)
    .toBe("第一镜");
});

it("limits frame images to five and reference images to one", () => {
  const project = createProject();
  const images = Array.from({ length: 7 }, (_, position) => ({
    path: `p-${position}`,
    url: `https://example.com/${position}.png`,
    name: `${position}.png`,
    position,
  }));
  project.shots[0].values.frame = JSON.stringify(images);
  project.shots[0].values.reference = JSON.stringify(images);

  const [row] = buildExportModel(project).rows;
  expect(row.cells.find((cell) => cell.fieldId === "frame")?.images).toHaveLength(5);
  expect(row.cells.find((cell) => cell.fieldId === "reference")?.images).toHaveLength(1);
});

it("creates a safe dated filename and supports an empty project", () => {
  const project = createProject();
  project.title = "广告/片:*?";
  project.shots = [];
  expect(buildExportModel(project).rows).toEqual([]);
  expect(exportFilename(project, "xlsx", new Date("2026-07-18T00:00:00Z")))
    .toBe("广告-片-分镜表-2026-07-18.xlsx");
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```bash
pnpm test --run src/export/storyboardExport.test.ts
```

Expected: FAIL because `storyboardExport.ts` does not exist.

- [ ] **Step 3: 实现最小导出模型**

Create `src/export/storyboardExport.ts` with these public shapes and behavior:

```ts
import type { RemoteImage } from "../domain/models";
import type { FieldDefinition, StoryboardProject } from "../domain/storyboard";
import { parseRemoteImages } from "../components/StoryboardTable";

export type ExportCell = {
  fieldId: string;
  fieldType: FieldDefinition["type"];
  text: string;
  images: RemoteImage[];
};

export type ExportRow = { shotId: string; cells: ExportCell[] };
export type ExportModel = {
  title: string;
  fields: FieldDefinition[];
  rows: ExportRow[];
};

export function buildExportModel(project: StoryboardProject): ExportModel {
  const fields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order)
    .map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
  return {
    title: project.title,
    fields,
    rows: project.shots.map((shot) => ({
      shotId: shot.id,
      cells: fields.map((field) => {
        const value = shot.values[field.id] ?? "";
        const maxImages = field.id === "frame" ? 5 : 1;
        return {
          fieldId: field.id,
          fieldType: field.type,
          text: field.type === "image" ? "" : value,
          images: field.type === "image" ? parseRemoteImages(value).slice(0, maxImages) : [],
        };
      }),
    })),
  };
}

export function exportFilename(
  project: Pick<StoryboardProject, "title">,
  extension: "xlsx" | "pdf",
  date = new Date(),
): string {
  const safeTitle = project.title.normalize("NFKC").trim()
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "未命名项目";
  return `${safeTitle}-分镜表-${date.toISOString().slice(0, 10)}.${extension}`;
}
```

- [ ] **Step 4: 运行模型测试**

Run: `pnpm test --run src/export/storyboardExport.test.ts`

Expected: PASS.

- [ ] **Step 5: 提交模型**

```bash
git add src/export/storyboardExport.ts src/export/storyboardExport.test.ts
git commit -m "feat: add storyboard export model"
```

---

### Task 2: 原生 XLSX 文件生成与图片嵌入

**Files:**
- Create: `src/export/download.ts`
- Create: `src/export/zip.ts`
- Test: `src/export/zip.test.ts`
- Create: `src/export/excelExport.ts`
- Test: `src/export/excelExport.test.ts`

**Interfaces:**
- Consumes: `ExportModel` from Task 1 and browser `fetch`.
- Produces: `createZip(entries)`、`buildXlsxPackage(model, loadImage?)`、`exportStoryboardExcel(project)`。

- [ ] **Step 1: 写 ZIP 和 XLSX 失败测试**

Create `src/export/zip.test.ts` and verify that `createZip([{ name: "a.txt", data: new TextEncoder().encode("A") }])` begins with bytes `50 4b 03 04`, contains `a.txt`, ends with a valid End of Central Directory record, and is deterministic.

Create `src/export/excelExport.test.ts` to construct a model with one text cell and two image cells, call `buildXlsxPackage`, and assert:

```ts
const files = await buildXlsxPackage(model, async () => ({
  bytes: Uint8Array.from([137, 80, 78, 71]),
  extension: "png",
}));
const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
expect(sheet).toContain("镜号");
expect(sheet).toContain("开场");
expect(sheet).toContain('ht="100"');
expect(files.has("xl/media/image1.png")).toBe(true);
expect(files.has("xl/media/image2.png")).toBe(true);
expect(new TextDecoder().decode(files.get("xl/drawings/drawing1.xml")))
  .toContain("xdr:twoCellAnchor");
```

Add a second test whose image loader rejects and assert that the cell value becomes `"图片加载失败"` while the workbook still resolves.

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `pnpm test --run src/export/excelExport.test.ts`

Expected: FAIL because `excelExport.ts` does not exist.

- [ ] **Step 3: 实现 Blob 下载助手和 ZIP 容器**

Create `src/export/download.ts`:

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Create `src/export/zip.ts` with `createZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array`. Implement CRC-32, little-endian local headers, central-directory headers, and End of Central Directory using ZIP method 0 (stored/uncompressed). UTF-8 encode entry names and set the UTF-8 general-purpose flag.

- [ ] **Step 4: 实现 Office Open XML 工作簿**

Create `src/export/excelExport.ts` with these public interfaces:

```ts
export type LoadedImage = {
  bytes: Uint8Array;
  extension: "png" | "jpeg" | "gif";
};

export async function buildXlsxPackage(
  model: ExportModel,
  loadImage: (url: string) => Promise<LoadedImage> = loadRemoteImage,
): Promise<Map<string, Uint8Array>>;

export async function exportStoryboardExcel(project: StoryboardProject): Promise<void> {
  const files = await buildXlsxPackage(buildExportModel(project));
  const bytes = createZip([...files].map(([name, data]) => ({ name, data })));
  downloadBlob(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    exportFilename(project, "xlsx"),
  );
}
```

The package must contain `[Content_Types].xml`, root relationships, workbook, workbook relationships, styles, worksheet, worksheet relationships, drawing, drawing relationships, and media entries. Use inline strings so Chinese text needs no shared-string table. Set image columns to width 32, text columns to width 18, freeze the first row, style the header green/bold, and set image rows to height 100. Each image uses an `xdr:twoCellAnchor`; divide the cell width evenly by image count so up to five images fill the same cell. XML-escape all project text. Catch each individual image error, put `图片加载失败` in the cell, and continue.

- [ ] **Step 5: 运行 Excel 测试**

Run: `pnpm test --run src/export/excelExport.test.ts`

Expected: PASS with valid deterministic ZIP and Office Open XML package entries.

- [ ] **Step 6: 提交 Excel 导出**

```bash
git add src/export/download.ts src/export/zip.ts src/export/zip.test.ts src/export/excelExport.ts src/export/excelExport.test.ts
git commit -m "feat: export storyboard to Excel"
```

---

### Task 3: Canvas 分页渲染与原生 PDF 下载

**Files:**
- Create: `src/export/pdfExport.ts`
- Test: `src/export/pdfExport.test.ts`

**Interfaces:**
- Consumes: `ExportModel` from Task 1, Canvas 2D and browser image decoding.
- Produces: `buildPdfLayout(model)`、`encodePdfPages(pages)`、`exportStoryboardPdf(project, render?)`。

- [ ] **Step 1: 写 PDF 布局和编码失败测试**

Create `src/export/pdfExport.test.ts` with a project containing visible fields, one hidden field, enough shots for multiple pages, and two frame images. Assert:

```ts
const layout = buildPdfLayout(buildExportModel(project));
expect(layout.fields.map((field) => field.label)).toEqual(["镜号", "画面", "内容"]);
expect(layout.pages.flatMap((page) => page.rows).map((row) => row.shotId))
  .toEqual(project.shots.map((shot) => shot.id));
expect(layout.pages.length).toBeGreaterThan(1);

const pdf = encodePdfPages([{ width: 2, height: 2, jpeg: Uint8Array.from([1, 2, 3]) }]);
expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
expect(new TextDecoder().decode(pdf)).toContain("xref");
expect(new TextDecoder().decode(pdf)).toContain("%%EOF");
```

Add a renderer test using injected canvas/image functions; reject one image and assert the renderer draws `图片加载失败` while still returning JPEG page bytes.

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `pnpm test --run src/export/pdfExport.test.ts`

Expected: FAIL because `pdfExport.ts` does not exist.

- [ ] **Step 3: 实现分页布局和 Canvas 渲染**

Create `src/export/pdfExport.ts`. `buildPdfLayout` must preserve field and shot order and split rows into deterministic A4-landscape pages. `renderPdfPages` creates a white Canvas per page, draws the project title, green header, borders, wrapped text, and 96px image rows using a Chinese system font. Load each remote image as a Blob and decode with `createImageBitmap`; draw multiple images into equal horizontal slots with `drawImage` dimensions that stretch to fill. On individual failure draw `图片加载失败` and continue. Convert each page to JPEG bytes with `canvas.toBlob`.

- [ ] **Step 4: 实现 PDF 1.4 编码和下载**

Implement the public exporter with an injectable renderer:

```ts
type PdfRenderer = (model: ExportModel) => Promise<PdfPageImage[]>;

export async function exportStoryboardPdf(
  project: StoryboardProject,
  render: PdfRenderer = renderPdfPages,
): Promise<void> {
  const pages = await render(buildExportModel(project));
  downloadBlob(new Blob([encodePdfPages(pages)], { type: "application/pdf" }), exportFilename(project, "pdf"));
}
```

`encodePdfPages` creates PDF 1.4 objects for catalog, pages, individual page dictionaries, JPEG image XObjects and content streams; calculate byte offsets for `xref`, add a trailer and `%%EOF`. Each page is landscape and scales one JPEG XObject to the full MediaBox. Empty projects still render one page containing title and headers.

- [ ] **Step 5: 运行 PDF 测试**

Run: `pnpm test --run src/export/pdfExport.test.ts`

Expected: PASS, including pagination, JPEG page embedding and image-error degradation.

- [ ] **Step 6: 提交 PDF 导出**

```bash
git add src/export/pdfExport.ts src/export/pdfExport.test.ts
git commit -m "feat: export storyboard to PDF"
```

---

### Task 4: 工作台导出按钮、状态和错误提示

**Files:**
- Create: `src/export/ExportActions.tsx`
- Test: `src/export/ExportActions.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `exportStoryboardExcel(project)` and `exportStoryboardPdf(project)`.
- Produces: `<ExportActions project={project} />` with two accessible buttons.

- [ ] **Step 1: 写按钮行为失败测试**

Create `src/export/ExportActions.test.tsx` with injected deferred handlers. Verify:

```ts
expect(screen.getByRole("button", { name: "导出 Excel" })).toBeVisible();
expect(screen.getByRole("button", { name: "导出 PDF" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "导出 Excel" }));
expect(exportExcel).toHaveBeenCalledWith(project);
expect(screen.getByRole("button", { name: "正在导出 Excel…" })).toBeDisabled();
expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
```

Add a rejection test asserting `role="alert"` contains `导出失败，请稍后重试` and that both buttons become enabled for retry.

Add a workbench test asserting the two buttons appear after the selected project loads.

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```bash
pnpm test --run src/export/ExportActions.test.tsx src/workbench/ProjectWorkbench.test.tsx
```

Expected: FAIL because `ExportActions` and workbench buttons do not exist.

- [ ] **Step 3: 实现导出操作组件**

Create `src/export/ExportActions.tsx` with optional handler injection:

```tsx
type ExportActionsProps = {
  project: StoryboardProject;
  exportExcel?: (project: StoryboardProject) => Promise<void>;
  exportPdf?: (project: StoryboardProject) => Promise<void>;
};

export function ExportActions({
  project,
  exportExcel = exportStoryboardExcel,
  exportPdf = exportStoryboardPdf,
}: ExportActionsProps) {
  const [active, setActive] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState("");
  async function run(format: "excel" | "pdf") {
    if (active) return;
    setActive(format);
    setError("");
    try {
      await (format === "excel" ? exportExcel(project) : exportPdf(project));
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setActive(null);
    }
  }
  return (
    <div className="export-actions">
      <button disabled={active !== null} type="button" onClick={() => void run("excel")}>
        {active === "excel" ? "正在导出 Excel…" : "导出 Excel"}
      </button>
      <button disabled={active !== null} type="button" onClick={() => void run("pdf")}>
        {active === "pdf" ? "正在导出 PDF…" : "导出 PDF"}
      </button>
      {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: 接入工作台并添加样式**

Render `<ExportActions project={project} />` inside `workbench-actions--spread`, after “字段设置”. Add `.export-actions` as an inline flex group with a small gap, and `.export-actions__error` in the existing danger color. Preserve existing responsive behavior and do not alter save logic.

- [ ] **Step 5: 运行组件和工作台测试**

Run:

```bash
pnpm test --run src/export/ExportActions.test.tsx src/workbench/ProjectWorkbench.test.tsx
```

Expected: PASS.

- [ ] **Step 6: 提交工作台接入**

```bash
git add src/export/ExportActions.tsx src/export/ExportActions.test.tsx src/workbench/ProjectWorkbench.tsx src/workbench/ProjectWorkbench.test.tsx src/styles.css
git commit -m "feat: add export actions to workbench"
```

---

### Task 5: 完整验证和发布准备

**Files:**
- Modify only files required by failures directly caused by Tasks 1-4.

**Interfaces:**
- Consumes: all export modules and existing application tests.
- Produces: a production build ready for the existing GitHub Pages workflow.

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test --run`

Expected: all tests PASS with no unhandled promise rejections.

- [ ] **Step 2: 运行类型检查和生产构建**

Run: `pnpm build`

Expected: TypeScript exits 0 and Vite produces `dist/` successfully.

- [ ] **Step 3: 检查代码和工作树**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional implementation files are changed.

- [ ] **Step 4: 在浏览器执行冒烟测试**

Run: `pnpm dev --host 127.0.0.1`

Open the local app, sign in, enter a project containing Chinese text and two frame images, then verify both buttons download files. Open the `.xlsx` and `.pdf` files and confirm header order, shot order, Chinese text, and stretched images.

- [ ] **Step 5: 确认分支可发布**

Run: `git status --short`

Expected: no output; branch is clean and ready to push.
