# 参考图片列统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使“参考”列与“画面”列同样支持最多五张纵向 16:9 图片，并在导出中保留相同数量。

**Architecture:** `StoryboardTable` 是画面和参考图片列传入 `ImageCell` 配置的唯一入口；将参考列纳入同一五张图片配置即可复用上传、拖拽、裁切和缩略图行为。`buildExportModel` 是 Excel/PDF 共用的图片来源；它也以同一字段规则保留五张。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

## Global Constraints

- “frame” 与 “reference” 同时支持最多 5 张图片。
- 其它图片字段保持单图。
- 仅暂存和提交本计划涉及的源代码、测试和文档；不触碰用户现有未提交文件。

---

### Task 1: 统一工作台和导出的参考图片上限

**Files:**
- Modify: `src/components/StoryboardTable.tsx:203-227`
- Create: `src/components/ReferenceImageColumn.test.tsx`
- Modify: `src/export/storyboardExport.ts:43`
- Modify: `src/export/storyboardExport.test.ts:27-43`

**Interfaces:**
- Consumes: `ImageCell` 的 `maxImages?: number`，大于 1 时启用多选、拖拽批量上传、16:9 预处理与纵向缩略图。
- Produces: “frame”和“reference”在工作台和 `ExportCell.images` 中均最多保留五张。

- [x] **Step 1: 写出失败回归测试**

新建工作台测试，要求参考输入框拥有 `multiple` 属性；将导出测试改为要求参考图片长度为 5：

```ts
expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
expect(screen.getByLabelText("参考-1")).toHaveAttribute("multiple");

expect(row.cells.find((cell) => cell.fieldId === "reference")?.images).toHaveLength(5);
```

- [x] **Step 2: 运行测试，确认其因当前单图规则失败**

Run: `pnpm test -- --run src/components/ReferenceImageColumn.test.tsx src/export/storyboardExport.test.ts`

Expected: 参考列 `multiple` 断言失败，参考导出图片长度得到 `1` 而非 `5`。

- [x] **Step 3: 实现最小规则统一**

在两个 `ImageCell` 调用以及导出模型中使用同一字段判断：

```ts
const maxImages = field.id === "frame" || field.id === "reference" ? 5 : 1;
```

将该值传给 `ImageCell` 或用于 `parseRemoteImages(value).slice(0, maxImages)`。

- [x] **Step 4: 运行定向测试，确认通过**

Run: `pnpm test -- --run src/components/ReferenceImageColumn.test.tsx src/export/storyboardExport.test.ts`

Expected: 两个测试文件均通过，参考列多选和五张导出被覆盖。

- [x] **Step 5: 运行完整验证**

Run: `pnpm test -- --run && pnpm build && git diff --check`

Expected: 测试与构建退出码均为 0，`git diff --check` 无输出。

- [x] **Step 6: 提交实现**

```bash
git add src/components/StoryboardTable.tsx src/components/ReferenceImageColumn.test.tsx src/export/storyboardExport.ts src/export/storyboardExport.test.ts docs/superpowers/plans/2026-07-29-reference-image-column-parity.md
git commit -m "feat: align reference images with storyboard frames"
```
