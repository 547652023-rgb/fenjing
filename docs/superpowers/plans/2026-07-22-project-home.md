# 项目首页管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把项目首页升级为个人文件夹式管理界面，同时保留项目协作、Emoji、搜索排序和 30 天回收站。

**Architecture:** 项目表保存所有成员可见的 Emoji 与回收状态；文件夹、项目归属和排序偏好存到按用户隔离的表。网关把这些数据统一为项目首页模型，Dashboard 根据活动侧栏条目过滤、搜索并排序项目。回收的项目仅所有者能看到、恢复或提交彻底删除请求；彻底删除由后台安全异步处理。

**Tech Stack:** React 18、TypeScript、Vitest、Supabase PostgreSQL/RLS、Vite。

## Global Constraints

- Emoji 对项目所有成员可见；文件夹、项目归属、排序仅属于当前用户。
- 任何可见项目均可被归入当前用户的个人文件夹；删除文件夹只取消归类。
- 搜索只匹配项目名称；排序为最近更新、创建时间或名称。
- 回收项目保留所有成员、镜头、字段、图片和个人归属，30 天后由后台永久清除；所有者也可提前提交异步彻底删除请求。
- 只有项目所有者能移入回收站、恢复或提交彻底删除请求；普通成员不能访问回收项目。

---

### Task 1: 首页数据模型、Supabase 表和 RLS

**Files:**
- Modify: `src/domain/models.ts`
- Create: `supabase/migrations/202607220003_project_home.sql`
- Modify: `src/data/supabaseGateway.test.ts`

**Interfaces:**
- `ProjectSummary` 增加 `icon`, `createdAt`, `deletedAt`, `shotCount`。
- `ProjectFolder = { id: string; name: string; updatedAt: string }`。
- `ProjectHomeSettings = { sortBy: "updated" | "created" | "name" }`。

- [ ] **Step 1: 写会失败的数据映射测试**

```ts
it("maps project home metadata from Supabase rows", async () => {
  const projects = await gateway.listProjects();
  expect(projects[0]).toMatchObject({ icon: "🎬", shotCount: 3, createdAt: expect.any(String) });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/data/supabaseGateway.test.ts --run`

Expected: FAIL because `ProjectSummary` does not expose project-home metadata.

- [ ] **Step 3: 增加数据库结构与安全策略**

```sql
alter table public.projects
  add column icon text check (char_length(icon) <= 16),
  add column deleted_at timestamptz;

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.project_folder_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  folder_id uuid not null references public.project_folders(id) on delete cascade,
  primary key (user_id, project_id)
);
```

Add owner-only trash policies, user-only folder/assignment policies, a `purge_deleted_projects()` security-definer function, and grant execution only to service-role scheduling. Update project/member/field/shot/storage read policies so an editor loses access while `deleted_at` is non-null.

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `pnpm test -- src/data/supabaseGateway.test.ts --run`

Expected: PASS.

```bash
git add src/domain/models.ts src/data/supabaseGateway.test.ts supabase/migrations/202607220003_project_home.sql
git commit -m "feat: add project home schema"
```

### Task 2: 文件夹、首页设置与回收站网关

**Files:**
- Modify: `src/data/gateway.ts`
- Modify: `src/data/fakeGateway.ts`
- Modify: `src/data/fakeGateway.test.ts`
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/data/supabaseGateway.test.ts`

**Interfaces:**

```ts
listFolders(): Promise<ProjectFolder[]>;
createFolder(name: string): Promise<ProjectFolder>;
renameFolder(folderId: string, name: string): Promise<void>;
deleteFolder(folderId: string): Promise<void>;
setProjectFolder(projectId: string, folderId: string | null): Promise<void>;
listProjectFolderAssignments(): Promise<Record<string, string>>;
listHomeSettings(): Promise<ProjectHomeSettings>;
saveHomeSettings(settings: ProjectHomeSettings): Promise<void>;
setProjectIcon(projectId: string, icon: string | null): Promise<void>;
moveProjectToTrash(projectId: string): Promise<void>;
restoreProject(projectId: string): Promise<void>;
permanentlyDeleteProject(projectId: string): Promise<void>;
```

- [ ] **Step 1: 写会失败的权限和个人归类测试**

```ts
it("keeps folder assignment personal while collaborators still see the project", async () => {
  const folder = await owner.createFolder("广告");
  await owner.setProjectFolder(project.id, folder.id);
  await editor.signIn("editor@example.com", "password");
  expect(await editor.listProjectFolderAssignments()).toEqual({});
  expect((await editor.listProjects()).map(({ id }) => id)).toContain(project.id);
});

it("allows only the owner to trash and restore a collaborative project", async () => {
  await expect(editor.moveProjectToTrash(project.id)).rejects.toMatchObject({ code: "forbidden" });
  await owner.moveProjectToTrash(project.id);
  expect((await owner.listProjects()).find(({ id }) => id === project.id)?.deletedAt).toEqual(expect.any(String));
});
```

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run`

Expected: FAIL because home gateway methods do not exist.

- [ ] **Step 3: 实现 fake 与 Supabase 网关**

Use maps in `FakeStoryboardGateway` keyed by `userId` for folders, assignments and settings. In `SupabaseStoryboardGateway`, query folders/assignments scoped by RLS, update `projects.icon`, set/clear `deleted_at`, and have `permanentlyDeleteProject` enqueue a safe deletion request with `permanent_delete_requested_at`. `listProjects()` must include trashed projects only for their owner and expose the request timestamp so the UI can show pending status.

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm test -- src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts --run`

Expected: PASS.

```bash
git add src/data
git commit -m "feat: add project home gateway"
```

### Task 3: 文件夹式首页、搜索、排序和 Emoji

**Files:**
- Create: `src/projects/ProjectHomeSidebar.tsx`
- Create: `src/projects/ProjectHomeSidebar.test.tsx`
- Modify: `src/projects/ProjectDashboard.tsx`
- Modify: `src/projects/ProjectDashboard.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `ProjectHomeSidebar({ folders, active, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder })`。
- Dashboard uses active scopes `"all" | "ungrouped" | "trash" | folderId`.

- [ ] **Step 1: 写会失败的首页交互测试**

```tsx
it("filters projects by a personal folder and searches by title", async () => {
  render(<ProjectDashboard gateway={gateway} user={user} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "广告" }));
  await user.type(screen.getByLabelText("搜索项目"), "夏季");
  expect(screen.getByRole("heading", { name: "夏季广告" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "品牌片" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `pnpm test -- src/projects/ProjectHomeSidebar.test.tsx src/projects/ProjectDashboard.test.tsx --run`

Expected: FAIL because the sidebar and filters do not exist.

- [ ] **Step 3: 实现项目管理界面**

Render the fixed sidebar entries `全部项目`, `未分组`, `我的文件夹`, `回收站`; add Chinese controls for folder create/rename/delete, title search and sort. Add one-Emoji project icon control for owners and project cards that show icon, title, aspect ratio, shot count, updated date and role. Add an owner-only folder assignment select. Keep invited projects openable but without owner-only controls.

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm test -- src/projects/ProjectHomeSidebar.test.tsx src/projects/ProjectDashboard.test.tsx --run`

Expected: PASS.

```bash
git add src/projects src/styles.css
git commit -m "feat: add folder-style project home"
```

### Task 4: 回收站操作与全量验证

**Files:**
- Modify: `src/projects/ProjectDashboard.tsx`
- Modify: `src/projects/ProjectDashboard.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 写会失败的回收站测试**

```tsx
it("restores an owner project from trash without showing it to editors", async () => {
  await gateway.moveProjectToTrash(project.id);
  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);
  await user.click(screen.getByRole("button", { name: "回收站" }));
  await user.click(screen.getByRole("button", { name: `恢复${project.title}` }));
  expect(gateway.restoreProject).toHaveBeenCalledWith(project.id);
});
```

- [ ] **Step 2: 运行聚焦测试确认失败**

Run: `pnpm test -- src/projects/ProjectDashboard.test.tsx --run`

Expected: FAIL because trash actions do not exist.

- [ ] **Step 3: 实现安全回收站操作**

Normal cards must only expose owner-only `移入回收站`, never a hard-delete path. In the recycle-bin scope show `恢复项目` and a separately-confirmed `彻底删除` request; expose neither action to editors. Display the 30-day expiration explanation next to trashed projects. Once `permanentDeleteRequestedAt` is present, replace both actions with a pending explanation because restoration is no longer allowed.

- [ ] **Step 4: 全量验证并提交**

Run: `pnpm test -- --run && pnpm build && git diff --check`

Expected: all tests PASS, Vite build succeeds, and no whitespace errors.

```bash
git add src/projects/ProjectDashboard.tsx src/projects/ProjectDashboard.test.tsx src/styles.css
git commit -m "feat: add project recycle bin"
```

## Self-review

- Tasks 1–2 cover the persisted, RLS-protected source of truth; Tasks 3–4 only consume gateway methods.
- Project emoji is shared, whereas folders, assignments and sort preference are user-scoped.
- The normal project list hides trashed work, editors cannot access it, and restore preserves the original project identifier and personal assignment.
- Storyboard-card, shooting-plan and advanced table features remain outside this plan.
