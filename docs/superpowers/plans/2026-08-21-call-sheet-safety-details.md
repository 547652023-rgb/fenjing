# 拍摄通告现场保障信息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让拍摄日可保存并交付天气、雨天预案、安全提示和紧急联系人信息。

**Architecture:** 扩展 `ShootDay` 的六个字符串字段，并以一份增量 Supabase 迁移持久化。拍摄通告沿用现有 `onUpdateShootDay` 回调保存这些字段，发布快照继续复制整个拍摄日对象；打印与 Excel 从 `ShootDayExportModel` 中读取同一份数据。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、Supabase、Vite。

**Spec:** `docs/superpowers/specs/2026-08-21-call-sheet-safety-details-design.md`

## Global Constraints

- 只在 `优化分支2` 工作区修改；不得改动 `integration/storyboard-platform`。
- 新建增量迁移，绝不修改已部署迁移文件。
- 不新增依赖；旧拍摄日通过空字符串兼容。
- 所有功能行为遵循测试优先，完成后运行全量测试、构建和 `git diff --check`。

---

### Task 1: 拍摄日数据与持久化

**Files:**
- Modify: `src/domain/storyboard.ts:26-57`
- Modify: `src/data/fakeGateway.ts:445-471`
- Modify: `src/data/supabaseGateway.ts:145-153,590,762-770`
- Modify: `src/data/fakeGateway.test.ts:167-213`
- Modify: `src/data/supabaseGateway.test.ts`
- Create: `supabase/migrations/202608210002_shoot_day_safety_details.sql`

**Interfaces:**
- Produces: `ShootDay.weather`, `rainPlan`, `safetyNotes`, `emergencyContactName`, `emergencyContactRole`, `emergencyContactPhone`, all `string`.
- Produces: the same optional keys on `CreateShootDayInput`.
- Consumes: existing `StoryboardGateway.createShootDay` and `updateShootDay` signatures unchanged.

- [ ] **Step 1: Write failing gateway tests**

```ts
it("persists shoot-day safety details", async () => {
  const project = await gateway.createProject({ title: "广告片" });
  const day = await gateway.createShootDay(project.id, { title: "首日", weather: "阵雨", rainPlan: "转棚内", safetyNotes: "天台作业系安全绳", emergencyContactName: "王制片", emergencyContactRole: "制片", emergencyContactPhone: "13800000000" });
  await gateway.updateShootDay(project.id, { ...day, weather: "小雨" });
  await expect(gateway.loadProject(project.id)).resolves.toMatchObject({ shootDays: [expect.objectContaining({ weather: "小雨", rainPlan: "转棚内", emergencyContactPhone: "13800000000" })] });
});
```

Add a Supabase test expecting the shoot-day select string and insert/update payloads to contain `weather`, `rain_plan`, `safety_notes`, `emergency_contact_name`, `emergency_contact_role`, and `emergency_contact_phone`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts`

Expected: FAIL because the six fields and Supabase mapping do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ShootDay = {
  weather: string; rainPlan: string; safetyNotes: string;
  emergencyContactName: string; emergencyContactRole: string; emergencyContactPhone: string;
  // existing properties remain unchanged
};
```

Initialize all six properties using `input.<field> ?? ""` in fake and Supabase creates. Add them to `rowToShootDay`, the shoot-day select, and update payload. Add six `text not null default ''` columns to a new migration.

- [ ] **Step 4: Run gateway test to verify it passes**

Run: `npm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/storyboard.ts src/data/fakeGateway.ts src/data/supabaseGateway.ts src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts supabase/migrations/202608210002_shoot_day_safety_details.sql
git commit -m "feat: store shoot-day safety details"
```

### Task 2: 通告编辑与发布状态

**Files:**
- Modify: `src/components/CallSheet.tsx:40-125`
- Modify: `src/components/CallSheet.test.tsx:79-135`
- Modify: `src/styles.css:2259-2265`

**Interfaces:**
- Consumes: Task 1 six `ShootDay` fields and existing `onUpdateShootDay(shootDay)`.
- Produces: a “现场保障” form and snapshot changes that the existing status comparison detects.

- [ ] **Step 1: Write failing CallSheet test**

```tsx
it("saves call-sheet safety details and marks them as unpublished changes", () => {
  const project = projectWithShootDay({ weather: "晴", safetyNotes: "注意脚下" });
  const snapshot = buildCallSheetSnapshot(project, "2026-08-13");
  const onUpdateShootDay = vi.fn();
  const { rerender } = render(<CallSheet project={project} versions={[version(snapshot)]} onUpdateShootDay={onUpdateShootDay} />);
  fireEvent.change(screen.getByLabelText("通告天气"), { target: { value: "阵雨" } });
  fireEvent.change(screen.getByLabelText("通告紧急联系电话"), { target: { value: "13800000000" } });
  fireEvent.click(screen.getByRole("button", { name: "保存现场保障" }));
  expect(onUpdateShootDay).toHaveBeenCalledWith(expect.objectContaining({ weather: "阵雨", emergencyContactPhone: "13800000000" }));
  rerender(<CallSheet project={{ ...project, shootDays: [{ ...project.shootDays![0], weather: "阵雨" }] }} versions={[version(snapshot)]} />);
  expect(screen.getByRole("status")).toHaveTextContent("存在未发布变更");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/CallSheet.test.tsx`

Expected: FAIL because `通告天气` and `保存现场保障` do not exist.

- [ ] **Step 3: Write minimal implementation**

Add `.call-sheet__safety`, rendered only with `shootDay` and `onUpdateShootDay`. Include inputs labelled `通告天气`、`通告雨天备选方案`、`通告安全提示`、`通告紧急联系人`、`通告紧急联系人职责`、`通告紧急联系电话`, plus submit button `保存现场保障`. Copy `shootDay`, replace only those values and call `onUpdateShootDay`. Use the same responsive grid rules as `.call-sheet__details`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/CallSheet.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CallSheet.tsx src/components/CallSheet.test.tsx src/styles.css
git commit -m "feat: edit call-sheet safety details"
```

### Task 3: 打印与 Excel 交付

**Files:**
- Modify: `src/export/ShootDayPrintView.tsx:3-11`
- Modify: `src/export/excelExport.ts:347-350`
- Modify: `src/export/ShootDayPrintView.test.tsx`
- Modify: `src/export/excelExport.test.ts`

**Interfaces:**
- Consumes: Task 1 six fields through existing `ShootDayExportModel`.
- Produces: conditional output in print and Excel; blank fields produce no label or placeholder.

- [ ] **Step 1: Write failing export tests**

```tsx
it("prints only populated shoot-day safety details", () => {
  const model = buildShootDayExportModel(projectWithDay({ weather: "阵雨", safetyNotes: "天台作业系安全绳", emergencyContactPhone: "13800000000" }), "day-1");
  render(<ShootDayPrintView model={model} onClose={vi.fn()} />);
  expect(screen.getByText("天气")).toBeVisible();
  expect(screen.getByText("阵雨")).toBeVisible();
  expect(screen.queryByText("雨天备选方案")).not.toBeInTheDocument();
});
```

Add an Excel test that decodes the information worksheet and expects populated labels `天气`、`安全提示`、`紧急联系人`, their values, and no `雨天备选方案` when empty.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/export/ShootDayPrintView.test.tsx src/export/excelExport.test.ts`

Expected: FAIL because neither output contains the safety fields.

- [ ] **Step 3: Write minimal implementation**

Append one print `dl` item for each non-empty weather, rain plan and safety note. Render emergency contact when at least one of name, role or phone is present, joining non-empty parts with ` · `. Append equivalent conditional information rows to `buildShootDayXlsxPackage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/export/ShootDayPrintView.test.tsx src/export/excelExport.test.ts`

Expected: PASS.

- [ ] **Step 5: Run complete verification and commit**

Run: `npm test -- --run && npm run build && git diff --check`

Expected: all tests pass, production build succeeds, and diff check has no output.

```bash
git add src/export/ShootDayPrintView.tsx src/export/ShootDayPrintView.test.tsx src/export/excelExport.ts src/export/excelExport.test.ts
git commit -m "feat: export call-sheet safety details"
git push
```
