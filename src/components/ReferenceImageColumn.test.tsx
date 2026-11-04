import { fireEvent, render, screen } from "@testing-library/react";
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
