import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createProject } from "../domain/storyboard";
import { CallSheet } from "./CallSheet";

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
