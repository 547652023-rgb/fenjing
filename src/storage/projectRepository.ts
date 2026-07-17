import type { StoryboardProject } from "../domain/storyboard";

export const STORAGE_KEY = "fenjing.storyboard-project.v1";

export type SaveProjectResult =
  | { ok: true }
  | { ok: false; reason: "storage-unavailable" };

export function loadProject(): StoryboardProject | null {
  try {
    const storedProject = localStorage.getItem(STORAGE_KEY);
    if (storedProject === null) {
      return null;
    }
    return JSON.parse(storedProject) as StoryboardProject;
  } catch {
    return null;
  }
}

export function saveProject(project: StoryboardProject): SaveProjectResult {
  const serializedProject = JSON.stringify(project);
  try {
    localStorage.setItem(STORAGE_KEY, serializedProject);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage-unavailable" };
  }
}
