import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "./App";
import { loadProject } from "./storage/projectRepository";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("renders the storyboard workbench", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "分镜工作台" })).toBeInTheDocument();
});

it("opens and closes field settings", async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByRole("dialog", { name: "字段设置" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "字段设置" }));
  expect(screen.getByRole("dialog", { name: "字段设置" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "关闭字段设置" }));
  expect(screen.queryByRole("dialog", { name: "字段设置" })).not.toBeInTheDocument();
});

it("applies a delayed image read to the latest edited project and persists that final state", async () => {
  const user = userEvent.setup();
  let pendingReader: FileReader | undefined;
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    pendingReader = this;
  });
  render(<App />);

  await user.upload(
    screen.getByLabelText("画面-1"),
    new File(["image"], "frame.png", { type: "image/png" }),
  );
  await user.clear(screen.getByLabelText("项目名称"));
  await user.type(screen.getByLabelText("项目名称"), "最终版本");

  Object.defineProperty(pendingReader, "result", {
    configurable: true,
    value: "data:image/png;base64,aW1hZ2U=",
  });
  act(() => pendingReader?.dispatchEvent(new ProgressEvent("load")));

  await waitFor(() => expect(screen.getByLabelText("项目名称")).toHaveValue("最终版本"));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已保存到本机"));
  const savedProject = loadProject();
  if (!savedProject) {
    throw new Error("Expected the project to be saved");
  }
  expect(savedProject.title).toBe("最终版本");
  expect(JSON.parse(savedProject.shots[0].values.frame)).toEqual([
    "data:image/png;base64,aW1hZ2U=",
  ]);
});

it("reports a storage failure instead of claiming the project was saved", async () => {
  const user = userEvent.setup();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  });
  render(<App />);

  await user.type(screen.getByLabelText("项目名称"), "A");

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("保存失败"));
  expect(screen.getByRole("status")).not.toHaveTextContent("已保存到本机");
});
