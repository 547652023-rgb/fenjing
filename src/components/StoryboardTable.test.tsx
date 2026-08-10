import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import {
  addShot,
  assignShotsToScene,
  createProject,
  createScene,
} from "../domain/storyboard";
import { ImageCell } from "./ImageCell";
import { StoryboardTable } from "./StoryboardTable";

it("edits a visible storyboard cell and adds a shot", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<StoryboardTable project={project} onChange={onChange} />);

  await user.clear(screen.getByLabelText("镜号-1"));
  await user.type(screen.getByLabelText("镜号-1"), "2");
  expect(onChange).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "新增 1 个镜头" }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ shots: expect.any(Array) }),
  );
});

it("switches to the cinematography view without mutating storyboard fields", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(<StoryboardTable project={createProject()} onChange={onChange} />);

  await user.click(screen.getByRole("button", { name: "列设置" }));
  await user.click(screen.getByRole("button", { name: "摄影视图" }));

  expect(screen.getByRole("columnheader", { name: "摄影机角度" })).toBeVisible();
  expect(screen.queryByRole("columnheader", { name: "内容" })).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it("reads an uploaded image as a data URL", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(<ImageCell label="画面-1" value="" onChange={onChange} />);

  const file = new File(["image"], "frame.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("画面-1"), file);

  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)),
  );
});

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
    <ImageCell
      label="画面-1"
      maxImages={5}
      value={JSON.stringify(existing)}
      onChange={onChange}
    />,
  );

  const fifth = new File(["five"], "five.png", { type: "image/png" });
  const ignored = new File(["six"], "six.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("画面-1"), [fifth, ignored]);

  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  const nextValue = onChange.mock.calls[0][0];
  expect(JSON.parse(nextValue)).toHaveLength(5);
  expect(screen.getByText("每行最多 5 张图片")).toBeVisible();

  rerender(
    <ImageCell label="画面-1" maxImages={5} value={nextValue} onChange={onChange} />,
  );
  expect(screen.queryByLabelText("画面-1")).not.toBeInTheDocument();
  expect(screen.getByText("5/5")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "移除画面-1-图片2" }));
  const removedValue = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(JSON.parse(removedValue)).toEqual([
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
    .mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new Event("error"));
    });

  render(<ImageCell label="画面-1" maxImages={5} value={existing} onChange={onChange} />);
  await user.upload(
    screen.getByLabelText("画面-1"),
    new File(["broken"], "broken.png", { type: "image/png" }),
  );

  await waitFor(() => expect(screen.getByText("读取图片失败")).toBeVisible());
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "画面-1-图片1" })).toHaveAttribute(
    "src",
    existing,
  );
  readSpy.mockRestore();
});

it("previews and removes an image data URL", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const value = "data:image/png;base64,aW1hZ2U=";

  render(<ImageCell label="画面-1" value={value} onChange={onChange} />);

  expect(screen.getByRole("img", { name: "画面-1-图片1" })).toHaveAttribute("src", value);
  await user.click(screen.getByRole("button", { name: "移除画面-1-图片1" }));
  expect(onChange).toHaveBeenCalledWith("");
});

it("rejects a non-image file before reading it", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const onChange = vi.fn();

  render(<ImageCell label="参考-1" value="" onChange={onChange} />);

  const file = new File(["notes"], "notes.txt", { type: "text/plain" });
  await user.upload(screen.getByLabelText("参考-1"), file);

  expect(screen.getByText("请选择图片文件")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

it("wires seeded image fields to shot updates", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<StoryboardTable project={project} onChange={onChange} />);

  const file = new File(["image"], "frame.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("画面-1"), file);

  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const imageUpdate = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
  expect(imageUpdate).toEqual(expect.any(Function));
  const updatedProject = imageUpdate(project);
  expect(JSON.parse(updatedProject.shots[0].values.frame)).toEqual([
    expect.stringMatching(/^data:image\/png;base64,/),
  ]);
  expect(screen.getByLabelText("参考-1")).toHaveAttribute("accept", "image/*");
});

it("allows five images in both frame and reference columns", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
  expect(screen.getByLabelText("参考-1")).toHaveAttribute("multiple");
  expect(screen.getByRole("columnheader", { name: "画面" })).toHaveAttribute(
    "style",
    expect.stringContaining("min-width: 16rem"),
  );
});

function StoryboardHarness() {
  const [project, setProject] = useState(() => addShot(addShot(createProject())));

  return (
    <>
      <output data-testid="shot-order">{project.shots.map(({ id }) => id).join(",")}</output>
      <StoryboardTable
        project={project}
        onChange={(update) =>
          setProject((current) =>
            typeof update === "function" ? update(current) : update,
          )
        }
      />
    </>
  );
}

function SceneGroupingHarness({ initialProject }: { initialProject: ReturnType<typeof createProject> }) {
  const [project, setProject] = useState(initialProject);
  return (
    <StoryboardTable
      project={project}
      onChange={(update) => setProject((current) =>
        typeof update === "function" ? update(current) : update,
      )}
    />
  );
}

it("creates a scene and assigns selected shots through the batch bar", async () => {
  const user = userEvent.setup();
  const projectWithScene = createScene(createProject(), { name: "夜景天台" });
  render(<SceneGroupingHarness initialProject={projectWithScene} />);

  await user.click(screen.getByLabelText("选择镜头 1"));
  await user.selectOptions(screen.getByLabelText("归入场次"), "scene-1");
  await user.click(screen.getByRole("button", { name: "归入场次" }));

  expect(screen.getByRole("row", { name: "场次 1 夜景天台" })).toBeVisible();
  expect(screen.queryByRole("row", { name: "未分组镜头" })).not.toBeInTheDocument();
});

it("keeps row operations inside an accessible more menu", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<StoryboardHarness />);

  expect(screen.queryByRole("button", { name: "上移镜头 1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "下移镜头 3" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除镜头 3" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "更多镜头 3" }));
  const menu = screen.getByRole("menu", { name: "镜头 3 操作" });
  expect(within(menu).getByRole("menuitem", { name: "在上方新增" })).toBeVisible();
  expect(within(menu).getByRole("menuitem", { name: "在下方新增" })).toBeVisible();
  expect(within(menu).getByRole("menuitem", { name: "复制镜头" })).toBeVisible();
  expect(within(menu).getByRole("menuitem", { name: "移动到场次" })).toBeEnabled();

  await user.click(within(menu).getByRole("menuitem", { name: "上移" }));
  expect(screen.getByTestId("shot-order")).toHaveTextContent("1,3,2");

  await user.click(screen.getByRole("button", { name: "更多镜头 3" }));
  await user.click(screen.getByRole("menuitem", { name: "删除镜头" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除这个镜头吗？");
  expect(screen.getByTestId("shot-order")).toHaveTextContent("1,2");
  expect(screen.getAllByLabelText(/^镜号-/).map((input) => input.getAttribute("value"))).toEqual([
    "1",
    "2",
  ]);
});

it("runs row shortcuts without disrupting active field editing", async () => {
  const user = userEvent.setup();
  const project = addShot(createProject());
  const onCreateShots = vi.fn().mockResolvedValue(["3"]);
  const onBatchDelete = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);

  render(
    <StoryboardTable
      project={project}
      onBatchDelete={onBatchDelete}
      onChange={vi.fn()}
      onCreateShots={onCreateShots}
    />,
  );

  const secondShotContent = screen.getByLabelText("内容-2");
  await user.click(secondShotContent);
  await user.keyboard("{Meta>}d{/Meta}");
  expect(onCreateShots).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "更多镜头 2" }));
  await user.keyboard("{Meta>}d{/Meta}");
  expect(onCreateShots).toHaveBeenCalledWith({ copyShotId: "2", count: 1 });

  await user.keyboard("{Meta>}{Enter}{/Meta}");
  expect(onCreateShots).toHaveBeenLastCalledWith({ afterShotId: "2", count: 1 });

  await user.click(screen.getByRole("checkbox", { name: "选择镜头 1" }));
  await user.keyboard("{Delete}");
  expect(window.confirm).toHaveBeenCalledWith("确定删除选中的 1 个镜头吗？");
  expect(onBatchDelete).toHaveBeenCalledWith(["1"]);
});

it("moves a dragged row to the dropped row position", () => {
  render(<StoryboardHarness />);

  const dragged = screen.getByRole("button", { name: "拖动镜头 3" });
  fireEvent.dragStart(dragged);
  fireEvent.dragOver(screen.getByRole("row", { name: /镜头 1/ }));
  fireEvent.drop(screen.getByRole("row", { name: /镜头 1/ }));

  expect(screen.getByTestId("shot-order")).toHaveTextContent("3,1,2");
});

it("renders shot size as the restricted six-option dropdown", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  const shotSize = screen.getByRole("combobox", { name: "景别-1" });
  expect(shotSize).toHaveAttribute("data-allow-custom", "false");
  expect(within(shotSize).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "",
    "大远景",
    "远景",
    "全景",
    "中景",
    "近景",
    "特写",
  ]);
});

it("selects shots and exposes batch copy, field update, and delete actions", async () => {
  const user = userEvent.setup();
  const project = addShot(addShot(createProject()));
  const onBatchCopy = vi.fn();
  const onBatchDelete = vi.fn();
  const onBatchUpdate = vi.fn();

  render(
    <StoryboardTable
      project={project}
      onChange={vi.fn()}
      onBatchCopy={onBatchCopy}
      onBatchDelete={onBatchDelete}
      onBatchUpdate={onBatchUpdate}
    />,
  );

  await user.click(screen.getByRole("checkbox", { name: "选择镜头 1" }));
  await user.click(screen.getByRole("checkbox", { name: "选择镜头 3" }));

  const batchBar = screen.getByRole("toolbar", { name: "批量操作" });
  expect(batchBar).toHaveTextContent("已选择 2 个镜头");

  await user.click(within(batchBar).getByRole("button", { name: "复制镜头" }));
  expect(onBatchCopy).toHaveBeenCalledWith(["1", "3"]);

  await user.selectOptions(
    within(batchBar).getByRole("combobox", { name: "批量字段" }),
    "content",
  );
  await user.type(within(batchBar).getByRole("textbox", { name: "批量字段值" }), "开场特写");
  await user.click(within(batchBar).getByRole("button", { name: "应用字段值" }));
  expect(onBatchUpdate).toHaveBeenCalledWith(["1", "3"], "content", "开场特写");

  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(within(batchBar).getByRole("button", { name: "删除镜头" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除选中的 2 个镜头吗？");
  expect(onBatchDelete).toHaveBeenCalledWith(["1", "3"]);
});

it("creates a five-shot run and inserts a derivative shot below the active row", async () => {
  const user = userEvent.setup();
  const project = addShot(createProject());
  const onCreateShots = vi.fn().mockResolvedValue(["3", "4", "5", "6", "7"]);

  render(
    <StoryboardTable
      project={project}
      onChange={vi.fn()}
      onCreateShots={onCreateShots}
    />,
  );

  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "新增 5 个镜头" }));
  expect(onCreateShots).toHaveBeenCalledWith({ count: 5 });

  await user.click(screen.getByLabelText("镜号-2"));
  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "在当前镜头下方新增" }));
  expect(onCreateShots).toHaveBeenLastCalledWith({ afterShotId: "2", count: 1 });

  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "复制当前镜头" }));
  expect(onCreateShots).toHaveBeenLastCalledWith({ copyShotId: "2", count: 1 });
});

it("copies text and select values when the table uses its local fallback", async () => {
  const user = userEvent.setup();
  render(<StoryboardHarness />);

  await user.type(screen.getByLabelText("内容-1"), "导演画面");
  await user.selectOptions(screen.getByRole("combobox", { name: "景别-1" }), "近景");
  await user.click(screen.getByLabelText("内容-1"));
  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "复制当前镜头" }));

  expect(screen.getByLabelText("内容-4")).toHaveValue("导演画面");
  expect(screen.getByRole("combobox", { name: "景别-4" })).toHaveValue("近景");
});

it("groups assigned shots beneath a collapsible scene header while retaining ungrouped shots", async () => {
  const user = userEvent.setup();
  const withShots = addShot(createProject());
  const withScene = createScene(withShots, {
    name: "夜 · 酒吧门口",
    intExt: "EXT",
    dayNight: "NIGHT",
  });
  const project = assignShotsToScene(withScene, ["1"], withScene.scenes[0].id);

  render(<SceneGroupingHarness initialProject={project} />);

  expect(screen.getByRole("row", { name: /场次 1 夜 · 酒吧门口/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "收起场次 1" })).toBeVisible();
  expect(screen.getByLabelText("镜号-1")).toBeVisible();
  expect(screen.getByRole("row", { name: "未分组镜头" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "收起场次 1" }));
  expect(screen.queryByLabelText("镜号-1")).not.toBeInTheDocument();
  expect(screen.getByLabelText("镜号-2")).toBeVisible();
  expect(screen.getByRole("button", { name: "展开场次 1" })).toBeVisible();
});

it("filters the workbench to a clicked production status without changing shot order", async () => {
  const user = userEvent.setup();
  const project = addShot(createProject());
  project.shots[0] = {
    ...project.shots[0],
    values: { ...project.shots[0].values, productionStatus: "待拍" },
  };
  project.shots[1] = {
    ...project.shots[1],
    values: { ...project.shots[1].values, productionStatus: "已完成" },
  };

  render(<StoryboardTable project={project} onChange={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "待拍 1" }));

  expect(screen.getByLabelText("镜号-1")).toBeVisible();
  expect(screen.queryByLabelText("镜号-2")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "移除筛选 待拍" })).toBeVisible();
});
