import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import type { RemoteImage } from "../domain/models";

type SharedImageCellProps = {
  label: string;
  maxImages?: number;
};

type LocalImageCellProps = SharedImageCellProps & {
  value: string;
  onChange: (value: string) => void;
  images?: never;
  onUpload?: never;
  onRemove?: never;
};

type OnlineImageCellProps = SharedImageCellProps & {
  images: RemoteImage[];
  onUpload: (files: File[]) => Promise<RemoteImage[]>;
  onRemove: (image: RemoteImage) => Promise<void>;
  value?: never;
  onChange?: never;
};

export type ImageCellProps = LocalImageCellProps | OnlineImageCellProps;

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

function droppedImageFiles(event: DragEvent<HTMLElement>): File[] {
  event.preventDefault();
  return Array.from(event.dataTransfer.files ?? []);
}

function LocalImageCell({
  value,
  label,
  maxImages = 1,
  onChange,
}: LocalImageCellProps) {
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
    const exceededLimit = valid.length > accepted.length;
    setError(exceededLimit ? `每行最多 ${maxImages} 张图片` : "");

    try {
      const loaded = await Promise.all(accepted.map(readImage));
      onChange(serializeImageValues([...images, ...loaded], maxImages));
    } catch {
      setError("读取图片失败");
    } finally {
      input.value = "";
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    const selected = droppedImageFiles(event);
    if (selected.length === 0) return;
    const valid = selected.filter((file) => file.type.startsWith("image/"));
    if (valid.length !== selected.length) {
      setError("请选择图片文件");
      return;
    }
    const accepted = valid.slice(0, Math.max(0, maxImages - images.length));
    setError(accepted.length < valid.length ? `每行最多 ${maxImages} 张图片` : "");
    try {
      const loaded = await Promise.all(accepted.map(readImage));
      onChange(serializeImageValues([...images, ...loaded], maxImages));
    } catch {
      setError("读取图片失败");
    }
  }

  function removeImage(index: number) {
    const nextImages = images.filter((_, imageIndex) => imageIndex !== index);
    onChange(serializeImageValues(nextImages, maxImages));
  }

  return (
    <ImageCellLayout
      error={error}
      images={images.map((url, position) => ({
        key: `${url.slice(0, 48)}-${position}`,
        url,
      }))}
      label={label}
      maxImages={maxImages}
      onFileChange={handleFileChange}
      onDrop={handleDrop}
      onRemove={(index) => removeImage(index)}
    />
  );
}

function OnlineImageCell({
  images,
  label,
  maxImages = 1,
  onUpload,
  onRemove,
}: OnlineImageCellProps) {
  const [visibleImages, setVisibleImages] = useState(() => images.slice(0, maxImages));
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setVisibleImages(images.slice(0, maxImages));
  }, [images, maxImages]);

  async function uploadFile(file: File) {
    setPendingNames((current) => [...current, file.name]);
    setError("");
    try {
      const uploaded = await onUpload([file]);
      setVisibleImages((current) => [...current, ...uploaded].slice(0, maxImages));
      setFailedFiles((current) => current.filter((candidate) => candidate !== file));
    } catch {
      setError("上传失败");
      setFailedFiles((current) =>
        current.includes(file) ? current : [...current, file],
      );
    } finally {
      setPendingNames((current) => current.filter((name) => name !== file.name));
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);
    input.value = "";
    if (selected.length === 0) {
      return;
    }

    if (selected.some((file) => !file.type.startsWith("image/"))) {
      setError("请选择图片文件");
      return;
    }

    const remaining = Math.max(0, maxImages - visibleImages.length - pendingNames.length);
    const accepted = selected.slice(0, remaining);
    if (accepted.length < selected.length) {
      setError(`每行最多 ${maxImages} 张图片`);
    }
    await Promise.all(accepted.map(uploadFile));
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    const selected = droppedImageFiles(event);
    if (selected.length === 0) return;
    if (selected.some((file) => !file.type.startsWith("image/"))) {
      setError("请选择图片文件");
      return;
    }
    const remaining = Math.max(0, maxImages - visibleImages.length - pendingNames.length);
    const accepted = selected.slice(0, remaining);
    if (accepted.length < selected.length) {
      setError(`每行最多 ${maxImages} 张图片`);
    }
    await Promise.all(accepted.map(uploadFile));
  }

  async function removeImage(index: number) {
    const image = visibleImages[index];
    setError("");
    try {
      await onRemove(image);
      setVisibleImages((current) => current.filter((candidate) => candidate !== image));
    } catch {
      setError("删除失败");
    }
  }

  return (
    <ImageCellLayout
      error={error}
      images={visibleImages.map((image) => ({ key: image.path, url: image.url }))}
      label={label}
      maxImages={maxImages}
      onFileChange={handleFileChange}
      onDrop={handleDrop}
      onRemove={removeImage}
      pendingNames={pendingNames}
      retryFiles={failedFiles}
      onRetry={uploadFile}
    />
  );
}

type ImageCellLayoutProps = {
  error: string;
  images: Array<{ key: string; url: string }>;
  label: string;
  maxImages: number;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onRemove: (index: number) => void;
  onRetry?: (file: File) => void;
  pendingNames?: string[];
  retryFiles?: File[];
};

function ImageCellLayout({
  error,
  images,
  label,
  maxImages,
  onFileChange,
  onDrop,
  onRemove,
  onRetry,
  pendingNames = [],
  retryFiles = [],
}: ImageCellLayoutProps) {
  const occupiedCount = images.length + pendingNames.length;
  return (
    <div
      className={`image-cell ${
        maxImages > 1 ? "image-cell--multiple" : "image-cell--single"
      }`}
      data-testid="image-cell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {images.length > 0 ? (
        <div
          className="image-cell__previews image-cell__previews--vertical"
          data-testid="image-cell-previews"
        >
          {images.map((image, index) => {
            const imageLabel = `${label}-图片${index + 1}`;
            return (
              <div className="image-cell__item" key={image.key}>
                <img alt={imageLabel} className="image-cell__preview" src={image.url} />
                <button
                  aria-label={`移除${imageLabel}`}
                  className="image-cell__remove"
                  type="button"
                  onClick={() => onRemove(index)}
                >
                  移除图片
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {pendingNames.map((name) => (
        <p className="image-cell__pending" key={name}>正在上传 {name}</p>
      ))}

      {retryFiles.map((file) => (
        <button
          aria-label={`重试上传 ${file.name}`}
          className="image-cell__retry"
          key={`${file.name}-${file.lastModified}`}
          type="button"
          onClick={() => onRetry?.(file)}
        >
          重试上传 {file.name}
        </button>
      ))}

      {occupiedCount < maxImages ? (
        <label className="image-cell__upload">
          <span>选择图片</span>
          <input
            aria-label={label}
            accept="image/*"
            className="image-cell__input"
            multiple={maxImages > 1}
            type="file"
            onChange={onFileChange}
          />
        </label>
      ) : null}

      {maxImages > 1 ? (
        <span className="image-cell__count">
          {occupiedCount}/{maxImages}
        </span>
      ) : null}

      {error ? <p className="image-cell__error">{error}</p> : null}
    </div>
  );
}

export function ImageCell(props: ImageCellProps) {
  if (props.images !== undefined) {
    return <OnlineImageCell {...props} />;
  }
  return <LocalImageCell {...props} />;
}
