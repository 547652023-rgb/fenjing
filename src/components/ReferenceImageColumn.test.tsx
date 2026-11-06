import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { StoryboardTable } from "./StoryboardTable";

it("configures reference cells like frame cells for five image uploads", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
  expect(screen.getByLabelText("参考-1")).toHaveAttribute("multiple");
  expect(screen.getAllByText("0/5")).toHaveLength(2);
});

it("keeps the full image stack by default and remembers the personal compact mode", () => {
  const project = createProject();
  project.shots[0].values.frame = JSON.stringify(["/first.jpg", "/second.jpg"]);
  const imageDensityKey = "test-image-density";
  const props = { project, onChange: vi.fn(), imageDensityKey };
  try {
    const { unmount } = render(<StoryboardTable {...props} />);
    expect(screen.getByAltText("画面-1-图片2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "紧凑模式" }));
    expect(screen.getByAltText("画面-1-图片1")).toBeVisible();
    expect(screen.queryByAltText("画面-1-图片2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看全部 2 张图片" }));
    expect(screen.getByAltText("画面-1-图片2")).toBeVisible();
    unmount();
    render(<StoryboardTable {...props} />);
    expect(screen.queryByAltText("画面-1-图片2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "紧凑模式" }));
    expect(screen.getByAltText("画面-1-图片2")).toBeVisible();
    expect(props.onChange).not.toHaveBeenCalled();
  } finally {
    localStorage.removeItem(imageDensityKey);
  }
});

it("keeps a reference original through the table upload entry point", async () => {
  const decode = vi.fn();
  vi.stubGlobal("createImageBitmap", decode);
  try {
    const upload = vi.fn(async () => []);
    render(<StoryboardTable project={createProject()} onChange={vi.fn()} imageActions={{ upload, remove: vi.fn() }} />);
    const file = new File(["portrait reference"], "reference.png", { type: "image/png" });
    await act(async () => fireEvent.change(screen.getByLabelText("参考-1"), { target: { files: [file] } }));
    expect(upload).toHaveBeenCalledWith("1", "reference", [], [file]);
    expect(decode).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("updates frame and reference slots when the shared project ratio changes", () => {
  const project = createProject();
  project.aspectRatio = "9:16";
  project.shots[0].values.frame = JSON.stringify(["/frame.jpg"]);
  project.shots[0].values.reference = JSON.stringify(["/reference.jpg"]);
  const { rerender } = render(<StoryboardTable project={project} onChange={vi.fn()} />);
  expect(screen.getByAltText("画面-1-图片1").parentElement).toHaveStyle({ aspectRatio: "9 / 16" });
  expect(screen.getByAltText("参考-1-图片1").parentElement).toHaveStyle({ aspectRatio: "9 / 16" });
  rerender(<StoryboardTable project={{ ...project, aspectRatio: "1:1" }} onChange={vi.fn()} />);
  expect(screen.getByAltText("画面-1-图片1").parentElement).toHaveStyle({ aspectRatio: "1 / 1" });
  rerender(<StoryboardTable project={{ ...project, aspectRatio: "旧项目无效比例" }} onChange={vi.fn()} />);
  expect(screen.getByAltText("画面-1-图片1").parentElement).toHaveStyle({ aspectRatio: "16 / 9" });
});
