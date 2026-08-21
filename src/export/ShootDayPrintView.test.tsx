import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { buildShootDayExportModel } from "./shootDayExport";
import { ShootDayPrintView } from "./ShootDayPrintView";

it("prints a shoot day call sheet", () => {
  const project = { ...createProject(), title: "广告片" };
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日外景", shootDate: "2026-08-23", location: "测试棚 A", callTime: "09:00", wrapTime: "18:00", coordinator: "制片", notes: "", order: 0 }];
  project.shots = [{ id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "开场" } }];
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(<ShootDayPrintView model={buildShootDayExportModel(project, "day-1")} onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "首日外景 拍摄通告" })).toBeVisible();
  expect(screen.getByText(/测试棚 A/)).toBeVisible();
  screen.getByRole("button", { name: "打印通告单" }).click();
  expect(print).toHaveBeenCalled();
});
