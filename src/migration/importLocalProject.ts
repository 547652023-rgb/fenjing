import type { StoryboardGateway } from "../data/gateway";
import type { RemoteImage } from "../domain/models";
import type { StoryboardProject } from "../domain/storyboard";

const IMPORT_MARKER_PREFIX = "fenjing.storyboard-project.v1.imported:";

type ImportLocalProjectInput = {
  gateway: StoryboardGateway;
  project: StoryboardProject;
  userId: string;
};

export type ImportLocalProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; stage: "project" | "images" | "save" };

export function importMarkerKey(userId: string): string {
  return `${IMPORT_MARKER_PREFIX}${userId}`;
}

function parseLegacyImages(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // One-image legacy cells store the data URL directly.
  }
  return [value];
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const match = /^data:([^;,]+)(?:;base64)?,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("invalid_data_url");
  const [, mime, encoded] = match;
  const bytes = dataUrl.includes(";base64,")
    ? Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(encoded));
  return new File([bytes], name, { type: mime });
}

function withoutLegacyImages(project: StoryboardProject): StoryboardProject {
  const imageFieldIds = new Set(
    project.fields.filter((field) => field.type === "image").map((field) => field.id),
  );
  return {
    ...project,
    fields: project.fields.map((field) => ({ ...field })),
    shots: project.shots.map((shot) => ({
      ...shot,
      values: Object.fromEntries(
        Object.entries(shot.values).map(([fieldId, value]) => [
          fieldId,
          imageFieldIds.has(fieldId) ? "" : value,
        ]),
      ),
    })),
  };
}

export async function importLocalProject({
  gateway,
  project,
  userId,
}: ImportLocalProjectInput): Promise<ImportLocalProjectResult> {
  let importedProjectId = "";
  try {
    const summary = await gateway.importLocalProject(withoutLegacyImages(project));
    importedProjectId = summary.id;
  } catch {
    return { ok: false, stage: "project" };
  }

  let importedProject: StoryboardProject;
  let currentStage: "images" | "save" = "images";
  try {
    importedProject = await gateway.loadProject(importedProjectId);
    const imageFields = project.fields.filter((field) => field.type === "image");
    for (const [shotIndex, localShot] of project.shots.entries()) {
      const remoteShot = importedProject.shots[shotIndex];
      if (!remoteShot) continue;
      const values = { ...remoteShot.values };
      for (const field of imageFields) {
        const legacyImages = parseLegacyImages(localShot.values[field.id] ?? "");
        const uploaded: RemoteImage[] = [];
        for (const [position, dataUrl] of legacyImages.entries()) {
          const file = dataUrlToFile(dataUrl, `旧图片-${position + 1}.png`);
          uploaded.push(
            await gateway.uploadImage({
              projectId: importedProjectId,
              shotId: remoteShot.id,
              fieldId: field.id,
              file,
              position,
            }),
          );
        }
        values[field.id] = uploaded.length > 0 ? JSON.stringify(uploaded) : "";
      }
      if (JSON.stringify(values) !== JSON.stringify(remoteShot.values)) {
        currentStage = "save";
        await gateway.saveShot(
          importedProjectId,
          { ...remoteShot, values },
          1,
        );
        currentStage = "images";
      }
    }
  } catch {
    return { ok: false, stage: currentStage };
  }

  localStorage.setItem(importMarkerKey(userId), "true");
  return { ok: true, projectId: importedProjectId };
}
