import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ProjectHomeSidebar } from "./ProjectHomeSidebar";

const folders = [
  { id: "folder-1", name: "广告", updatedAt: "2026-07-22T01:00:00.000Z" },
];

it("renders the fixed project scopes and personal folders", () => {
  render(
    <ProjectHomeSidebar
      active="folder-1"
      folders={folders}
      onCreateFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      onRenameFolder={vi.fn()}
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "全部项目" })).toBeVisible();
  expect(screen.getByRole("button", { name: "未分组" })).toBeVisible();
  expect(screen.getByText("我的文件夹")).toBeVisible();
  expect(screen.getByRole("button", { name: "广告" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("button", { name: "回收站" })).toBeVisible();
});

it("creates, renames, and deletes a personal folder with Chinese controls", async () => {
  const onCreateFolder = vi.fn();
  const onRenameFolder = vi.fn();
  const onDeleteFolder = vi.fn();
  const user = userEvent.setup();

  render(
    <ProjectHomeSidebar
      active="all"
      folders={folders}
      onCreateFolder={onCreateFolder}
      onDeleteFolder={onDeleteFolder}
      onRenameFolder={onRenameFolder}
      onSelect={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "新建文件夹" }));
  await user.type(screen.getByLabelText("文件夹名称"), "短片");
  await user.click(screen.getByRole("button", { name: "创建文件夹" }));
  expect(onCreateFolder).toHaveBeenCalledWith("短片");

  await user.click(screen.getByRole("button", { name: "重命名广告" }));
  const renameInput = screen.getByLabelText("重命名广告");
  await user.clear(renameInput);
  await user.type(renameInput, "商业片");
  await user.click(screen.getByRole("button", { name: "保存文件夹名称" }));
  expect(onRenameFolder).toHaveBeenCalledWith("folder-1", "商业片");

  await user.click(screen.getByRole("button", { name: "删除广告" }));
  expect(onDeleteFolder).toHaveBeenCalledWith("folder-1");
});
