import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FakeStoryboardGateway } from "../data/fakeGateway";
import { GatewayError } from "../data/gateway";
import { AuthScreen } from "./AuthScreen";

it("validates an eight-character password before registration", async () => {
  const user = userEvent.setup();
  render(<AuthScreen gateway={new FakeStoryboardGateway()} />);

  await user.click(screen.getByRole("button", { name: "注册账号" }));
  await user.type(screen.getByLabelText("邮箱"), "owner@example.com");
  await user.type(screen.getByLabelText("密码"), "short");
  await user.click(screen.getByRole("button", { name: "确认注册" }));

  expect(screen.getByRole("alert")).toHaveTextContent("密码至少需要 8 个字符");
});

it("reports invalid login credentials in Chinese", async () => {
  const user = userEvent.setup();
  render(<AuthScreen gateway={new FakeStoryboardGateway()} />);

  await user.type(screen.getByLabelText("邮箱"), "missing@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "登录" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确");
});

it("explains that registration requires supervisor approval", async () => {
  const gateway = new FakeStoryboardGateway();
  vi.spyOn(gateway, "signUp").mockRejectedValue(new GatewayError("registration_not_allowed"));
  const user = userEvent.setup();
  render(<AuthScreen gateway={gateway} />);

  await user.click(screen.getByRole("button", { name: "注册账号" }));
  await user.type(screen.getByLabelText("邮箱"), "new@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "确认注册" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("请联系主管添加邮箱");
});

it("explains that a disabled account cannot log in", async () => {
  const gateway = new FakeStoryboardGateway();
  vi.spyOn(gateway, "signIn").mockRejectedValue(new GatewayError("account_disabled"));
  const user = userEvent.setup();
  render(<AuthScreen gateway={gateway} />);

  await user.type(screen.getByLabelText("邮箱"), "blocked@example.com");
  await user.type(screen.getByLabelText("密码"), "password123");
  await user.click(screen.getByRole("button", { name: "登录" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("账号已被主管禁用");
});
