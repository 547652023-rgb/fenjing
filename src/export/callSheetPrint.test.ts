import { expect, it } from "vitest";
import type { CallSheetVersion, ProjectMember } from "../domain/models";
import type { ShootDay } from "../domain/storyboard";
import { buildCallSheetPrintModel } from "./callSheetPrint";

const owner: ProjectMember = { userId: "owner", email: "owner@example.com", role: "owner" };
const editor: ProjectMember = { userId: "editor", email: "editor@example.com", role: "editor" };

function snapshotWithLocation(location: string): Record<string, unknown> {
  const shootDay: ShootDay = {
    id: "day-1", projectId: "project-1", title: "首日", shootDate: "2026-08-23", location,
    callTime: "08:00", wrapTime: "18:00", coordinator: "王制片", notes: "带雨具",
    weather: "小雨", rainPlan: "转棚内", safetyNotes: "高空作业系安全绳",
    emergencyContactName: "李安全", emergencyContactRole: "安全员", emergencyContactPhone: "13800000000", order: 0,
  };
  return {
    projectTitle: "发布时项目名",
    shootDay,
    scenes: [{ id: "scene-1", number: "1", name: "天台", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "15", shootDate: "2026-08-23", notes: "夜戏", collapsed: false }],
    shots: [{ id: "shot-1", sceneId: "scene-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "主角登场" } }],
  };
}

function version(snapshot: Record<string, unknown>): CallSheetVersion {
  return { id: "version-1", projectId: "project-1", shootDate: "2026-08-23", versionNumber: 1, snapshot, publishedBy: owner.userId, publishedAt: "2026-08-20T08:00:00.000Z" };
}

it("builds the formal print model exclusively from the published snapshot", () => {
  const model = buildCallSheetPrintModel(version(snapshotWithLocation("已发布地点")), [owner], []);

  expect(model.versionNumber).toBe(1);
  expect(model.projectTitle).toBe("发布时项目名");
  expect(model.shootDay.location).toBe("已发布地点");
  expect(model.acknowledgementSummary).toEqual({ acknowledged: 0, total: 1 });
});

it("counts acknowledgements only for current members on the selected version", () => {
  const model = buildCallSheetPrintModel(version(snapshotWithLocation("发布地点")), [owner, editor], [
    { callSheetVersionId: "version-1", userId: "owner", acknowledgedAt: "2026-08-20T09:00:00.000Z" },
    { callSheetVersionId: "other-version", userId: "editor", acknowledgedAt: "2026-08-20T09:00:00.000Z" },
    { callSheetVersionId: "version-1", userId: "former-member", acknowledgedAt: "2026-08-20T09:00:00.000Z" },
  ]);

  expect(model.acknowledgementSummary).toEqual({ acknowledged: 1, total: 2 });
});

it("rejects legacy versions with incomplete snapshots", () => {
  expect(() => buildCallSheetPrintModel(version({ projectTitle: "旧版本", shootDay: null, scenes: [], shots: [] }), [owner], [])).toThrowError("通告版本快照不完整");
});

it("rejects a null legacy snapshot with the formal validation error", () => {
  const nullSnapshotVersion = { ...version(snapshotWithLocation("发布地点")), snapshot: null as unknown as Record<string, unknown> };

  expect(() => buildCallSheetPrintModel(nullSnapshotVersion, [owner], [])).toThrowError("通告版本快照不完整");
});
