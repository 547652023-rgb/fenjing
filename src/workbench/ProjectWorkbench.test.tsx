import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { buildCallSheetSnapshot } from "../components/CallSheet";
import { createNamedStoryboardView } from "../domain/storyboardViews";
import { ProjectWorkbench } from "./ProjectWorkbench";

afterEach(() => {
  localStorage.clear();
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

  await user.click(screen.getByRole("button", { name: "字段设置" }));
  await user.click(screen.getByLabelText("显示-内容"));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(screen.queryByRole("columnheader", { name: "内容" })).not.toBeInTheDocument();
  localStorage.clear();
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
  await user.click(screen.getByRole("button", { name: "字段设置" }));
  await user.click(screen.getByLabelText("显示-摄影机装备"));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(screen.queryByRole("columnheader", { name: "摄影机装备" })).not.toBeInTheDocument();
  localStorage.clear();
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
  await user.click(screen.getByRole("button", { name: "字段设置" }));

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
  expect(screen.queryByRole("button", { name: "字段设置" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "确认镜头 1" })).not.toBeInTheDocument();
});
