# Image Cell Thumbnail Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent storyboard frame and reference uploads from enlarging a row while retaining vertical, five-image stacks.

**Architecture:** The image-cell component already renders both image fields through one layout. CSS will make that layout use a bounded thumbnail box for every image count, with the table cell providing no inherited full-row height. Tests will assert the shared layout contract so future reference-image work cannot regress it.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Apply the same bounded thumbnail layout to both `画面` and `参考` fields.
- Support at most five images vertically in either field.
- Use `object-fit: cover` and preserve click-to-view behavior.
- Do not alter stored image metadata or upload behavior.

---

### Task 1: Lock image previews to a bounded thumbnail layout

**Files:**
- Modify: `src/styles.css:981-1040`
- Test: `src/components/StoryboardTable.test.tsx`, `src/styles.test.js`

**Interfaces:**
- Consumes: `ImageCellLayout` CSS classes: `image-cell`, `image-cell--single`, `image-cell--multiple`, `image-cell__previews`, `image-cell__item`, and `image-cell__preview`.
- Produces: bounded image cells whose dimensions never inherit an image's intrinsic dimensions.

- [ ] **Step 1: Write the visual-layout regression test**

Add this test after the existing `reads an uploaded image as a data URL` test:

```tsx
it("uses the same bounded thumbnail layout for frame and reference images", () => {
  const source = "data:image/png;base64,bGVnYWN5";
  const { rerender } = render(
    <ImageCell label="画面-1" maxImages={5} value={source} onChange={vi.fn()} />,
  );

  expect(screen.getByTestId("image-cell")).toHaveClass("image-cell--multiple");
  expect(screen.getByTestId("image-cell-previews")).toHaveClass("image-cell__previews--vertical");
  expect(screen.getByRole("img", { name: "画面-1-图片1" })).toHaveClass("image-cell__preview");

  rerender(<ImageCell label="参考-1" maxImages={5} value={source} onChange={vi.fn()} />);
  expect(screen.getByRole("img", { name: "参考-1-图片1" })).toHaveClass("image-cell__preview");
});
```

- [ ] **Step 2: Add failing CSS contract assertions**

In `src/styles.test.js`, assert that image cells use a fixed thumbnail height and that a single-image cell does not inherit full row height:

```js
expect(css).toMatch(/\.image-cell__item--thumbnail[\s\S]*height:\s*6\.75rem/);
expect(css).toMatch(/\.image-cell--single \.image-cell__item[\s\S]*height:\s*6\.75rem/);
expect(css).not.toMatch(/\.image-cell--single \.image-cell__item[\s\S]*height:\s*100%/);
```

- [ ] **Step 3: Run the focused tests and observe the CSS contract failure**

Run: `pnpm test -- --run src/components/StoryboardTable.test.tsx src/styles.test.js`

Expected: the CSS assertions fail because single-image cells still use `height: 100%`.

- [ ] **Step 4: Implement the bounded CSS rules**

Replace the single-image full-height rule with a fixed thumbnail rule, and share the thumbnail dimensions between single and multiple cells:

```css
.image-cell--single,
.image-cell--multiple {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  padding: 0.75rem;
}

.image-cell--single .image-cell__item,
.image-cell--multiple .image-cell__item--thumbnail {
  width: min(100%, 12rem);
  height: 6.75rem;
  min-height: 6.75rem;
  aspect-ratio: 16 / 9;
}
```

Keep `.image-cell__preview { width: 100%; height: 100%; object-fit: cover; }` unchanged.

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm test -- --run src/components/StoryboardTable.test.tsx src/styles.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the bounded layout**

```bash
git add src/styles.css src/styles.test.js src/components/StoryboardTable.test.tsx
git commit -m "fix: bound storyboard image thumbnails"
```

### Task 2: Verify the full application still builds

**Files:**
- Verify only: `src/components/ImageCell.tsx`, `src/workbench/ProjectWorkbench.tsx`

**Interfaces:**
- Consumes: existing online image upload and metadata persistence flows.
- Produces: confirmation that the CSS-only layout change leaves upload and workbench behavior intact.

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test -- --run`

Expected: all test files pass.

- [ ] **Step 2: Build the production bundle**

Run: `pnpm build`

Expected: `tsc --noEmit` and `vite build` succeed.

- [ ] **Step 3: Manually validate in the deployed workbench**

1. Open a project and upload one image to `参考`.
2. Confirm it renders as a 16:9 thumbnail rather than expanding the row.
3. Upload up to five images to `画面` and confirm vertical thumbnails remain within the cell.
4. Click a thumbnail and confirm the existing large-image view opens.

- [ ] **Step 4: Commit any verification-only test changes**

```bash
git status --short
git add src/components/StoryboardTable.test.tsx src/styles.test.js
git commit -m "test: cover bounded storyboard image previews"
```

