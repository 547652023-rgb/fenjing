import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { StoryboardTable } from "./StoryboardTable";

it("configures reference cells like frame cells for five image uploads", () => {
  render(<StoryboardTable project={createProject()} onChange={vi.fn()} />);

  expect(screen.getByLabelText("画面-1")).toHaveAttribute("multiple");
  expect(screen.getByLabelText("参考-1")).toHaveAttribute("multiple");
  expect(screen.getAllByText("0/5")).toHaveLength(2);
});
