import { useState, type ChangeEvent } from "react";

type ImageCellProps = {
  value: string;
  label: string;
  maxImages?: number;
  onChange: (value: string) => void;
};

function parseImageValues(value: string): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
    }
  } catch {
    // Legacy image fields store one raw data URL.
  }

  return [value];
}

function serializeImageValues(values: string[], maxImages: number): string {
  if (maxImages === 1) {
    return values[0] ?? "";
  }

  return values.length === 0 ? "" : JSON.stringify(values);
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("读取图片失败"));
      }
    });
    reader.addEventListener("error", () => reject(new Error("读取图片失败")));
    reader.readAsDataURL(file);
  });
}

export function ImageCell({ value, label, maxImages = 1, onChange }: ImageCellProps) {
  const [error, setError] = useState("");
  const images = parseImageValues(value).slice(0, maxImages);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);

    if (selected.length === 0) {
      return;
    }

    const valid = selected.filter((file) => file.type.startsWith("image/"));
    if (valid.length !== selected.length) {
      setError("请选择图片文件");
      input.value = "";
      return;
    }

    const accepted = valid.slice(0, Math.max(0, maxImages - images.length));
    setError("");

    try {
      const loaded = await Promise.all(accepted.map(readImage));
      onChange(serializeImageValues([...images, ...loaded], maxImages));
    } catch {
      setError("读取图片失败");
    } finally {
      input.value = "";
    }
  }

  function removeImage(index: number) {
    const nextImages = images.filter((_, imageIndex) => imageIndex !== index);
    onChange(serializeImageValues(nextImages, maxImages));
  }

  return (
    <div className="image-cell">
      {images.length > 0 ? (
        <div className="image-cell__previews">
          {images.map((image, index) => {
            const imageLabel = `${label}-图片${index + 1}`;
            return (
              <div className="image-cell__item" key={`${image.slice(0, 48)}-${index}`}>
                <img alt={imageLabel} className="image-cell__preview" src={image} />
                <button
                  aria-label={`移除${imageLabel}`}
                  className="image-cell__remove"
                  type="button"
                  onClick={() => removeImage(index)}
                >
                  移除图片
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {images.length < maxImages ? (
        <label className="image-cell__upload">
          <span>选择图片</span>
          <input
            aria-label={label}
            accept="image/*"
            className="image-cell__input"
            multiple={maxImages > 1}
            type="file"
            onChange={handleFileChange}
          />
        </label>
      ) : null}

      {error ? <p className="image-cell__error">{error}</p> : null}
    </div>
  );
}
