import { describe, expect, it, vi } from "vitest";
import { cropToSixteenByNine, prepareStoryboardFrame } from "./prepareStoryboardImage";

describe("cropToSixteenByNine", () => {
  it("center-crops a portrait image to a 16:9 source rectangle", () => {
    expect(cropToSixteenByNine(900, 1600)).toEqual({
      sx: 0,
      sy: 546.875,
      sw: 900,
      sh: 506.25,
    });
  });

  it("center-crops a wide image to a 16:9 source rectangle", () => {
    expect(cropToSixteenByNine(2000, 900)).toEqual({
      sx: 200,
      sy: 0,
      sw: 1600,
      sh: 900,
    });
  });

  it("uploads the original file when browser decoding stalls", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockImplementation(() => new Promise(() => undefined)));
    const original = new File(["image"], "frame.png", { type: "image/png" });

    await expect(prepareStoryboardFrame(original, 1)).resolves.toBe(original);
    vi.unstubAllGlobals();
  });
});

it("releases a decoded bitmap that finishes after the decoding deadline", async () => {
  let finish!: (bitmap: ImageBitmap) => void;
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; })));
  const original = new File(["image"], "frame.png", { type: "image/png" });
  try {
    await expect(prepareStoryboardFrame(original, 1)).resolves.toBe(original);
    const close = vi.fn();
    finish({ close } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("crops new frames to the selected portrait ratio and keeps the full portrait composition", async () => {
  const drawImage = vi.fn();
  const close = vi.fn();
  const nativeCreate = document.createElement.bind(document);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 900, height: 1600, close })));
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return nativeCreate(tag);
    return { width: 0, height: 0, getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })) } as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  try {
    const original = new File(["portrait"], "portrait.png", { type: "image/png" });
    const prepared = await prepareStoryboardFrame(original, 1500, "9:16");
    expect(prepared.type).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 900, 1600, 0, 0, 900, 1600);
    expect(close).toHaveBeenCalledOnce();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
