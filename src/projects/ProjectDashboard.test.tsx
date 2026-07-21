import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { BUILT_IN_TEMPLATES } from "../domain/templates";
import { ProjectDashboard } from "./ProjectDashboard";

it("selects a template while creating a project", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const createProject = vi.spyOn(gateway, "createProject");
  const user = userEvent.setup();

  render(
    <ProjectDashboard
      gateway={gateway}
      onOpenProject={vi.fn()}
      onSignOut={vi.fn()}
      user={owner}
    />,
  );

  await user.click(screen.getByRole("button", { name: "新建项目" }));
  await user.click(await screen.findByRole("radio", { name: /宣传片.*内置模板/ }));
  await user.click(screen.getByRole("button", { name: "创建" }));

  expect(createProject).toHaveBeenCalledWith("项目", BUILT_IN_TEMPLATES[2].snapshot);
});

it("creates, renames, opens, and deletes an owned project", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const onOpenProject = vi.fn();
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <ProjectDashboard
      gateway={gateway}
      onOpenProject={onOpenProject}
      onSignOut={vi.fn()}
      user={owner}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "新建项目" }));
  await user.type(screen.getByLabelText("新项目名称"), "品牌片");
  await user.click(screen.getByRole("button", { name: "创建" }));

  await user.click(await screen.findByRole("button", { name: "进入品牌片" }));
  expect(onOpenProject).toHaveBeenCalledWith("project-1");

  await user.click(screen.getByRole("button", { name: "重命名品牌片" }));
  const renameInput = screen.getByRole("textbox", { name: "重命名品牌片" });
  await user.clear(renameInput);
  await user.type(renameInput, "新品发布片");
  await user.click(screen.getByRole("button", { name: "保存项目名称" }));
  expect(await screen.findByRole("button", { name: "进入新品发布片" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "删除新品发布片" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除项目“新品发布片”吗？此操作无法撤销。");
  expect(screen.queryByRole("button", { name: "进入新品发布片" })).not.toBeInTheDocument();
});

it("shows invited projects without owner-only actions", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("editor@example.com", "password123");
  await gateway.signOut();
  await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("共同项目");
  await gateway.inviteMember(project.id, "editor@example.com");
  await gateway.signOut();
  const editor = await gateway.signIn("editor@example.com", "password123");

  render(
    <ProjectDashboard
      gateway={gateway}
      onOpenProject={vi.fn()}
      onSignOut={vi.fn()}
      user={editor}
    />,
  );

  expect(await screen.findByRole("heading", { name: "受邀项目" })).toBeVisible();
  expect(screen.getByRole("button", { name: "进入共同项目" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "重命名共同项目" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除共同项目" })).not.toBeInTheDocument();
});
