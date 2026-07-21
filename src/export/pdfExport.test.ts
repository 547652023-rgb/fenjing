import { vi } from "vitest";
import type { StoryboardProject } from "../domain/storyboard";
import { buildExportModel } from "./storyboardExport";
import {
  buildPdfLayout,
  encodePdfPages,
  renderPdfPages,
} from "./pdfExport";

function createPdfProject(): StoryboardProject {
  const frameImages = JSON.stringify([
    {
      path: "first",
      url: "https://example.com/first.jpg",
      name: "first.jpg",
      position: 0,
    },
    {
      path: "broken",
      url: "https://example.com/broken.jpg",
      name: "broken.jpg",
      position: 1,
    },
  ]);

  return {
    id: "pdf-project",
    title: "测试分镜",
    fields: [
      { id: "shotNumber", label: "镜号", type: "number", visible: true, order: 0 },
      { id: "frame", label: "画面", type: "image", visible: true, order: 1 },
      { id: "reference", label: "参考", type: "image", visible: false, order: 2 },
      { id: "content", label: "内容", type: "text", visible: true, order: 3 },
    ],
    shots: Array.from({ length: 7 }, (_, index) => ({
      id: `shot-${index + 1}`,
      values: {
        shotNumber: String(index + 1),
        frame: index === 0 ? frameImages : "[]",
        content: `第${index + 1}镜内容`,
      },
    })),
  };
}

it("preserves visible field and shot order across deterministic PDF pages", () => {
  const project = createPdfProject();
  const layout = buildPdfLayout(buildExportModel(project));

  expect(layout.fields.map((field) => field.label)).toEqual(["镜号", "画面", "内容"]);
  expect(layout.pages.flatMap((page) => page.rows).map((row) => row.shotId))
    .toEqual(project.shots.map((shot) => shot.id));
  expect(layout.pages.length).toBeGreaterThan(1);
});

it("encodes JPEG pages in a PDF 1.4 document", () => {
  const jpeg = Uint8Array.from([255, 216, 1, 2, 3, 255, 217]);
  const pdf = encodePdfPages([
    { width: 2, height: 2, jpeg },
  ]);
  const text = new TextDecoder().decode(pdf);
  const xrefOffset = Number(text.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  const xrefLines = text.slice(xrefOffset).split("\n");

  expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
  expect(new TextDecoder().decode(pdf.slice(xrefOffset, xrefOffset + 4))).toBe("xref");
  expect(xrefLines.slice(3, 8)).toHaveLength(5);
  xrefLines.slice(3, 8).forEach((line, index) => {
    const objectOffset = Number(line.slice(0, 10));
    expect(new TextDecoder().decode(pdf.slice(objectOffset, objectOffset + 7)))
      .toBe(`${index + 1} 0 obj`);
  });
  expect(text).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
  expect([...pdf].some((byte, index) =>
    jpeg.every((jpegByte, jpegIndex) => pdf[index + jpegIndex] === jpegByte)
  )).toBe(true);
  expect(text).toContain("%%EOF");
});

it("uses A4 landscape points while preserving JPEG pixel dimensions", () => {
  const text = new TextDecoder().decode(encodePdfPages([
    { width: 1123, height: 794, jpeg: Uint8Array.from([1, 2, 3]) },
  ]));

  expect(text).toContain("/MediaBox [0 0 842 595]");
  expect(text).toContain("q\n842 0 0 595 0 0 cm\n/Im0 Do");
  expect(text).toContain("/Width 1123 /Height 794");
});

it("draws an image failure marker and still returns JPEG page bytes", async () => {
  const fillText = vi.fn();
  const drawImage = vi.fn();
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText,
    drawImage,
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
  const jpeg = Uint8Array.from([255, 216, 255, 217]);
  const createCanvas = vi.fn(() => ({
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([jpeg], { type: "image/jpeg" })),
  }) as unknown as HTMLCanvasElement);
  const loadImage = vi.fn(async (url: string) => {
    if (url.includes("broken")) throw new Error("image unavailable");
    return {} as CanvasImageSource;
  });

  const pages = await renderPdfPages(buildExportModel(createPdfProject()), {
    createCanvas,
    loadImage,
  });

  expect(fillText.mock.calls.some(([text]) => text === "图片加载失败")).toBe(true);
  expect(drawImage).toHaveBeenCalled();
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.every((page) => Array.from(page.jpeg).join(",") === "255,216,255,217"))
    .toBe(true);
});

it("renders every line of a long text cell across variable-height pages", async () => {
  const sourceLines = Array.from(
    { length: 80 },
    (_, index) => `长内容第${String(index + 1).padStart(2, "0")}行`,
  );
  const model = {
    title: "长内容测试",
    aspectRatio: "16:9",
    shotCount: 1,
    fields: [
      { id: "content", label: "内容", type: "text" as const, visible: true, order: 0 },
    ],
    rows: [{
      shotId: "long-shot",
      cells: [{
        fieldId: "content",
        fieldType: "text" as const,
        text: sourceLines.join("\n"),
        images: [],
      }],
    }],
  };
  const fillText = vi.fn();
  const measuredFonts: string[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText,
    drawImage: vi.fn(),
    measureText(text: string) {
      measuredFonts.push(this.font);
      return { width: text.length * 8 };
    },
  };
  const jpeg = Uint8Array.from([255, 216, 255, 217]);
  const createCanvas = vi.fn(() => ({
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([jpeg], { type: "image/jpeg" })),
  }) as unknown as HTMLCanvasElement);

  const pages = await renderPdfPages(model, { createCanvas });
  const renderedBodyLines = fillText.mock.calls
    .map(([text]) => text as string)
    .filter((text) => text.startsWith("长内容第"));

  expect(pages.length).toBeGreaterThan(1);
  expect(renderedBodyLines).toEqual(sourceLines);
  expect(measuredFonts.length).toBeGreaterThan(0);
  expect(measuredFonts.every((font) => font === '14px "PingFang SC", "Microsoft YaHei", sans-serif'))
    .toBe(true);
});

it("renders one titled header page for an empty project", async () => {
  const project = createPdfProject();
  project.shots = [];
  const fillText = vi.fn();
  const jpeg = Uint8Array.from([255, 216, 255, 217]);
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText,
    drawImage: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
  const createCanvas = vi.fn(() => ({
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([jpeg], { type: "image/jpeg" })),
  }) as unknown as HTMLCanvasElement);

  const pages = await renderPdfPages(buildExportModel(project), { createCanvas });

  expect(pages).toHaveLength(1);
  expect(fillText.mock.calls.map(([text]) => text)).toEqual([
    "测试分镜",
    "画幅比例：16:9    镜头总数：0",
    "镜号",
    "画面",
    "内容",
  ]);
  expect(pages[0].jpeg).toEqual(jpeg);
});

it("draws the temporary export logo on every PDF page", async () => {
  const drawImage = vi.fn();
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "start", textBaseline: "alphabetic",
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage,
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
  const jpeg = Uint8Array.from([255, 216, 255, 217]);
  const createCanvas = vi.fn(() => ({
    getContext: () => context,
    toBlob: (callback: BlobCallback) => callback(new Blob([jpeg], { type: "image/jpeg" })),
  }) as unknown as HTMLCanvasElement);
  const loadImage = vi.fn(async (_url: string) => ({} as CanvasImageSource));

  const pages = await renderPdfPages(buildExportModel(createPdfProject()), { createCanvas, loadImage }, {
    logo: { name: "logo.png", url: "blob:logo", type: "image/png" },
  });

  expect(pages.length).toBeGreaterThan(1);
  expect(loadImage.mock.calls.filter(([url]) => url === "blob:logo")).toHaveLength(pages.length);
});
