export type ImageCrop = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

const FRAME_RATIO = 16 / 9;
const MAX_FRAME_EDGE = 1920;

export function cropToSixteenByNine(width: number, height: number): ImageCrop {
  if (width / height > FRAME_RATIO) {
    const sw = height * FRAME_RATIO;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }

  const sh = width / FRAME_RATIO;
  return { sx: 0, sy: (height - sh) / 2, sw: width, sh };
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

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器不支持图片裁切");
  }
  return createImageBitmap(file);
}

export async function prepareStoryboardFrame(file: File): Promise<File> {
  try {
    const bitmap = await loadBitmap(file);
    const crop = cropToSixteenByNine(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_FRAME_EDGE / crop.sw);
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
    bitmap.close();
    const blob = await canvasBlob(canvas);
    return new File([blob], jpegFileName(file.name), { type: "image/jpeg" });
  } catch {
    // Keep original files uploadable on browsers that cannot decode a given format.
    return file;
  }
}
