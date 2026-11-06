import { imageAspectRatio } from "../domain/aspectRatio";

export type ImageCrop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

const MAX_FRAME_EDGE = 1920;
const DEFAULT_DECODE_TIMEOUT_MS = 1500;

export function cropToAspectRatio(width: number, height: number, aspectRatio = "16:9"): ImageCrop {
  const ratio = imageAspectRatio(aspectRatio);
  const frameRatio = ratio.width / ratio.height;
  if (width / height > frameRatio) {
    const sw = height * frameRatio;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }

  const sh = width / frameRatio;
  return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
}

export function cropToSixteenByNine(width: number, height: number): ImageCrop {
  return cropToAspectRatio(width, height);
}

function jpegFileName(name: string): string {
  const baseName = name.replace(/\.[^.]+$/, "").trim() || "storyboard-frame";
  return `${baseName}.jpg`;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片裁切失败"));
    }, "image/jpeg", 0.88);
  });
}

async function loadBitmap(file: File, timeoutMs: number): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器不支持图片裁切");
  }
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("图片解码超时"));
    }, timeoutMs);
    createImageBitmap(file).then(bitmap => {
      clearTimeout(timer);
      if (expired) bitmap.close();
      else resolve(bitmap);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function prepareStoryboardFrame(
  file: File,
  decodeTimeoutMs = DEFAULT_DECODE_TIMEOUT_MS,
  aspectRatio = "16:9",
): Promise<File> {
  try {
    const bitmap = await loadBitmap(file, decodeTimeoutMs);
    try {
      const crop = cropToAspectRatio(bitmap.width, bitmap.height, aspectRatio);
      const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(crop.sw, crop.sh));
      const outputWidth = Math.max(1, Math.round(crop.sw * scale));
      const outputHeight = Math.max(1, Math.round(crop.sh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("图片裁切失败");
      context.drawImage(
        bitmap,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        outputWidth,
        outputHeight,
      );
      const blob = await canvasBlob(canvas);
      return new File([blob], jpegFileName(file.name), { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    // Keep original files uploadable on browsers that cannot decode a given format.
    return file;
  }
}
