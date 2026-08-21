import type { FieldDefinition, ShootDay, StoryboardProject } from "../domain/storyboard";
import { buildExportModel, type ExportRow } from "./storyboardExport";

export type ShootDayExportModel = { projectTitle: string; shootDay: ShootDay; summary: { shotCount: number; totalDurationSeconds: number }; fields: FieldDefinition[]; rows: ExportRow[] };

export function buildShootDayExportModel(project: StoryboardProject, shootDayId: string): ShootDayExportModel {
  const shootDay = (project.shootDays ?? []).find((day) => day.id === shootDayId);
  if (!shootDay) throw new Error("Shoot day not found");
  const shots = project.shots.filter((shot) => shot.shootDayId === shootDayId).sort((left, right) => (left.shootOrder ?? 0) - (right.shootOrder ?? 0));
  const exportModel = buildExportModel({ ...project, shots });
  return { projectTitle: project.title, shootDay: { ...shootDay }, summary: { shotCount: shots.length, totalDurationSeconds: shots.reduce((sum, shot) => sum + (Number(shot.values.durationSeconds) || 0), 0) }, fields: exportModel.fields, rows: exportModel.rows };
}

export function shootDayExportFilename(project: Pick<StoryboardProject, "title">, shootDay: Pick<ShootDay, "title" | "shootDate">, extension: "xlsx"): string {
  const sanitize = (value: string, fallback: string) => value.normalize("NFKC").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
  return `${sanitize(project.title, "未命名项目")}-${sanitize(shootDay.title, "未命名拍摄日")}-${shootDay.shootDate || "日期待定"}-镜头执行表.${extension}`;
}
