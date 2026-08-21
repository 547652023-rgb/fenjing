# 拍摄日工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让制片可将每个镜头独立编入拍摄日、排序、查看当日摘要，并据此发布通告。

**Architecture:** 新增 `ShootDay` 及镜头排程字段，通过网关原子化管理编入与排序；工作台加载完整拍摄日数据。拍摄计划组件保持展示与交互本地状态，所有写入由 `ProjectWorkbench` 调用网关后重载。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Supabase、FakeStoryboardGateway。

**Spec:** `docs/superpowers/specs/2026-08-20-shoot-day-workbench-design.md`

## Global Constraints

- 不添加第三方依赖；拖放以原生 HTML Drag and Drop 实现，同时保留按钮式排序。
- 原有场次归属和故事板镜头顺序不变。
- 不从模板快照复制拍摄日或镜头排程。
- 所有代码修改先写会失败的测试并确认失败，再写最小实现。

---

### Task 1: 领域模型与迁移

**Files:**
- Modify: `src/domain/storyboard.ts`
- Modify: `src/domain/models.ts`
- Create: `supabase/migrations/202608200001_shoot_days.sql`
- Test: `src/domain/storyboard.test.ts`

- [ ] 写失败测试：新建项目的镜头没有拍摄日；拍摄日数据可保留在项目中。
- [ ] 运行 `pnpm test --run src/domain/storyboard.test.ts`，确认失败。
- [ ] 定义 `ShootDay`、`CreateShootDayInput` 和 `Shot.shootDayId/shootOrder`，为 `StoryboardProject` 加 `shootDays`。
- [ ] 编写迁移：`shoot_days` 表、RLS、realtime、镜头外键与排序列、索引。
- [ ] 重跑领域测试并提交。

### Task 2: 网关读写与镜头排程

**Files:**
- Modify: `src/data/gateway.ts`
- Modify: `src/data/fakeGateway.ts`
- Modify: `src/data/supabaseGateway.ts`
- Test: `src/data/fakeGateway.test.ts`
- Test: `src/data/supabaseGateway.test.ts`

- [ ] 写失败测试：创建、更新、删除拍摄日；删除后镜头退回待排。
- [ ] 写失败测试：批量编入、移出和重排只影响拍摄日顺序、不影响故事板顺序。
- [ ] 运行两个网关测试文件，确认失败。
- [ ] 扩展接口与两种网关；加载、模板创建、保存镜头均完整映射新字段。
- [ ] 重跑两个网关测试文件并提交。

### Task 3: 拍摄日工作台 UI

**Files:**
- Modify: `src/components/ShootPlan.tsx`
- Modify: `src/components/ShootPlan.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`
- Modify: `src/styles.css`

- [ ] 写失败组件测试：待排镜头显示元数据及拍摄日摘要。
- [ ] 写失败组件测试：多选镜头可编入拍摄日；上移、下移、移出按钮触发对应回调。
- [ ] 运行 `pnpm test --run src/components/ShootPlan.test.tsx src/workbench/ProjectWorkbench.test.tsx`，确认失败。
- [ ] 实现三栏布局、拍摄日创建/编辑、批量编入、排序、原生拖放与空状态。
- [ ] 在工作台接入网关调用、保存状态与重载。
- [ ] 重跑上述测试并提交。

### Task 4: 通告快照与完整验证

**Files:**
- Modify: `src/components/CallSheet.tsx`
- Modify: `src/components/CallSheet.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Test: `src/workbench/ProjectWorkbench.test.tsx`

- [ ] 写失败测试：通告快照包含拍摄日资料、镜头按 `shootOrder` 排列且空拍摄日不能发布。
- [ ] 运行 `pnpm test --run src/components/CallSheet.test.tsx src/workbench/ProjectWorkbench.test.tsx`，确认失败。
- [ ] 将通告选择和版本键改为拍摄日 ID；保留旧场次日期通告的兼容展示。
- [ ] 重跑针对性测试、完整 `pnpm test --run`、`pnpm build` 与 `git diff --check`。
- [ ] 审阅需求覆盖，提交实现。
