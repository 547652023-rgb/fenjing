import { createProject } from "../domain/storyboard";
import { loadProject, saveProject } from "./projectRepository";

it("round-trips a project through local storage", () => {
  const project = createProject();

  saveProject(project);

  expect(loadProject()).toEqual(project);
});
