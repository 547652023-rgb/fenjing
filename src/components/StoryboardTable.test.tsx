import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { StoryboardTable } from "./StoryboardTable";

it("edits a visible storyboard cell and adds a shot", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<StoryboardTable project={project} onChange={onChange} />);

  await user.clear(screen.getByLabelText("镜号-1"));
  await user.type(screen.getByLabelText("镜号-1"), "2");
  expect(onChange).toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "新增镜头" }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ shots: expect.any(Array) }),
  );
});
