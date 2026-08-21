import { expect, it } from "vitest";
import { createProject } from "../domain/storyboard";
import { buildShootDayExportModel, shootDayExportFilename } from "./shootDayExport";

it("builds a shoot day export in shooting order with a stable filename", () => {
  const project = { ...createProject(), title: "广告片" };
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日外景", shootDate: "2026-08-23", location: "测试棚 A", callTime: "09:00", wrapTime: "18:00", coordinator: "制片", notes: "", weather: "", rainPlan: "", safetyNotes: "", emergencyContactName: "", emergencyContactRole: "", emergencyContactPhone: "", order: 0 }];
  project.shots = [
    { id: "shot-1", shootDayId: "day-1", shootOrder: 1, values: { shotNumber: "2", durationSeconds: "6" } },
    { id: "shot-2", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", durationSeconds: "5" } },
  ];

  const model = buildShootDayExportModel(project, "day-1");

  expect(model.rows.map((row) => row.shotId)).toEqual(["shot-2", "shot-1"]);
  expect(model.summary).toEqual({ shotCount: 2, totalDurationSeconds: 11 });
  expect(shootDayExportFilename(project, model.shootDay, "xlsx")).toBe("广告片-首日外景-2026-08-23-镜头执行表.xlsx");
});
