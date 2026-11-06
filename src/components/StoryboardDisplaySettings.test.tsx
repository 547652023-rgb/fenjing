import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { StoryboardTable } from "./StoryboardTable";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it("changes table text size and restores the preference when reopening the project", async () => {
  const project = createProject();
  const props = { project, onChange: vi.fn() };
  const user = userEvent.setup();
  const view = render(<StoryboardTable {...props} />);
  await user.click(screen.getByText("分镜设置"));
  await user.selectOptions(screen.getByLabelText("表格字号"), "18");
  expect(screen.getByLabelText("内容-1")).toHaveStyle({ fontSize: "18px" });
  view.unmount();
  render(<StoryboardTable {...props} />);
  expect(screen.getByLabelText("内容-1")).toHaveStyle({ fontSize: "18px" });
  expect(props.onChange).not.toHaveBeenCalled();
});

it("switches long text between centered, left and upper-left without losing its value", async () => {
  const project = createProject();
  project.shots[0].values.content = "完整的第一行\n第二行";
  const user = userEvent.setup();
  render(<StoryboardTable project={project} onChange={vi.fn()} />);
  await user.click(screen.getByText("分镜设置"));
  const content = screen.getByLabelText("内容-1");
  await user.selectOptions(screen.getByLabelText("文字对齐"), "left");
  expect(content).toHaveStyle({ textAlign: "left", top: "50%", transform: "translateY(-50%)" });
  await user.selectOptions(screen.getByLabelText("文字对齐"), "top-left");
  expect(content).toHaveStyle({ textAlign: "left", top: "0px", transform: "none" });
  expect(content).toHaveValue("完整的第一行\n第二行");
  await user.selectOptions(screen.getByLabelText("文字对齐"), "center");
  expect(content).toHaveStyle({ textAlign: "center", top: "50%" });
});

it("switches image fitting independently of project ratio and keeps it after remount", async () => {
  const project = createProject();
  project.aspectRatio = "9:16";
  project.shots[0].values.frame = JSON.stringify(["/portrait.jpg"]);
  project.shots[0].values.reference = JSON.stringify(["/reference.png"]);
  const props = { project, onChange: vi.fn() };
  const view = render(<StoryboardTable {...props} />);
  await userEvent.click(screen.getByText("分镜设置"));
  await userEvent.selectOptions(screen.getByLabelText("图片适配"), "cover");
  expect(screen.getByAltText("画面-1-图片1")).toHaveStyle({ objectFit: "cover" });
  expect(screen.getByAltText("参考-1-图片1")).toHaveStyle({ objectFit: "cover" });
  expect(screen.getByAltText("画面-1-图片1").parentElement).toHaveStyle({ aspectRatio: "9 / 16" });
  view.unmount();
  render(<StoryboardTable {...props} />);
  expect(screen.getByAltText("画面-1-图片1")).toHaveStyle({ objectFit: "cover" });
  expect(props.onChange).not.toHaveBeenCalled();
});

it("does not leak display preferences into another project", async () => {
  const project = createProject();
  const view = render(<StoryboardTable project={project} onChange={vi.fn()} />);
  await userEvent.click(screen.getByText("分镜设置"));
  await userEvent.selectOptions(screen.getByLabelText("表格字号"), "18");
  view.rerender(<StoryboardTable project={{ ...project, id: "other-project" }} onChange={vi.fn()} />);
  expect(screen.getByLabelText("内容-1")).toHaveStyle({ fontSize: "14px" });
});

it("keeps display controls usable when browser preference storage fails", async () => {
  const project = createProject();
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage full"); });
  render(<StoryboardTable project={project} onChange={vi.fn()} />);
  await userEvent.click(screen.getByText("分镜设置"));
  fireEvent.change(screen.getByLabelText("表格字号"), { target: { value: "16" } });
  expect(screen.getByLabelText("内容-1")).toHaveStyle({ fontSize: "16px" });
  get.mockRestore(); set.mockRestore();
});

it("falls back safely from corrupt or unsupported stored display values", () => {
  const project = createProject();
  localStorage.setItem(`fenjing.storyboard-display.v1:${project.id}`, JSON.stringify({ textSize: 1000, alignment: "diagonal", imageFit: "stretch" }));
  render(<StoryboardTable project={project} onChange={vi.fn()} />);
  expect(screen.getByLabelText("内容-1")).toHaveStyle({ fontSize: "14px", textAlign: "center" });
});

it("applies the chosen font and alignment in the expanded long-text editor", async () => {
  const project = createProject();
  project.shots[0].values.content = "长文字第一行\n第二行完整内容";
  render(<StoryboardTable project={project} onChange={vi.fn()} />);
  await userEvent.click(screen.getByText("分镜设置"));
  await userEvent.selectOptions(screen.getByLabelText("表格字号"), "18");
  await userEvent.selectOptions(screen.getByLabelText("文字对齐"), "top-left");
  await userEvent.click(screen.getByRole("button", { name: "展开内容-1" }));
  expect(screen.getByLabelText("完整文字")).toHaveStyle({ fontSize: "18px", textAlign: "left" });
  expect(screen.getByLabelText("完整文字")).toHaveValue("长文字第一行\n第二行完整内容");
});

it("closes display settings with Escape and restores focus to its opener", async () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);
  await userEvent.click(screen.getByText("分镜设置"));
  screen.getByLabelText("表格字号").focus();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByLabelText("表格字号")).not.toBeVisible();
  expect(screen.getByText("分镜设置")).toHaveFocus();
});
