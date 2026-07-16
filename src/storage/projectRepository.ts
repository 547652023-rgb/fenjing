import type { StoryboardProject } from "../domain/storyboard";

const STORAGE_KEY = "fenjing.storyboard-project.v1";

export function loadProject(): StoryboardProject | null {
  const storedProject = localStorage.getItem(STORAGE_KEY);
  if (storedProject === null) {
    return null;
  }

  try {
    return JSON.parse(storedProject) as StoryboardProject;
  } catch {
    return null;
  }
}

export function saveProject(project: StoryboardProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}
