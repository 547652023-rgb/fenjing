import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  expect(screen.getByText("显示-演员")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();

  await user.click(screen.getByLabelText("显示-摄影机装备"));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "演员", label: "演员", type: "person" }),
      ]),
    }),
  );
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      fields: expect.arrayContaining([
        expect.objectContaining({ id: "cameraGear", visible: false }),
      ]),
    }),
  );
});

it("keeps field edits as a draft until saved, and cancels without changing the project", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();
  const onClose = vi.fn();

  const firstRender = render(<FieldSettings project={project} onChange={onChange} onClose={onClose} />);

  await user.type(screen.getByLabelText("字段名称"), "服装备注");
  await user.click(screen.getByRole("button", { name: "添加字段" }));

  expect(screen.getByText("显示-服装备注")).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();

  firstRender.unmount();
  render(<FieldSettings project={project} onChange={onChange} onClose={onClose} />);
  await user.type(screen.getByLabelText("字段名称"), "服装备注");
  await user.click(screen.getByRole("button", { name: "添加字段" }));
  await user.click(screen.getByRole("button", { name: "保存更改" }));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    fields: expect.arrayContaining([
      expect.objectContaining({ id: "服装备注", label: "服装备注", type: "text" }),
    ]),
  }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("reorders fields and disables unavailable moves", async () => {
  const user = userEvent.setup();
  const project = createProject();
  const onChange = vi.fn();

  render(<FieldSettings project={project} onChange={onChange} onClose={vi.fn()} />);

  const firstField = screen.getByTestId("field-settings-shotNumber");
  const secondField = screen.getByTestId("field-settings-frame");
  const lastField = screen.getByTestId("field-settings-productionStatus");

  expect(within(firstField).getByRole("button", { name: "上移" })).toBeDisabled();
  expect(within(lastField).getByRole("button", { name: "下移" })).toBeDisabled();

  await user.click(within(secondField).getByRole("button", { name: "上移" }));
  await user.click(screen.getByRole("button", { name: "保存更改" }));
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

it("shows validation for a punctuation-only field name without throwing", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <FieldSettings project={createProject()} onChange={onChange} onClose={vi.fn()} />,
  );

  await user.type(screen.getByLabelText("字段名称"), "!!!");
  await user.click(screen.getByRole("button", { name: "添加字段" }));

  expect(screen.getByRole("alert")).toHaveTextContent("字段名称需包含文字或数字");
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

it("converts a text field to a configurable dropdown and adds an option", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [project, setProject] = useState(createProject);
    return <FieldSettings project={project} onChange={setProject} onClose={vi.fn()} />;
  }

  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "设置备注下拉选项" }));
  await user.type(screen.getByLabelText("新增备注选项"), "补拍");
  await user.click(screen.getByRole("button", { name: "添加备注选项" }));

  expect(screen.getByDisplayValue("补拍")).toBeVisible();
  expect(screen.getByRole("button", { name: "删除备注选项补拍" })).toBeVisible();
});
