# 拍摄通告 P1 收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已发布拍摄通告提供成员确认、页内临期提醒、镜头分组视图和以版本快照为来源的正式打印单。

**Architecture:** 回执以独立表按通告版本保存，网关为界面提供成员与回执的组合数据；当前版本切换、发布或确认后由工作台刷新。通告组件保持编辑和展示职责，正式打印由独立的纯快照模型与打印视图承担，避免读取会变化的项目草稿。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、Supabase Postgres/RLS、现有 FakeStoryboardGateway。

**Spec:** `docs/superpowers/specs/2026-08-21-call-sheet-p1-completion-design.md`

## Global Constraints

- 不做站内通知中心、短信、邮件、企业微信或其他外部推送。
- 不新增部门或镜头负责人字段；镜头仅按已有场次和生产状态分组。
- 正式打印仅使用当前未撤销发布版本快照；草稿仍使用现有拍摄日打印。
- 所有数据和 RLS 仅限项目成员；成员只能确认自己的回执。
- 不修改或合并 `integration/storyboard-platform`；在 `优化分支2` 完成、测试、提交、推送。

---

## File structure

- `src/domain/models.ts`：定义 `CallSheetAcknowledgement` 传输类型。
- `src/data/gateway.ts`：定义读取和确认回执的网关契约。
- `src/data/fakeGateway.ts`：以版本 ID 和用户 ID 保存幂等确认。
- `src/data/supabaseGateway.ts`：实现回执读写与错误映射。
- `supabase/migrations/202608210003_call_sheet_acknowledgements.sql`：表、索引和成员 RLS。
- `src/workbench/ProjectWorkbench.tsx`：装载成员/回执并在发布、切换日期、确认后刷新。
- `src/components/CallSheet.tsx`：成员确认、临期提示、两种镜头分组和正式打印入口。
- `src/export/callSheetPrint.ts`：从版本快照建立类型安全的正式打印模型。
- `src/export/CallSheetPrintView.tsx`：渲染固定版本的正式通告。
- `src/styles.css`：回执、提醒、分组和打印样式。

### Task 1: 回执领域契约、迁移与网关

**Files:**
- Modify: `src/domain/models.ts:103-112`
- Modify: `src/data/gateway.ts:90-104`
- Modify: `src/data/fakeGateway.ts:75-95,576-600`
- Modify: `src/data/supabaseGateway.ts:679-700`
- Create: `supabase/migrations/202608210003_call_sheet_acknowledgements.sql`
- Test: `src/data/fakeGateway.test.ts:215-245`
- Test: `src/data/supabaseGateway.test.ts`

**Interfaces:**
- Produces `CallSheetAcknowledgement = { callSheetVersionId: string; userId: string; acknowledgedAt: string }`.
- Produces `listCallSheetAcknowledgements(versionId: string): Promise<CallSheetAcknowledgement[]>` and `acknowledgeCallSheet(versionId: string): Promise<CallSheetAcknowledgement>`.

- [ ] **Step 1: Write failing fake-gateway tests**

```ts
it("records one acknowledgement per member and version", async () => {
  const version = await gateway.publishCallSheet(project.id, "2026-08-13", {});
  const first = await gateway.acknowledgeCallSheet(version.id);
  const repeated = await gateway.acknowledgeCallSheet(version.id);
  expect(repeated).toEqual(first);
  await expect(gateway.listCallSheetAcknowledgements(version.id)).resolves.toEqual([first]);
});

it("rejects acknowledgement of a withdrawn version", async () => {
  const version = await gateway.publishCallSheet(project.id, "2026-08-13", {});
  await gateway.withdrawCallSheetVersions(project.id, "2026-08-13");
  await expect(gateway.acknowledgeCallSheet(version.id)).rejects.toMatchObject({ code: "forbidden" });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/data/fakeGateway.test.ts`

Expected: FAIL because acknowledgement methods do not exist.

- [ ] **Step 3: Add the contract, in-memory implementation, Supabase implementation, and migration**

```ts
export type CallSheetAcknowledgement = {
  callSheetVersionId: string;
  userId: string;
  acknowledgedAt: string;
};

async acknowledgeCallSheet(versionId: string): Promise<CallSheetAcknowledgement> {
  const existing = this.callSheetAcknowledgements.get(versionId)?.find((row) => row.userId === this.currentUser?.id);
  if (existing) return { ...existing };
  // Verify the caller is a member and the version is not withdrawn, then persist one row.
}
```

```sql
create table public.call_sheet_acknowledgements (
  call_sheet_version_id uuid not null references public.call_sheet_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (call_sheet_version_id, user_id)
);
alter table public.call_sheet_acknowledgements enable row level security;
create policy call_sheet_acknowledgements_select_member on public.call_sheet_acknowledgements
  for select using (exists (select 1 from public.call_sheet_versions v where v.id = call_sheet_version_id and public.is_project_member(v.project_id)));
create policy call_sheet_acknowledgements_insert_self on public.call_sheet_acknowledgements
  for insert with check (user_id = auth.uid() and exists (select 1 from public.call_sheet_versions v where v.id = call_sheet_version_id and v.withdrawn_at is null and public.is_project_member(v.project_id)));
```

Supabase confirmation uses `insert(...).select(...)`; on a unique conflict, re-read the current user's existing acknowledgement and return it, making retries idempotent.

- [ ] **Step 4: Run focused gateway tests**

Run: `npm test -- --run src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/models.ts src/data/gateway.ts src/data/fakeGateway.ts src/data/fakeGateway.test.ts src/data/supabaseGateway.ts src/data/supabaseGateway.test.ts supabase/migrations/202608210003_call_sheet_acknowledgements.sql
git commit -m "feat: add call-sheet acknowledgements"
```

### Task 2: 工作台数据编排与成员确认区

**Files:**
- Modify: `src/workbench/ProjectWorkbench.tsx:83-185,544-554,800`
- Modify: `src/components/CallSheet.tsx:7-15,55-210`
- Modify: `src/components/CallSheet.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`
- Modify: `src/styles.css:2259-2267`

**Interfaces:**
- Consumes Task 1 gateway methods and `CallSheetAcknowledgement`.
- `CallSheet` receives `members`, `acknowledgements`, `currentUserId`, and `onAcknowledge(versionId)`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("lets an unacknowledged member confirm the current version and shows progress", async () => {
  const onAcknowledge = vi.fn();
  render(<CallSheet project={project} versions={[version(snapshot)]} currentUserId="editor" members={[owner, editor]} acknowledgements={[{ callSheetVersionId: "v1", userId: "owner", acknowledgedAt: "2026-08-12T01:00:00Z" }]} onAcknowledge={onAcknowledge} />);
  expect(screen.getByText("已确认 1 / 2" )).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认已阅读 V1" }));
  expect(onAcknowledge).toHaveBeenCalledWith("v1");
});

it("does not offer confirmation for a withdrawn version", () => {
  render(<CallSheet project={project} versions={[{ ...version(snapshot), withdrawnAt: "2026-08-12T01:00:00Z" }]} currentUserId="editor" members={[editor]} />);
  expect(screen.queryByRole("button", { name: /确认已阅读/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/components/CallSheet.test.tsx src/workbench/ProjectWorkbench.test.tsx`

Expected: FAIL because the props and confirmation UI do not exist.

- [ ] **Step 3: Implement data refresh and confirmation UI**

```tsx
const currentAcknowledged = acknowledgements.some((row) => row.callSheetVersionId === currentVersion?.id && row.userId === currentUserId);
const acknowledgementRows = members.map((member) => ({ member, acknowledgement: acknowledgements.find((row) => row.userId === member.userId) }));
```

In `ProjectWorkbench`, load members once after project load; create `loadCallSheetAcknowledgements(versionId)` that clears data without an active version, and call it after version refresh. `onAcknowledge` awaits the gateway, then re-loads acknowledgement rows. The UI displays `已确认 X / Y`, a member row showing `待确认` or localized timestamp, and only enables the action when `currentVersion` exists, is active, and the user has not confirmed.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/components/CallSheet.test.tsx src/workbench/ProjectWorkbench.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/ProjectWorkbench.tsx src/workbench/ProjectWorkbench.test.tsx src/components/CallSheet.tsx src/components/CallSheet.test.tsx src/styles.css
git commit -m "feat: show call-sheet acknowledgement progress"
```

### Task 3: 临期提醒与镜头分组视图

**Files:**
- Modify: `src/components/CallSheet.tsx`
- Modify: `src/components/CallSheet.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `members` and Task 2 acknowledgement state.
- Produces a local `shotGrouping: "scene" | "status"` state; no persistence.

- [ ] **Step 1: Write failing tests**

```tsx
it("warns about unacknowledged members within three days of the shoot", () => {
  vi.setSystemTime(new Date("2026-08-10T08:00:00Z"));
  render(<CallSheet project={withShootDate(project, "2026-08-13")} versions={[version(snapshot)]} members={[owner, editor]} acknowledgements={[]} />);
  expect(screen.getByRole("status")).toHaveTextContent("距离拍摄 3 天，2 位成员尚未确认");
});

it("groups scheduled shots by production status when selected", async () => {
  render(<CallSheet project={projectWithTwoStatuses} />);
  await userEvent.click(screen.getByRole("button", { name: "按现场状态" }));
  expect(screen.getByRole("heading", { name: "待拍" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "已完成" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component tests and verify failure**

Run: `npm test -- --run src/components/CallSheet.test.tsx`

Expected: FAIL because reminder and grouping controls are absent.

- [ ] **Step 3: Implement pure calculations and accessible grouping controls**

```ts
const daysUntilShoot = Math.ceil((Date.parse(`${selectedDate}T00:00:00`) - Date.now()) / 86_400_000);
const showDueReminder = Boolean(currentVersion && !currentVersion.withdrawnAt && daysUntilShoot >= 0 && daysUntilShoot <= 3 && unacknowledgedCount > 0);
const groupKey = shotGrouping === "scene" ? (scene?.name || "未分配场次") : (shot.values.productionStatus || "待制作");
```

Render `role="status"` reminder only under the above predicate. Add two pressed buttons, `按场次` and `按现场状态`; build groups in original scheduled-shot order and render each group heading before its shot articles. The existing per-shot update form remains inside every article.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/components/CallSheet.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CallSheet.tsx src/components/CallSheet.test.tsx src/styles.css
git commit -m "feat: group and flag call-sheet execution"
```

### Task 4: 从发布快照生成正式打印模型与视图

**Files:**
- Create: `src/export/callSheetPrint.ts`
- Create: `src/export/CallSheetPrintView.tsx`
- Create: `src/export/callSheetPrint.test.ts`
- Create: `src/export/CallSheetPrintView.test.tsx`
- Modify: `src/components/CallSheet.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `CallSheetVersion`, `ProjectMember[]`, `CallSheetAcknowledgement[]`.
- Produces `buildCallSheetPrintModel(version, members, acknowledgements)` and `CallSheetPrintView`.

- [ ] **Step 1: Write failing print-model and view tests**

```tsx
it("builds the formal print model exclusively from the published snapshot", () => {
  const model = buildCallSheetPrintModel(version(snapshotWithLocation("已发布地点")), [owner], []);
  expect(model.versionNumber).toBe(1);
  expect(model.shootDay.location).toBe("已发布地点");
  expect(model.acknowledgementSummary).toEqual({ acknowledged: 0, total: 1 });
});

it("renders version and acknowledgement summary in the formal print view", () => {
  render(<CallSheetPrintView model={model} onClose={vi.fn()} />);
  expect(screen.getByText("正式拍摄通告 · V1")).toBeInTheDocument();
  expect(screen.getByText("成员确认：1 / 2")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/export/callSheetPrint.test.ts src/export/CallSheetPrintView.test.tsx`

Expected: FAIL because the model builder and view do not exist.

- [ ] **Step 3: Implement narrow snapshot parser, formal view, and entry point**

```ts
export type CallSheetPrintModel = {
  projectTitle: string;
  versionNumber: number;
  publishedAt: string;
  shootDay: ShootDay;
  scenes: StoryboardScene[];
  shots: Shot[];
  acknowledgementSummary: { acknowledged: number; total: number };
};
```

Validate the minimum snapshot shape (`projectTitle`, non-null `shootDay`, `shots`, `scenes`) and throw `Error("通告版本快照不完整")` for invalid legacy data. In `CallSheet`, show `打印正式通告 Vn` only for `currentVersion`; opening it calls the model builder with the version, project members, and that version's acknowledgements. The print view has a distinct `aria-label="正式拍摄通告"`, calls `window.print()`, and renders version/publication time, production and safety details, scenes plus assigned shots, and `成员确认：X / Y`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/export/callSheetPrint.test.ts src/export/CallSheetPrintView.test.tsx src/components/CallSheet.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/export/callSheetPrint.ts src/export/callSheetPrint.test.ts src/export/CallSheetPrintView.tsx src/export/CallSheetPrintView.test.tsx src/components/CallSheet.tsx src/components/CallSheet.test.tsx src/styles.css
git commit -m "feat: print published call sheets"
```

### Task 5: 全量验证与远程交付

**Files:**
- Verify: all changed source, tests, migration, spec and plan files.

- [ ] **Step 1: Run full tests**

Run: `npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Check patch hygiene and branch state**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors and only intended branch changes.

- [ ] **Step 4: Push the isolated branch**

Run: `git push`

Expected: `优化分支2` updated on `origin`; do not merge into `integration/storyboard-platform`.
