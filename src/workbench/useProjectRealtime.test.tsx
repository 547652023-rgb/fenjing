import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { ProjectWorkbench } from "./ProjectWorkbench";

async function setupProject() {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const summary = await gateway.createProject("协作广告片");
  const project = await gateway.loadProject(summary.id);
  return { gateway, owner, summary, project };
}

it("applies a remote cell change without losing a different local value", async () => {
  const { gateway, owner, summary, project } = await setupProject();
  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={summary.id}
      user={owner}
    />,
  );

  const notes = await screen.findByLabelText("备注-1");
  await userEvent.type(notes, "本地草稿");
  const remoteShot = {
    ...project.shots[0],
    values: { ...project.shots[0].values, content: "远端新内容" },
  };

  act(() => {
    gateway.emit(summary.id, {
      type: "shot.updated",
      shot: { shot: remoteShot, version: 9 },
    });
  });

  expect(notes).toHaveValue("本地草稿");
  expect(await screen.findByLabelText("内容-1")).toHaveValue("远端新内容");
});

it("reports a version conflict and reloads the server shot", async () => {
  const { gateway, owner, summary, project } = await setupProject();
  const serverShot = {
    ...project.shots[0],
    values: { ...project.shots[0].values, notes: "服务器备注" },
  };
  gateway.failNextSaveWithConflict(summary.id, serverShot);

  render(
    <ProjectWorkbench
      gateway={gateway}
      onBack={vi.fn()}
      projectId={summary.id}
      user={owner}
    />,
  );

  await userEvent.type(await screen.findByLabelText("备注-1"), "冲突内容");

  expect(await screen.findByText("内容已被其他成员更新")).toBeVisible();
  expect(screen.getByLabelText("备注-1")).toHaveValue("服务器备注");
});
