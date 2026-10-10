// @ts-expect-error Node filesystem is available in Vitest, not in the browser build.
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import * as pdfExport from "./pdfExport";
import * as download from "./download";
import { vi } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import type { ExportModel } from "./storyboardExport";

const model: ExportModel = {
  title: "清晰分镜测试", aspectRatio: "16:9", shotCount: 1,
  fields: [{ id: "content", label: "内容", type: "text", visible: true, order: 0 }],
  rows: [{ shotId: "one", cells: [{ fieldId: "content", fieldType: "text", text: "中文清晰，English 123", images: [] }] }],
};

it("centers numbers and multiline Chinese text inside a tall photo cell row", async () => {
  const source: ExportModel = { ...model, fields: [
    { id: "duration", label: "时长", type: "number", visible: true, order: 0 },
    { id: "frame", label: "画面", type: "image", visible: true, order: 1 },
    { id: "content", label: "内容", type: "text", visible: true, order: 2 },
  ], rows: [{ shotId: "one", cells: [
    { fieldId: "duration", fieldType: "number", text: "6", images: [] },
    { fieldId: "frame", fieldType: "image", text: "", images: [0, 1].map(position => ({ path: `photo-${position}`, url: "photo", name: "photo.png", position })) },
    { fieldId: "content", fieldType: "text", text: "中文\n说明", images: [] },
  ] }] };
  const fontBytes = new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf"));
  const bytes = await pdfExport.buildVectorPdf(source, {}, { fontBytes, loadImage: async () => new Uint8Array(readFileSync("src/assets/dapaidang-logo.png")) });
  const pdf = await PDFDocument.load(bytes);
  const content = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of("Subtype"))) return [];
    const decoded = new TextDecoder().decode(decodePDFRawStream(object).decode());
    return decoded.includes("\nBT\n") ? [decoded] : [];
  }).join("\n");
  const body = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\n<[^>]+> Tj/g)].slice(-3);
  expect(body).toHaveLength(3);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const scale = 842 / 1123;
  const ascent = font.heightAtSize(14, { descender: false });
  const glyphHeight = font.heightAtSize(14, { descender: true });
  const centerOffset = (ascent - glyphHeight / 2) * scale;
  const xCenters = [122.255681818, 940.573863636, 940.573863636];
  for (const [index, value] of ["6", "中文", "说明"].entries()) {
    expect(Number(body[index][1]) + font.widthOfTextAtSize(value, 14) * scale / 2).toBeCloseTo(xCenters[index] * scale, 3);
  }
  const rowCenter = 595 - 296 * scale;
  expect(Number(body[0][2]) + centerOffset).toBeCloseTo(rowCenter, 3);
  expect((Number(body[1][2]) + Number(body[2][2])) / 2 + centerOffset).toBeCloseTo(rowCenter, 3);
  expect(Number(body[1][2]) - Number(body[2][2])).toBeCloseTo(19 * scale, 3);
});

it("uses vector output for the platform's default PDF download", async () => {
  const fontData = readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf");
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
  const bytes = await pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf")), loadImage: async () => image });
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
  const bytes = await pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf")) });
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
  await expect(pdfExport.buildVectorPdf(source, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf")) })).rejects.toThrow("字段名称");
});

it("exports visible embedded Chinese text and vector borders without a page screenshot", async () => {
  const build = (pdfExport as unknown as { buildVectorPdf?: Function }).buildVectorPdf;
  expect(build).toBeTypeOf("function");
  const bytes = await build!(model, {}, { fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf")) });
  const pdf = await PDFDocument.load(bytes);
  // A structural CMap check alone missed broken CJK subsets. Preserve the real
  // complete TrueType program, whose CID glyph IDs match the visible outlines.
  const fontResource = pdf.getPages()[0].node.Resources()!.lookup(PDFName.of("Font")) as any;
  const embeddedFont = pdf.context.lookup(fontResource.values()[0]) as any;
  const descendants = embeddedFont.lookup(PDFName.of("DescendantFonts")) as any;
  const descriptor = descendants.lookup(0).lookup(PDFName.of("FontDescriptor")) as any;
  const program = descriptor.lookup(PDFName.of("FontFile2")) as PDFRawStream;
  const embeddedBytes = decodePDFRawStream(program).decode();
  const sourceBytes = readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf");
  expect(embeddedBytes.byteLength).toBe(sourceBytes.byteLength);
  expect(embeddedBytes.every((byte, index) => byte === sourceBytes[index])).toBe(true);
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
    fontBytes: new Uint8Array(readFileSync("src/assets/fonts/NotoSansSC-Regular.ttf")),
    loadImage: async () => logo,
  });
  const pdf = await PDFDocument.load(bytes);
  const images = pdf.context.enumerateIndirectObjects().map(([, object]) => object).filter(object => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image") as PDFRawStream[];
  expect(images.some(image => image.dict.get(PDFName.of("Width"))?.toString() === "600" && image.dict.get(PDFName.of("Height"))?.toString() === "110")).toBe(true);
  expect(images.every(image => Number(image.dict.get(PDFName.of("Width"))?.toString()) < 3369)).toBe(true);
});
