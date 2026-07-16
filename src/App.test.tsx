import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the storyboard workbench", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "分镜工作台" })).toBeInTheDocument();
});
