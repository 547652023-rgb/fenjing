import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { ShootPlan } from "./ShootPlan";

it("keeps existing scene assignments visible as unplanned shots until scheduled", async () => {
  const project = createProject();
  project.scenes = [
    { id: "scene-1", number: "1", name: "天台", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "12", shootDate: "2026-08-12", notes: "烟机", collapsed: false },
    { id: "scene-2", number: "2", name: "酒馆", intExt: "INT", dayNight: "NIGHT", targetDurationSeconds: "8", shootDate: "", notes: "", collapsed: false },
  ];
  project.shots = [
    { id: "shot-1", sceneId: "scene-1", values: { shotNumber: "1", productionStatus: "待拍" } },
    { id: "shot-2", sceneId: "scene-1", values: { shotNumber: "2", productionStatus: "已确认" } },
  ];
  const onUpdateScene = vi.fn();
  render(<ShootPlan project={project} onUpdateScene={onUpdateScene} />);

  expect(screen.getByText("待排镜头")).toBeVisible();
  expect(screen.getAllByText("未填写内容")).toHaveLength(2);
});

it("renders unassigned shots so a new project does not have an empty shoot plan", () => {
  const project = createProject();
  project.shots = [{
    id: "shot-1",
    values: {
      shotNumber: "1",
      content: "演员走入咖啡馆",
      durationSeconds: "6",
      productionStatus: "待拍",
    },
  }];

  render(<ShootPlan project={project} onUpdateScene={vi.fn()} />);

  expect(screen.getByText("待排镜头")).toBeVisible();
  expect(screen.getByText("演员走入咖啡馆")).toBeVisible();
  expect(screen.getByText(/6 秒 · 待拍/)).toBeVisible();
});

it("shows unplanned shot metadata beside a shoot-day summary", () => {
  const project = createProject();
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日外景", shootDate: "2026-08-21", location: "滨江路", callTime: "07:00", wrapTime: "18:00", coordinator: "制片小李", notes: "备雨具", order: 0 }];
  project.shots = [
    { id: "shot-1", values: { shotNumber: "1", content: "演员走入咖啡馆", shotSize: "中景", durationSeconds: "6", productionStatus: "待拍" } },
    { id: "shot-2", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "2", content: "推门特写", durationSeconds: "3", productionStatus: "已确认" } },
  ];

  render(<ShootPlan project={project} onUpdateScene={vi.fn()} />);

  expect(screen.getByText("待排镜头")).toBeVisible();
  expect(screen.getByText("演员走入咖啡馆")).toBeVisible();
  expect(screen.getAllByText("首日外景")).toHaveLength(2);
  expect(screen.getByText("2 个镜头 · 9 秒")).toBeVisible();
  expect(screen.getByText("1/2 已确认")).toBeVisible();
});
