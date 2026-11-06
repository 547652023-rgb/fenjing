import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { buildCallSheetSnapshot } from "../components/CallSheet";
import { createNamedStoryboardView } from "../domain/storyboardViews";
import { ProjectWorkbench } from "./ProjectWorkbench";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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

it("coalesces structural realtime events into one workspace reload", async () => {
  const { gateway, owner, project } = await setupProject();
  const loadProject = vi.spyOn(gateway, "loadProject");
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("广告片");
  loadProject.mockClear();

  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      gateway.emit(project.id, { type: "structure.changed" });
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  expect(loadProject).toHaveBeenCalledTimes(1);
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

it("applies field visibility changes to the active storyboard columns after saving", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  expect(screen.getByRole("columnheader", { name: "内容" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "字段设置" }));
  await user.click(screen.getByLabelText("显示-内容"));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(screen.queryByRole("columnheader", { name: "内容" })).not.toBeInTheDocument();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("replaces an older personal column view with the saved field visibility", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveProjectMeta(project.id, {
    fields: loaded.fields.map((field) =>
      field.id === "cameraGear" ? { ...field, visible: false } : field,
    ),
  });
  localStorage.setItem(
    `fenjing.storyboard-view.v1:${owner.id}:${project.id}`,
    JSON.stringify(createNamedStoryboardView("cinematographer", loaded.fields).columns),
  );
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  expect(await screen.findByRole("columnheader", { name: "摄影机装备" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "字段设置" }));
  await user.click(screen.getByLabelText("显示-摄影机装备"));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(screen.queryByRole("columnheader", { name: "摄影机装备" })).not.toBeInTheDocument();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("shows the active column visibility in field settings when an older view differs", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveProjectMeta(project.id, {
    fields: loaded.fields.map((field) =>
      field.id === "cameraGear" ? { ...field, visible: false } : field,
    ),
  });
  localStorage.setItem(
    `fenjing.storyboard-view.v1:${owner.id}:${project.id}`,
    JSON.stringify(createNamedStoryboardView("cinematographer", loaded.fields).columns),
  );
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByRole("columnheader", { name: "摄影机装备" });
  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "字段设置" }));

  expect(screen.getByLabelText("显示-摄影机装备")).toBeChecked();
});

it("upgrades an older project with the production status field on load", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveProjectMeta(project.id, {
    fields: loaded.fields.filter((field) => field.id !== "productionStatus"),
  });

  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  expect(await screen.findByRole("combobox", { name: "制作状态-1" })).toBeVisible();
  await waitFor(async () => {
    expect((await gateway.loadProject(project.id)).fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "productionStatus" })]),
    );
  });
});

it("assigns a shot to a scene using the version loaded from the server", async () => {
  const { gateway, owner, project } = await setupProject();
  const scene = await gateway.createScene(project.id, { name: "开场" });
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveShot(
    project.id,
    { ...loaded.shots[0], values: { ...loaded.shots[0].values, content: "已更新" } },
    1,
  );
  const user = userEvent.setup();
  render(
    <ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("checkbox", { name: `选择镜头 ${loaded.shots[0].id}` }));
  await user.selectOptions(screen.getByRole("combobox", { name: "归入场次" }), scene.id);
  await user.click(screen.getByRole("button", { name: "归入场次" }));

  await waitFor(async () => {
    expect((await gateway.loadProject(project.id)).shots[0].sceneId).toBe(scene.id);
  });
});

it("saves a shoot-day assignment without changing storyboard shot order", async () => {
  const { gateway, owner, project } = await setupProject();
  const before = (await gateway.loadProject(project.id)).shots.map((shot) => shot.id);
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "拍摄计划" }));
  await user.type(screen.getByLabelText("拍摄日名称"), "拍摄验证");
  fireEvent.change(screen.getByLabelText("拍摄日日期"), { target: { value: "2026-08-13" } });
  await user.click(screen.getByRole("button", { name: "新建拍摄日" }));

  await waitFor(async () => {
    expect((await gateway.loadProject(project.id)).shootDays).toEqual([expect.objectContaining({ shootDate: "2026-08-13" })]);
  });
  expect((await gateway.loadProject(project.id)).shots.map((shot) => shot.id)).toEqual(before);
});

it("publishes a call-sheet snapshot through the active project gateway", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.createScene(project.id, { name: "夜景", shootDate: "2026-08-13" });
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "拍摄通告" }));
  await user.click(screen.getByRole("button", { name: "发布 V1" }));

  await waitFor(async () => {
    await expect(gateway.listCallSheetVersions(project.id, "2026-08-13")).resolves.toEqual([
      expect.objectContaining({ versionNumber: 1, snapshot: expect.objectContaining({ projectTitle: "广告片" }) }),
    ]);
  });
  expect(await screen.findByText("V1 · 当前版本")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.getByText("拍摄通告 · 2026-08-13 · V1")).toBeVisible();
});

it("loads acknowledgement progress and confirms the current call-sheet version", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.createScene(project.id, { name: "夜景", shootDate: "2026-08-13" });
  const snapshot = buildCallSheetSnapshot(await gateway.loadProject(project.id), "2026-08-13");
  const version = await gateway.publishCallSheet(project.id, "2026-08-13", snapshot);
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "拍摄通告" }));
  await user.click(await screen.findByRole("button", { name: "确认已阅读 V1" }));

  expect(await screen.findByText("已确认 1 / 1")).toBeVisible();
  await expect(gateway.listCallSheetAcknowledgements(version.id)).resolves.toEqual([
    expect.objectContaining({ callSheetVersionId: version.id, userId: owner.id }),
  ]);
});

it("clears the prior version acknowledgement after publishing a replacement version", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.createScene(project.id, { name: "夜景", shootDate: "2026-08-13" });
  const snapshot = buildCallSheetSnapshot(await gateway.loadProject(project.id), "2026-08-13");
  const firstVersion = await gateway.publishCallSheet(project.id, "2026-08-13", snapshot);
  await gateway.acknowledgeCallSheet(firstVersion.id);
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "拍摄通告" }));
  expect(await screen.findByText("已确认 1 / 1")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "发布 V2" }));

  expect(await screen.findByText("待确认")).toBeVisible();
  expect(screen.getByText("已确认 0 / 1")).toBeVisible();
});

it("keeps the selected shooting date acknowledgement when an earlier request returns late", async () => {
  const { gateway, owner, project } = await setupProject();
  const firstDate = "2026-08-13";
  const secondDate = "2026-08-14";
  await gateway.createScene(project.id, { name: "首日", shootDate: firstDate });
  await gateway.createScene(project.id, { name: "次日", shootDate: secondDate });
  const loaded = await gateway.loadProject(project.id);
  await gateway.publishCallSheet(project.id, firstDate, buildCallSheetSnapshot(loaded, firstDate));
  await gateway.publishCallSheet(project.id, secondDate, buildCallSheetSnapshot(loaded, secondDate));
  const firstVersionId = "version-first-date";
  const secondVersionId = "version-second-date";
  const listVersions = gateway.listCallSheetVersions.bind(gateway);
  vi.spyOn(gateway, "listCallSheetVersions").mockImplementation(async (projectId, shootDate) => (
    (await listVersions(projectId, shootDate)).map((version) => ({
      ...version,
      id: shootDate === firstDate ? firstVersionId : secondVersionId,
    }))
  ));
  const delayedFirstDateResponses: Array<() => void> = [];
  vi.spyOn(gateway, "listCallSheetAcknowledgements").mockImplementation(async (versionId) => {
    if (versionId === secondVersionId) {
      return [{ callSheetVersionId: secondVersionId, userId: owner.id, acknowledgedAt: "2026-08-12T02:00:00Z" }];
    }
    return new Promise((resolve) => {
      delayedFirstDateResponses.push(() => resolve([
        { callSheetVersionId: firstVersionId, userId: owner.id, acknowledgedAt: "2026-08-12T01:00:00Z" },
      ]));
    });
  });
  const secondAcknowledgementTime = new Date("2026-08-12T02:00:00Z").toLocaleString("zh-CN", { hour12: false });
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "拍摄通告" }));
  await user.selectOptions(screen.getByRole("combobox", { name: "选择拍摄日" }), secondDate);
  const acknowledgementArea = screen.getByRole("region", { name: "成员确认" });
  expect(await within(acknowledgementArea).findByText(secondAcknowledgementTime)).toBeVisible();

  await act(async () => {
    delayedFirstDateResponses.forEach((resolve) => resolve());
  });

  await waitFor(() => {
    expect(within(acknowledgementArea).getByText(secondAcknowledgementTime)).toBeVisible();
  });
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
  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "保存为模板" }));
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
  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "保存为模板" }));
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
  await user.click(screen.getByRole("button", { name: "项目操作" }));
  await user.click(screen.getByRole("menuitem", { name: "字段设置" }));
  await user.click(screen.getByRole("button", { name: "设置备注下拉选项" }));
  await user.type(screen.getByLabelText("新增备注选项"), "补拍");
  await user.click(screen.getByRole("button", { name: "添加备注选项" }));

  expect(await screen.findByDisplayValue("补拍")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "保存更改" }));
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
  const projectActions = await screen.findByRole("button", { name: "项目操作" });
  expect(screen.queryByRole("menuitem", { name: "成员管理" })).not.toBeInTheDocument();
  fireEvent.click(projectActions);
  expect(screen.getByRole("menuitem", { name: "成员管理" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "字段设置" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu", { name: "项目操作" })).not.toBeInTheDocument();
  expect(projectActions).toHaveFocus();
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
  fireEvent.click(screen.getByRole("button", { name: "项目操作" }));
  expect(screen.queryByRole("menuitem", { name: "成员管理" })).not.toBeInTheDocument();
});

it("uploads frame images through the online gateway and persists their metadata", async () => {
  const { gateway, owner, project } = await setupProject();
  const uploaded = {
    path: `${project.id}/1/frame/a.png`,
    url: "blob:online-a",
    name: "a.png",
    position: 0,
  };
  let finishUpload!: (image: typeof uploaded) => void;
  vi.spyOn(gateway, "uploadImage").mockImplementation(() => new Promise(resolve => { finishUpload = resolve; }));

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

  expect(await screen.findByText("还有 1 张图片正在上传")).toBeVisible();
  expect(screen.getByRole("button", { name: "返回项目" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "导出文件" })).toBeDisabled();
  const uploadUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(uploadUnload);
  expect(uploadUnload.defaultPrevented).toBe(true);
  expect(screen.queryByText("已在线保存")).not.toBeInTheDocument();
  await act(async () => finishUpload(uploaded));
  await waitFor(() => expect(screen.queryByText("还有 1 张图片正在上传")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "返回项目" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "导出文件" })).toBeEnabled();
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

it("persists a row-menu reorder through the project gateway", async () => {
  const { gateway, owner, project } = await setupProject();
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

  await screen.findByLabelText("镜号-2");
  await user.click(screen.getByRole("button", { name: "更多镜头 1" }));
  await user.click(screen.getByRole("menuitem", { name: "下移" }));

  await waitFor(async () => {
    expect((await gateway.loadProject(project.id)).shots.map((shot) => shot.id)).toEqual([
      "2", "1",
    ]);
  });
});

it("restores a personal storyboard view after the workbench remounts", async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  const firstMount = render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "列设置" }));
  await user.click(screen.getByRole("button", { name: "摄影视图" }));
  expect(screen.getByRole("columnheader", { name: "摄影机角度" })).toBeVisible();

  firstMount.unmount();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={project.id}
      user={owner}
    />,
  );

  expect(await screen.findByRole("columnheader", { name: "摄影机角度" })).toBeVisible();
});

it("switches from the workbench table to the storyboard review cards", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(
    <ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "故事板" }));

  expect(await screen.findByRole("region", { name: "故事板审阅" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "分镜表格区域" })).not.toBeInTheDocument();
});

it("saves a storyboard approval into the production status shown in the workbench", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(
    <ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "故事板" }));
  await user.click(screen.getByRole("button", { name: "确认镜头 1" }));
  await user.click(screen.getByRole("button", { name: "工作台" }));

  expect(await screen.findByRole("combobox", { name: "制作状态-1" })).toHaveValue("已确认");
});

it("enters a read-only storyboard review without project editing controls", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(
    <ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />,
  );

  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: "进入审阅模式" }));

  expect(await screen.findByRole("main", { name: "只读故事板审阅" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "项目操作" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "确认镜头 1" })).not.toBeInTheDocument();
});

it("persists renamed fields and personal column movement across reloads", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  await gateway.saveShot(project.id, { ...loaded.shots[0], values: { ...loaded.shots[0].values, lens: "35mm" } }, loaded.shots[0].version ?? 1);
  const user = userEvent.setup();
  const props = { gateway, onBack: vi.fn(), projectId: project.id, user: owner };
  localStorage.setItem(`fenjing.storyboard-view.v1:${owner.id}:${project.id}`, JSON.stringify(createNamedStoryboardView("cinematographer", loaded.fields).columns));
  const first = render(<ProjectWorkbench {...props} />);
  await screen.findByRole("columnheader", { name: "镜头焦段" });
  await user.click(screen.getByRole("button", { name: "镜头焦段列操作" }));
  await user.click(screen.getByRole("button", { name: "向左移动" }));
  await user.click(screen.getByRole("button", { name: "镜头焦段列操作" }));
  await user.click(screen.getByRole("button", { name: "重命名字段" }));
  await user.clear(screen.getByLabelText("新的字段名称"));
  await user.type(screen.getByLabelText("新的字段名称"), "焦距");
  await user.click(screen.getByRole("button", { name: "保存名称" }));
  await waitFor(async () => {
    const saved = await gateway.loadProject(project.id);
    expect(saved.fields.find(field => field.id === "lens")?.label).toBe("焦距");
    expect(saved.shots[0].values.lens).toBe("35mm");
  });
  first.unmount();
  render(<ProjectWorkbench {...props} />);
  await screen.findByRole("columnheader", { name: "焦距" });
  const headers = screen.getAllByRole("columnheader");
  expect(headers.findIndex(header => header.getAttribute("aria-label") === "焦距"))
    .toBeLessThan(headers.findIndex(header => header.getAttribute("aria-label") === "摄影机装备"));
  expect(screen.getByLabelText(`焦距-${loaded.shots[0].id}`)).toHaveValue("35mm");
});


it("marks edited cells as pending immediately and saves before returning", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  const onBack = vi.fn();
  let finishSave!: () => void;
  const originalSave = gateway.saveShot.bind(gateway);
  vi.spyOn(gateway, "saveShot").mockImplementation(async (...args) => {
    await new Promise<void>((resolve) => { finishSave = resolve; });
    return originalSave(...args);
  });
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={onBack} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(input, { target: { value: "最后一笔输入" } });
  expect(screen.getByRole("status")).toHaveTextContent("正在保存");
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  expect(onBack).not.toHaveBeenCalled();
  await waitFor(() => expect(finishSave).toBeTypeOf("function"));
  await act(async () => { finishSave(); });
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("最后一笔输入");
});

it("keeps a failed edit and retries it instead of replacing it with server content", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  const onBack = vi.fn();
  const save = vi.spyOn(gateway, "saveShot").mockRejectedValueOnce(new Error("network"));
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={onBack} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(input, { target: { value: "网络失败也保留" } });
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  await screen.findByRole("button", { name: "重试保存" });
  expect(input).toHaveValue("网络失败也保留");
  expect(onBack).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
  expect(save).toHaveBeenCalledTimes(2);
  expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("网络失败也保留");
});

it("restores an unsaved cell draft after the workbench is reopened", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  const props = { gateway, user: owner, projectId: project.id, onBack: vi.fn() };
  const view = render(<ProjectWorkbench {...props} />);
  fireEvent.change(await screen.findByLabelText(`内容-${loaded.shots[0].id}`), { target: { value: "刷新前草稿" } });
  const beforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);
  view.unmount();
  render(<ProjectWorkbench {...props} />);
  expect(await screen.findByLabelText(`内容-${loaded.shots[0].id}`)).toHaveValue("刷新前草稿");
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
  expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("刷新前草稿");
});


it("waits for edits made while a return save is in flight", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  const originalSave = gateway.saveShot.bind(gateway);
  let finishFirst!: () => void;
  vi.spyOn(gateway, "saveShot").mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { finishFirst = resolve; });
    return originalSave(...args);
  });
  const onBack = vi.fn();
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={onBack} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(input, { target: { value: "第一笔" } });
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  await waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  fireEvent.change(input, { target: { value: "第二笔" } });
  await act(async () => { finishFirst(); });
  await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("第二笔");
});

it("keeps a conflicted input visible and refreshes the version for an explicit retry", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  vi.spyOn(gateway, "saveShot").mockRejectedValueOnce({ code: "conflict" });
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(input, { target: { value: "保留冲突输入" } });
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("你的输入已保留");
  expect(input).toHaveValue("保留冲突输入");
  fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
  expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("保留冲突输入");
});


it("returns to saved when an edit is reverted before the debounce", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(input, { target: { value: "临时内容" } });
  fireEvent.change(input, { target: { value: "" } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
});

it("merges queued local fields with a newer remote field instead of overwriting it", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  const originalMeta = gateway.saveProjectMeta.bind(gateway);
  let release!: () => void;
  vi.spyOn(gateway, "saveProjectMeta").mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return originalMeta(...args);
  });
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  const content = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "本地标题" } });
  await waitFor(() => expect(release).toBeTypeOf("function"));
  fireEvent.change(content, { target: { value: "排队的本地内容" } });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  await act(async () => {
    await gateway.saveShot(project.id, {
      ...loaded.shots[0], values: { ...loaded.shots[0].values, notes: "其他成员的新备注" },
    }, loaded.shots[0].version ?? 1);
    release();
  });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
  const saved = await gateway.loadProject(project.id);
  expect(saved.shots[0].values.content).toBe("排队的本地内容");
  expect(saved.shots[0].values.notes).toBe("其他成员的新备注");
});


it("merges remote changes received midway through a multi-shot save", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.addShot(project.id);
  const loaded = await gateway.loadProject(project.id);
  const originalSave = gateway.saveShot.bind(gateway);
  let release!: () => void;
  vi.spyOn(gateway, "saveShot").mockImplementationOnce(async (...args) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return originalSave(...args);
  });
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText(`内容-${loaded.shots[0].id}`), { target: { value: "本地第一镜头" } });
  fireEvent.change(screen.getByLabelText(`内容-${loaded.shots[1].id}`), { target: { value: "本地第二镜头" } });
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await act(async () => {
    await originalSave(project.id, { ...loaded.shots[1], values: { ...loaded.shots[1].values, notes: "保存中收到的远端备注" } }, loaded.shots[1].version ?? 1);
    release();
  });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已在线保存"));
  const saved = await gateway.loadProject(project.id);
  expect(saved.shots[1].values.content).toBe("本地第二镜头");
  expect(saved.shots[1].values.notes).toBe("保存中收到的远端备注");
});

it("uses the workbench selection and filter for delivery counts", async () => {
  const { gateway, owner, project } = await setupProject();
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);

  await user.click(await screen.findByRole("checkbox", { name: /^选择镜头 / }));
  await user.click(screen.getByRole("button", { name: /制作概览/ }));
  await user.click(screen.getByRole("button", { name: /已供画面/ }));
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  const dialog = within(screen.getByRole("dialog", { name: "导出交付" }));
  const scope = dialog.getByLabelText("导出范围");
  await user.selectOptions(scope, "filtered");
  expect(dialog.getByText("0 个")).toBeVisible();
  await user.selectOptions(scope, "selected");
  expect(dialog.getByText("1 个")).toBeVisible();
  expect(dialog.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
});

it("can undo a staged single-shot deletion and commits only after the grace period", async () => {
  const { gateway, owner, project } = await setupProject();
  const [shot] = (await gateway.loadProject(project.id)).shots;
  const remove = vi.spyOn(gateway, "deleteShot");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  const menu = await screen.findByRole("button", { name: /^更多镜头 / });
  vi.useFakeTimers();
  try {
    function stageDeletion() {
      fireEvent.click(menu);
      fireEvent.click(screen.getByRole("menuitem", { name: "删除镜头" }));
    }

    stageDeletion();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /^选择镜头 / })).toBeVisible();

    stageDeletion();
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(remove).toHaveBeenCalledWith(project.id, shot.id);
    expect(screen.queryByRole("checkbox", { name: /^选择镜头 / })).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("cancels a pending batch deletion when returning to the project list", async () => {
  const { gateway, owner, project } = await setupProject();
  await gateway.addShot(project.id);
  const remove = vi.spyOn(gateway, "deleteShot");
  const onBack = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ProjectWorkbench gateway={gateway} onBack={onBack} projectId={project.id} user={owner} />);
  const checkboxes = await screen.findAllByRole("checkbox", { name: /^选择镜头 / });

  vi.useFakeTimers();
  try {
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(within(screen.getByRole("toolbar", { name: "批量操作" })).getByRole("button", { name: "删除镜头" }));
    expect(screen.getByRole("region", { name: "待删除镜头" })).toHaveTextContent("2 个镜头");
    fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(onBack).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("persists both images when a batch upload completes without a render between responses", async () => {
  const { gateway, owner, project } = await setupProject();
  vi.spyOn(gateway, "uploadImage").mockImplementation(async ({ file, position }) => ({
    path: file.name, url: `blob:${file.name}`, name: file.name, position,
  }));
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  await userEvent.upload(await screen.findByLabelText("画面-1"), [
    new File(["a"], "a.png", { type: "image/png" }),
    new File(["b"], "b.png", { type: "image/png" }),
  ]);
  await waitFor(async () => {
    const images = JSON.parse((await gateway.loadProject(project.id)).shots[0].values.frame);
    expect(images.map((image: { name: string }) => image.name)).toEqual(["a.png", "b.png"]);
  });
});

it("restores navigation and export after an image upload fails", async () => {
  const { gateway, owner, project } = await setupProject();
  vi.spyOn(gateway, "uploadImage").mockRejectedValue(new Error("offline"));
  render(<ProjectWorkbench gateway={gateway} user={owner} projectId={project.id} onBack={vi.fn()} />);
  await userEvent.upload(await screen.findByLabelText("画面-1"), new File(["a"], "a.png", { type: "image/png" }));
  expect(await screen.findByRole("button", { name: "重试上传 a.png" })).toBeVisible();
  expect(screen.queryByText("还有 1 张图片正在上传")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "返回项目" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "导出文件" })).toBeEnabled();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

it("protects navigation while selected images are still being prepared", async () => {
  const { gateway, owner, project } = await setupProject();
  let rejectDecode!: (error: Error) => void;
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((_resolve, reject) => { rejectDecode = reject; })));
  const upload = vi.spyOn(gateway, "uploadImage");
  let finishUpload!: (image: { path: string; url: string; name: string; position: number }) => void;
  upload.mockImplementation(() => new Promise(resolve => { finishUpload = resolve; }));
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  await userEvent.upload(await screen.findByLabelText("画面-1"), new File(["a"], "a.png", { type: "image/png" }));
  expect(upload).not.toHaveBeenCalled();
  expect(screen.getByText("正在准备图片…")).toBeVisible();
  expect(screen.getByRole("button", { name: "返回项目" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "导出文件" })).toBeDisabled();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(async () => rejectDecode(new Error("unsupported image")));
  await waitFor(() => expect(upload).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "返回项目" })).toBeDisabled();
  await act(async () => finishUpload({ path: "a.png", url: "blob:a", name: "a.png", position: 0 }));
  await waitFor(() => expect(screen.getByRole("button", { name: "返回项目" })).toBeEnabled());
  expect(screen.queryByText("正在准备图片…")).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});

it("retains failed scene edits until a successful retry", async () => {
  const { gateway, owner, project } = await setupProject();
  const scene = await gateway.createScene(project.id, { name: "原场次" });
  vi.spyOn(gateway, "updateScene").mockRejectedValueOnce(new Error("network"));
  const user = userEvent.setup();
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  await screen.findByDisplayValue("广告片");
  await user.click(screen.getByRole("button", { name: `编辑场次 ${scene.number}` }));
  const form = screen.getByRole("form", { name: `编辑场次 ${scene.number}` });
  fireEvent.change(within(form).getByLabelText("名称"), { target: { value: "保留的新名称" } });
  fireEvent.change(within(form).getByLabelText("制作备注"), { target: { value: "失败也不能丢失的备注" } });
  await user.click(within(form).getByRole("button", { name: "保存场次" }));
  expect(await within(form).findByRole("alert")).toHaveTextContent("保存失败");
  expect(form).toBeVisible();
  expect(within(form).getByLabelText("名称")).toHaveValue("保留的新名称");
  expect(within(form).getByLabelText("制作备注")).toHaveValue("失败也不能丢失的备注");
  expect((await gateway.loadProject(project.id)).scenes[0].name).toBe("原场次");
  await user.click(within(form).getByRole("button", { name: /重试保存场次/ }));
  await waitFor(() => expect(form).not.toBeInTheDocument());
  expect((await gateway.loadProject(project.id)).scenes[0]).toMatchObject({
    name: "保留的新名称", notes: "失败也不能丢失的备注",
  });
});

it("keeps the scene form open and prevents duplicate submissions while saving", async () => {
  const { gateway, owner, project } = await setupProject();
  const scene = await gateway.createScene(project.id, { name: "开场" });
  const updateScene = gateway.updateScene.bind(gateway);
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const save = vi.spyOn(gateway, "updateScene").mockImplementation(async (...args) => {
    await gate;
    await updateScene(...args);
  });
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  await screen.findByDisplayValue("广告片");
  fireEvent.click(screen.getByRole("button", { name: `编辑场次 ${scene.number}` }));
  const form = screen.getByRole("form", { name: `编辑场次 ${scene.number}` });
  fireEvent.change(within(form).getByLabelText("名称"), { target: { value: "保存中" } });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledTimes(1);
  expect(form).toBeVisible();
  expect(within(form).getByRole("button", { name: /正在保存/ })).toBeDisabled();
  expect(within(form).getByRole("button", { name: "关闭" })).toBeDisabled();
  const collapse = screen.getByRole("button", { name: `收起场次 ${scene.number}` });
  expect(collapse).toBeDisabled();
  fireEvent.click(collapse);
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  await waitFor(() => expect(form).not.toBeInTheDocument());
  expect((await gateway.loadProject(project.id)).scenes[0].name).toBe("保存中");
});

it("times out a stalled project read and ignores its late result after a successful retry", async () => {
  const { gateway, owner, project } = await setupProject();
  const oldProject = await gateway.loadProject(project.id);
  let finishOld!: (project: typeof oldProject) => void;
  vi.spyOn(gateway, "loadProject").mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  vi.useFakeTimers();
  try {
    render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByRole("alert")).toHaveTextContent("加载超时");
    expect(screen.getByRole("button", { name: "返回项目" })).toBeEnabled();
    await gateway.saveProjectMeta(project.id, { title: "重试读到的新项目名" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试加载" })); });
    expect(screen.getByDisplayValue("重试读到的新项目名")).toBeVisible();
    await act(async () => { finishOld({ ...oldProject, title: "过期返回的旧项目名" }); });
    expect(screen.getByDisplayValue("重试读到的新项目名")).toBeVisible();
    expect(screen.queryByDisplayValue("过期返回的旧项目名")).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it("offers retry after an immediate project read failure", async () => {
  const { gateway, owner, project } = await setupProject();
  vi.spyOn(gateway, "loadProject").mockRejectedValueOnce(new Error("network"));
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  expect(await screen.findByRole("alert")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
  expect(await screen.findByDisplayValue("广告片")).toBeVisible();
});

it("allows leaving an initial project read and prevents late normalization after unmount", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  let finish!: (project: typeof loaded) => void;
  vi.spyOn(gateway, "loadProject").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saveMeta = vi.spyOn(gateway, "saveProjectMeta");
  const onBack = vi.fn();
  const view = render(<ProjectWorkbench gateway={gateway} onBack={onBack} projectId={project.id} user={owner} />);
  fireEvent.click(screen.getByRole("button", { name: "返回项目" }));
  expect(onBack).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => { finish({ ...loaded, fields: loaded.fields.filter(field => field.id !== "productionStatus") }); });
  expect(saveMeta).not.toHaveBeenCalled();
});

it("preserves local input when a realtime reload stalls and can retry saving afterwards", async () => {
  const { gateway, owner, project } = await setupProject();
  const loaded = await gateway.loadProject(project.id);
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  const input = await screen.findByLabelText(`内容-${loaded.shots[0].id}`);
  vi.spyOn(gateway, "saveShot").mockRejectedValueOnce(new Error("network"));
  fireEvent.change(input, { target: { value: "重新读取超时也保留" } });
  await screen.findByRole("alert");
  vi.spyOn(gateway, "loadProject").mockImplementationOnce(() => new Promise(() => {}));
  vi.useFakeTimers();
  try {
    await act(async () => {
      gateway.emit(project.id, { type: "structure.changed" });
      await vi.advanceTimersByTimeAsync(20_100);
    });
    expect(input).toHaveValue("重新读取超时也保留");
    expect(screen.getByRole("alert")).toHaveTextContent("无法重新获取项目");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重试保存" })); });
    expect(input).toHaveValue("重新读取超时也保留");
    expect((await gateway.loadProject(project.id)).shots[0].values.content).toBe("重新读取超时也保留");
  } finally { vi.useRealTimers(); }
});

it("completes a confirmed scene write without waiting for a separate project read", async () => {
  const { gateway, owner, project } = await setupProject();
  const scene = await gateway.createScene(project.id, { name: "开场" });
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  await screen.findByDisplayValue("广告片");
  vi.spyOn(gateway, "loadProject").mockImplementation(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: `编辑场次 ${scene.number}` }));
  const form = screen.getByRole("form", { name: `编辑场次 ${scene.number}` });
  fireEvent.change(within(form).getByLabelText("名称"), { target: { value: "服务器已确认" } });
  await act(async () => { fireEvent.submit(form); });
  expect(form).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("已在线保存");
  expect(screen.getByText(/服务器已确认/)).toBeVisible();
});

it("ignores a pre-save scene read that completes after a confirmed scene write", async () => {
  const { gateway, owner, project } = await setupProject();
  const scene = await gateway.createScene(project.id, { name: "原场次名称" });
  const oldSnapshot = await gateway.loadProject(project.id);
  render(<ProjectWorkbench gateway={gateway} onBack={vi.fn()} projectId={project.id} user={owner} />);
  await screen.findByDisplayValue("广告片");
  let finishOld!: (project: typeof oldSnapshot) => void;
  vi.spyOn(gateway, "loadProject").mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
  vi.useFakeTimers();
  try {
    await act(async () => {
      gateway.emit(project.id, { type: "structure.changed" });
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.click(screen.getByRole("button", { name: `编辑场次 ${scene.number}` }));
    const form = screen.getByRole("form", { name: `编辑场次 ${scene.number}` });
    fireEvent.change(within(form).getByLabelText("名称"), { target: { value: "刚确认保存的新场次" } });
    await act(async () => { fireEvent.submit(form); });
    expect(screen.getByText(/刚确认保存的新场次/)).toBeVisible();
    await act(async () => { finishOld(oldSnapshot); });
    expect(screen.getByText(/刚确认保存的新场次/)).toBeVisible();
    expect(screen.queryByText(/原场次名称/)).not.toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
