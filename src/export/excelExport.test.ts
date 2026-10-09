import { afterEach, vi } from "vitest";
import type { ExportModel } from "./storyboardExport";
import { buildShootDayXlsxPackage, buildXlsxPackage } from "./excelExport";
import { createProject } from "../domain/storyboard";
import { buildShootDayExportModel } from "./shootDayExport";

function validPngBytes(): Uint8Array {
  const binary = atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("uses the exported column width to fit long text without inflating image rows", async () => {
  const source: ExportModel = {
    ...model,
    fields: [...model.fields, { id: "durationSeconds", label: "时长（秒）", type: "number", visible: true, order: 3 }],
    rows: [{ ...model.rows[0], cells: model.rows[0].cells.map(cell =>
      cell.fieldId === "content" ? { ...cell, text: "分镜内容".repeat(20) } : cell.fieldId === "frame" ? { ...cell, images: cell.images.slice(0, 1) } : cell
    ) }],
  };
  const files = await buildXlsxPackage(source, async () => ({ bytes: validPngBytes(), extension: "png", width: 1920, height: 1080 }));
  const sheet = new DOMParser().parseFromString(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")), "application/xml");
  const widths = Array.from(sheet.getElementsByTagName("col")).map(col => Number(col.getAttribute("width")));
  expect(widths[1]).toBeGreaterThan(widths[0] * 2);
  expect(widths[1]).toBeGreaterThan(widths[3] * 2);
  expect(Number(sheet.querySelector('row[r="5"]')?.getAttribute("ht"))).toBe(104);
  expect(sheet.querySelector('c[r="B5"]')?.textContent).toBe("分镜内容".repeat(20));
});

it("keeps long custom text readable while fitting ordinary select fields compactly", async () => {
  const source: ExportModel = { ...model, fields: [
    { id: "scene", label: "场景", type: "text", visible: true, order: 0 },
    { id: "notes", label: "备注", type: "text", visible: true, order: 1 },
    { id: "custom", label: "自定义说明", type: "text", visible: true, order: 2 },
    { id: "shotSize", label: "景别", type: "singleSelect", visible: true, order: 3 },
  ], rows: [] };
  const files = await buildXlsxPackage(source);
  const sheet = new DOMParser().parseFromString(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")), "application/xml");
  const widths = Array.from(sheet.getElementsByTagName("col")).map(col => Number(col.getAttribute("width")));
  expect(widths.slice(0, 3).every(width => width >= 24)).toBe(true);
  expect(widths.slice(0, 3).every(width => width >= widths[3] * 2)).toBe(true);
});

it("gives long wrapped text enough height even when the row has an image", async () => {
  const source = { ...model, rows: [{ ...model.rows[0], cells: model.rows[0].cells.map(cell =>
    cell.fieldId === "content" ? { ...cell, text: "完整的分镜内容".repeat(20) } : cell
  ) }] };
  const files = await buildXlsxPackage(source, async () => ({ bytes: validPngBytes(), extension: "png", width: 1920, height: 1080 }));
  const sheet = new DOMParser().parseFromString(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")), "application/xml");
  expect(Number(sheet.querySelector('row[r="5"]')?.getAttribute("ht"))).toBeGreaterThan(160);
  expect(new TextDecoder().decode(files.get("xl/styles.xml"))).toContain('vertical="top"');
});

it("anchors photos at their original aspect ratio inside their cells", async () => {
  const files = await buildXlsxPackage(model, async () => ({ bytes: validPngBytes(), extension: "png", width: 1920, height: 1080 }));
  const drawing = new DOMParser().parseFromString(new TextDecoder().decode(files.get("xl/drawings/drawing1.xml")), "application/xml");
  const extents = Array.from(drawing.getElementsByTagName("xdr:ext"));
  expect(extents).toHaveLength(2);
  extents.forEach(ext => expect(Number(ext.getAttribute("cx")) / Number(ext.getAttribute("cy"))).toBeCloseTo(16 / 9, 4));
});

it("continues oversized text and five photos without exceeding Excel's maximum row height", async () => {
  const source = { ...model, rows: [{ ...model.rows[0], cells: model.rows[0].cells.map(cell => cell.fieldId === "content" ? { ...cell, text: Array.from({ length: 60 }, (_, i) => `内容${i}`).join("\n") } : cell.fieldId === "frame" ? { ...cell, images: Array.from({ length: 5 }, (_, i) => ({ ...cell.images[0], path: `frame-${i}` })) } : cell) }] };
  const files = await buildXlsxPackage(source, async () => ({ bytes: validPngBytes(), extension: "png", width: 1920, height: 1080 }));
  const sheet = new DOMParser().parseFromString(new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml")), "application/xml");
  const rows = Array.from(sheet.getElementsByTagName("row")).filter(row => Number(row.getAttribute("r")) >= 5);
  expect(rows).toHaveLength(3);
  rows.forEach(row => expect(Number(row.getAttribute("ht"))).toBeLessThanOrEqual(409));
  const text = rows.flatMap(row => Array.from(row.getElementsByTagName("c")).filter(cell => cell.getAttribute("r")?.startsWith("B")).map(cell => cell.textContent)).join("\n");
  expect(text).toBe(source.rows[0].cells[1].text);
  expect([...files.keys()].filter(name => /xl\/media\/image\d/.test(name))).toHaveLength(5);
});

it("exports a black-backed default logo with the correct printed aspect ratio", async () => {
  const fillRect = vi.fn();
  const drawImage = vi.fn();
  const context = { fillStyle: "", fillRect, drawImage };
  const files = await buildXlsxPackage({ ...model, rows: [] }, async () => ({ bytes: validPngBytes(), extension: "png", width: 600, height: 110 }), undefined, {
    createImageBitmap: async () => ({ width: 600, height: 110, close: vi.fn() }) as unknown as ImageBitmap,
    createCanvas: () => ({ getContext: () => context, toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array(validPngBytes())], { type: "image/png" })) }) as unknown as HTMLCanvasElement,
  }, { logo: { name: "大拍档logo.png", url: "blob:logo", type: "image/png" } });
  expect(context.fillStyle).toBe("#000000");
  expect(fillRect).toHaveBeenCalledWith(0, 0, 600, 110);
  expect(drawImage).toHaveBeenCalled();
  const vml = new TextDecoder().decode(files.get("xl/drawings/vmlDrawing1.vml"));
  const size = vml.match(/width:([\d.]+)pt;height:([\d.]+)pt/);
  expect(Number(size?.[1]) / Number(size?.[2])).toBeCloseTo(600 / 110, 2);
});

it("builds a two-sheet workbook for a shoot day", async () => {
  const project = { ...createProject(), title: "广告片" };
  project.shootDays = [{ id: "day-1", projectId: project.id, title: "首日外景", shootDate: "2026-08-23", location: "测试棚 A", callTime: "09:00", wrapTime: "18:00", coordinator: "制片", notes: "", weather: "阵雨", rainPlan: "", safetyNotes: "天台作业系安全绳", emergencyContactName: "王制片", emergencyContactRole: "制片", emergencyContactPhone: "13800000000", order: 0 }];
  project.shots = [{ id: "shot-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "开场" } }];
  const files = await buildShootDayXlsxPackage(buildShootDayExportModel(project, "day-1"));
  const read = (name: string) => new TextDecoder().decode(files.get(name));
  expect(read("xl/workbook.xml")).toContain('sheet name="拍摄日信息"');
  expect(read("xl/workbook.xml")).toContain('sheet name="镜头执行表"');
  expect(read("xl/worksheets/sheet1.xml")).toContain("测试棚 A");
  expect(read("xl/worksheets/sheet1.xml")).toContain("天气");
  expect(read("xl/worksheets/sheet1.xml")).toContain("阵雨");
  expect(read("xl/worksheets/sheet1.xml")).toContain("安全提示");
  expect(read("xl/worksheets/sheet1.xml")).toContain("王制片 · 制片 · 13800000000");
  expect(read("xl/worksheets/sheet1.xml")).not.toContain("雨天备选方案");
  expect(read("xl/worksheets/sheet2.xml")).toContain("镜号");
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
  expect(sheet).toContain('ht="208"');
  expect(files.has("xl/media/image1.png")).toBe(true);
  expect(files.has("xl/media/image2.png")).toBe(true);
  expect(new TextDecoder().decode(files.get("xl/drawings/drawing1.xml")))
    .toContain("xdr:oneCellAnchor");
  expect(new TextDecoder().decode(files.get("xl/workbook.xml")))
    .toContain("_xlnm.Print_Titles");
  expect(sheet).toContain('fitToWidth="1"');
  expect(new TextDecoder().decode(files.get("xl/styles.xml")))
    .toContain('fgColor rgb="FF000000"');
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
  const xml = new DOMParser().parseFromString(drawing, "application/xml");
  const centers = Array.from(xml.getElementsByTagName("xdr:oneCellAnchor")).map(anchor =>
    Number(anchor.getElementsByTagName("xdr:rowOff")[0].textContent) + Number(anchor.getElementsByTagName("xdr:ext")[0].getAttribute("cy")) / 2
  );
  expect(centers).toHaveLength(3);
  expect(centers[1] - centers[0]).toBeCloseTo(104 * 12700, 0);
  expect(centers[2] - centers[1]).toBeCloseTo(104 * 12700, 0);
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
    .match(/<xdr:oneCellAnchor/g)).toHaveLength(2);
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
