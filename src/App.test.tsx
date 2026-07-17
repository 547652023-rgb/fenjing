import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { FakeStoryboardGateway } from "./data/fakeGateway";

it("shows setup instructions when no online gateway is configured", () => {
  render(<App gateway={null} />);

  expect(
    screen.getByRole("heading", { name: "需要配置在线服务" }),
  ).toBeVisible();
});

it("shows login until a session exists", async () => {
  render(<App gateway={new FakeStoryboardGateway()} />);

  expect(
    await screen.findByRole("heading", { name: "登录分镜工作台" }),
  ).toBeVisible();
});

it("registers, enters the authenticated area, and signs out", async () => {
  const gateway = new FakeStoryboardGateway();
  const user = userEvent.setup();
  render(<App gateway={gateway} />);

  await user.click(await screen.findByRole("button", { name: "注册账号" }));
  await user.type(screen.getByLabelText("邮箱"), "owner@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "确认注册" }));

  expect(await screen.findByRole("heading", { name: "我的项目" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "退出登录" }));
  expect(
    await screen.findByRole("heading", { name: "登录分镜工作台" }),
  ).toBeVisible();
});
