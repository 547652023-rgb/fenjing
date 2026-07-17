import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { createProject } from "../domain/storyboard";
import { saveProject } from "../storage/projectRepository";
import { LocalImportPrompt } from "./LocalImportPrompt";

beforeEach(() => localStorage.clear());

it("imports legacy data only after the user confirms", async () => {
  const project = { ...createProject(), title: "电脑里的旧项目" };
  saveProject(project);
  const gateway = new FakeStoryboardGateway();
  const user = await gateway.signUp("owner@example.com", "password123");
  const imported = vi.fn();

  render(
    <LocalImportPrompt gateway={gateway} onImported={imported} user={user} />,
  );

  expect(screen.getByText("发现电脑里的旧分镜项目")).toBeVisible();
  expect(await gateway.listProjects()).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "导入旧项目" }));

  expect(await screen.findByText("旧项目已安全导入")).toBeVisible();
  expect(imported).toHaveBeenCalledOnce();
  expect(await gateway.listProjects()).toHaveLength(1);
});

it("can postpone import without deleting local data", async () => {
  const project = createProject();
  saveProject(project);
  const gateway = new FakeStoryboardGateway();
  const user = await gateway.signUp("owner@example.com", "password123");

  render(<LocalImportPrompt gateway={gateway} onImported={vi.fn()} user={user} />);
  await userEvent.click(screen.getByRole("button", { name: "以后再说" }));

  expect(screen.queryByText("发现电脑里的旧分镜项目")).not.toBeInTheDocument();
  expect(localStorage.getItem("fenjing.storyboard-project.v1")).not.toBeNull();
});
