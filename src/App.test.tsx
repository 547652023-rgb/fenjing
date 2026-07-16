import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

it("renders the storyboard workbench", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "分镜工作台" })).toBeInTheDocument();
});

it("opens and closes field settings", async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByRole("dialog", { name: "字段设置" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "字段设置" }));
  expect(screen.getByRole("dialog", { name: "字段设置" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "关闭字段设置" }));
  expect(screen.queryByRole("dialog", { name: "字段设置" })).not.toBeInTheDocument();
});
