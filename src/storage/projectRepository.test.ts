import { createProject } from "../domain/storyboard";
import { loadProject, saveProject } from "./projectRepository";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("round-trips a project through local storage", () => {
  const project = createProject();

  expect(saveProject(project)).toEqual({ ok: true });

  expect(loadProject()).toEqual(project);
});

it("returns an error and keeps the previous project when local storage rejects a write", () => {
  const previousProject = createProject();
  expect(saveProject(previousProject)).toEqual({ ok: true });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  });

  const result = saveProject({ ...previousProject, title: "无法保存" });

  expect(result).toEqual({ ok: false, reason: "storage-unavailable" });
  expect(loadProject()).toEqual(previousProject);
});
