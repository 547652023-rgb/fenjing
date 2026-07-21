import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { SaveTemplateDialog } from "./SaveTemplateDialog";

const projectWithImage = {
  ...createProject(),
  id: "project-1",
  title: "拍摄项目",
  shots: [
    {
      id: "shot-1",
      values: {
        frame: JSON.stringify([{ path: "project-1/shot-1/frame.png" }]),
      },
    },
  ],
};

function SaveTemplateLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>保存为模板</button>
      {open ? (
        <SaveTemplateDialog
          project={projectWithImage}
          onSave={vi.fn()}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

it("saves the current project as an image-free shared template", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <SaveTemplateDialog
      project={projectWithImage}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );

  await user.type(screen.getByLabelText("模板名称"), "拍摄模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  expect(onSave).toHaveBeenCalledWith(
    "拍摄模板",
    expect.objectContaining({ shots: [{ id: "shot-1", values: {} }] }),
  );
});

it("shows Chinese validation and does not save an empty template name", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <SaveTemplateDialog
      project={projectWithImage}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );

  await user.type(screen.getByLabelText("模板名称"), "   ");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  expect(screen.getByRole("alert")).toHaveTextContent("请输入模板名称");
  expect(screen.getByLabelText("模板名称")).toHaveAttribute("aria-invalid", "true");
  expect(onSave).not.toHaveBeenCalled();
});

it("opens as a native modal and restores focus after closing", async () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: showModal,
  });

  try {
    const user = userEvent.setup();
    render(<SaveTemplateLauncher />);
    const launcher = screen.getByRole("button", { name: "保存为模板" });

    await user.click(launcher);
    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "保存为模板" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "保存为模板" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  } finally {
    if (originalShowModal) {
      Object.defineProperty(
        HTMLDialogElement.prototype,
        "showModal",
        originalShowModal,
      );
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    }
  }
});

it("prevents dismissing the dialog while a template save is pending", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(() => new Promise<void>(() => undefined));
  render(
    <SaveTemplateDialog
      project={projectWithImage}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );

  await user.type(screen.getByLabelText("模板名称"), "拍摄模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  expect(screen.getByRole("button", { name: "关闭保存模板" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
});
