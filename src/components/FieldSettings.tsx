import { useState, type FormEvent } from "react";
import {
  addField,
  moveField,
  toggleFieldVisibility,
  type CustomFieldType,
  type StoryboardProject,
} from "../domain/storyboard";

type FieldSettingsProps = {
  project: StoryboardProject;
  onChange: (project: StoryboardProject) => void;
  onClose: () => void;
};

const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  "text",
  "number",
  "date",
  "singleSelect",
  "multiSelect",
  "person",
];

export function FieldSettings({ project, onChange, onClose }: FieldSettingsProps) {
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [error, setError] = useState("");
  const orderedFields = [...project.fields].sort((left, right) => left.order - right.order);

  function handleAddField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = fieldName.trim();
    const normalizedLabel = label.normalize("NFKC").toLocaleLowerCase();
    const duplicateName = project.fields.some(
      (field) => field.label.trim().normalize("NFKC").toLocaleLowerCase() === normalizedLabel,
    );

    if (duplicateName) {
      setError("字段名称已存在");
      return;
    }

    try {
      onChange(addField(project, { label, type: fieldType }));
      setFieldName("");
      setError("");
    } catch (addError) {
      if (
        addError instanceof Error &&
        addError.message.includes("must contain letters or numbers")
      ) {
        setError("字段名称需包含文字或数字");
        return;
      }
      if (addError instanceof Error && addError.message.includes("already exists")) {
        setError("字段名称已存在");
        return;
      }
      throw addError;
    }
  }

  return (
    <dialog
      aria-labelledby="field-settings-title"
      aria-modal="true"
      className="field-settings"
      open
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="field-settings__header">
        <div>
          <p className="field-settings__eyebrow">项目字段</p>
          <h2 id="field-settings-title">字段设置</h2>
        </div>
        <button
          aria-label="关闭字段设置"
          className="field-settings__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <form className="field-settings__form" onSubmit={handleAddField}>
        <label>
          字段名称
          <input
            aria-describedby={error ? "field-name-error" : undefined}
            onChange={(event) => {
              setFieldName(event.target.value);
              setError("");
            }}
            value={fieldName}
          />
        </label>
        <label>
          字段类型
          <select
            onChange={(event) => setFieldType(event.target.value as CustomFieldType)}
            value={fieldType}
          >
            {CUSTOM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!fieldName.trim()} type="submit">
          添加字段
        </button>
        {error ? (
          <p className="field-settings__error" id="field-name-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <div className="field-settings__list">
        {orderedFields.map((field, index) => (
          <div
            className="field-settings__row"
            data-testid={`field-settings-${field.id}`}
            key={field.id}
          >
            <label className="field-settings__visibility">
              <input
                checked={field.visible}
                onChange={(event) =>
                  onChange(toggleFieldVisibility(project, field.id, event.target.checked))
                }
                type="checkbox"
              />
              <span>{`显示-${field.label}`}</span>
            </label>
            <span className="field-settings__type">{field.type}</span>
            <div className="field-settings__move">
              <button
                disabled={index === 0}
                onClick={() => onChange(moveField(project, field.id, index - 1))}
                type="button"
              >
                上移
              </button>
              <button
                disabled={index === orderedFields.length - 1}
                onClick={() => onChange(moveField(project, field.id, index + 1))}
                type="button"
              >
                下移
              </button>
            </div>
          </div>
        ))}
      </div>
    </dialog>
  );
}
