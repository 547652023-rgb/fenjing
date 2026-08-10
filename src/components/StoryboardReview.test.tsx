import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { StoryboardReview } from "./StoryboardReview";

it("renders storyboard cards in the project shot order with their review details", () => {
  const project = createProject();
  project.shots = [
    {
      id: "shot-2",
      values: {
        shotNumber: "2",
        content: "主角从窗边回头",
        shotSize: "近景",
        durationSeconds: "4",
        productionStatus: "待拍",
      },
    },
    {
      id: "shot-1",
      values: {
        shotNumber: "1",
        content: "清晨的城市远景",
        shotSize: "远景",
        durationSeconds: "6",
        productionStatus: "待制作",
      },
    },
  ];

  render(<StoryboardReview project={project} />);

  const cards = screen.getAllByRole("article", { name: /镜头/ });
  expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
    "镜头 2",
    "镜头 1",
  ]);
  expect(cards[0]).toHaveTextContent("近景");
  expect(cards[0]).toHaveTextContent("4 秒");
  expect(cards[0]).toHaveTextContent("主角从窗边回头");
});

it("opens the selected frame in a review lightbox", async () => {
  const project = createProject();
  project.shots[0] = {
    ...project.shots[0],
    values: {
      ...project.shots[0].values,
      shotNumber: "1",
      content: "窗边特写",
      frame: JSON.stringify([
        { path: "project/shot/frame.png", url: "https://example.com/frame.png", name: "frame.png", position: 0 },
      ]),
    },
  };
  const user = userEvent.setup();

  render(<StoryboardReview project={project} />);
  await user.click(screen.getByRole("button", { name: "查看镜头 1 画面" }));

  const dialog = screen.getByRole("dialog", { name: "镜头 1 画面审阅" });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByRole("img", { name: "镜头 1 画面" })).toHaveAttribute(
    "src",
    "https://example.com/frame.png",
  );
});

it("moves the lightbox to the next storyboard frame", async () => {
  const project = createProject();
  project.shots = ["1", "2"].map((id) => ({
    id,
    values: {
      shotNumber: id,
      frame: JSON.stringify([{ path: `${id}.png`, url: `https://example.com/${id}.png`, name: `${id}.png`, position: 0 }]),
    },
  }));
  const user = userEvent.setup();

  render(<StoryboardReview project={project} />);
  await user.click(screen.getByRole("button", { name: "查看镜头 1 画面" }));
  await user.click(screen.getByRole("button", { name: "下一镜头" }));

  expect(screen.getByRole("dialog", { name: "镜头 2 画面审阅" })).toBeVisible();
});

it("reports an approved review state for the selected shot", async () => {
  const project = createProject();
  const onReviewStateChange = vi.fn();
  const user = userEvent.setup();

  render(<StoryboardReview project={project} onReviewStateChange={onReviewStateChange} />);
  await user.click(screen.getByRole("button", { name: "确认镜头 1" }));

  expect(onReviewStateChange).toHaveBeenCalledWith("1", "已确认");
});
