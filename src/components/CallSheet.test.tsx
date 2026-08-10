import { fireEvent, render, screen } from "@testing-library/react";
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
