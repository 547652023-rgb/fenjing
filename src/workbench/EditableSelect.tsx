type EditableSelectProps = {
  label: string;
  value: string;
  options: string[];
  allowCustomValue: boolean;
  onChange: (value: string) => void;
};

function listIdFor(label: string): string {
  return `options-${label.replace(/[^\p{L}\p{N}]+/gu, "-")}`;
}

export function EditableSelect({
  label,
  value,
  options,
  allowCustomValue,
  onChange,
}: EditableSelectProps) {
  if (!allowCustomValue) {
    return (
      <select
        aria-label={label}
        data-allow-custom="false"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" />
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  const listId = listIdFor(label);
  return (
    <>
      <input
        aria-label={label}
        data-allow-custom="true"
        list={listId}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}
