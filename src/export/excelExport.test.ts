import { afterEach, vi } from "vitest";
import type { ExportModel } from "./storyboardExport";
import { buildXlsxPackage } from "./excelExport";

function validPngBytes(): Uint8Array {
  const binary = atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

const model: ExportModel = {
  title: "测试 & 项目",
  aspectRatio: "16:9",
  shotCount: 1,
  fields: [
    { id: "shotNumber", label: "镜号", type: "number", visible: true, order: 0 },
    { id: "content", label: "内容", type: "text", visible: true, order: 1 },
    { id: "frame", label: "画面", type: "image", visible: true, order: 2 },
  ],
  rows: [{
    shotId: "1",
    cells: [
      { fieldId: "shotNumber", fieldType: "number", text: "1", images: [] },
      { fieldId: "content", fieldType: "text", text: "开场", images: [] },
      {
        fieldId: "frame",
        fieldType: "image",
        text: "",
        images: [
          { path: "first", url: "https://example.com/first.png", name: "first.png", position: 0 },
          { path: "second", url: "https://example.com/second.png", name: "second.png", position: 1 },
        ],
      },
    ],
  }],
};

it("builds a workbook with inline text and embedded images", async () => {
  const files = await buildXlsxPackage(model, async () => ({
    bytes: Uint8Array.from([137, 80, 78, 71]),
    extension: "png",
  }));

  const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
  expect(sheet).toContain("镜号");
  expect(sheet).toContain("开场");
  expect(sheet).toContain("项目名称：测试 &amp; 项目");
  expect(sheet).toContain("画幅比例：16:9");
  expect(sheet).toContain("镜头总数：1");
  expect(sheet).toContain('ht="160"');
  expect(files.has("xl/media/image1.png")).toBe(true);
  expect(files.has("xl/media/image2.png")).toBe(true);
  expect(new TextDecoder().decode(files.get("xl/drawings/drawing1.xml")))
    .toContain("xdr:twoCellAnchor");
});

it("keeps the workbook usable when an image fails to load", async () => {
  const files = await buildXlsxPackage(
    model,
    async () => {
      throw new Error("network unavailable");
    },
    async () => ({
      bytes: Uint8Array.from([137, 80, 78, 71]),
      extension: "png",
    }),
  );

  expect(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")))
    .toContain("图片加载失败");
});

it("keeps mixed image slots stable and embeds a visible placeholder for each failure", async () => {
  const mixedModel: ExportModel = {
    ...model,
    rows: [{
      ...model.rows[0],
      cells: model.rows[0].cells.map((cell) => cell.fieldId === "frame" ? {
        ...cell,
        images: [
          { path: "first", url: "https://example.com/first.png", name: "first.png", position: 0 },
          { path: "broken", url: "https://example.com/broken.png", name: "broken.png", position: 1 },
          { path: "third", url: "https://example.com/third.png", name: "third.png", position: 2 },
        ],
      } : cell),
    }],
  };
  const placeholderBytes = validPngBytes();
  const createFailurePlaceholder = vi.fn(async () => ({
    bytes: placeholderBytes,
    extension: "png" as const,
  }));

  const files = await buildXlsxPackage(
    mixedModel,
    async (url) => {
      if (url.includes("broken")) throw new Error("network unavailable");
      return {
        bytes: new TextEncoder().encode(url.includes("first") ? "FIRST" : "THIRD"),
        extension: "png",
      };
    },
    createFailurePlaceholder,
  );

  const drawing = new TextDecoder().decode(files.get("xl/drawings/drawing1.xml"));
  const startOffsets = [...drawing.matchAll(
    /<xdr:from><xdr:col>2<\/xdr:col><xdr:colOff>0<\/xdr:colOff><xdr:row>4<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff>/g,
  )].map((match) => Number(match[1]));

  expect(startOffsets).toEqual([0, 423333, 846666]);
  expect(files.get("xl/media/image1.png")).toEqual(new TextEncoder().encode("FIRST"));
  expect(files.get("xl/media/image2.png")).toEqual(placeholderBytes);
  expect(files.get("xl/media/image3.png")).toEqual(new TextEncoder().encode("THIRD"));
  expect(createFailurePlaceholder).toHaveBeenCalledTimes(1);
  expect(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")))
    .toContain("图片加载失败");
});

it("transcodes a browser-decodable WebP upload to PNG before embedding", async () => {
  const webpModel: ExportModel = {
    ...model,
    rows: [{
      ...model.rows[0],
      cells: model.rows[0].cells.map((cell) => cell.fieldId === "frame" ? {
        ...cell,
        images: [{
          path: "webp",
          url: "https://example.com/frame.webp",
          name: "frame.webp",
          position: 0,
        }],
      } : cell),
    }],
  };
  const webpBlob = new Blob([Uint8Array.from([82, 73, 70, 70])], { type: "image/webp" });
  const fetchImage = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/webp" }),
    blob: async () => webpBlob,
  }) as Response);
  const bitmap = { width: 4, height: 2, close: vi.fn() };
  const decodeImage = vi.fn(async () => bitmap as unknown as ImageBitmap);
  const drawImage = vi.fn();
  const pngBytes = validPngBytes();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (callback: BlobCallback, type?: string) => {
      expect(type).toBe("image/png");
      callback(new Blob([new Uint8Array(pngBytes)], { type: "image/png" }));
    },
  } as unknown as HTMLCanvasElement;
  const createCanvas = vi.fn(() => canvas);
  const createFailurePlaceholder = vi.fn(async () => ({
    bytes: new TextEncoder().encode("FAIL"),
    extension: "png" as const,
  }));

  const files = await buildXlsxPackage(
    webpModel,
    undefined,
    createFailurePlaceholder,
    { fetch: fetchImage, createImageBitmap: decodeImage, createCanvas },
  );

  expect(files.get("xl/media/image1.png")).toEqual(pngBytes);
  expect(fetchImage).toHaveBeenCalledWith("https://example.com/frame.webp");
  expect(decodeImage).toHaveBeenCalledWith(webpBlob);
  expect(createCanvas).toHaveBeenCalledWith(4, 2);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 4, 2);
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(createFailurePlaceholder).not.toHaveBeenCalled();
});

it("draws the default Chinese failure tile into a valid PNG media slot", async () => {
  const pngBytes = validPngBytes();
  const fillText = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText,
    }),
    toBlob: (callback: BlobCallback) => {
      callback(new Blob([new Uint8Array(pngBytes)], { type: "image/png" }));
    },
  } as unknown as HTMLCanvasElement;
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName, options) =>
    tagName === "canvas" ? canvas : originalCreateElement(tagName, options)
  );

  const files = await buildXlsxPackage(model, async () => {
    throw new Error("network unavailable");
  });

  expect(fillText).toHaveBeenCalledWith("图片加载失败", 160, 90);
  expect(files.get("xl/media/image1.png")).toEqual(pngBytes);
  expect(files.get("xl/media/image2.png")).toEqual(pngBytes);
  expect(new TextDecoder().decode(files.get("xl/drawings/drawing1.xml"))
    .match(/<xdr:twoCellAnchor/g)).toHaveLength(2);
});

it("encodes forbidden controls and preserves literal SpreadsheetML escape tokens", async () => {
  const files = await buildXlsxPackage({
    title: "编码测试",
    aspectRatio: "16:9",
    shotCount: 1,
    fields: [
      { id: "text", label: "列\u0001_x0001_", type: "text", visible: true, order: 0 },
    ],
    rows: [{
      shotId: "1",
      cells: [{
        fieldId: "text",
        fieldType: "text",
        text: "值\u000b_x0001_",
        images: [],
      }],
    }],
  });

  const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
  expect(sheet).not.toContain("\u0001");
  expect(sheet).not.toContain("\u000b");
  expect(sheet).toContain("列_x0001__x005F_x0001_");
  expect(sheet).toContain("值_x000B__x005F_x0001_");
});

it("adds a temporary logo to every printed Excel page header", async () => {
  const files = await buildXlsxPackage(
    model,
    async () => ({ bytes: validPngBytes(), extension: "png" }),
    undefined,
    {},
    { logo: { name: "logo.png", url: "blob:logo", type: "image/png" } },
  );

  const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
  expect(sheet).toContain("&amp;R&amp;G");
  expect(sheet).toContain("legacyDrawingHF");
  expect(files.has("xl/drawings/vmlDrawing1.vml")).toBe(true);
  expect(files.has("xl/media/logo.png")).toBe(true);
});
