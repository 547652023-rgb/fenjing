import { render, screen } from "@testing-library/react";
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

  expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
});

it("previews and removes an image data URL", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const value = "data:image/png;base64,aW1hZ2U=";

  render(<ImageCell label="画面-1" value={value} onChange={onChange} />);

  expect(screen.getByRole("img", { name: "画面-1" })).toHaveAttribute("src", value);
  await user.click(screen.getByRole("button", { name: "移除图片" }));
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

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      shots: [
        expect.objectContaining({
          values: expect.objectContaining({
            frame: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        }),
      ],
    }),
  );
  expect(screen.getByLabelText("参考-1")).toHaveAttribute("accept", "image/*");
});
