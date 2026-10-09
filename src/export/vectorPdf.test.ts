// @ts-expect-error Node filesystem is available in Vitest, not in the browser build.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import * as pdfExport from "./pdfExport";
import * as download from "./download";
import { vi } from "vitest";
import type { ExportModel } from "./storyboardExport";

const model: ExportModel = {
  title: "清晰分镜测试", aspectRatio: "16:9", shotCount: 1,
  fields: [{ id: "content", label: "内容", type: "text", visible: true, order: 0 }],
  rows: [{ shotId: "one", cells: [{ fieldId: "content", fieldType: "text", text: "中文清晰，English 123", images: [] }] }],
};

it("uses vector output for the platform's default PDF download", async () => {
  const fontData = readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf");
  const fetchFont = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array(fontData).buffer } as Response);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  try {
    await pdfExport.exportStoryboardPdf({ id: "test", title: model.title, fields: model.fields, scenes: [], shots: [{ id: "one", values: { content: "平台导出文字" } }] });
    const blob = save.mock.calls[0][0];
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.context.enumerateIndirectObjects().some(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image")).toBe(false);
    expect(new TextDecoder().decode(bytes)).toMatch(/\/FontFile[23]/);
  } finally { fetchFont.mockRestore(); save.mockRestore(); }
});

it("keeps all five photo placements across pages instead of clipping a tall shot", async () => {
  const source: ExportModel = { ...model, fields: [{ id: "frame", label: "画面", type: "image", visible: true, order: 0 }], rows: [{ shotId: "one", cells: [{ fieldId: "frame", fieldType: "image", text: "", images: Array.from({ length: 5 }, (_, i) => ({ path: `photo-${i}`, url: `photo-${i}`, name: "photo.png", position: i })) }] }] };
  const image = new Uint8Array(readFileSync("src/assets/dapaidang-logo.png"));
  const bytes = await pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf")), loadImage: async () => image });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);
  const placements = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of("Subtype"))) return [];
    return [...new TextDecoder().decode(decodePDFRawStream(object).decode()).matchAll(/\bDo\n/g)];
  });
  expect(placements).toHaveLength(5);
});

it("makes wrapped headers tall enough instead of letting their last line escape the header", async () => {
  const source: ExportModel = { ...model, fields: Array.from({ length: 20 }, (_, order) => ({ id: `field-${order}`, label: "很长的自定义表头名称", type: "text", visible: true, order })), rows: [] };
  const bytes = await pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf")) });
  const pdf = await PDFDocument.load(bytes);
  const content = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    const value = new TextDecoder().decode(decodePDFRawStream(object).decode());
    return value.includes("\nBT\n") ? [value] : [];
  }).join("\n");
  const heights = [...content.matchAll(/0 0 m\n0 ([\d.]+) l/g)].map(match => Number(match[1]));
  expect(heights).toHaveLength(20);
  expect(heights.every(height => height >= 59)).toBe(true);
});

it("rejects a header that leaves no room for a shot instead of hanging pagination", async () => {
  const source: ExportModel = { ...model, fields: Array.from({ length: 20 }, (_, order) => ({ id: `field-${order}`, label: "超长字段名称".repeat(50), type: "text", visible: true, order })), rows: [] };
  await expect(pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf")) })).rejects.toThrow("字段名称");
});

it("exports visible embedded Chinese text and vector borders without a page screenshot", async () => {
  const build = (pdfExport as unknown as { buildVectorPdf?: Function }).buildVectorPdf;
  expect(build).toBeTypeOf("function");
  const bytes = await build!(model, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf")) });
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  const fonts: string[] = [];
  const contents: string[] = [];
  let imageCount = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") imageCount++;
    const text = new TextDecoder().decode(decodePDFRawStream(object).decode());
    if (text.includes("\nBT\n")) contents.push(text);
    if (text.includes("begincmap")) fonts.push(text);
  }
  expect(imageCount).toBe(0);
  expect(new TextDecoder().decode(bytes)).toMatch(/\/FontFile[23]/);
  expect(contents.join("\n")).toContain(" Tj");
  expect(contents.join("\n")).not.toContain("3 Tr");
  expect(contents.join("\n")).toMatch(/\bl\nh\nS\n/);
  expect(fonts.join("\n").toUpperCase()).toContain("4E2D");
});

it("embeds photos independently at native resolution, with a proportional black-backed logo", async () => {
  const build = (pdfExport as unknown as { buildVectorPdf?: Function }).buildVectorPdf;
  expect(build).toBeTypeOf("function");
  const source: ExportModel = { ...model, fields: [...model.fields, { id: "frame", label: "画面", type: "image", visible: true, order: 1 }], rows: [{ ...model.rows[0], cells: [...model.rows[0].cells, { fieldId: "frame", fieldType: "image", text: "", images: [{ path: "photo", url: "photo", name: "photo.png", position: 0 }] }] }] };
  const logo = new Uint8Array(readFileSync("src/assets/dapaidang-logo.png"));
  const bytes = await build!(source, { logo: { name: "大拍档logo.png", url: "logo", type: "image/png" } }, {
    fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansCJKsc-Regular.otf")),
    loadImage: async () => logo,
  });
  const pdf = await PDFDocument.load(bytes);
  const images = pdf.context.enumerateIndirectObjects().map(([, object]) => object).filter(object => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") as PDFRawStream[];
  expect(images.some(image => image.dict.get(PDFName.of("Width"))?.toString() === "600" && image.dict.get(PDFName.of("Height"))?.toString() === "110")).toBe(true);
  expect(images.every(image => Number(image.dict.get(PDFName.of("Width"))?.toString()) < 3369)).toBe(true);
});
