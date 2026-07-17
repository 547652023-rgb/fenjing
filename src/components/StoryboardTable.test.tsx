import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
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

  await user.click(screen.getByRole("button", { name: "新增镜头" }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ shots: expect.any(Array) }),
  );
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

it("allows five frame images while reference remains single image", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
  expect(screen.getByLabelText("参考-1")).not.toHaveAttribute("multiple");
});
