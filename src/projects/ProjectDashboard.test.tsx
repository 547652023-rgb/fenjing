import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { BUILT_IN_TEMPLATES } from "../domain/templates";
import { ProjectDashboard } from "./ProjectDashboard";

const handlers = {
  onOpenProject: vi.fn(),
  onSignOut: vi.fn(),
};

it("filters projects by a personal folder and searches by title", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const summer = await gateway.createProject("夏季广告");
  const brand = await gateway.createProject("品牌片");
  const folder = await gateway.createFolder("广告");
  await gateway.setProjectFolder(summer.id, folder.id);
  await gateway.setProjectFolder(brand.id, folder.id);
  const user = userEvent.setup();

  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);

  await user.click(await screen.findByRole("button", { name: "广告" }));
  await user.type(screen.getByLabelText("搜索项目"), "夏季");

  expect(screen.getByRole("heading", { name: "夏季广告" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "品牌片" })).not.toBeInTheDocument();
});

it("sorts projects by title and saves the personal preference", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  await gateway.createProject("Z 项目");
  await gateway.createProject("A 项目");
  const saveHomeSettings = vi.spyOn(gateway, "saveHomeSettings");
  const user = userEvent.setup();

  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);

  await screen.findByRole("heading", { name: "Z 项目" });
  await user.selectOptions(screen.getByLabelText("项目排序"), "name");

  const titles = screen
    .getAllByRole("article")
    .map((card) => within(card).getByRole("heading", { level: 3 }).textContent);
  expect(titles).toEqual(["A 项目", "Z 项目"]);
  expect(saveHomeSettings).toHaveBeenCalledWith({ sortBy: "name" });
});

it("assigns an owned project to a personal folder and edits one Emoji", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("品牌片");
  const folder = await gateway.createFolder("广告");
  const setProjectFolder = vi.spyOn(gateway, "setProjectFolder");
  const setProjectIcon = vi.spyOn(gateway, "setProjectIcon");
  const user = userEvent.setup();

  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);

  const card = await screen.findByRole("article", { name: "品牌片" });
  expect(within(card).getByText("16:9")).toBeVisible();
  expect(within(card).getByText("1 个镜头")).toBeVisible();
  expect(within(card).getByText("所有者")).toBeVisible();

  await user.selectOptions(
    within(card).getByLabelText("将品牌片移到文件夹"),
    folder.id,
  );
  expect(setProjectFolder).toHaveBeenCalledWith(project.id, folder.id);

  const iconInput = within(card).getByLabelText("设置品牌片图标");
  await user.type(iconInput, "🎬🎨");
  await user.tab();
  expect(iconInput).toHaveValue("🎬");
  expect(setProjectIcon).toHaveBeenCalledWith(project.id, "🎬");
});

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

it("creates, renames, opens, and moves an owned project to trash", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const onOpenProject = vi.fn();
  const moveProjectToTrash = vi.spyOn(gateway, "moveProjectToTrash");
  const permanentlyDeleteProject = vi.spyOn(gateway, "permanentlyDeleteProject");
  const deleteProject = vi.spyOn(gateway, "deleteProject");
  const user = userEvent.setup();
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

  await user.click(screen.getByRole("button", { name: "移入回收站新品发布片" }));
  expect(moveProjectToTrash).toHaveBeenCalledWith("project-1");
  expect(permanentlyDeleteProject).not.toHaveBeenCalled();
  expect(deleteProject).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "进入新品发布片" })).not.toBeInTheDocument();
});

it("restores an owner project from trash and explains the 30-day retention", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("品牌片");
  await gateway.moveProjectToTrash(project.id);
  const restoreProject = vi.spyOn(gateway, "restoreProject");
  const user = userEvent.setup();

  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);

  await user.click(await screen.findByRole("button", { name: "回收站" }));
  const card = await screen.findByRole("article", { name: "品牌片" });
  expect(within(card).getByText(/保留 30 天/)).toBeVisible();

  await user.click(within(card).getByRole("button", { name: "恢复品牌片" }));
  expect(restoreProject).toHaveBeenCalledWith(project.id);
  expect(screen.queryByRole("article", { name: "品牌片" })).not.toBeInTheDocument();
});

it("confirms a permanent-delete request and shows its pending state", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("品牌片");
  await gateway.moveProjectToTrash(project.id);
  const permanentlyDeleteProject = vi.spyOn(gateway, "permanentlyDeleteProject");
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const user = userEvent.setup();

  render(<ProjectDashboard gateway={gateway} user={owner} {...handlers} />);

  await user.click(await screen.findByRole("button", { name: "回收站" }));
  const permanentDeleteButton = await screen.findByRole("button", {
    name: "彻底删除品牌片",
  });
  await user.click(permanentDeleteButton);
  expect(permanentlyDeleteProject).not.toHaveBeenCalled();

  await user.click(permanentDeleteButton);

  expect(confirm).toHaveBeenCalledWith(
    "确定申请彻底删除项目“品牌片”吗？请求提交后将由系统安全处理，期间无法恢复。",
  );
  expect(permanentlyDeleteProject).toHaveBeenCalledWith(project.id);
  expect(await screen.findByText("彻底删除请求处理中，期间无法恢复")).toBeVisible();
  expect(screen.queryByRole("button", { name: "恢复品牌片" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "彻底删除品牌片" })).not.toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "移入回收站共同项目" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "恢复共同项目" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "彻底删除共同项目" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("将共同项目移到文件夹")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("设置共同项目图标")).not.toBeInTheDocument();
});
