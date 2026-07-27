import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { SupervisorDashboard } from "./SupervisorDashboard";

it("adds an email and renders invited account status", async () => {
  const gateway = new FakeStoryboardGateway();
  const supervisor = await gateway.signUp("主管@example.com", "password123");
  const user = userEvent.setup();

  render(<SupervisorDashboard gateway={gateway} user={supervisor} onBack={() => undefined} />);

  await user.type(screen.getByLabelText("注册邮箱"), "member@example.com");
  await user.click(screen.getByRole("button", { name: "添加邮箱" }));

  const row = await screen.findByRole("row", { name: /member@example\.com/ });
  expect(within(row).getByText("待注册")).toBeInTheDocument();
});

it("filters accounts and restores a disabled member", async () => {
  const gateway = new FakeStoryboardGateway();
  const supervisor = await gateway.signUp("主管@example.com", "password123");
  await gateway.invitePlatformAccount("member@example.com");
  const member = await gateway.signUp("member@example.com", "password123");
  await gateway.signOut();
  await gateway.signIn(supervisor.email, "password123");
  await gateway.setPlatformAccountStatus(member.id, "disabled");
  const user = userEvent.setup();

  render(<SupervisorDashboard gateway={gateway} user={supervisor} onBack={() => undefined} />);

  await user.type(screen.getByLabelText("筛选邮箱"), "member");
  const row = await screen.findByRole("row", { name: /member@example\.com/ });
  expect(within(row).getByText("已禁用")).toBeInTheDocument();
  await user.click(within(row).getByRole("button", { name: "恢复" }));
  expect(await within(row).findByText("正常")).toBeInTheDocument();
});
