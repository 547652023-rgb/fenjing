import type { CallSheetAcknowledgement, CallSheetVersion, ProjectMember } from "../domain/models";
import type { ShootDay, Shot, StoryboardScene } from "../domain/storyboard";

export type CallSheetPrintModel = {
  projectTitle: string;
  versionNumber: number;
  publishedAt: string;
  shootDay: ShootDay;
  scenes: StoryboardScene[];
  shots: Shot[];
  acknowledgementSummary: { acknowledged: number; total: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSnapshot(snapshot: unknown) {
  if (!isRecord(snapshot) || typeof snapshot.projectTitle !== "string" || !isRecord(snapshot.shootDay) || !Array.isArray(snapshot.scenes) || !Array.isArray(snapshot.shots) || !snapshot.scenes.every(isRecord) || !snapshot.shots.every(isRecord)) {
    throw new Error("通告版本快照不完整");
  }
  return {
    projectTitle: snapshot.projectTitle,
    shootDay: { ...snapshot.shootDay } as ShootDay,
    scenes: snapshot.scenes.map((scene) => ({ ...scene })) as StoryboardScene[],
    shots: snapshot.shots.map((shot) => ({ ...shot, values: isRecord(shot.values) ? { ...shot.values } as Record<string, string> : {} })) as Shot[],
  };
}

export function buildCallSheetPrintModel(version: CallSheetVersion, members: ProjectMember[], acknowledgements: CallSheetAcknowledgement[]): CallSheetPrintModel {
  const snapshot = readSnapshot(version.snapshot);
  const memberIds = new Set(members.map((member) => member.userId));
  const acknowledgedIds = new Set(acknowledgements
    .filter((acknowledgement) => acknowledgement.callSheetVersionId === version.id && memberIds.has(acknowledgement.userId))
    .map((acknowledgement) => acknowledgement.userId));

  return {
    ...snapshot,
    versionNumber: version.versionNumber,
    publishedAt: version.publishedAt,
    acknowledgementSummary: { acknowledged: acknowledgedIds.size, total: members.length },
  };
}
