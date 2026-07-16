import { useState, type ChangeEvent } from "react";

type ImageCellProps = {
  value: string;
  label: string;
  onChange: (value: string) => void;
};

export function ImageCell({ value, label, onChange }: ImageCellProps) {
  const [error, setError] = useState("");

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      input.value = "";
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        onChange(reader.result);
      }
      input.value = "";
    });
    reader.readAsDataURL(file);
  }

  return (
    <div className="image-cell">
      {value ? (
        <>
          <img alt={label} className="image-cell__preview" src={value} />
          <button
            className="image-cell__remove"
            type="button"
            onClick={() => onChange("")}
          >
            移除图片
          </button>
        </>
      ) : (
        <label className="image-cell__upload">
          <span>选择图片</span>
          <input
            aria-label={label}
            accept="image/*"
            className="image-cell__input"
            type="file"
            onChange={handleFileChange}
          />
        </label>
      )}
      {error ? <p className="image-cell__error">{error}</p> : null}
    </div>
  );
}
