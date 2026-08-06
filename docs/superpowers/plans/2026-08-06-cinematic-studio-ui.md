# 电影制片工作室视觉系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目首页、分镜工作台、主管后台和导出交付流程统一为墨黑、暖白、香槟铜、酒红的制片工作室界面，同时保留全部既有业务行为。

**Architecture:** 在 `src/styles.css` 建立全局视觉 token 与可复用的表面、按钮、表格、对话框规则；四个现有 React 界面只补充语义 class 和必要的可访问性结构。导出组件保留现有导出 API，以更清晰的交付选项与状态反馈替代通用弹窗内容。

**Tech Stack:** React 18、TypeScript、CSS、Vitest、Testing Library、Vite。

## Global Constraints

- 色彩严格使用墨黑、暖白、香槟铜、酒红及其透明层；酒红仅承载主动作和危险语义。
- 不改变 Supabase 网关、项目数据模型、导出格式或既有按钮行为。
- 保留键盘焦点、错误、禁用、加载、空状态与移动端横向表格使用场景。
- 不新增依赖；采用现有 React 与原生 CSS。

---

### Task 1: 导出交付室的可测试交互结构

**Files:**
- Modify: `src/export/ExportActions.test.tsx`
- Modify: `src/export/ExportActions.tsx`

**Interfaces:**
- `ExportActions` 继续接受 `project`、`exportExcel`、`exportPdf`，并将调用结果传递同样的 `ExportOptions`。

- [ ] **Step 1: 写会失败的交付选项测试**

```tsx
await user.click(screen.getByRole("button", { name: "导出文件" }));
expect(screen.getByText("可编辑镜头清单")).toBeVisible();
expect(screen.getByText("审阅用制片稿")).toBeVisible();
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/export/ExportActions.test.tsx --run`

Expected: FAIL because the export dialog does not yet describe either delivery format.

- [ ] **Step 3: 实现最小交付结构**

在导出对话框中为 Excel 与 PDF 按钮增加对应的格式名称和用途说明，保留临时 Logo、处理中禁用和错误留在对话框中的行为。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- src/export/ExportActions.test.tsx --run`

Expected: PASS.

### Task 2: 制片工作室设计系统与四个表面

**Files:**
- Modify: `src/styles.css`
- Modify: `src/projects/ProjectDashboard.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/projects/SupervisorDashboard.tsx`
- Modify: `src/export/ExportActions.tsx`

**Interfaces:**
- 页面组件的 props 和网关调用不变。
- 新增的 class 仅表述页面角色，例如 `studio-shell`、`workbench-command-bar`、`export-format-option`。

- [ ] **Step 1: 建立 CSS token 与全局浏览器表面**

```css
:root {
  --ink: #161416;
  --paper: #f5f0e7;
  --copper: #c68d64;
  --wine: #6f1e2d;
}
```

将 focus、selection、滚动条、按钮状态、输入框与阴影接入 token，确保暖白背景上的正文和控件标签达到可读对比度。

- [ ] **Step 2: 编排项目首页和主管后台**

为首页提供深色制片抬头、暖白工作区、片夹式项目卡片、铜色分隔与酒红主动作；主管后台沿用同一抬头，强化账号状态和危险操作的视觉隔离。

- [ ] **Step 3: 编排工作台和导出交付室**

将工作台头部操作按返回/协作、项目配置、交付分组，给镜头表格建立深色列头、暖白数据轨道和铜色固定列边界；将导出弹窗实现为有遮罩、项目摘要、Logo 区和两个清晰格式选项的交付室。

- [ ] **Step 4: 执行完整测试与构建**

Run: `pnpm test --run && pnpm build`

Expected: all tests and type-check/build pass.

### Task 3: 视觉与机械质量验证

**Files:**
- Inspect: `src/styles.css`, `src/projects/ProjectDashboard.tsx`, `src/workbench/ProjectWorkbench.tsx`, `src/projects/SupervisorDashboard.tsx`, `src/export/ExportActions.tsx`

- [ ] **Step 1: 启动 Vite 并截取桌面和移动端界面**

Run: `pnpm dev -- --host 127.0.0.1`

在 1440px 与 390px 宽度检查项目首页、工作台、主管后台和导出弹窗的层级、溢出与焦点样式。

- [ ] **Step 2: 批量修复截图中发现的问题**

只修复同一轮中明确出现的层级、换行、溢出、可读性或对齐问题。

- [ ] **Step 3: 运行 Impeccable 检测器**

Run: `node /Users/anshandapaidangmacm4/.codex/skills/impeccable/scripts/detect.mjs --json src/styles.css src/projects/ProjectDashboard.tsx src/workbench/ProjectWorkbench.tsx src/projects/SupervisorDashboard.tsx src/export/ExportActions.tsx`

Expected: report mechanical design findings for one final batch of fixes.
