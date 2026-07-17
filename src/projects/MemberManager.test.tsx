import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { MemberManager } from "./MemberManager";

async function setupOwnerWithRegisteredEditor() {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("editor@example.com", "password123");
  await gateway.signOut();
  await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("共同项目");
  return { gateway, project };
}

it("lets an owner invite a registered user and remove the editor", async () => {
  const { gateway, project } = await setupOwnerWithRegisteredEditor();
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <MemberManager gateway={gateway} onClose={vi.fn()} projectId={project.id} />,
  );

  await user.type(screen.getByLabelText("成员邮箱"), "editor@example.com");
  await user.click(screen.getByRole("button", { name: "邀请成员" }));
  expect(await screen.findByText("editor@example.com")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "移除 editor@example.com" }));
  expect(window.confirm).toHaveBeenCalledWith("确定移除成员 editor@example.com 吗？");
  expect(screen.queryByText("editor@example.com")).not.toBeInTheDocument();
});

it("explains that an unregistered email cannot be invited yet", async () => {
  const { gateway, project } = await setupOwnerWithRegisteredEditor();
  const user = userEvent.setup();
  render(
    <MemberManager gateway={gateway} onClose={vi.fn()} projectId={project.id} />,
  );

  await user.type(screen.getByLabelText("成员邮箱"), "new@example.com");
  await user.click(screen.getByRole("button", { name: "邀请成员" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "该邮箱尚未注册，请对方注册后再邀请",
  );
});
