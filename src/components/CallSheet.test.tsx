import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { createProject } from "../domain/storyboard";
import { buildCallSheetSnapshot, CallSheet } from "./CallSheet";

it("creates a call-sheet preview from the selected shooting day", () => {
  const project = createProject();
  project.title = "夜景广告";
  project.scenes = [{ id: "scene-1", number: "1", name: "天台", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "15", shootDate: "2026-08-13", notes: "高空作业", collapsed: false }];
  project.shots = [{ id: "shot-1", sceneId: "scene-1", values: { shotNumber: "1", productionStatus: "待拍" } }];
  render(<CallSheet project={project} />);
  expect(screen.getByRole("heading", { name: "2026-08-13 拍摄通告" })).toBeVisible();
  expect(screen.getByText("场次 1 · 天台")).toBeVisible();
  expect(screen.getByText(/高空作业/)).toBeVisible();
  expect(screen.getByText("1 个镜头 · 15 秒")).toBeVisible();
});

it("freezes shoot-day details and ordered scheduled shots in a call-sheet snapshot", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "备雨具", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.shots = [{ id: "shot-2", shootDayId: "day-1", shootOrder: 1, values: { shotNumber: "2" } }, { id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1" } }];
  expect(buildCallSheetSnapshot(project, "2026-08-13")).toMatchObject({ shootDay: expect.objectContaining({ location: "滨江路" }), shots: [expect.objectContaining({ id: "shot-1" }), expect.objectContaining({ id: "shot-2" })] });
});

it("publishes the current shooting-day snapshot and labels superseded versions", () => {
  const project = createProject();
  project.title = "夜景广告";
  project.scenes = [{ id: "scene-1", number: "1", name: "天台", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "15", shootDate: "2026-08-13", notes: "高空作业", collapsed: false }];
  project.shots = [{ id: "shot-1", sceneId: "scene-1", values: { shotNumber: "1", productionStatus: "待拍" } }];
  const onPublish = vi.fn();

  render(<CallSheet
    project={project}
    onPublish={onPublish}
    versions={[
      { id: "v2", projectId: "project", shootDate: "2026-08-13", versionNumber: 2, snapshot: {}, publishedBy: "producer@example.com", publishedAt: "2026-08-10T09:00:00.000Z" },
      { id: "v1", projectId: "project", shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: "producer@example.com", publishedAt: "2026-08-10T08:00:00.000Z" },
    ]}
  />);

  fireEvent.click(screen.getByRole("button", { name: "发布 V3" }));
  expect(onPublish).toHaveBeenCalledWith("2026-08-13", expect.objectContaining({ projectTitle: "夜景广告" }));
  expect(screen.getByText("V1 · 已被 V2 替代")).toBeVisible();
});

it("creates a call-sheet draft by creating a shooting day", () => {
  const project = createProject();
  const onCreateShootDay = vi.fn();

  render(<CallSheet project={project} onCreateShootDay={onCreateShootDay} />);

  fireEvent.change(screen.getByLabelText("通告标题"), { target: { value: "首日通告" } });
  fireEvent.change(screen.getByLabelText("通告拍摄日期"), { target: { value: "2026-08-13" } });
  fireEvent.click(screen.getByRole("button", { name: "创建通告草稿" }));

  expect(onCreateShootDay).toHaveBeenCalledWith({ title: "首日通告", shootDate: "2026-08-13" });
});

it("requires a second confirmation before deleting a published call-sheet", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "", callTime: "", wrapTime: "", coordinator: "", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  const onDeleteShootDay = vi.fn();

  render(<CallSheet
    project={project}
    onDeleteShootDay={onDeleteShootDay}
    versions={[{ id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: "producer@example.com", publishedAt: "2026-08-10T08:00:00.000Z" }]}
  />);

  fireEvent.click(screen.getByRole("button", { name: "删除通告" }));
  expect(screen.getByText("已发布通告将被撤销，是否继续？")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "确认删除并撤销" }));

  expect(onDeleteShootDay).toHaveBeenCalledWith("day-1", "2026-08-13", true);
});

it("saves call-sheet production details without leaving the call-sheet view", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "旧址", callTime: "", wrapTime: "", coordinator: "", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  const onUpdateShootDay = vi.fn();

  render(<CallSheet project={project} onUpdateShootDay={onUpdateShootDay} />);

  fireEvent.change(screen.getByLabelText("通告拍摄地点"), { target: { value: "滨江路 18 号" } });
  fireEvent.change(screen.getByLabelText("通告集合时间"), { target: { value: "07:00" } });
  fireEvent.change(screen.getByLabelText("通告收工时间"), { target: { value: "18:00" } });
  fireEvent.change(screen.getByLabelText("通告负责人"), { target: { value: "小李" } });
  fireEvent.change(screen.getByLabelText("通告现场备注"), { target: { value: "备雨具" } });
  fireEvent.click(screen.getByRole("button", { name: "保存通告资料" }));

  expect(onUpdateShootDay).toHaveBeenCalledWith(expect.objectContaining({
    id: "day-1",
    location: "滨江路 18 号",
    callTime: "07:00",
    wrapTime: "18:00",
    coordinator: "小李",
    notes: "备雨具",
  }));
});

it("shows scheduled shots with their scene, shooting details, and duration summary", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.scenes = [{ id: "scene-1", number: "3", name: "天台对话", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "20", shootDate: "2026-08-13", notes: "", collapsed: false }];
  project.shots = [
    { id: "shot-1", sceneId: "scene-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "7", content: "主角走向栏杆", shotSize: "中景", durationSeconds: "12", productionStatus: "待拍", notes: "留出收声时间" } },
    { id: "shot-2", sceneId: "scene-1", shootDayId: "day-1", shootOrder: 1, values: { shotNumber: "8", content: "回望城市", shotSize: "特写", durationSeconds: "8", productionStatus: "拍摄中", notes: "" } },
  ];

  render(<CallSheet project={project} />);

  expect(screen.getByRole("heading", { name: "镜头清单 · 2 个镜头 · 20 秒" })).toBeVisible();
  const scheduled = screen.getByRole("region", { name: "排程镜头" });
  expect(within(scheduled).getAllByText("场次 3 · 天台对话")).toHaveLength(2);
  expect(within(scheduled).getByText("镜头 7 · 主角走向栏杆")).toBeVisible();
  expect(within(scheduled).getByText("中景 · 12 秒 · 待拍 · 留出收声时间")).toBeVisible();
  expect(within(scheduled).getByText("特写 · 8 秒 · 拍摄中 · 备注待补充")).toBeVisible();
});

it("warns when the current call-sheet has changes that were not published", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.shots = [{ id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "原始画面", durationSeconds: "8" } }];
  const snapshot = buildCallSheetSnapshot(project, "2026-08-13");
  const version = { id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot, publishedBy: "producer@example.com", publishedAt: "2026-08-10T08:00:00.000Z" };
  const { rerender } = render(<CallSheet project={project} versions={[version]} />);

  expect(screen.getByRole("status")).toHaveTextContent("已发布 V1，内容已同步");

  const changedProject = { ...project, shots: [{ ...project.shots[0], values: { ...project.shots[0].values, content: "修改后的画面" } }] };
  rerender(<CallSheet project={changedProject} versions={[version]} />);

  expect(screen.getByRole("status")).toHaveTextContent("存在未发布变更");
});

it("saves call-sheet safety details", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "", weather: "晴", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  const onUpdateShootDay = vi.fn();

  render(<CallSheet project={project} onUpdateShootDay={onUpdateShootDay} />);

  fireEvent.change(screen.getByLabelText("通告天气"), { target: { value: "阵雨" } });
  fireEvent.change(screen.getByLabelText("通告雨天备选方案"), { target: { value: "转棚内" } });
  fireEvent.change(screen.getByLabelText("通告安全提示"), { target: { value: "天台作业系安全绳" } });
  fireEvent.change(screen.getByLabelText("通告紧急联系人"), { target: { value: "王制片" } });
  fireEvent.change(screen.getByLabelText("通告紧急联系人职责"), { target: { value: "制片" } });
  fireEvent.change(screen.getByLabelText("通告紧急联系电话"), { target: { value: "13800000000" } });
  fireEvent.click(screen.getByRole("button", { name: "保存现场保障" }));

  expect(onUpdateShootDay).toHaveBeenCalledWith(expect.objectContaining({
    weather: "阵雨",
    rainPlan: "转棚内",
    safetyNotes: "天台作业系安全绳",
    emergencyContactName: "王制片",
    emergencyContactRole: "制片",
    emergencyContactPhone: "13800000000",
  }));
});

it("writes a scheduled shot's on-set status and note back to the project", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "", callTime: "", wrapTime: "", coordinator: "", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.shots = [{ id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "7", content: "主角走向栏杆", productionStatus: "待拍", notes: "" } }];
  const onUpdateShot = vi.fn();

  render(<CallSheet project={project} onUpdateShot={onUpdateShot} />);

  fireEvent.change(screen.getByLabelText("通告镜头 7 现场状态"), { target: { value: "已完成" } });
  fireEvent.change(screen.getByLabelText("通告镜头 7 现场备注"), { target: { value: "补拍一条侧面" } });
  fireEvent.click(screen.getByRole("button", { name: "保存镜头 7 现场回写" }));

  expect(onUpdateShot).toHaveBeenCalledWith("shot-1", { productionStatus: "已完成", notes: "补拍一条侧面" });
});

it("lets an unacknowledged member confirm the current version and shows progress", async () => {
  const project = createProject();
  const onAcknowledge = vi.fn();
  const owner = { userId: "owner", email: "owner@example.com", role: "owner" as const };
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };
  const currentVersion = { id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: owner.email, publishedAt: "2026-08-12T00:00:00Z" };

  render(<CallSheet
    project={project}
    versions={[currentVersion]}
    currentUserId="editor"
    members={[owner, editor]}
    acknowledgements={[{ callSheetVersionId: "v1", userId: "owner", acknowledgedAt: "2026-08-12T01:00:00Z" }]}
    onAcknowledge={onAcknowledge}
  />);

  expect(screen.getByText("已确认 1 / 2")).toBeInTheDocument();
  expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  expect(screen.getByText("待确认")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "确认已阅读 V1" }));
  expect(onAcknowledge).toHaveBeenCalledWith("v1");
});

it("does not offer confirmation for a withdrawn version", () => {
  const project = createProject();
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };

  render(<CallSheet
    project={project}
    versions={[{ id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: editor.email, publishedAt: "2026-08-12T00:00:00Z", withdrawnAt: "2026-08-12T01:00:00Z" }]}
    currentUserId="editor"
    members={[editor]}
  />);

  expect(screen.queryByRole("button", { name: /确认已阅读/ })).not.toBeInTheDocument();
});

it("disables confirmation while the acknowledgement is pending", async () => {
  const project = createProject();
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };
  let resolveAcknowledgement: () => void = () => undefined;
  const onAcknowledge = vi.fn(() => new Promise<void>((resolve) => { resolveAcknowledgement = resolve; }));

  render(<CallSheet
    project={project}
    versions={[{ id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: editor.email, publishedAt: "2026-08-12T00:00:00Z" }]}
    currentUserId="editor"
    members={[editor]}
    onAcknowledge={onAcknowledge}
  />);

  const button = screen.getByRole("button", { name: "确认已阅读 V1" });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent("正在确认…");
  await userEvent.click(button);
  expect(onAcknowledge).toHaveBeenCalledOnce();
  resolveAcknowledgement();
});

it("keeps confirmation available and reports a Chinese error when acknowledgement fails", async () => {
  const project = createProject();
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };
  const onAcknowledge = vi.fn().mockRejectedValue(new Error("network"));

  render(<CallSheet
    project={project}
    versions={[{ id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: editor.email, publishedAt: "2026-08-12T00:00:00Z" }]}
    currentUserId="editor"
    members={[editor]}
    onAcknowledge={onAcknowledge}
  />);

  await userEvent.click(screen.getByRole("button", { name: "确认已阅读 V1" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("确认回执失败，请稍后重试");
  expect(screen.getByRole("button", { name: "确认已阅读 V1" })).toBeEnabled();
});

it("counts acknowledgements only for current project members", () => {
  const project = createProject();
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };

  render(<CallSheet
    project={project}
    versions={[{ id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: editor.email, publishedAt: "2026-08-12T00:00:00Z" }]}
    currentUserId="editor"
    members={[editor]}
    acknowledgements={[
      { callSheetVersionId: "v1", userId: "removed-member", acknowledgedAt: "2026-08-12T01:00:00Z" },
      { callSheetVersionId: "v1", userId: "editor", acknowledgedAt: "2026-08-12T01:01:00Z" },
    ]}
  />);

  expect(screen.getByText("已确认 1 / 1")).toBeInTheDocument();
});

it("warns about unacknowledged members within three days of the shoot", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T08:00:00Z"));
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "", callTime: "", wrapTime: "", coordinator: "", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  const owner = { userId: "owner", email: "owner@example.com", role: "owner" as const };
  const editor = { userId: "editor", email: "editor@example.com", role: "editor" as const };
  const version = { id: "v1", projectId: project.id, shootDate: "2026-08-13", versionNumber: 1, snapshot: {}, publishedBy: owner.email, publishedAt: "2026-08-10T00:00:00Z" };

  try {
    render(<CallSheet project={project} versions={[version]} members={[owner, editor]} acknowledgements={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("距离拍摄 3 天，2 位成员尚未确认");
  } finally {
    vi.useRealTimers();
  }
});

it("groups scheduled shots by production status when selected", async () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "", callTime: "", wrapTime: "", coordinator: "", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.shots = [
    { id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "开机", productionStatus: "待拍" } },
    { id: "shot-2", shootDayId: "day-1", shootOrder: 1, values: { shotNumber: "2", content: "收工", productionStatus: "已完成" } },
  ];

  render(<CallSheet project={project} />);
  await userEvent.click(screen.getByRole("button", { name: "按现场状态" }));

  expect(screen.getByRole("heading", { name: "待拍" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "已完成" })).toBeInTheDocument();
});

it("offers formal printing only for the current non-withdrawn published version", () => {
  const project = createProject();
  project.title = "当前草稿项目名";
  const owner = { userId: "owner", email: "owner@example.com", role: "owner" as const };
  const snapshot = {
    projectTitle: "发布时项目名",
    shootDay: { id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-23", location: "已发布地点", callTime: "08:00", wrapTime: "18:00", coordinator: "王制片", notes: "带雨具", weather: "小雨", rainPlan: "转棚内", safetyNotes: "高空作业系安全绳", emergencyContactName: "李安全", emergencyContactRole: "安全员", emergencyContactPhone: "13800000000", order: 0 },
    scenes: [], shots: [],
  };
  const active = { id: "v2", projectId: project.id, shootDate: "2026-08-23", versionNumber: 2, snapshot, publishedBy: owner.userId, publishedAt: "2026-08-20T08:00:00.000Z" };
  const withdrawn = { id: "v3", projectId: project.id, shootDate: "2026-08-23", versionNumber: 3, snapshot, publishedBy: owner.userId, publishedAt: "2026-08-21T08:00:00.000Z", withdrawnAt: "2026-08-21T09:00:00.000Z" };
  const { rerender } = render(<CallSheet project={project} versions={[withdrawn, active]} members={[owner]} acknowledgements={[]} />);

  fireEvent.click(screen.getByRole("button", { name: "打印正式通告 V2" }));
  expect(screen.getByText("正式拍摄通告 · V2")).toBeInTheDocument();
  expect(screen.getByText("发布时项目名")).toBeInTheDocument();
  expect(screen.getByText(/已发布地点/)).toBeInTheDocument();

  rerender(<CallSheet project={project} versions={[withdrawn]} members={[owner]} acknowledgements={[]} />);
  expect(screen.queryByRole("button", { name: /打印正式通告/ })).not.toBeInTheDocument();
});
