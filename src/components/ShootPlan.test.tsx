import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { ShootPlan } from "./ShootPlan";

it("groups scenes by planned shooting day and changes only the scene schedule", async () => {
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

  expect(screen.getByRole("heading", { name: "2026-08-12" })).toBeVisible();
  expect(screen.getByText("2 个镜头 · 12 秒")).toBeVisible();
  expect(screen.getByRole("heading", { name: "待排期" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("设置场次 2 拍摄日"), { target: { value: "2026-08-13" } });

  expect(onUpdateScene).toHaveBeenCalledWith(expect.objectContaining({ id: "scene-2", shootDate: "2026-08-13" }));
});
