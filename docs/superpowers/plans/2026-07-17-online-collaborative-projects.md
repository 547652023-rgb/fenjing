# Online Collaborative Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the storyboard workbench to authenticated online multi-project storage with member invitations, realtime editing, online images, sortable/deletable shots, and project-configurable dropdown fields.

**Architecture:** Keep React/Vite/GitHub Pages as a static client and place authentication, relational data, private files, authorization, and realtime events in Supabase. Separate pure storyboard ordering/field behavior from Supabase repositories so domain and UI tests run without a live backend; integration tests use a typed fake gateway, while final manual verification uses two real accounts.

**Tech Stack:** React 18.3.1, TypeScript, Vite, Vitest, Testing Library, `@supabase/supabase-js`, native HTML5 drag-and-drop, Supabase Auth/PostgreSQL/Storage/Realtime, GitHub Pages.

## Global Constraints

- Unauthenticated users can only access registration and login.
- Project roles are exactly `owner` and `editor`; only owners manage members or delete projects.
- RLS is the authorization boundary; UI button visibility is not a security control.
- The browser bundle may contain only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, never a service-role key.
- Frame fields allow at most five images; reference fields allow at most one image.
- Shot numbers are regenerated as `1, 2, 3...` after add, move, drag, or delete.
- Shot size starts with exactly `大远景、远景、全景、中景、近景、特写` and rejects arbitrary values.
- Other non-image dropdown fields allow selecting a configured option or typing a temporary value; temporary values are not added to the option list.
- Existing local data is retained after import and is never deleted automatically.
- GitHub Pages remains the frontend host.

---

## File Map

- `src/domain/storyboard.ts`: pure field, option, shot move/delete/renumber behavior.
- `src/domain/models.ts`: shared authenticated-user, project-summary, membership, version, and image-object types.
- `src/lib/supabase.ts`: environment validation and the single Supabase client.
- `src/data/gateway.ts`: frontend-facing `StoryboardGateway` interface and error/result types.
- `src/data/supabaseGateway.ts`: Supabase implementation of auth, projects, members, fields, shots, images, and subscriptions.
- `src/data/fakeGateway.ts`: deterministic integration-test gateway.
- `src/auth/AuthGate.tsx`, `src/auth/AuthScreen.tsx`: session boundary and email/password UI.
- `src/projects/ProjectDashboard.tsx`: multi-project landing page.
- `src/projects/MemberManager.tsx`: owner-only invitation/removal dialog.
- `src/workbench/ProjectWorkbench.tsx`: online project orchestration, drafts, status, and subscriptions.
- `src/workbench/EditableSelect.tsx`: searchable/selectable field input with optional free text.
- `src/components/StoryboardTable.tsx`: table rendering, row controls, native drag events.
- `src/components/ImageCell.tsx`: online upload/remove UI using image object records.
- `src/migration/importLocalProject.ts`: one-time local-project import orchestration.
- `supabase/migrations/202607170001_online_storyboards.sql`: schema, functions, indexes, triggers, RLS, realtime publication, and storage policies.
- `.env.example`: public client configuration names only.
- `README.md`: Supabase setup and GitHub Pages configuration.

---

### Task 1: Pure Shot Ordering and Dropdown Domain Rules

**Files:**
- Modify: `src/domain/storyboard.ts`
- Modify: `src/domain/storyboard.test.ts`

**Interfaces:**
- Produces: `SHOT_SIZE_OPTIONS: readonly string[]`
- Produces: `moveShot(project, shotId, targetIndex): StoryboardProject`
- Produces: `deleteShot(project, shotId): StoryboardProject`
- Produces: `normalizeShotNumbers(shots): Shot[]`
- Produces: `setFieldOptions(project, fieldId, options): StoryboardProject`
- Adds: `FieldDefinition.options?: string[]` and `FieldDefinition.allowCustomValue?: boolean`

- [ ] **Step 1: Write failing domain tests**

```ts
import {
  SHOT_SIZE_OPTIONS,
  addShot,
  createProject,
  deleteShot,
  moveShot,
  setFieldOptions,
} from "./storyboard";

it("seeds the six shot-size options", () => {
  const field = createProject().fields.find(({ id }) => id === "shotSize");
  expect(field).toMatchObject({
    type: "singleSelect",
    options: [...SHOT_SIZE_OPTIONS],
    allowCustomValue: false,
  });
});

it("moves, deletes, and continuously renumbers shots", () => {
  const project = addShot(addShot(createProject()));
  const moved = moveShot(project, "3", 0);
  expect(moved.shots.map(({ id }) => id)).toEqual(["3", "1", "2"]);
  expect(moved.shots.map(({ values }) => values.shotNumber)).toEqual(["1", "2", "3"]);
  const deleted = deleteShot(moved, "1");
  expect(deleted.shots.map(({ id }) => id)).toEqual(["3", "2"]);
  expect(deleted.shots.map(({ values }) => values.shotNumber)).toEqual(["1", "2"]);
});

it("stores project-specific dropdown options without forcing custom values", () => {
  const project = setFieldOptions(createProject(), "notes", ["补拍", "待定"]);
  expect(project.fields.find(({ id }) => id === "notes")).toMatchObject({
    type: "singleSelect",
    options: ["补拍", "待定"],
    allowCustomValue: true,
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm test -- --run src/domain/storyboard.test.ts`

Expected: FAIL because the new exports/properties do not exist.

- [ ] **Step 3: Implement pure operations**

```ts
export const SHOT_SIZE_OPTIONS = [
  "大远景", "远景", "全景", "中景", "近景", "特写",
] as const;

export type FieldDefinition = {
  id: string;
  label: string;
  type: FieldType;
  visible: boolean;
  order: number;
  options?: string[];
  allowCustomValue?: boolean;
};

export function normalizeShotNumbers(shots: Shot[]): Shot[] {
  return shots.map((shot, index) => ({
    ...shot,
    values: { ...shot.values, shotNumber: String(index + 1) },
  }));
}

export function moveShot(project: StoryboardProject, shotId: string, targetIndex: number) {
  const shots = project.shots.map((shot) => ({ ...shot, values: { ...shot.values } }));
  const sourceIndex = shots.findIndex(({ id }) => id === shotId);
  if (sourceIndex < 0) return { ...project, shots };
  const [shot] = shots.splice(sourceIndex, 1);
  shots.splice(Math.max(0, Math.min(targetIndex, shots.length)), 0, shot);
  return { ...project, shots: normalizeShotNumbers(shots) };
}

export function deleteShot(project: StoryboardProject, shotId: string) {
  return {
    ...project,
    shots: normalizeShotNumbers(project.shots.filter(({ id }) => id !== shotId)),
  };
}

export function setFieldOptions(project: StoryboardProject, fieldId: string, options: string[]) {
  const normalized = [...new Set(options.map((value) => value.trim()).filter(Boolean))];
  return {
    ...project,
    fields: project.fields.map((field) => field.id === fieldId
      ? { ...field, type: "singleSelect", options: normalized, allowCustomValue: fieldId !== "shotSize" }
      : { ...field }),
  };
}
```

Update the seeded `shotSize` field to `singleSelect` and attach a copied `SHOT_SIZE_OPTIONS` array. Change local `addShot` to choose one more than the largest existing numeric id (rather than `shots.length + 1`) and call `normalizeShotNumbers`; Supabase-created shots receive UUIDs from the database.

- [ ] **Step 4: Run domain tests**

Run: `pnpm test -- --run src/domain/storyboard.test.ts`

Expected: all storyboard domain tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/storyboard.ts src/domain/storyboard.test.ts
git commit -m "feat: add shot ordering and dropdown rules"
```

---

### Task 2: Row Controls, Drag Sorting, and Editable Dropdown Cells

**Files:**
- Create: `src/workbench/EditableSelect.tsx`
- Create: `src/workbench/EditableSelect.test.tsx`
- Modify: `src/components/StoryboardTable.tsx`
- Modify: `src/components/StoryboardTable.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 1 `moveShot`, `deleteShot`, and field option properties.
- Produces: `EditableSelect({ label, value, options, allowCustomValue, onChange })`.
- Produces: table row controls with accessible names `上移镜头 N`, `下移镜头 N`, `删除镜头 N`, `拖动镜头 N`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("moves and deletes rows while renumbering", async () => {
  const user = userEvent.setup();
  const project = addShot(addShot(createProject()));
  const Harness = () => {
    const [value, setValue] = useState(project);
    return <StoryboardTable project={value} onChange={(update) =>
      setValue((current) => typeof update === "function" ? update(current) : update)
    } />;
  };
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "上移镜头 3" }));
  expect(screen.getAllByLabelText(/镜号-/).map((input) => (input as HTMLInputElement).value))
    .toEqual(["1", "2", "3"]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "删除镜头 2" }));
  expect(screen.getAllByLabelText(/镜号-/)).toHaveLength(2);
});

it("renders shot size as a restricted dropdown", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);
  expect(screen.getByRole("combobox", { name: "景别-1" })).toHaveAttribute("data-allow-custom", "false");
  expect(screen.getAllByRole("option").map((option) => option.textContent))
    .toEqual(["", "大远景", "远景", "全景", "中景", "近景", "特写"]);
});

it("allows a custom temporary value without adding an option", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<EditableSelect label="备注-1" value="" options={["补拍"]} allowCustomValue onChange={onChange} />);
  await user.type(screen.getByRole("combobox", { name: "备注-1" }), "临时说明");
  expect(onChange).toHaveBeenLastCalledWith("临时说明");
  expect(screen.queryByRole("option", { name: "临时说明" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify tests fail**

Run: `pnpm test -- --run src/components/StoryboardTable.test.tsx src/workbench/EditableSelect.test.tsx`

Expected: FAIL because row controls and `EditableSelect` do not exist.

- [ ] **Step 3: Implement the editable select and row actions**

Use an `<input list>` when `allowCustomValue` is true and a `<select>` when false:

```tsx
export function EditableSelect(props: EditableSelectProps) {
  const listId = `${props.label.replace(/\s+/g, "-")}-options`;
  if (!props.allowCustomValue) {
    return <select aria-label={props.label} data-allow-custom="false" value={props.value}
      onChange={(event) => props.onChange(event.target.value)}>
      <option value="" />
      {props.options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  return <>
    <input aria-label={props.label} data-allow-custom="true" list={listId} value={props.value}
      onChange={(event) => props.onChange(event.target.value)} />
    <datalist id={listId}>{props.options.map((option) =>
      <option key={option} value={option} />)}</datalist>
  </>;
}
```

Add a sticky operation column, native `draggable` row handle, `dragStartShotId` state, `onDragOver={event => event.preventDefault()}`, and `onDrop` calling `moveShot`. Call `window.confirm("确定删除这个镜头吗？")` before `deleteShot`. Render `EditableSelect` for `singleSelect` fields.

- [ ] **Step 4: Run component and full tests**

Run: `pnpm test -- --run src/components/StoryboardTable.test.tsx src/workbench/EditableSelect.test.tsx && pnpm test -- --run`

Expected: focused and full suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench src/components/StoryboardTable.tsx src/components/StoryboardTable.test.tsx src/styles.css
git commit -m "feat: reorder delete and select storyboard rows"
```

---

### Task 3: Supabase Schema, RLS, Reordering Function, and Storage Policies

**Files:**
- Create: `supabase/migrations/202607170001_online_storyboards.sql`
- Create: `supabase/tests/online_storyboards.sql`
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces tables `profiles`, `projects`, `project_members`, `fields`, `field_options`, `shots`.
- Produces RPC `reorder_project_shots(p_project_id uuid, p_ordered_shot_ids uuid[])`.
- Produces private Storage bucket `storyboard-images` and project-member policies.

- [ ] **Step 1: Write SQL assertions before schema statements**

Create pgTAP assertions that verify required tables, RLS, role enum/check, owner policy, member read policy, and the reorder function:

```sql
begin;
select plan(10);
select has_table('public', 'projects');
select has_table('public', 'project_members');
select has_table('public', 'fields');
select has_table('public', 'field_options');
select has_table('public', 'shots');
select row_security_active('public', 'projects');
select row_security_active('public', 'project_members');
select row_security_active('public', 'shots');
select has_function('public', 'reorder_project_shots', array['uuid', 'uuid[]']);
select results_eq(
  $$select public.is_project_member('00000000-0000-0000-0000-000000000000'::uuid)$$,
  $$values (false)$$
);
select * from finish();
rollback;
```

- [ ] **Step 2: Run schema tests and verify failure**

Run: `supabase db reset && supabase test db`

Expected: FAIL until the migration defines the schema. If the Supabase CLI is unavailable locally, run `pnpm build` here and record SQL verification as pending real-project setup; do not claim SQL tests passed.

- [ ] **Step 3: Implement the migration**

The migration must define UUID primary keys, cascading foreign keys, `position integer`, `values jsonb`, `version integer default 1`, timestamps, updated-at triggers, profile creation trigger, project-owner membership trigger, helper functions `is_project_member` and `is_project_owner`, and RLS policies using `auth.uid()`.

The reorder RPC must lock project shots, verify the caller is a member, verify the supplied ids exactly match existing project shot ids, then update positions and `shotNumber` JSON values in one transaction:

```sql
create or replace function public.reorder_project_shots(p_project_id uuid, p_ordered_shot_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare shot_id uuid; index_value integer;
begin
  if not public.is_project_member(p_project_id) then raise exception 'forbidden'; end if;
  perform 1 from public.shots where project_id = p_project_id for update;
  if (select count(*) from public.shots where project_id = p_project_id) <> cardinality(p_ordered_shot_ids)
     or exists (select 1 from public.shots where project_id = p_project_id and not (id = any(p_ordered_shot_ids)))
  then raise exception 'shot_order_conflict'; end if;
  for index_value in 1..cardinality(p_ordered_shot_ids) loop
    shot_id := p_ordered_shot_ids[index_value];
    update public.shots
      set position = index_value - 1,
          values = jsonb_set(values, '{shotNumber}', to_jsonb(index_value::text), true),
          version = version + 1
      where id = shot_id and project_id = p_project_id;
  end loop;
end $$;
```

Create private bucket `storyboard-images`. Storage policies must extract the first path segment as project id and call `is_project_member`; delete is owner/editor member-scoped, never public.

- [ ] **Step 4: Run SQL verification**

Run: `supabase db reset && supabase test db`

Expected: 10 pgTAP assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase .env.example README.md
git commit -m "feat: define secure collaborative storyboard schema"
```

---

### Task 4: Typed Gateway and Supabase Client Configuration

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/data/gateway.ts`
- Create: `src/data/fakeGateway.ts`
- Create: `src/data/fakeGateway.test.ts`
- Create: `src/lib/supabase.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `ProjectSummary`, `ProjectRole`, `ProjectMember`, `RemoteImage`, `SaveState`, `GatewayError`.
- Produces: `StoryboardGateway` methods for auth, projects, members, workbench data, images, import, and subscriptions.
- Produces: `createSupabaseClient(env): SupabaseClient | null` and a typed missing-config result.

- [ ] **Step 1: Install dependency and write failing gateway tests**

Run: `pnpm add @supabase/supabase-js`

```ts
it("keeps projects isolated by signed-in user", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  const created = await gateway.createProject("广告片");
  await gateway.signOut();
  await gateway.signUp("other@example.com", "password123");
  expect(await gateway.listProjects()).toEqual([]);
  await gateway.signIn("owner@example.com", "password123");
  expect(await gateway.listProjects()).toEqual([expect.objectContaining({ id: created.id })]);
});
```

- [ ] **Step 2: Verify the gateway test fails**

Run: `pnpm test -- --run src/data/fakeGateway.test.ts`

Expected: FAIL because the gateway does not exist.

- [ ] **Step 3: Define types, interface, fake, and client factory**

The interface must expose exact signatures:

```ts
export interface StoryboardGateway {
  getSession(): Promise<AuthUser | null>;
  onAuthChange(listener: (user: AuthUser | null) => void): Unsubscribe;
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(title: string): Promise<ProjectSummary>;
  renameProject(projectId: string, title: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  loadProject(projectId: string): Promise<StoryboardProject>;
  saveProjectMeta(projectId: string, patch: ProjectMetaPatch): Promise<void>;
  saveShot(projectId: string, shot: Shot, expectedVersion: number): Promise<VersionedShot>;
  addShot(projectId: string): Promise<VersionedShot>;
  deleteShot(projectId: string, shotId: string): Promise<void>;
  reorderShots(projectId: string, orderedShotIds: string[]): Promise<void>;
  listMembers(projectId: string): Promise<ProjectMember[]>;
  inviteMember(projectId: string, email: string): Promise<void>;
  removeMember(projectId: string, userId: string): Promise<void>;
  uploadImage(input: UploadImageInput): Promise<RemoteImage>;
  deleteImage(projectId: string, path: string): Promise<void>;
  subscribeProject(projectId: string, listener: ProjectEventListener): Unsubscribe;
  importLocalProject(project: StoryboardProject): Promise<ProjectSummary>;
}
```

`src/lib/supabase.ts` must return `null` when either public environment variable is missing so tests and the setup screen can run without secrets.

- [ ] **Step 4: Run gateway tests and build**

Run: `pnpm test -- --run src/data/fakeGateway.test.ts && pnpm build`

Expected: PASS and production build succeeds without embedding a service-role key.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/domain/models.ts src/data src/lib/supabase.ts
git commit -m "feat: add typed online storyboard gateway"
```

---

### Task 5: Authentication Boundary and Email/Password Screen

**Files:**
- Create: `src/auth/AuthGate.tsx`
- Create: `src/auth/AuthScreen.tsx`
- Create: `src/auth/AuthScreen.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `StoryboardGateway` auth methods.
- Produces: `<App gateway={gateway} />` with loading, setup-required, unauthenticated, and authenticated states.

- [ ] **Step 1: Write failing auth tests**

```tsx
it("shows login until a session exists", async () => {
  const gateway = new FakeStoryboardGateway();
  render(<App gateway={gateway} />);
  expect(await screen.findByRole("heading", { name: "登录分镜工作台" })).toBeVisible();
});

it("registers then enters the project dashboard", async () => {
  const gateway = new FakeStoryboardGateway();
  const user = userEvent.setup();
  render(<App gateway={gateway} />);
  await user.click(await screen.findByRole("button", { name: "注册账号" }));
  await user.type(screen.getByLabelText("邮箱"), "owner@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "确认注册" }));
  expect(await screen.findByRole("heading", { name: "我的项目" })).toBeVisible();
});
```

- [ ] **Step 2: Verify auth tests fail**

Run: `pnpm test -- --run src/auth/AuthScreen.test.tsx src/App.test.tsx`

Expected: FAIL because `App` has no gateway/auth states.

- [ ] **Step 3: Implement authentication UI**

`AuthGate` calls `getSession` once, subscribes with `onAuthChange`, and always unsubscribes on unmount. `AuthScreen` validates non-empty email and password length at least 8, disables submit while pending, maps gateway errors to Chinese copy, and separates login/register modes. Add a configuration-required screen when the real gateway cannot be constructed.

- [ ] **Step 4: Run auth tests and full suite**

Run: `pnpm test -- --run src/auth/AuthScreen.test.tsx src/App.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: require account authentication"
```

---

### Task 6: Multi-Project Dashboard and Ownership Actions

**Files:**
- Create: `src/projects/ProjectDashboard.tsx`
- Create: `src/projects/ProjectDashboard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: gateway project list/create/rename/delete and authenticated user.
- Produces: `onOpenProject(projectId)` navigation callback.

- [ ] **Step 1: Write failing dashboard tests**

```tsx
it("creates, renames, opens, and deletes an owned project", async () => {
  const gateway = seededOwnerGateway();
  const onOpenProject = vi.fn();
  const user = userEvent.setup();
  render(<ProjectDashboard gateway={gateway} user={owner} onOpenProject={onOpenProject} onSignOut={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "新建项目" }));
  await user.type(screen.getByLabelText("新项目名称"), "品牌片");
  await user.click(screen.getByRole("button", { name: "创建" }));
  await user.click(screen.getByRole("button", { name: "进入品牌片" }));
  expect(onOpenProject).toHaveBeenCalledWith(expect.any(String));
  expect(screen.getByRole("button", { name: "删除品牌片" })).toBeVisible();
});

it("does not offer delete for an invited project", async () => {
  render(<ProjectDashboard gateway={seededEditorGateway()} user={editor} onOpenProject={vi.fn()} onSignOut={vi.fn()} />);
  expect(await screen.findByText("受邀项目")).toBeVisible();
  expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify dashboard tests fail**

Run: `pnpm test -- --run src/projects/ProjectDashboard.test.tsx`

Expected: FAIL because the dashboard does not exist.

- [ ] **Step 3: Implement dashboard**

Load projects on mount, group by `role`, use controlled dialogs for create/rename, call `window.confirm` before owner delete, render updated time and member count, disable pending actions, and refresh only after successful gateway operations. Keep the current project id in App state; browser refresh returns to the dashboard in this phase.

- [ ] **Step 4: Run dashboard and full tests**

Run: `pnpm test -- --run src/projects/ProjectDashboard.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/projects/ProjectDashboard.tsx src/projects/ProjectDashboard.test.tsx src/App.tsx src/styles.css
git commit -m "feat: add online project dashboard"
```

---

### Task 7: Online Project Workbench Persistence and Configurable Field Options

**Files:**
- Create: `src/workbench/ProjectWorkbench.tsx`
- Create: `src/workbench/ProjectWorkbench.test.tsx`
- Modify: `src/components/FieldSettings.tsx`
- Modify: `src/components/FieldSettings.test.tsx`
- Modify: `src/components/ProjectHeader.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: gateway load/save/add/delete/reorder methods and Task 2 components.
- Produces: field-option editor and workbench save states `saving | saved | offline | reconnecting | error | conflict`.

- [ ] **Step 1: Write failing workbench tests**

```tsx
it("loads the selected online project and returns to the dashboard", async () => {
  const gateway = seededOwnerGateway();
  const onBack = vi.fn();
  render(<ProjectWorkbench projectId="project-1" gateway={gateway} user={owner} onBack={onBack} />);
  expect(await screen.findByDisplayValue("广告片")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "返回项目" }));
  expect(onBack).toHaveBeenCalled();
});

it("configures notes options and keeps custom cell input temporary", async () => {
  const gateway = seededOwnerGateway();
  render(<ProjectWorkbench projectId="project-1" gateway={gateway} user={owner} onBack={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "字段设置" }));
  await userEvent.click(screen.getByRole("button", { name: "设置备注下拉选项" }));
  await userEvent.type(screen.getByLabelText("新增备注选项"), "补拍");
  await userEvent.click(screen.getByRole("button", { name: "添加备注选项" }));
  expect(await screen.findByRole("option", { name: "补拍" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify workbench tests fail**

Run: `pnpm test -- --run src/workbench/ProjectWorkbench.test.tsx src/components/FieldSettings.test.tsx`

Expected: FAIL because online workbench orchestration and option editing do not exist.

- [ ] **Step 3: Implement workbench and option settings**

Load once by project id, keep server project and per-cell draft maps separate, debounce text saves by 400ms, immediately save selects and structural operations, show pending/error states, and disable edits if the project disappears or permission is revoked. Extend `FieldSettings` with option add/rename/delete/reorder controls for non-image fields; enforce fixed shot-size options in both UI and gateway.

- [ ] **Step 4: Run focused tests and full suite**

Run: `pnpm test -- --run src/workbench/ProjectWorkbench.test.tsx src/components/FieldSettings.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/ProjectWorkbench.tsx src/workbench/ProjectWorkbench.test.tsx src/components/FieldSettings.tsx src/components/FieldSettings.test.tsx src/components/ProjectHeader.tsx src/App.tsx
git commit -m "feat: persist online storyboard workbench"
```

---

### Task 8: Member Invitation and Owner-Only Management

**Files:**
- Create: `src/projects/MemberManager.tsx`
- Create: `src/projects/MemberManager.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`

**Interfaces:**
- Consumes: gateway `listMembers`, `inviteMember`, `removeMember`.
- Produces: owner-only member dialog; exact unregistered-email copy `该邮箱尚未注册，请对方注册后再邀请`.

- [ ] **Step 1: Write failing member tests**

```tsx
it("lets an owner invite a registered user and remove an editor", async () => {
  const gateway = seededOwnerGatewayWithRegisteredEditor();
  render(<MemberManager projectId="project-1" role="owner" gateway={gateway} onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("成员邮箱"), "editor@example.com");
  await userEvent.click(screen.getByRole("button", { name: "邀请成员" }));
  expect(await screen.findByText("editor@example.com")).toBeVisible();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "移除 editor@example.com" }));
  expect(screen.queryByText("editor@example.com")).not.toBeInTheDocument();
});

it("hides member management from editors", () => {
  render(<ProjectWorkbench projectId="project-1" gateway={seededEditorGateway()} user={editor} onBack={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "成员管理" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify member tests fail**

Run: `pnpm test -- --run src/projects/MemberManager.test.tsx`

Expected: FAIL because the member manager does not exist.

- [ ] **Step 3: Implement owner-only management**

Load members on dialog open, invite by normalized lowercase email, map `user_not_found`, `already_member`, and `forbidden` gateway codes to Chinese messages, forbid removing the owner, and confirm removal. The Supabase implementation uses a security-definer RPC that accepts email but exposes no general profile-email lookup to ordinary clients.

- [ ] **Step 4: Run member tests and full suite**

Run: `pnpm test -- --run src/projects/MemberManager.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/projects/MemberManager.tsx src/projects/MemberManager.test.tsx src/workbench/ProjectWorkbench.tsx supabase/migrations/202607170001_online_storyboards.sql
git commit -m "feat: manage storyboard project members"
```

---

### Task 9: Private Online Image Uploads

**Files:**
- Modify: `src/components/ImageCell.tsx`
- Modify: `src/components/StoryboardTable.tsx`
- Create: `src/components/OnlineImageCell.test.tsx`
- Modify: `src/data/supabaseGateway.ts`

**Interfaces:**
- Consumes: gateway `uploadImage`, `deleteImage`; `RemoteImage { path, url, name, position }`.
- Produces: `ImageCell` async props `onUpload(files): Promise<RemoteImage[]>`, `onRemove(image): Promise<void>`, progress/error states.

- [ ] **Step 1: Write failing online-image tests**

```tsx
it("uploads up to five frame images and retries one failure", async () => {
  const onUpload = vi.fn()
    .mockRejectedValueOnce(new GatewayError("upload_failed"))
    .mockResolvedValueOnce([{ path: "p/s/frame/a", url: "blob:a", name: "a.png", position: 0 }]);
  render(<ImageCell label="画面-1" maxImages={5} images={[]} onUpload={onUpload} onRemove={vi.fn()} />);
  await userEvent.upload(screen.getByLabelText("画面-1"), new File(["a"], "a.png", { type: "image/png" }));
  expect(await screen.findByText("上传失败")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "重试上传 a.png" }));
  expect(await screen.findByRole("img", { name: "画面-1-图片1" })).toHaveAttribute("src", "blob:a");
});
```

- [ ] **Step 2: Verify image test fails**

Run: `pnpm test -- --run src/components/OnlineImageCell.test.tsx`

Expected: FAIL because `ImageCell` only reads base64 locally.

- [ ] **Step 3: Implement online image mode**

Preserve legacy `value/onChange` props only for migration tests, add a discriminated prop union for online mode, validate MIME before upload, cap selected files by remaining slots, show per-file pending/error/retry, revoke object preview URLs on cleanup, and remove the database reference only after Storage deletion succeeds. The Supabase gateway creates short-lived signed URLs for private objects and refreshes expired URLs on project reload.

- [ ] **Step 4: Run image and full tests**

Run: `pnpm test -- --run src/components/OnlineImageCell.test.tsx src/components/StoryboardTable.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ImageCell.tsx src/components/StoryboardTable.tsx src/components/OnlineImageCell.test.tsx src/data/supabaseGateway.ts
git commit -m "feat: store storyboard images privately online"
```

---

### Task 10: Realtime Events, Optimistic Versions, and Reconnection

**Files:**
- Create: `src/workbench/useProjectRealtime.ts`
- Create: `src/workbench/useProjectRealtime.test.tsx`
- Modify: `src/workbench/ProjectWorkbench.tsx`
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/data/fakeGateway.ts`

**Interfaces:**
- Consumes: gateway subscription and versioned shot saves.
- Produces: project event reducer and connection states `connected | offline | reconnecting`.

- [ ] **Step 1: Write failing realtime tests**

```tsx
it("applies remote cell changes without losing a different local draft", async () => {
  const gateway = seededOwnerGateway();
  render(<ProjectWorkbench projectId="project-1" gateway={gateway} user={owner} onBack={vi.fn()} />);
  const notes = await screen.findByLabelText("备注-1");
  await userEvent.type(notes, "本地草稿");
  act(() => gateway.emit("project-1", { type: "shot.updated", shot: remoteContentUpdate }));
  expect(notes).toHaveValue("本地草稿");
  expect(screen.getByLabelText("内容-1")).toHaveValue(remoteContentUpdate.values.content);
});

it("reports a same-record version conflict and reloads server data", async () => {
  const gateway = seededOwnerGateway();
  gateway.failNextSaveWithConflict(serverShot);
  render(<ProjectWorkbench projectId="project-1" gateway={gateway} user={owner} onBack={vi.fn()} />);
  await userEvent.type(await screen.findByLabelText("备注-1"), "冲突内容");
  expect(await screen.findByRole("status")).toHaveTextContent("内容已被其他成员更新");
  expect(screen.getByLabelText("备注-1")).toHaveValue(serverShot.values.notes);
});
```

- [ ] **Step 2: Verify realtime tests fail**

Run: `pnpm test -- --run src/workbench/useProjectRealtime.test.tsx`

Expected: FAIL because subscription reconciliation does not exist.

- [ ] **Step 3: Implement subscription and conflict handling**

Subscribe once per project, unsubscribe on project change/unmount, reduce insert/update/delete events by id, preserve only drafts for untouched fields, cancel drafts for remotely deleted shots, and refetch after channel reconnect. Supabase updates must use `.eq("version", expectedVersion)` and return a `conflict` error when no row was updated. Structural events always refetch ordered shots after the event to honor transactional server order.

- [ ] **Step 4: Run realtime tests and full suite**

Run: `pnpm test -- --run src/workbench/useProjectRealtime.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workbench/useProjectRealtime.ts src/workbench/useProjectRealtime.test.tsx src/workbench/ProjectWorkbench.tsx src/data/supabaseGateway.ts src/data/fakeGateway.ts
git commit -m "feat: synchronize collaborative storyboard edits"
```

---

### Task 11: Safe One-Time Local Project Import

**Files:**
- Create: `src/migration/importLocalProject.ts`
- Create: `src/migration/importLocalProject.test.ts`
- Create: `src/migration/LocalImportPrompt.tsx`
- Create: `src/migration/LocalImportPrompt.test.tsx`
- Modify: `src/projects/ProjectDashboard.tsx`
- Modify: `src/storage/projectRepository.ts`

**Interfaces:**
- Consumes: legacy `loadProject`, gateway `importLocalProject` and online image uploads.
- Produces: migration marker `fenjing.storyboard-project.v1.imported:<user-id>` without deleting `fenjing.storyboard-project.v1`.

- [ ] **Step 1: Write failing migration tests**

```ts
it("imports only after confirmation and keeps the legacy project", async () => {
  const project = createProject();
  saveProject(project);
  const gateway = new FakeStoryboardGateway();
  const result = await importLocalProject({ gateway, project, userId: "user-1" });
  expect(result.ok).toBe(true);
  expect(loadProject()).toEqual(project);
  expect(localStorage.getItem("fenjing.storyboard-project.v1.imported:user-1")).toBe("true");
});

it("does not mark a failed import complete", async () => {
  const gateway = failingImportGateway();
  const result = await importLocalProject({ gateway, project: createProject(), userId: "user-1" });
  expect(result.ok).toBe(false);
  expect(localStorage.getItem("fenjing.storyboard-project.v1.imported:user-1")).toBeNull();
});
```

- [ ] **Step 2: Verify migration tests fail**

Run: `pnpm test -- --run src/migration/importLocalProject.test.ts src/migration/LocalImportPrompt.test.tsx`

Expected: FAIL because import orchestration does not exist.

- [ ] **Step 3: Implement import prompt and orchestration**

Detect legacy data only after login, skip when the user-specific marker exists, show Import/Later actions, upload data before images, convert base64 image values back to `Blob`, stop and report the failing stage, set the marker only after complete success, and never call `localStorage.removeItem` for the legacy storage key.

- [ ] **Step 4: Run migration and full tests**

Run: `pnpm test -- --run src/migration/importLocalProject.test.ts src/migration/LocalImportPrompt.test.tsx && pnpm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/migration src/projects/ProjectDashboard.tsx src/storage/projectRepository.ts
git commit -m "feat: import legacy local storyboard safely"
```

---

### Task 12: Real Supabase Gateway, Deployment Setup, and Final Verification

**Files:**
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/main.tsx`
- Modify: `README.md`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: all previous gateway contracts and SQL schema.
- Produces: production app wired to Supabase environment variables.

- [ ] **Step 1: Add contract tests for Supabase response mapping**

Mock the Supabase client chain and assert `PGRST116`, RLS denial, duplicate member, zero-row version update, storage upload failure, and realtime unsubscribe map to stable `GatewayError` codes. Example:

```ts
it("maps a zero-row version update to conflict", async () => {
  const gateway = createSupabaseGateway(mockClientReturning([]));
  await expect(gateway.saveShot("p1", versionedShot, 2))
    .rejects.toMatchObject({ code: "conflict" });
});
```

- [ ] **Step 2: Verify contract tests fail**

Run: `pnpm test -- --run src/data/supabaseGateway.test.ts`

Expected: FAIL until every gateway method and error mapping is implemented.

- [ ] **Step 3: Complete production gateway and deployment documentation**

Implement every `StoryboardGateway` method with scoped selects, RPCs, version conditions, signed image URLs, and private realtime channels. `main.tsx` constructs the gateway from Vite environment values and renders the setup-required state when absent. README must list exact dashboard actions: create Supabase project, run migration, confirm private bucket, enable email provider, add `https://547652023-rgb.github.io/fenjing/` to allowed redirect URLs, and add `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` as GitHub Actions variables/secrets used by the build step.

- [ ] **Step 4: Run all local verification**

Run: `pnpm test -- --run && pnpm build && git diff --check`

Expected: all tests PASS, TypeScript/Vite build succeeds, and diff check is clean.

- [ ] **Step 5: Run two-account manual acceptance against Supabase**

Verify in two independent browser sessions:

1. Register owner and editor accounts.
2. Owner creates a project and invites editor.
3. Editor cannot delete project or manage members.
4. Both open the project; edits, option changes, row moves, deletes, and images appear on the other client.
5. Direct access by a non-member returns no project data or private image.
6. Disconnect one client, edit on the other, reconnect, and confirm server data wins over stale input.
7. Import a legacy local project and confirm old local data remains.

Expected: all seven checks PASS. If Supabase credentials/configuration are not yet available, stop here and report this external prerequisite; do not claim online collaboration is complete.

- [ ] **Step 6: Commit**

```bash
git add src/data/supabaseGateway.ts src/data/supabaseGateway.test.ts src/main.tsx README.md .github/workflows
git commit -m "feat: deploy realtime collaborative storyboard app"
```

---

## Final Release Verification

- [ ] Run `pnpm test -- --run` and record the exact test-file and test counts.
- [ ] Run `pnpm build` and record success.
- [ ] Confirm no service-role key appears with `rg -n "service_role|SUPABASE_SERVICE" . --glob '!node_modules/**' --glob '!docs/**'`.
- [ ] Push the branch only after all local checks pass.
- [ ] Confirm the GitHub Pages workflow succeeds.
- [ ] Open `https://547652023-rgb.github.io/fenjing/` and repeat login, project creation, row operations, shot-size dropdown, custom dropdown, image upload, and two-account realtime smoke tests.
