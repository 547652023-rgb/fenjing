# 模板系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前项目成员提供内置模板、共享自定义模板、模板库与按模板创建项目。

**Architecture:** 内置模板由前端的纯函数提供，不能被编辑。自定义模板存入 Supabase `project_templates`，保存不含图片和成员的项目快照；RLS 通过源项目成员关系限制读取和写入。网关向仪表盘和工作台提供模板读写与从模板创建项目的接口。

**Tech Stack:** React 18、TypeScript、Vitest、Supabase PostgreSQL 与 RLS、Vite。

## Global Constraints

- 内置模板为专业、简洁、宣传片；所有登录用户可用且不可编辑或删除。
- 自定义模板仅源项目成员可见，所有源项目成员均可新增、编辑、删除。
- 模板包含标题建议、画幅比例、字段、字段选项与默认镜头；绝不包含图片、成员、Logo 或历史。
- 从模板创建的项目独立于模板与源项目。

---

### Task 1: 定义可序列化模板与内置模板

**Files:**
- Create: `src/domain/templates.ts`
- Create: `src/domain/templates.test.ts`
- Modify: `src/domain/models.ts`

**Interfaces:**
- Produce `StoryboardTemplate`, `TemplateSnapshot`, `BUILT_IN_TEMPLATES`, `projectToTemplateSnapshot(project)` and `templateToProject(snapshot, id, title)`.
- `TemplateSnapshot` uses `{ title, aspectRatio, fields, shots }`, and removes every image-field value from copied shots.

- [ ] **Step 1: Write the failing domain tests**

```ts
it("removes image values when saving a project as a template", () => {
  const snapshot = projectToTemplateSnapshot(projectWithFrameImage);
  expect(snapshot.shots[0].values.frame).toBeUndefined();
  expect(snapshot.fields).toEqual(projectWithFrameImage.fields);
});

it("creates an independent project from a template snapshot", () => {
  const project = templateToProject(BUILT_IN_TEMPLATES[0].snapshot, "p-2", "广告片");
  expect(project.id).toBe("p-2");
  expect(project.title).toBe("广告片");
});
```

- [ ] **Step 2: Run the focused tests**

Run: `pnpm test -- src/domain/templates.test.ts --run`

Expected: FAIL because `src/domain/templates.ts` does not exist.

- [ ] **Step 3: Implement the template domain module**

```ts
export type TemplateSnapshot = Pick<StoryboardProject, "title" | "aspectRatio" | "fields" | "shots">;
export type StoryboardTemplate = {
  id: string; name: string; sourceProjectId?: string; builtIn: boolean;
  snapshot: TemplateSnapshot; updatedAt: string;
};
```

Clone fields/options and shots/values at every conversion boundary; remove values whose field type is `image`; define the three named built-ins using stable `builtin:*` ids.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- src/domain/templates.test.ts --run`

Expected: PASS.

```bash
git add src/domain/templates.ts src/domain/templates.test.ts src/domain/models.ts
git commit -m "feat: add storyboard template domain"
```

### Task 2: Persist shared templates with member-only RLS

**Files:**
- Create: `supabase/migrations/202607210002_project_templates.sql`
- Modify: `src/data/gateway.ts`
- Modify: `src/data/fakeGateway.ts`
- Modify: `src/data/fakeGateway.test.ts`
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/data/supabaseGateway.test.ts`

**Interfaces:**
- `listTemplates(): Promise<StoryboardTemplate[]>`
- `createTemplate(sourceProjectId: string, name: string, snapshot: TemplateSnapshot): Promise<StoryboardTemplate>`
- `updateTemplate(templateId: string, name: string, snapshot: TemplateSnapshot): Promise<void>`
- `deleteTemplate(templateId: string): Promise<void>`
- `createProject(title: string, template?: TemplateSnapshot): Promise<ProjectSummary>`

- [ ] **Step 1: Write failing gateway tests**

```ts
it("lets project members share templates but hides them from non-members", async () => {
  await owner.createTemplate(project.id, "广告", snapshot);
  await editor.signIn("editor@example.com", "password");
  expect((await editor.listTemplates()).map((template) => template.name)).toContain("广告");
  await outsider.signIn("outsider@example.com", "password");
  expect(await outsider.listTemplates()).toEqual(BUILT_IN_TEMPLATES);
});
```

- [ ] **Step 2: Run focused gateway tests**

Run: `pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run`

Expected: FAIL because template gateway methods do not exist.

- [ ] **Step 3: Add database migration and gateway code**

Create `project_templates(id uuid primary key default gen_random_uuid(), source_project_id uuid not null references projects(id) on delete cascade, name text not null, snapshot jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`. Enable RLS and add select/insert/update/delete policies that call the existing `is_project_member(source_project_id)` helper. Fake gateway stores snapshots in a map and checks membership before each operation. Supabase gateway serializes `snapshot` JSON and applies its existing error mapping.

- [ ] **Step 4: Create projects from snapshots**

After inserting `projects`, use the existing fields/field_options/shots persistence path to insert the snapshot structure. The normal empty-project path remains unchanged when no template is given.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run`

Expected: PASS.

```bash
git add supabase/migrations/202607210002_project_templates.sql src/data
git commit -m "feat: persist shared project templates"
```

### Task 3: Add template selection and template library UI

**Files:**
- Create: `src/projects/TemplatePicker.tsx`
- Create: `src/projects/TemplateLibrary.tsx`
- Create: `src/projects/TemplateLibrary.test.tsx`
- Modify: `src/projects/ProjectDashboard.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `TemplatePicker({ templates, onSelect })` returns `"blank" | templateId`.
- `TemplateLibrary({ templates, onCreate, onUpdate, onDelete, onClose })` never exposes edit/delete controls for `builtIn: true`.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("selects a template while creating a project", async () => {
  render(<ProjectDashboard gateway={gateway} user={user} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "新建项目" }));
  await user.click(screen.getByRole("radio", { name: "宣传片" }));
  await user.click(screen.getByRole("button", { name: "创建" }));
  expect(gateway.createProject).toHaveBeenCalledWith("项目", BUILT_IN_TEMPLATES[2].snapshot);
});
```

- [ ] **Step 2: Run focused UI tests**

Run: `pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run`

Expected: FAIL because picker and library do not exist.

- [ ] **Step 3: Implement picker and library**

Make the project creation form display blank, built-in and permitted shared templates. The library supports a name field, source-project selection only from projects visible to the member, and confirms destructive deletion. User-facing errors remain Chinese.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.test.tsx --run`

Expected: PASS.

```bash
git add src/projects/TemplatePicker.tsx src/projects/TemplateLibrary.tsx src/projects/TemplateLibrary.test.tsx src/projects/ProjectDashboard.tsx src/styles.css
git commit -m "feat: add template picker and library"
```

### Task 4: Save the current workbench project as a template

**Files:**
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Create: `src/workbench/SaveTemplateDialog.tsx`
- Create: `src/workbench/SaveTemplateDialog.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.test.tsx`

**Interfaces:**
- `SaveTemplateDialog({ project, onSave, onClose })` calls `onSave(name, projectToTemplateSnapshot(project))` only for non-empty names.

- [ ] **Step 1: Write failing component tests**

```tsx
it("saves the current project as an image-free shared template", async () => {
  render(<SaveTemplateDialog project={projectWithImage} onSave={onSave} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText("模板名称"), "拍摄模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));
  expect(onSave).toHaveBeenCalledWith("拍摄模板", expect.objectContaining({ shots: [{ values: {} }] }));
});
```

- [ ] **Step 2: Run focused component tests**

Run: `pnpm test -- src/workbench/SaveTemplateDialog.test.tsx src/workbench/ProjectWorkbench.test.tsx --run`

Expected: FAIL because the dialog and workbench action do not exist.

- [ ] **Step 3: Implement save action**

Add a `保存为模板` button to the workbench action row, a named dialog with Chinese validation, gateway create call using the current project id as `sourceProjectId`, and a visible success/error status. Never alter the current project after saving.

- [ ] **Step 4: Run all tests, build, and commit**

Run: `pnpm test -- --run && pnpm build`

Expected: all tests PASS and Vite build succeeds.

```bash
git add src/workbench/ProjectWorkbench.tsx src/workbench/ProjectWorkbench.test.tsx src/workbench/SaveTemplateDialog.tsx src/workbench/SaveTemplateDialog.test.tsx
git commit -m "feat: save workbench projects as templates"
```

## Self-review

- Tasks 1–4 cover all first-version template requirements; project homepage requirements remain intentionally separate.
- Every name used by UI, gateway and migration is `StoryboardTemplate`, `TemplateSnapshot`, `sourceProjectId` or `project_templates` consistently.
- All custom templates are member-scoped and all built-ins are immutable client data.
