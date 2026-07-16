import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { FieldSettings } from "./FieldSettings";

it("adds a person field and hides an existing field", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<FieldSettings project={project} onChange={onChange} onClose={vi.fn()} />);

  const typeSelect = screen.getByLabelText("字段类型");
  expect(within(typeSelect).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual([
    "text",
    "number",
    "date",
    "singleSelect",
    "multiSelect",
    "person",
  ]);

  await user.type(screen.getByLabelText("字段名称"), "演员");
  await user.selectOptions(typeSelect, "person");
  await user.click(screen.getByRole("button", { name: "添加字段" }));

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "演员", label: "演员", type: "person" }),
      ]),
    }),
  );

  await user.click(screen.getByLabelText("显示-摄影机装备"));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "cameraGear", visible: false }),
      ]),
    }),
  );
});

it("reorders fields and disables unavailable moves", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<FieldSettings project={project} onChange={onChange} onClose={vi.fn()} />);

  const firstField = screen.getByTestId("field-settings-shotNumber");
  const secondField = screen.getByTestId("field-settings-frame");
  const lastField = screen.getByTestId("field-settings-sceneNumber");

  expect(within(firstField).getByRole("button", { name: "上移" })).toBeDisabled();
  expect(within(lastField).getByRole("button", { name: "下移" })).toBeDisabled();

  await user.click(within(secondField).getByRole("button", { name: "上移" }));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "frame", order: 0 }),
        expect.objectContaining({ id: "shotNumber", order: 1 }),
      ]),
    }),
  );
});

it("rejects duplicate field names without changing the project", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <FieldSettings project={createProject()} onChange={onChange} onClose={vi.fn()} />,
  );

  await user.type(screen.getByLabelText("字段名称"), "镜号");
  await user.click(screen.getByRole("button", { name: "添加字段" }));

  expect(screen.getByText("字段名称已存在")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});

it("closes from the dialog close button", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  render(
    <FieldSettings project={createProject()} onChange={vi.fn()} onClose={onClose} />,
  );

  expect(screen.getByRole("dialog", { name: "字段设置" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "关闭字段设置" }));
  expect(onClose).toHaveBeenCalledOnce();
});
