import { useState } from "react";
import type { StoryboardTemplate } from "../domain/models";
import type { DeepReadonly } from "../domain/templates";

export type TemplateSelection = "blank" | string;

type TemplatePickerProps = {
  templates: readonly DeepReadonly<StoryboardTemplate>[];
  value?: TemplateSelection;
  onSelect: (selection: TemplateSelection) => void;
};

export function TemplatePicker({ templates, value, onSelect }: TemplatePickerProps) {
  const [internalValue, setInternalValue] = useState<TemplateSelection>("blank");
  const selected = value ?? internalValue;

  function select(selection: TemplateSelection) {
    if (value === undefined) setInternalValue(selection);
    onSelect(selection);
  }

  return (
    <fieldset className="template-picker">
      <legend>项目模板</legend>
      <div className="template-picker__options">
        <label className="template-option">
          <input
            checked={selected === "blank"}
            name="project-template"
            type="radio"
            value="blank"
            onChange={() => select("blank")}
          />
          <span>空白项目</span>
          <small>使用默认分镜字段</small>
        </label>
        {templates.map((template) => (
          <label className="template-option" key={template.id}>
            <input
              checked={selected === template.id}
              name="project-template"
              type="radio"
              value={template.id}
              onChange={() => select(template.id)}
            />
            <span>{template.name}</span>
            <small>{template.builtIn ? "内置模板" : "共享模板"}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
