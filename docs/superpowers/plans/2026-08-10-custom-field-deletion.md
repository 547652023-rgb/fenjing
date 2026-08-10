# Custom Field Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project owners remove a custom storyboard field through the existing draft-and-save field-settings workflow.

**Architecture:** Add a pure domain operation that rejects protected built-in fields and removes a custom field while re-normalizing order. FieldSettings invokes that operation only in its local draft after explicit confirmation; the existing Save button persists the draft and Cancel discards it.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Supabase gateway.

## Global Constraints

- Protect built-in fields from deletion.
- Do not persist a deletion until the user chooses “保存更改”.
- “取消”, Escape, and close must leave the saved project unchanged.
- Preserve the existing warm-white, copper, wine-red studio UI system.

---

### Task 1: Safe custom-field deletion

**Files:**
- Modify: `src/domain/storyboard.ts`
- Test: `src/domain/storyboard.test.ts`

**Interfaces:**
- Produces: `deleteField(project: StoryboardProject, fieldId: string): StoryboardProject`.
- Rejects `shotNumber` and every field included in `DEFAULT_FIELDS`.

- [ ] **Step 1: Write the failing test**

```ts
expect(() => deleteField(project, "shotNumber")).toThrow("cannot be deleted");
expect(deleteField(project, "wardrobe").fields.map((field) => field.id))
  .not.toContain("wardrobe");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run src/domain/storyboard.test.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
export function deleteField(project: StoryboardProject, fieldId: string): StoryboardProject {
  if (BUILT_IN_FIELD_IDS.has(fieldId)) throw new Error("Built-in fields cannot be deleted");
  return { ...project, fields: withFieldOrder(project.fields.filter((field) => field.id !== fieldId)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --run src/domain/storyboard.test.ts`

### Task 2: Field-settings deletion control

**Files:**
- Modify: `src/components/FieldSettings.tsx`
- Modify: `src/styles.css`
- Test: `src/components/FieldSettings.test.tsx`

**Interfaces:**
- Consumes: `deleteField(project, fieldId)` from Task 1.
- Produces: a custom-field “删除字段” button that removes only the local draft after `window.confirm` returns true.

- [ ] **Step 1: Write the failing test**

```tsx
await user.click(screen.getByRole("button", { name: "删除服装备注字段" }));
expect(onChange).not.toHaveBeenCalled();
await user.click(screen.getByRole("button", { name: "保存更改" }));
expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
  fields: expect.not.arrayContaining([expect.objectContaining({ id: "服装备注" })]),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --run src/components/FieldSettings.test.tsx`

- [ ] **Step 3: Write minimal implementation**

```tsx
if (window.confirm(`删除字段“${field.label}”？`)) {
  updateDraft(deleteField(draft, field.id));
}
```

- [ ] **Step 4: Run test and build**

Run: `pnpm test -- --run src/components/FieldSettings.test.tsx src/domain/storyboard.test.ts && pnpm build`

### Task 3: Online validation and delivery

**Files:**
- No source changes expected.

- [ ] **Step 1: Push the verified commit**

Run: `git push origin agent/next-optimization`

- [ ] **Step 2: Verify with supervisor account**

1. Open a project’s 字段设置.
2. Add a disposable custom field, save, reopen, and delete it.
3. Confirm deletion, save, reopen, and confirm it is absent.
4. Cancel a second deletion and confirm the field remains.
