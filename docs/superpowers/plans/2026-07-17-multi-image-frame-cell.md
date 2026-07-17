# 画面列单行多图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个分镜行的“画面”单元格支持一次多选或分次追加最多 5 张图片，并可逐张删除和拉伸显示。

**Architecture:** 保持 `Shot.values: Record<string, string>` 不变，在 `ImageCell` 边界把字符串解析为图片数组并序列化回 JSON。`StoryboardTable` 只为 `frame` 字段传入上限 5，其他图片字段仍传入上限 1，从而兼容现有参考列和旧单图数据。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、CSS、浏览器 FileReader 与 localStorage。

## Global Constraints

- “画面”字段每个分镜行最多 5 张图片。
- 支持一次选择多张和多次追加。
- 图片按添加顺序保存；不实现拖拽排序。
- 图片使用 `object-fit: fill` 拉伸铺满缩略框。
- “参考”字段继续保持单图行为。
- 旧的单张 data URL 必须继续显示且不能丢失。
- 不增加云端上传、多人同步或新依赖。

---

### Task 1: 图片值解析与多文件上传

**Files:**
- Modify: `src/components/ImageCell.tsx`
- Test: `src/components/StoryboardTable.test.tsx`

**Interfaces:**
- Consumes: `value: string`、`label: string`、`onChange(value: string): void`。
- Produces: `ImageCellProps.maxImages?: number`，默认值为 `1`；画面多图值使用 JSON 字符串数组。

- [ ] **Step 1: 写入旧值兼容和一次多选的失败测试**

在 `src/components/StoryboardTable.test.tsx` 增加：

```tsx
it("uploads multiple images in selection order", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(<ImageCell label="画面-1" maxImages={5} value="" onChange={onChange} />);

  const first = new File(["first"], "first.png", { type: "image/png" });
  const second = new File(["second"], "second.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("画面-1"), [first, second]);

  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const saved = JSON.parse(onChange.mock.calls[0][0]);
  expect(saved).toHaveLength(2);
  expect(saved[0]).toMatch(/^data:image\/png;base64,/);
  expect(saved[1]).toMatch(/^data:image\/jpeg;base64,/);
});

it("renders a legacy single image value", () => {
  const value = "data:image/png;base64,bGVnYWN5";
  render(<ImageCell label="画面-1" maxImages={5} value={value} onChange={vi.fn()} />);

  expect(screen.getByRole("img", { name: "画面-1-图片1" })).toHaveAttribute("src", value);
});
```

同时把原有“预览并移除单图”测试的图片名称更新为 `画面-1-图片1`，删除按钮名称更新为 `移除画面-1-图片1`，使旧单图测试与新的逐图可访问名称一致。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
node_modules/.bin/vitest src/components/StoryboardTable.test.tsx --run
```

Expected: FAIL，因为 `ImageCell` 尚无 `maxImages` 属性、文件输入不支持多选且旧图片的序号可访问名称不存在。

- [ ] **Step 3: 实现字符串解析、序列化和有序多文件读取**

在 `src/components/ImageCell.tsx` 中增加并使用以下边界函数：

```tsx
function parseImageValues(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  } catch {
    // Legacy values are stored as one raw data URL.
  }
  return [value];
}

function serializeImageValues(values: string[], maxImages: number): string {
  if (maxImages === 1) return values[0] ?? "";
  return values.length === 0 ? "" : JSON.stringify(values);
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("读取图片失败")),
    );
    reader.addEventListener("error", () => reject(new Error("读取图片失败")));
    reader.readAsDataURL(file);
  });
}
```

把属性扩展为：

```tsx
type ImageCellProps = {
  value: string;
  label: string;
  maxImages?: number;
  onChange: (value: string) => void;
};
```

文件选择处理必须先筛选图片、截取剩余名额，再使用 `Promise.all` 保持选择顺序：

```tsx
const images = parseImageValues(value).slice(0, maxImages);
const selected = Array.from(input.files ?? []);
const valid = selected.filter((file) => file.type.startsWith("image/"));
const accepted = valid.slice(0, Math.max(0, maxImages - images.length));
const loaded = await Promise.all(accepted.map(readImage));
onChange(serializeImageValues([...images, ...loaded], maxImages));
```

文件输入在 `maxImages > 1` 时设置 `multiple`。预览图的 `alt` 使用 `${label}-图片${index + 1}`。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
node_modules/.bin/vitest src/components/StoryboardTable.test.tsx --run
```

Expected: 新增测试和原有图片测试全部 PASS。

- [ ] **Step 5: 提交第一阶段**

```bash
git add src/components/ImageCell.tsx src/components/StoryboardTable.test.tsx
git commit -m "feat: upload multiple storyboard frame images"
```

---

### Task 2: 五张上限、追加和逐张删除

**Files:**
- Modify: `src/components/ImageCell.tsx`
- Test: `src/components/StoryboardTable.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `parseImageValues`、`serializeImageValues` 和 `maxImages`。
- Produces: 逐张删除、剩余名额限制、上限提示和 `当前数量/上限` 状态。

- [ ] **Step 1: 写入追加、上限和指定删除的失败测试**

```tsx
it("appends images up to five and removes one selected image", async () => {
  const user = userEvent.setup();
  const existing = [
    "data:image/png;base64,MQ==",
    "data:image/png;base64,Mg==",
    "data:image/png;base64,Mw==",
    "data:image/png;base64,NA==",
  ];
  const onChange = vi.fn();
  const { rerender } = render(
    <ImageCell label="画面-1" maxImages={5} value={JSON.stringify(existing)} onChange={onChange} />,
  );

  const fifth = new File(["five"], "five.png", { type: "image/png" });
  const ignored = new File(["six"], "six.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("画面-1"), [fifth, ignored]);

  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const nextValue = onChange.mock.calls[0][0];
  expect(JSON.parse(nextValue)).toHaveLength(5);
  expect(screen.getByText("每行最多 5 张图片")).toBeVisible();

  rerender(<ImageCell label="画面-1" maxImages={5} value={nextValue} onChange={onChange} />);
  expect(screen.queryByLabelText("画面-1")).not.toBeInTheDocument();
  expect(screen.getByText("5/5")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "移除画面-1-图片2" }));
  expect(JSON.parse(onChange.mock.calls.at(-1)?.[0])).toEqual([
    existing[0],
    existing[2],
    existing[3],
    expect.stringMatching(/^data:image\/png;base64,/),
  ]);
});

it("keeps existing images when a file read fails", async () => {
  const user = userEvent.setup();
  const existing = "data:image/png;base64,b2s=";
  const onChange = vi.fn();
  const readSpy = vi
    .spyOn(FileReader.prototype, "readAsDataURL")
    .mockImplementation(function () {
      this.dispatchEvent(new Event("error"));
    });

  render(<ImageCell label="画面-1" maxImages={5} value={existing} onChange={onChange} />);
  await user.upload(
    screen.getByLabelText("画面-1"),
    new File(["broken"], "broken.png", { type: "image/png" }),
  );

  await waitFor(() => expect(screen.getByText("读取图片失败")).toBeVisible());
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "画面-1-图片1" })).toHaveAttribute("src", existing);
  readSpy.mockRestore();
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
node_modules/.bin/vitest src/components/StoryboardTable.test.tsx --run
```

Expected: FAIL，因为组件尚无逐张删除、数量状态和超限提示。

- [ ] **Step 3: 实现上限提示、数量状态和逐张删除**

在 `ImageCell` 中：

```tsx
function removeImage(index: number) {
  const nextImages = images.filter((_, imageIndex) => imageIndex !== index);
  onChange(serializeImageValues(nextImages, maxImages));
}
```

当 `selected.length > accepted.length` 且存在超过名额的图片时设置 `每行最多 ${maxImages} 张图片`；存在非图片文件时优先显示 `请选择图片文件`；FileReader 拒绝时显示 `读取图片失败`。达到上限后不渲染文件输入，并始终渲染 `${images.length}/${maxImages}`。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
node_modules/.bin/vitest src/components/StoryboardTable.test.tsx --run
```

Expected: 追加、限制、删除以及原有错误处理测试全部 PASS。

- [ ] **Step 5: 提交第二阶段**

```bash
git add src/components/ImageCell.tsx src/components/StoryboardTable.test.tsx
git commit -m "feat: limit and remove storyboard frame images"
```

---

### Task 3: 只为画面列启用五图与拉伸布局

**Files:**
- Modify: `src/components/StoryboardTable.tsx`
- Modify: `src/styles.css`
- Test: `src/components/StoryboardTable.test.tsx`

**Interfaces:**
- Consumes: `ImageCell.maxImages`。
- Produces: `frame` 字段上限 5，`reference` 字段上限 1；横向多图拉伸布局。

- [ ] **Step 1: 写入字段接线的失败测试**

```tsx
it("allows five frame images while reference remains single image", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
  expect(screen.getByLabelText("参考-1")).not.toHaveAttribute("multiple");
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
node_modules/.bin/vitest src/components/StoryboardTable.test.tsx --run
```

Expected: FAIL，因为表格尚未给画面字段传入 `maxImages={5}`。

- [ ] **Step 3: 接线字段上限**

修改 `StoryboardTable` 中的图片组件：

```tsx
<ImageCell
  label={`${field.label}-${shot.id}`}
  maxImages={field.id === "frame" ? 5 : 1}
  value={shot.values[field.id] ?? ""}
  onChange={(value) =>
    onChange((latestProject) => updateShotValue(latestProject, shot.id, field.id, value))
  }
/>
```

- [ ] **Step 4: 实现横向拉伸样式**

在 `src/styles.css` 中把图片区调整为：

```css
.image-cell__previews {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.image-cell__item {
  position: relative;
  flex: 0 0 8rem;
  height: 6rem;
}

.image-cell__preview {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
```

保留现有表格横向滚动，并把画面列最小宽度提高到可清楚展示添加入口和至少两张缩略图。

- [ ] **Step 5: 运行组件测试和全量验证**

Run:

```bash
node_modules/.bin/vitest --run
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build
```

Expected: 5 个以上测试文件全部 PASS，TypeScript 退出码 0，Vite 生成 `dist/` 且退出码 0。

- [ ] **Step 6: 提交并部署**

```bash
git add src/components/StoryboardTable.tsx src/components/StoryboardTable.test.tsx src/styles.css
git commit -m "feat: display five stretched frame images"
git push origin agent/add-storyboard-saas-design
```

推送后检查 GitHub Actions 的 `Deploy GitHub Pages` 工作流成功，并在 `https://547652023-rgb.github.io/fenjing/` 验证：画面列可多选、追加、删除和刷新保留；参考列仍为单图。
