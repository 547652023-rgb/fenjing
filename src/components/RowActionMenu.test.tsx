import { fireEvent, render, screen } from "@testing-library/react";
import { RowActionMenu } from "./RowActionMenu";

it("renders outside fixed table cells and closes with Escape or an outside click", () => {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const close = vi.fn();
  const view = render(<RowActionMenu anchor={anchor} label="镜头操作" onClose={close}><button role="menuitem">复制镜头</button></RowActionMenu>);
  expect(screen.getByRole("menu").parentElement).toBe(document.body);
  expect(screen.getByRole("menuitem")).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(document.body);
  expect(close).toHaveBeenCalledTimes(2);
  view.unmount();
  anchor.remove();
});

it("opens above a trigger near the bottom of the viewport", () => {
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isMenu = this.classList.contains("shot-actions__menu");
    return { left: 100, right: 280, top: isMenu ? 0 : 700, bottom: isMenu ? 240 : 730, width: 180, height: isMenu ? 240 : 30, x: 100, y: 0, toJSON: () => ({}) };
  });
  const anchor = document.createElement("button");
  const view = render(<RowActionMenu anchor={anchor} label="镜头操作" onClose={vi.fn()}><button>复制镜头</button></RowActionMenu>);
  expect(screen.getByRole("menu").style.top).toBe("454px");
  view.unmount();
  rect.mockRestore();
});
