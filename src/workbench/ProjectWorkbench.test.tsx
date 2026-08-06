import { render, screen, waitFor, within } from "@testing-library/react";
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

it("copies selected shots after the selection and clears copied images", async () => {
  const { gateway, owner, project } = await setupProject();
  const first = await gateway.loadProject(project.id);
  await gateway.saveShot(
    project.id,
    {
      ...first.shots[0],
      values: {
        ...first.shots[0].values,
        content: "开场远景",
        frame: JSON.stringify([{ path: "frame.png", url: "blob:frame", name: "frame.png", position: 0 }]),
      },
    },
    1,
  );
  await gateway.addShot(project.id);
  await gateway.addShot(project.id);
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
  await user.click(screen.getByRole("checkbox", { name: "选择镜头 1" }));
  await user.click(screen.getByRole("checkbox", { name: "选择镜头 2" }));
  await user.click(screen.getByRole("button", { name: "复制镜头" }));

  await waitFor(async () => {
    const saved = await gateway.loadProject(project.id);
    expect(saved.shots).toHaveLength(5);
    expect(saved.shots.slice(2, 4).map((shot) => shot.values.content)).toEqual([
      "开场远景",
      undefined,
    ]);
    expect(saved.shots[2].values.frame).toBeUndefined();
  });
});

it("inserts new shots directly below the current shot and automatically renumbers them", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.addShot(project.id);
  await gateway.addShot(project.id);
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
  await user.click(screen.getByLabelText("镜号-2"));
  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "新增 5 个镜头" }));

  expect(await screen.findByLabelText("镜号-4")).toHaveFocus();

  await waitFor(async () => {
    const saved = await gateway.loadProject(project.id);
    expect(saved.shots).toHaveLength(8);
    expect(saved.shots.map((shot) => shot.values.shotNumber)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8",
    ]);
  });

  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "在当前镜头下方新增" }));

  await waitFor(async () => {
    const saved = await gateway.loadProject(project.id);
    expect(saved.shots).toHaveLength(9);
    expect(saved.shots[2].values.content).toBeUndefined();
  });
});

it("copies the current shot below itself while leaving uploaded images blank", async () => {
  const { gateway, owner, project } = await setupProject();
  const first = await gateway.loadProject(project.id);
  await gateway.saveShot(
    project.id,
    {
      ...first.shots[0],
      values: {
        ...first.shots[0].values,
        content: "导演监看",
        shotSize: "近景",
        frame: JSON.stringify([{ path: "frame.png", url: "blob:frame", name: "frame.png", position: 0 }]),
      },
    },
    1,
  );
  const user = userEvent.setup();

  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("导演监看");
  await user.click(screen.getByLabelText("内容-1"));
  await user.click(screen.getByRole("button", { name: "新增选项" }));
  await user.click(screen.getByRole("menuitem", { name: "复制当前镜头" }));

  await waitFor(async () => {
    const saved = await gateway.loadProject(project.id);
    expect(saved.shots).toHaveLength(2);
    expect(saved.shots[1].values.content).toBe("导演监看");
    expect(saved.shots[1].values.shotSize).toBe("近景");
    expect(saved.shots[1].values.frame).toBeUndefined();
  });
});

it("inserts a row-menu shot directly above its source shot", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.addShot(project.id);
  await gateway.addShot(project.id);
  const saved = await gateway.loadProject(project.id);
  for (const [index, content] of ["首", "中", "尾"].entries()) {
    await gateway.saveShot(
      project.id,
      { ...saved.shots[index], values: { ...saved.shots[index].values, content } },
      1,
    );
  }
  const user = userEvent.setup();

  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("中");
  await user.click(screen.getByRole("button", { name: "更多镜头 2" }));
  await user.click(screen.getByRole("menuitem", { name: "在上方新增" }));

  await waitFor(async () => {
    const next = await gateway.loadProject(project.id);
    expect(next.shots.map((shot) => shot.values.content)).toEqual([
      "首", undefined, "中", "尾",
    ]);
  });
});
