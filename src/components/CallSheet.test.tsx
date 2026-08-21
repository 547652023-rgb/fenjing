import { fireEvent, render, screen, within } from "@testing-library/react";
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
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "备雨具", order: 0 }];
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
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "", callTime: "", wrapTime: "", coordinator: "", notes: "", order: 0 }];
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
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "旧址", callTime: "", wrapTime: "", coordinator: "", notes: "", order: 0 }];
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
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日", shootDate: "2026-08-13", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "小李", notes: "", order: 0 }];
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
