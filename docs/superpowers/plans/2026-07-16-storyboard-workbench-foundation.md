# Storyboard Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable desktop-web storyboard workbench: a project can manage a horizontally structured shot table, customize fields, attach stretched images, and preserve its local editing state.

**Architecture:** A Vite React TypeScript single-page app owns the first deliverable. A small domain module defines project, field, shot and image-reference data; a local-storage repository isolates persistence so a later cloud API can replace it without changing table components. The workbench renders columns from field definitions and exposes row-level editing, field settings and image attachment through focused components.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library, browser `localStorage` and browser `FileReader`.

## Global Constraints

- Desktop browser is the only target for this phase.
- Seed every new project with these ordered fields: 镜号、画面、参考、景别、时长（秒）、内容、备注、场景、声音、摄影机角度、运镜、摄影机装备、镜头焦段、场号.
- Each project can add, hide and reorder fields; only text, number, date, single-select, multi-select and person field definitions are allowed.
- Picture cells must fill the entire cell and may stretch independently on both axes; no aspect-ratio preservation is applied.
- Keep this phase local-only: live collaboration, comments, version restoration, cloud file storage, PDF/Excel export and shooting-plan generation remain later phases.
- No AI writing, AI shot splitting or AI image generation is included.

---

## File Structure

- `package.json`: scripts and development dependencies.
- `vite.config.ts`: Vite and Vitest configuration.
- `tsconfig.json`: TypeScript compiler configuration used by the production build.
- `src/domain/storyboard.ts`: field types, project types, default fields and pure mutation helpers.
- `src/storage/projectRepository.ts`: `localStorage` persistence contract.
- `src/App.tsx`: application composition and saved-project lifecycle.
- `src/components/ProjectHeader.tsx`: project-title edit and save status.
- `src/components/StoryboardTable.tsx`: dynamic-column, editable shot table.
- `src/components/ImageCell.tsx`: picture upload, stretched preview and removal.
- `src/components/FieldSettings.tsx`: add, hide and reorder field definitions.
- `src/styles.css`: desktop layout and image fill styling.
- `src/test/setup.ts`: DOM test setup.
- `src/domain/storyboard.test.ts`: tests for default fields and pure state changes.
- `src/storage/projectRepository.test.ts`: tests for storage serialization.
- `src/components/StoryboardTable.test.tsx`: table-editing and image presentation tests.

## Task 1: Bootstrap a testable React application

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`

**Interfaces:**
- Consumes: none.
- Produces: `npm run dev`, `npm run build` and `npm test` commands, plus the `App` React component.

- [ ] **Step 1: Write the failing smoke test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the storyboard workbench", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "分镜工作台" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the smoke test to verify setup is absent**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because `package.json` and `src/App.tsx` do not exist.

- [ ] **Step 3: Add the application bootstrap**

Create `package.json` with these scripts and versions:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vitest": "latest"
  },
  "devDependenciesMeta": {}
}
```

Create `src/App.tsx`:

```tsx
export function App() {
  return <main><h1>分镜工作台</h1></main>;
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

Configure Vite with React and `environment: "jsdom"` for tests, import `@testing-library/jest-dom/vitest` from `src/test/setup.ts`, and provide a root `<div id="root"></div>` in `index.html`.

- [ ] **Step 4: Run the smoke test and production build**

Run: `npm test -- --run src/App.test.tsx && npm run build`

Expected: the test passes and Vite emits `dist/` without TypeScript errors.

- [ ] **Step 5: Commit the bootstrap**

```bash
git add package.json vite.config.ts index.html src
git commit -m "feat: bootstrap storyboard workbench"
```

## Task 2: Define storyboard data and local persistence

**Files:**
- Create: `src/domain/storyboard.ts`
- Create: `src/domain/storyboard.test.ts`
- Create: `src/storage/projectRepository.ts`
- Create: `src/storage/projectRepository.test.ts`

**Interfaces:**
- Consumes: TypeScript from Task 1.
- Produces: `StoryboardProject`, `FieldDefinition`, `Shot`, `createProject()`, `addField()`, `toggleFieldVisibility()`, `moveField()`, `addShot()`, `updateShotValue()`, `loadProject()` and `saveProject(project)`.

- [ ] **Step 1: Write failing domain and repository tests**

```ts
import { DEFAULT_FIELDS, addField, createProject, moveField, toggleFieldVisibility } from "./storyboard";

it("seeds the supplied 14-column storyboard template", () => {
  expect(DEFAULT_FIELDS.map((field) => field.label)).toEqual([
    "镜号", "画面", "参考", "景别", "时长（秒）", "内容", "备注", "场景",
    "声音", "摄影机角度", "运镜", "摄影机装备", "镜头焦段", "场号"
  ]);
});

it("adds, hides and reorders a project field", () => {
  const project = createProject();
  const withActor = addField(project, { label: "actor", type: "person" });
  const hidden = toggleFieldVisibility(withActor, "actor", false);
  expect(moveField(hidden, "actor", 0).fields[0]).toMatchObject({ id: "actor", visible: false });
});
```

```ts
import { createProject } from "../domain/storyboard";
import { loadProject, saveProject } from "./projectRepository";

it("round-trips a project through local storage", () => {
  const project = createProject();
  saveProject(project);
  expect(loadProject()).toEqual(project);
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- --run src/domain/storyboard.test.ts src/storage/projectRepository.test.ts`

Expected: FAIL because the domain and repository modules do not exist.

- [ ] **Step 3: Implement immutable domain helpers and the repository**

Define these exact types:

```ts
export type FieldType = "text" | "number" | "date" | "singleSelect" | "multiSelect" | "person" | "image";
export type FieldDefinition = { id: string; label: string; type: FieldType; visible: boolean; order: number };
export type Shot = { id: string; values: Record<string, string> };
export type StoryboardProject = { id: string; title: string; fields: FieldDefinition[]; shots: Shot[] };
```

Use stable IDs for the seeded fields, including `shotNumber`, `frame`, `reference`, `shotSize`, `durationSeconds`, `content`, `notes`, `scene`, `sound`, `cameraAngle`, `cameraMove`, `cameraGear`, `lens` and `sceneNumber`. `createProject()` returns title `未命名项目` and one first shot whose `shotNumber` is `1`. `addField()` derives a kebab-case ID from its label and throws when that ID already exists. Every helper returns a new project object without mutating its input.

Persist under the exact storage key `fenjing.storyboard-project.v1`. `loadProject()` returns `null` when no stored value exists or when JSON parsing fails; `saveProject()` serializes the full `StoryboardProject`.

- [ ] **Step 4: Run the domain and storage tests**

Run: `npm test -- --run src/domain/storyboard.test.ts src/storage/projectRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the data layer**

```bash
git add src/domain src/storage
git commit -m "feat: add local storyboard project model"
```

## Task 3: Build the editable dynamic-column workbench

**Files:**
- Create: `src/components/ProjectHeader.tsx`
- Create: `src/components/StoryboardTable.tsx`
- Create: `src/components/StoryboardTable.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `StoryboardProject`, `addShot(project)`, `updateShotValue(project, shotId, fieldId, value)` and `saveProject(project)`.
- Produces: `StoryboardTable({ project, onChange })` and `ProjectHeader({ title, onTitleChange })`.

- [ ] **Step 1: Write failing editing tests**

```tsx
it("edits a visible storyboard cell and adds a shot", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();
  render(<StoryboardTable project={project} onChange={onChange} />);
  await user.clear(screen.getByLabelText("镜号-1"));
  await user.type(screen.getByLabelText("镜号-1"), "2");
  expect(onChange).toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "新增镜头" }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shots: expect.any(Array) }));
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm test -- --run src/components/StoryboardTable.test.tsx`

Expected: FAIL because `StoryboardTable` does not exist.

- [ ] **Step 3: Implement the workbench components**

`StoryboardTable` renders only `project.fields.filter((field) => field.visible).sort((a, b) => a.order - b.order)`. It uses an HTML `<table>`, renders one `<input>` per non-image field, and labels each input `${field.label}-${shot.id}`. It calls `onChange(updateShotValue(...))` on every input change. Its `新增镜头` button calls `onChange(addShot(project))`.

`ProjectHeader` renders the editable project title and a save-status string. `App` loads a saved project once, otherwise creates one; every project change updates React state and calls `saveProject`. Add buttons for `新增镜头` and `字段设置`; defer the latter button behavior to Task 5.

Use CSS grid/table sizing so the table scrolls horizontally in a desktop viewport, while the first `镜号` column remains visible with `position: sticky; left: 0`. Do not hard-code table columns: widths follow field type and label.

- [ ] **Step 4: Run editing tests and build**

Run: `npm test -- --run src/components/StoryboardTable.test.tsx && npm run build`

Expected: PASS and successful production build.

- [ ] **Step 5: Commit the workbench**

```bash
git add src/App.tsx src/components/ProjectHeader.tsx src/components/StoryboardTable.tsx src/components/StoryboardTable.test.tsx src/styles.css
git commit -m "feat: add editable storyboard table"
```

## Task 4: Add stretched image cells

**Files:**
- Create: `src/components/ImageCell.tsx`
- Modify: `src/domain/storyboard.ts`
- Modify: `src/components/StoryboardTable.tsx`
- Modify: `src/components/StoryboardTable.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `updateShotValue(project, shotId, fieldId, value)`.
- Produces: `ImageCell({ value, label, onChange })`, where `value` is a data URL or an empty string.

- [ ] **Step 1: Write the failing image-cell test**

```tsx
it("fills the image cell with the selected image", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ImageCell label="画面-1" value="" onChange={onChange} />);
  const file = new File(["image"], "frame.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("画面-1"), file);
  expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
});
```

- [ ] **Step 2: Run the image test to verify it fails**

Run: `npm test -- --run src/components/StoryboardTable.test.tsx`

Expected: FAIL because `ImageCell` does not exist.

- [ ] **Step 3: Implement upload, preview and removal**

Implement `ImageCell` with a hidden `accept="image/*"` file input, `FileReader.readAsDataURL(file)`, a preview `<img>` and a `移除图片` button. Render it for `field.type === "image"`, including seeded `frame` and `reference` fields. The preview must have `width: 100%`, `height: 100%`, `object-fit: fill` and no `object-position` rule. Set image table-cell height to `160px`.

Reject non-image MIME types before reading and show the exact visible error text `请选择图片文件`.

- [ ] **Step 4: Run the image test and full suite**

Run: `npm test -- --run && npm run build`

Expected: all tests pass and the built app has no TypeScript error.

- [ ] **Step 5: Commit image support**

```bash
git add src/domain/storyboard.ts src/components/ImageCell.tsx src/components/StoryboardTable.tsx src/components/StoryboardTable.test.tsx src/styles.css
git commit -m "feat: add stretched storyboard images"
```

## Task 5: Add field settings

**Files:**
- Create: `src/components/FieldSettings.tsx`
- Create: `src/components/FieldSettings.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `StoryboardProject`, `addField(project, input)`, `toggleFieldVisibility(project, id, visible)` and `moveField(project, id, toIndex)`.
- Produces: `FieldSettings({ project, onChange, onClose })`.

- [ ] **Step 1: Write the failing field-settings test**

```tsx
it("adds a person field and hides an existing field", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();
  render(<FieldSettings project={project} onChange={onChange} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText("字段名称"), "演员");
  await user.selectOptions(screen.getByLabelText("字段类型"), "person");
  await user.click(screen.getByRole("button", { name: "添加字段" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ label: "演员", type: "person" })]) }));
  await user.click(screen.getByLabelText("显示-摄影机装备"));
  expect(onChange).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the settings test to verify it fails**

Run: `npm test -- --run src/components/FieldSettings.test.tsx`

Expected: FAIL because `FieldSettings` does not exist.

- [ ] **Step 3: Implement field settings and wire the dialog**

Render `FieldSettings` in an accessible `<dialog open>` only after the user clicks `字段设置`. Include a name input labelled `字段名称`, a select labelled `字段类型` with exactly `text`, `number`, `date`, `singleSelect`, `multiSelect` and `person`, and an `添加字段` button. Render existing fields in current order with a `显示-${field.label}` checkbox and `上移`/`下移` buttons. Disable `上移` on the first field and `下移` on the last field. On duplicate field names, show `字段名称已存在` and do not call `onChange`.

- [ ] **Step 4: Run the settings test, full suite and build**

Run: `npm test -- --run && npm run build`

Expected: all tests pass and production build succeeds.

- [ ] **Step 5: Commit the settings feature**

```bash
git add src/App.tsx src/components/FieldSettings.tsx src/components/FieldSettings.test.tsx src/styles.css
git commit -m "feat: customize storyboard fields"
```

## Plan Self-Review

- Spec coverage for this first implementation slice: default field template (Task 2), row editing and dynamic columns (Task 3), project-level field settings (Task 5), picture attachment with required stretching behavior (Task 4), and local persistence (Task 2).
- Deliberate phase boundaries: realtime collaboration, role permissions, comments, version restoration, server object storage, PDF/Excel export and shooting plans require backend services and are not deceptively stubbed in this first local application.
- Placeholder scan: no unfinished markers or undefined interfaces remain.
- Type check: all UI tasks use the `StoryboardProject`, `FieldDefinition`, `Shot` and helper signatures defined in Task 2.
