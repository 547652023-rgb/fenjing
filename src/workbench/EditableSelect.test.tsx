import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { EditableSelect } from "./EditableSelect";

it("restricts a fixed dropdown to its configured options", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <EditableSelect
      allowCustomValue={false}
      label="景别-1"
      onChange={onChange}
      options={["大远景", "远景"]}
      value=""
    />,
  );

  await user.selectOptions(screen.getByRole("combobox", { name: "景别-1" }), "远景");

  expect(onChange).toHaveBeenCalledWith("远景");
  expect(screen.getByRole("combobox", { name: "景别-1" })).toHaveAttribute(
    "data-allow-custom",
    "false",
  );
});

it("allows a temporary custom value without adding it to the option list", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(
    <EditableSelect
      allowCustomValue
      label="备注-1"
      onChange={onChange}
      options={["补拍"]}
      value=""
    />,
  );

  await user.type(screen.getByRole("combobox", { name: "备注-1" }), "临时说明");
  expect(onChange).toHaveBeenLastCalledWith("明");

  rerender(
    <EditableSelect
      allowCustomValue
      label="备注-1"
      onChange={onChange}
      options={["补拍"]}
      value="临时说明"
    />,
  );
  expect(screen.getByRole("combobox", { name: "备注-1" })).toHaveValue("临时说明");
  expect(screen.queryByRole("option", { name: "临时说明" })).not.toBeInTheDocument();
});
