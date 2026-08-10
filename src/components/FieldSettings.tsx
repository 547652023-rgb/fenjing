import { useState, type FormEvent } from "react";
import {
  addField,
  moveField,
  setFieldOptions,
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
  const [draft, setDraft] = useState<StoryboardProject>(() => structuredClone(project));
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [error, setError] = useState("");
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const orderedFields = [...draft.fields].sort((left, right) => left.order - right.order);

  function updateDraft(next: StoryboardProject) {
    setDraft(next);
  }

  function handleAddField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = fieldName.trim();
    const normalizedLabel = label.normalize("NFKC").toLocaleLowerCase();
    const duplicateName = draft.fields.some(
      (field) => field.label.trim().normalize("NFKC").toLocaleLowerCase() === normalizedLabel,
    );

    if (duplicateName) {
      setError("字段名称已存在");
      return;
    }

    try {
      updateDraft(addField(draft, { label, type: fieldType }));
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
                  updateDraft(toggleFieldVisibility(draft, field.id, event.target.checked))
                }
                type="checkbox"
              />
              <span>{`显示-${field.label}`}</span>
            </label>
            <span className="field-settings__type">{field.type}</span>
            {field.type !== "image" &&
            field.id !== "shotNumber" &&
            field.type !== "singleSelect" ? (
              <button
                aria-label={`设置${field.label}下拉选项`}
                className="field-settings__dropdown-toggle"
                type="button"
                onClick={() => updateDraft(setFieldOptions(draft, field.id, []))}
              >
                设为下拉
              </button>
            ) : null}
            <div className="field-settings__move">
              <button
                disabled={index === 0}
                onClick={() => updateDraft(moveField(draft, field.id, index - 1))}
                type="button"
              >
                上移
              </button>
              <button
                disabled={index === orderedFields.length - 1}
                onClick={() => updateDraft(moveField(draft, field.id, index + 1))}
                type="button"
              >
                下移
              </button>
            </div>
            {field.type === "singleSelect" && field.id !== "shotSize" ? (
              <div className="field-settings__options">
                {(field.options ?? []).map((option, optionIndex) => (
                  <div className="field-settings__option" key={`${field.id}-${optionIndex}`}>
                    <input
                      aria-label={`${field.label}选项${optionIndex + 1}`}
                      value={option}
                      onChange={(event) => {
                        const nextOptions = [...(field.options ?? [])];
                        nextOptions[optionIndex] = event.target.value;
                        updateDraft(setFieldOptions(draft, field.id, nextOptions));
                      }}
                    />
                    <button
                      aria-label={`上移${field.label}选项${option}`}
                      disabled={optionIndex === 0}
                      type="button"
                      onClick={() => {
                        const nextOptions = [...(field.options ?? [])];
                        [nextOptions[optionIndex - 1], nextOptions[optionIndex]] = [
                          nextOptions[optionIndex],
                          nextOptions[optionIndex - 1],
                        ];
                        updateDraft(setFieldOptions(draft, field.id, nextOptions));
                      }}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`下移${field.label}选项${option}`}
                      disabled={optionIndex === (field.options?.length ?? 0) - 1}
                      type="button"
                      onClick={() => {
                        const nextOptions = [...(field.options ?? [])];
                        [nextOptions[optionIndex], nextOptions[optionIndex + 1]] = [
                          nextOptions[optionIndex + 1],
                          nextOptions[optionIndex],
                        ];
                        updateDraft(setFieldOptions(draft, field.id, nextOptions));
                      }}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`删除${field.label}选项${option}`}
                      type="button"
                      onClick={() =>
                        updateDraft(
                          setFieldOptions(
                            draft,
                            field.id,
                            (field.options ?? []).filter((_, index) => index !== optionIndex),
                          ),
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                ))}
                <div className="field-settings__option-add">
                  <input
                    aria-label={`新增${field.label}选项`}
                    placeholder="输入新选项"
                    value={optionDrafts[field.id] ?? ""}
                    onChange={(event) =>
                      setOptionDrafts((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    aria-label={`添加${field.label}选项`}
                    disabled={!optionDrafts[field.id]?.trim()}
                    type="button"
                    onClick={() => {
                      updateDraft(
                        setFieldOptions(draft, field.id, [
                          ...(field.options ?? []),
                          optionDrafts[field.id] ?? "",
                        ]),
                      );
                      setOptionDrafts((current) => ({ ...current, [field.id]: "" }));
                    }}
                  >
                    添加选项
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="field-settings__actions">
        <button onClick={onClose} type="button">
          取消
        </button>
        <button
          className="field-settings__save"
          onClick={() => {
            onChange(draft);
            onClose();
          }}
          type="button"
        >
          保存更改
        </button>
      </div>
    </dialog>
  );
}
