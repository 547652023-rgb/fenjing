import { beforeEach, expect, it, vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { createProject } from "../domain/storyboard";
import { loadProject, saveProject } from "../storage/projectRepository";
import { importLocalProject } from "./importLocalProject";

beforeEach(() => localStorage.clear());

it("marks a successful import and keeps the legacy project", async () => {
  const project = { ...createProject(), title: "旧分镜" };
  saveProject(project);
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");

  const result = await importLocalProject({ gateway, project, userId: "user-1" });

  expect(result.ok).toBe(true);
  expect(loadProject()).toEqual(project);
  expect(
    localStorage.getItem("fenjing.storyboard-project.v1.imported:user-1"),
  ).toBe("true");
  expect(await gateway.listProjects()).toEqual([
    expect.objectContaining({ title: "旧分镜" }),
  ]);
});

it("does not mark a failed import complete", async () => {
  const project = createProject();
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  vi.spyOn(gateway, "importLocalProject").mockRejectedValue(new Error("network"));

  const result = await importLocalProject({ gateway, project, userId: "user-1" });

  expect(result.ok).toBe(false);
  expect(
    localStorage.getItem("fenjing.storyboard-project.v1.imported:user-1"),
  ).toBeNull();
});

it("reports image upload as the failing stage", async () => {
  const project = createProject();
  project.shots[0].values.frame = "data:image/png;base64,YQ==";
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  vi.spyOn(gateway, "uploadImage").mockRejectedValue(new Error("network"));

  const result = await importLocalProject({ gateway, project, userId: "user-1" });

  expect(result).toEqual({ ok: false, stage: "images" });
  expect(localStorage.getItem("fenjing.storyboard-project.v1.imported:user-1"))
    .toBeNull();
});
