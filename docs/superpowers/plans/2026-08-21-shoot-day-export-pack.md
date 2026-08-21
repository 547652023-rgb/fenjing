# 拍摄日导出包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为制片按单个拍摄日生成可打印的拍摄通告单和可编辑的 Excel 镜头执行表。

**Architecture:** 在导出层建立独立的 `ShootDayExportModel`，只读取一个 `ShootDay` 及其按 `shootOrder` 排列的镜头。Excel 在现有自建 XLSX 归档器上扩展为两张工作表；打印通告使用独立 React 视图和 `window.print()`，不引入 PDF 第三方依赖。拍摄计划只负责选择拍摄日、阻止保存中导出和触发相应导出器。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、浏览器原生打印、现有 ZIP/XLSX 导出器。

**Spec:** `docs/superpowers/specs/2026-08-21-shoot-day-export-pack-design.md`

## Global Constraints

- 首期只支持已选择拍摄日的 PDF 打印通告与 Excel 镜头执行表。
- 数据源是 `ShootDay`、当前项目字段和按 `shootOrder` 排列的镜头；不得改变故事板镜头顺序。
- 未保存或保存失败时禁止导出；空拍摄日允许导出，但要显示明确空状态。
- 不新增第三方依赖，不实现资源库、导出历史、预算或冲突检测。
- 每个行为变更先写失败测试，确认失败后再写最小实现。

---

### Task 1: 修复拍摄日创建日期持久化

**Files:**
- Modify: `src/components/ShootPlan.tsx`
- Modify: `src/components/ShootPlan.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`

**Interfaces:**
- Consumes: `onCreateShootDay(input: { title: string; shootDate: string })`。
- Produces: 点击“新建拍摄日”时，填写的 ISO 日期原样传入网关；重载后所选拍摄日显示该日期。

- [ ] **Step 1: 写失败组件测试，覆盖非空日期。**

```tsx
fireEvent.change(screen.getByLabelText("拍摄日名称"), { target: { value: "首日外景" } });
fireEvent.change(screen.getByLabelText("拍摄日日期"), { target: { value: "2026-08-23" } });
fireEvent.click(screen.getByRole("button", { name: "新建拍摄日" }));
expect(onCreateShootDay).toHaveBeenCalledWith({ title: "首日外景", shootDate: "2026-08-23" });
```

- [ ] **Step 2: 运行组件测试确认失败。**

Run: `pnpm test --run src/components/ShootPlan.test.tsx`

Expected: 新测试失败，日期为 `""` 或创建回调未收到输入日期。

- [ ] **Step 3: 写最小修复。**

确保日期控件用能可靠触发 React 状态更新的事件处理，并在创建处理器中读取同一份受控状态：

```tsx
<input
  aria-label="拍摄日日期"
  type="date"
  value={shootDate}
  onInput={(event) => setShootDate(event.currentTarget.value)}
  onChange={(event) => setShootDate(event.currentTarget.value)}
/>
```

保留创建回调：

```tsx
void onCreateShootDay?.({ title, shootDate });
```

- [ ] **Step 4: 重跑组件测试确认通过。**

Run: `pnpm test --run src/components/ShootPlan.test.tsx`

Expected: PASS，已有删除和编辑测试继续通过。

- [ ] **Step 5: 手工冒烟。**

在已部署或本地项目中创建日期为 `2026-08-23` 的临时拍摄日，刷新后确认标题和摘要显示该日期；删除该临时拍摄日并确认镜头回到待排池。

- [ ] **Step 6: 提交。**

```bash
git add src/components/ShootPlan.tsx src/components/ShootPlan.test.tsx src/workbench/ProjectWorkbench.test.tsx
git commit -m "fix: preserve shoot day date on creation"
```

### Task 2: 建立拍摄日导出模型和文件名

**Files:**
- Create: `src/export/shootDayExport.ts`
- Create: `src/export/shootDayExport.test.ts`
- Modify: `src/export/storyboardExport.ts`
- Modify: `src/export/storyboardExport.test.ts`

**Interfaces:**
- Consumes: `StoryboardProject`、`ShootDay`。
- Produces:

```ts
export type ShootDayExportModel = {
  projectTitle: string;
  shootDay: ShootDay;
  summary: { shotCount: number; totalDurationSeconds: number };
  fields: FieldDefinition[];
  rows: ExportRow[];
};

export function buildShootDayExportModel(
  project: StoryboardProject,
  shootDayId: string,
): ShootDayExportModel;

export function shootDayExportFilename(
  project: Pick<StoryboardProject, "title">,
  shootDay: Pick<ShootDay, "title" | "shootDate">,
  extension: "xlsx",
): string;
```

- [ ] **Step 1: 写失败模型测试。**

```ts
const model = buildShootDayExportModel(project, "day-1");
expect(model.rows.map((row) => row.shotId)).toEqual(["shot-2", "shot-1"]);
expect(model.summary).toEqual({ shotCount: 2, totalDurationSeconds: 11 });
expect(shootDayExportFilename(project, day, "xlsx"))
  .toBe("广告片-首日外景-2026-08-23-镜头执行表.xlsx");
```

覆盖：找不到拍摄日抛出错误、无日期使用 `日期待定`、镜头字段按当前可见顺序复制、无效时长按 `0` 计。

- [ ] **Step 2: 运行模型测试确认失败。**

Run: `pnpm test --run src/export/shootDayExport.test.ts`

Expected: FAIL，模块或导出函数不存在。

- [ ] **Step 3: 实现最小导出模型。**

在 `shootDayExport.ts` 中定位拍摄日，筛选 `shot.shootDayId === shootDayId` 的镜头，稳定地按 `(shootOrder ?? 0)` 升序排列；复用 `buildExportModel` 的字段和单元格构造逻辑，避免两套图片解析规则。日期为空时用文字 `日期待定` 生成文件名。

- [ ] **Step 4: 重跑模型及原导出模型测试。**

Run: `pnpm test --run src/export/shootDayExport.test.ts src/export/storyboardExport.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交。**

```bash
git add src/export/shootDayExport.ts src/export/shootDayExport.test.ts src/export/storyboardExport.ts src/export/storyboardExport.test.ts
git commit -m "feat: model shoot day export data"
```

### Task 3: 生成双工作表 Excel 拍摄包

**Files:**
- Modify: `src/export/excelExport.ts`
- Modify: `src/export/excelExport.test.ts`
- Modify: `src/export/zip.test.ts`

**Interfaces:**
- Consumes: `ShootDayExportModel`。
- Produces:

```ts
export async function buildShootDayXlsxPackage(
  model: ShootDayExportModel,
): Promise<Map<string, Uint8Array>>;

export async function exportShootDayExcel(
  project: StoryboardProject,
  shootDayId: string,
): Promise<void>;
```

- [ ] **Step 1: 写失败 Excel 包测试。**

```ts
const files = await buildShootDayXlsxPackage(model);
expect(new TextDecoder().decode(files.get("xl/workbook.xml")))
  .toContain('<sheet name="拍摄日信息" sheetId="1" r:id="rId1"/>');
expect(new TextDecoder().decode(files.get("xl/workbook.xml")))
  .toContain('<sheet name="镜头执行表" sheetId="2" r:id="rId2"/>');
expect(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")))
  .toContain("测试棚 A");
expect(new TextDecoder().decode(files.get("xl/worksheets/sheet2.xml")))
  .toContain("镜号");
```

覆盖空拍摄日：信息表仍存在，镜头表显示 `暂无已排镜头`。

- [ ] **Step 2: 运行 Excel 测试确认失败。**

Run: `pnpm test --run src/export/excelExport.test.ts`

Expected: FAIL，双工作表构造函数不存在。

- [ ] **Step 3: 抽取无图片的通用工作簿 XML 组装。**

保留既有 `buildXlsxPackage` 的分镜表和图片嵌入行为；新增仅文本的双表工作簿路径，写入：

```ts
const infoRows = [
  ["项目", model.projectTitle], ["拍摄日", model.shootDay.title],
  ["日期", model.shootDay.shootDate || "日期待定"], ["地点", model.shootDay.location || "地点待定"],
  ["集合", model.shootDay.callTime || "待定"], ["收工", model.shootDay.wrapTime || "待定"],
  ["负责人", model.shootDay.coordinator || "待确认"], ["备注", model.shootDay.notes || "—"],
  ["镜头数", String(model.summary.shotCount)], ["总时长（秒）", String(model.summary.totalDurationSeconds)],
];
```

镜头表第一行采用可见字段标签，随后按模型 `rows` 写入文本单元格；冻结标题行、横向 A4、适合现场打印。`exportShootDayExcel` 使用 `downloadBlob` 与 `shootDayExportFilename` 下载。

- [ ] **Step 4: 重跑 Excel 全部测试。**

Run: `pnpm test --run src/export/excelExport.test.ts src/export/zip.test.ts`

Expected: PASS；既有包含图片的分镜表导出不回归。

- [ ] **Step 5: 提交。**

```bash
git add src/export/excelExport.ts src/export/excelExport.test.ts src/export/zip.test.ts
git commit -m "feat: export shoot day execution workbook"
```

### Task 4: 提供可打印拍摄通告单

**Files:**
- Create: `src/export/ShootDayPrintView.tsx`
- Create: `src/export/ShootDayPrintView.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ShootDayExportModel`。
- Produces:

```ts
export function ShootDayPrintView({
  model,
  onClose,
}: {
  model: ShootDayExportModel;
  onClose: () => void;
}): JSX.Element;
```

- [ ] **Step 1: 写失败打印视图测试。**

```tsx
render(<ShootDayPrintView model={model} onClose={vi.fn()} />);
expect(screen.getByRole("heading", { name: "首日外景 拍摄通告" })).toBeVisible();
expect(screen.getByText("测试棚 A")).toBeVisible();
expect(screen.getAllByText(/镜头 2/)).toHaveLength(1);
expect(screen.getByRole("button", { name: "打印通告单" })).toBeEnabled();
```

再断言空模型显示 `暂无已排镜头`，并使用 `vi.spyOn(window, "print")` 断言按钮调用打印。

- [ ] **Step 2: 运行打印视图测试确认失败。**

Run: `pnpm test --run src/export/ShootDayPrintView.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现 A4 通告视图与打印 CSS。**

视图包含：项目名、拍摄日标题、日期/地点、集合/收工、负责人、备注、镜头数/总时长和顺序镜头表。屏幕上保留“打印通告单”“关闭”按钮；在 `@media print` 下隐藏按钮和无关工作台区域，设置 `@page { size: A4 portrait; margin: 12mm; }`，表头以 `thead { display: table-header-group; }` 跨页重复。

- [ ] **Step 4: 重跑打印组件测试。**

Run: `pnpm test --run src/export/ShootDayPrintView.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交。**

```bash
git add src/export/ShootDayPrintView.tsx src/export/ShootDayPrintView.test.tsx src/styles.css
git commit -m "feat: add printable shoot day call sheet"
```

### Task 5: 接入拍摄计划导出入口并完整验证

**Files:**
- Modify: `src/components/ShootPlan.tsx`
- Modify: `src/components/ShootPlan.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `exportShootDayExcel(project, shootDayId)`、`buildShootDayExportModel(project, shootDayId)`、`ShootDayPrintView`。
- Produces: 已选拍摄日的 `导出拍摄包` 菜单，包含 `打印拍摄通告单（PDF）` 和 `导出镜头执行表（Excel）`。

- [ ] **Step 1: 写失败交互测试。**

```tsx
render(<ShootPlan project={project} onUpdateScene={vi.fn()} exportShootDayExcel={exportExcel} />);
expect(screen.getByRole("button", { name: "导出拍摄包" })).toBeEnabled();
fireEvent.click(screen.getByRole("button", { name: "导出拍摄包" }));
fireEvent.click(screen.getByRole("button", { name: "导出镜头执行表（Excel）" }));
expect(exportExcel).toHaveBeenCalledWith(project, "day-1");
```

再覆盖：未选择拍摄日时入口禁用；`saveStatus !== "saved"` 时两个导出动作禁用；Excel 抛错时显示 `导出失败，请稍后重试`。

- [ ] **Step 2: 运行拍摄计划与工作台测试确认失败。**

Run: `pnpm test --run src/components/ShootPlan.test.tsx src/workbench/ProjectWorkbench.test.tsx`

Expected: FAIL，拍摄计划尚无导出入口或保存状态参数。

- [ ] **Step 3: 最小接入。**

为 `ShootPlan` 增加：

```ts
saveStatus?: SaveState;
exportShootDayExcel?: (project: StoryboardProject, shootDayId: string) => Promise<void>;
```

工作台传入当前 `saveStatus`。选择拍摄日后显示导出菜单：Excel 动作调用注入导出器；打印动作将 `buildShootDayExportModel(project, day.id)` 传给 `ShootDayPrintView` 覆盖层。运行中的导出禁用同一菜单，失败提示在菜单内显示；关闭打印视图不修改项目数据。

- [ ] **Step 4: 重跑针对性测试。**

Run: `pnpm test --run src/components/ShootPlan.test.tsx src/workbench/ProjectWorkbench.test.tsx src/export/ShootDayPrintView.test.tsx`

Expected: PASS。

- [ ] **Step 5: 全量验证与人工交付检查。**

Run: `pnpm test --run && pnpm build && git diff --check`

Expected: 所有测试通过、构建成功、无空白错误。

在浏览器中创建/选择已有拍摄日，确认：Excel 含“拍摄日信息”“镜头执行表”两表；打印预览为 A4 纵向，信息表头和长镜头表跨页可读；未选择或保存中不能导出。

- [ ] **Step 6: 提交。**

```bash
git add src/components/ShootPlan.tsx src/components/ShootPlan.test.tsx src/workbench/ProjectWorkbench.tsx src/workbench/ProjectWorkbench.test.tsx src/styles.css
git commit -m "feat: export shoot day production pack"
```
