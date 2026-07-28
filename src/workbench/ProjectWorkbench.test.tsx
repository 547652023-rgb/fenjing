import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { ProjectWorkbench } from "./ProjectWorkbench";

async function setupProject() {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("广告片");
  return { gateway, owner, project };
}

it("loads the selected project and returns to the dashboard", async () => {
  const { gateway, owner, project } = await setupProject();
  const onBack = vi.fn();
  const user = userEvent.setup();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={onBack}
      projectId={project.id}
      user={owner}
    />,
  );

  expect(await screen.findByDisplayValue("广告片")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "返回项目" }));
  expect(onBack).toHaveBeenCalledOnce();
});

it("shows export actions after the selected project loads", async () => {
  const { gateway, owner, project } = await setupProject();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("广告片");

  expect(screen.getByRole("button", { name: "导出文件" })).toBeVisible();
});

it("saves the current project as a template without altering the project", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveShot(
    project.id,
    {
      ...loaded.shots[0],
      values: {
        ...loaded.shots[0].values,
        frame: JSON.stringify([{ path: `${project.id}/1/frame.png` }]),
      },
    },
    1,
  );
  const projectBeforeSaving = await gateway.loadProject(project.id);
  const createTemplate = vi.spyOn(gateway, "createTemplate");
  const user = userEvent.setup();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "保存为模板" }));
  await user.type(screen.getByLabelText("模板名称"), "拍摄模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  expect(createTemplate).toHaveBeenCalledWith(
    project.id,
    "拍摄模板",
    expect.objectContaining({
      shots: [
        expect.objectContaining({
          values: expect.not.objectContaining({ frame: expect.anything() }),
        }),
      ],
    }),
  );
  expect(await screen.findByRole("status", { name: "模板保存状态" })).toHaveTextContent(
    "模板“拍摄模板”已保存",
  );
  expect(await gateway.loadProject(project.id)).toEqual(projectBeforeSaving);
});

it("shows an error when saving the current project as a template fails", async () => {
  const { gateway, owner, project } = await setupProject();
  vi.spyOn(gateway, "createTemplate").mockRejectedValue(new Error("network"));
  const user = userEvent.setup();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "保存为模板" }));
  await user.type(screen.getByLabelText("模板名称"), "拍摄模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  const dialog = screen.getByRole("dialog", { name: "保存为模板" });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "模板保存失败，请稍后重试",
  );
  expect(dialog).toBeVisible();
});

it("persists a title edit and project-specific notes options", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  const title = await screen.findByLabelText("项目名称");
  await user.clear(title);
  await user.type(title, "新版广告片");
  await user.click(screen.getByRole("button", { name: "字段设置" }));
  await user.click(screen.getByRole("button", { name: "设置备注下拉选项" }));
  await user.type(screen.getByLabelText("新增备注选项"), "补拍");
  await user.click(screen.getByRole("button", { name: "添加备注选项" }));

  expect(await screen.findByDisplayValue("补拍")).toBeVisible();
  expect(await gateway.loadProject(project.id)).toMatchObject({
    title: "新版广告片",
    fields: expect.arrayContaining([
      expect.objectContaining({ id: "notes", options: ["补拍"] }),
    ]),
  });
});

it("shows member management only to the project owner", async () => {
  const gateway = new FakeStoryboardGateway();
  const editor = await gateway.signUp("editor@example.com", "password123");
  await gateway.signOut();
  await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("共同项目");
  await gateway.inviteMember(project.id, editor.email);

  const ownerView = render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={{ id: "user-2", email: "owner@example.com" }}
    />,
  );
  expect(await screen.findByRole("button", { name: "成员管理" })).toBeVisible();
  ownerView.unmount();

  await gateway.signOut();
  await gateway.signIn("editor@example.com", "password123");
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={editor}
    />,
  );
  await screen.findByDisplayValue("共同项目");
  expect(screen.queryByRole("button", { name: "成员管理" })).not.toBeInTheDocument();
});

it("uploads frame images through the online gateway and persists their metadata", async () => {
  const { gateway, owner, project } = await setupProject();
  const uploaded = {
    path: `${project.id}/1/frame/a.png`,
    url: "blob:online-a",
    name: "a.png",
    position: 0,
  };
  vi.spyOn(gateway, "uploadImage").mockResolvedValue(uploaded);

  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await userEvent.upload(
    await screen.findByLabelText("画面-1"),
    new File(["a"], "a.png", { type: "image/png" }),
  );

  expect(await screen.findByRole("img", { name: "画面-1-图片1" })).toHaveAttribute(
    "src",
    uploaded.url,
  );
  expect(gateway.uploadImage).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: project.id,
      shotId: "1",
      fieldId: "frame",
      position: 0,
    }),
  );
  expect(JSON.parse((await gateway.loadProject(project.id)).shots[0].values.frame))
    .toEqual([uploaded]);
});

it("uploads a frame after reloading a shot whose server version has advanced", async () => {
  const { gateway, owner, project } = await setupProject();
  const initial = await gateway.loadProject(project.id);
  await gateway.saveShot(
    project.id,
    {
      ...initial.shots[0],
      values: { ...initial.shots[0].values, content: "已由其他成员更新" },
    },
    1,
  );

  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await userEvent.upload(
    await screen.findByLabelText("画面-1"),
    new File(["frame"], "frame.png", { type: "image/png" }),
  );

  expect(await screen.findByRole("img", { name: "画面-1-图片1" })).toBeVisible();
  expect(JSON.parse((await gateway.loadProject(project.id)).shots[0].values.frame))
    .toHaveLength(1);
});
