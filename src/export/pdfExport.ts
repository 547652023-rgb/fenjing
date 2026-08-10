import type { FieldDefinition, StoryboardProject } from "../domain/storyboard";
import { downloadBlob } from "./download";
import {
  buildExportModel,
  exportFilename,
  type ExportOptions,
  type ExportModel,
  type ExportRow,
} from "./storyboardExport";

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const PDF_PAGE_WIDTH = 842;
const PDF_PAGE_HEIGHT = 595;
const PAGE_MARGIN = 32;
const TITLE_HEIGHT = 50;
const HEADER_HEIGHT = 42;
const IMAGE_ROW_HEIGHT = 96;
const TEXT_ROW_HEIGHT = 52;
const TEXT_PADDING = 8;
const TEXT_LINE_HEIGHT = 19;
const BODY_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2 - TITLE_HEIGHT - HEADER_HEIGHT;
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", sans-serif';
const BODY_FONT = `14px ${FONT_FAMILY}`;

export type PdfLayoutRow = ExportRow & {
  height: number;
  cellLines: string[][];
  showImages: boolean;
};

export type PdfLayoutPage = { rows: PdfLayoutRow[] };

export type PdfLayout = {
  width: number;
  height: number;
  title: string;
  aspectRatio: string;
  shotCount: number;
  fields: FieldDefinition[];
  pages: PdfLayoutPage[];
};

export type PdfPageImage = {
  width: number;
  height: number;
  jpeg: Uint8Array;
};

export type PdfRenderDependencies = {
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  loadImage?: (url: string) => Promise<CanvasImageSource>;
};

export type PdfRenderer = (model: ExportModel, options?: ExportOptions) => Promise<PdfPageImage[]>;

function minimumRowHeight(fields: FieldDefinition[]): number {
  return fields.some((field) => field.type === "image")
    ? IMAGE_ROW_HEIGHT
    : TEXT_ROW_HEIGHT;
}

function imageRowHeight(row: ExportRow, fields: FieldDefinition[]): number {
  const imageCount = Math.max(
    1,
    ...row.cells
      .filter((cell) => cell.fieldType === "image")
      .map((cell) => Math.max(1, cell.images.length)),
  );
  return fields.some((field) => field.type === "image")
    ? IMAGE_ROW_HEIGHT * imageCount
    : TEXT_ROW_HEIGHT;
}

function fieldWeights(fields: FieldDefinition[]): number[] {
  return fields.map((field) => {
    if (field.type === "image") return 2.4;
    if (field.type === "number" || field.type === "date") return 0.75;
    return 1.25;
  });
}

function fieldWidths(fields: FieldDefinition[]): number[] {
  if (fields.length === 0) return [];
  const available = PAGE_WIDTH - PAGE_MARGIN * 2;
  const weights = fieldWeights(fields);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => available * weight / totalWeight);
  widths[widths.length - 1] = available
    - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
  return widths;
}

function wrapText(
  text: string,
  maxWidth: number,
  measureText: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && measureText(candidate) > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function textHeight(lineCount: number): number {
  return TEXT_PADDING * 2 + Math.max(1, lineCount) * TEXT_LINE_HEIGHT;
}

export function buildPdfLayout(
  model: ExportModel,
  measureText: (text: string) => number = (text) => text.length * 8,
): PdfLayout {
  const pages: PdfLayoutPage[] = [];
  const widths = fieldWidths(model.fields);
  const baseHeight = minimumRowHeight(model.fields);
  let page: PdfLayoutPage = { rows: [] };
  let usedHeight = 0;

  const finishPage = () => {
    pages.push(page);
    page = { rows: [] };
    usedHeight = 0;
  };

  for (const row of model.rows) {
    const allCellLines = model.fields.map((field, index) => {
      if (field.type === "image") return [];
      return wrapText(
        row.cells[index]?.text ?? "",
        Math.max(1, widths[index] - TEXT_PADDING * 2),
        measureText,
      );
    });
    const maximumLineCount = Math.max(0, ...allCellLines.map((lines) => lines.length));
    const fullHeight = Math.max(baseHeight, imageRowHeight(row, model.fields), textHeight(maximumLineCount));

    if (fullHeight <= BODY_HEIGHT) {
      if (page.rows.length > 0 && usedHeight + fullHeight > BODY_HEIGHT) finishPage();
      page.rows.push({
        ...row,
        height: fullHeight,
        cellLines: allCellLines,
        showImages: true,
      });
      usedHeight += fullHeight;
      continue;
    }

    let lineOffset = 0;
    let firstSegment = true;
    while (lineOffset < maximumLineCount) {
      const minimumHeight = firstSegment ? baseHeight : TEXT_ROW_HEIGHT;
      if (page.rows.length > 0 && BODY_HEIGHT - usedHeight < minimumHeight) finishPage();

      const availableHeight = BODY_HEIGHT - usedHeight;
      const lineCapacity = Math.max(
        1,
        Math.floor((availableHeight - TEXT_PADDING * 2) / TEXT_LINE_HEIGHT),
      );
      const lineCount = Math.min(lineCapacity, maximumLineCount - lineOffset);
      const cellLines = allCellLines.map((lines) => lines.slice(lineOffset, lineOffset + lineCount));
      const segmentLineCount = Math.max(0, ...cellLines.map((lines) => lines.length));
      const height = Math.max(minimumHeight, textHeight(segmentLineCount));

      page.rows.push({
        ...row,
        height,
        cellLines,
        showImages: firstSegment,
      });
      usedHeight += height;
      lineOffset += lineCount;
      firstSegment = false;

      if (lineOffset < maximumLineCount) finishPage();
    }
  }
  if (page.rows.length > 0 || pages.length === 0) pages.push(page);

  return {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    title: model.title,
    aspectRatio: model.aspectRatio,
    shotCount: model.shotCount,
    fields: model.fields,
    pages,
  };
}

function createBrowserCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadRemoteImage(url: string): Promise<CanvasImageSource> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
  return createImageBitmap(await response.blob());
}

function drawTextLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
): void {
  context.fillStyle = "#111827";
  context.font = BODY_FONT;
  context.textAlign = "left";
  context.textBaseline = "top";
  lines.forEach((line, index) => {
    context.fillText(
      line,
      x + TEXT_PADDING,
      y + TEXT_PADDING + index * TEXT_LINE_HEIGHT,
    );
  });
}

async function drawImageCell(
  context: CanvasRenderingContext2D,
  images: ExportRow["cells"][number]["images"],
  x: number,
  y: number,
  width: number,
  height: number,
  loadImage: (url: string) => Promise<CanvasImageSource>,
): Promise<void> {
  if (images.length === 0) return;
  const loaded = await Promise.all(images.map(async (image) => {
    try {
      return { image: await loadImage(image.url) };
    } catch {
      return { image: null };
    }
  }));
  const slotHeight = height / images.length;

  loaded.forEach(({ image }, index) => {
    const slotY = y + slotHeight * index;
    if (image) {
      context.drawImage(image, x, slotY, width, slotHeight);
      return;
    }
    context.fillStyle = "#b91c1c";
    context.font = `13px ${FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("图片加载失败", x + width / 2, slotY + slotHeight / 2);
  });
}

function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read JPEG blob"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas JPEG encoding failed"));
        return;
      }
      blobBytes(blob).then(resolve, reject);
    }, "image/jpeg", 0.92);
  });
}

export async function renderPdfPages(
  model: ExportModel,
  dependencies: PdfRenderDependencies = {},
  options: ExportOptions = {},
): Promise<PdfPageImage[]> {
  const createCanvas = dependencies.createCanvas ?? createBrowserCanvas;
  const loadImage = dependencies.loadImage ?? loadRemoteImage;
  const firstCanvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const firstContext = firstCanvas.getContext("2d");
  if (!firstContext) throw new Error("Canvas 2D context is unavailable");
  firstContext.font = BODY_FONT;
  const layout = buildPdfLayout(model, (text) => firstContext.measureText(text).width);
  const widths = fieldWidths(layout.fields);
  const rendered: PdfPageImage[] = [];

  for (const [pageIndex, page] of layout.pages.entries()) {
    const canvas = pageIndex === 0 ? firstCanvas : createCanvas(layout.width, layout.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, layout.width, layout.height);
    context.fillStyle = "#111827";
    context.font = `bold 24px ${FONT_FAMILY}`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(layout.title, PAGE_MARGIN, PAGE_MARGIN + TITLE_HEIGHT / 2);

    if (options.logo) {
      try {
        const logo = await loadImage(options.logo.url);
        const logoWidth = 118;
        const logoHeight = 36;
        context.drawImage(logo, layout.width - PAGE_MARGIN - logoWidth, PAGE_MARGIN + 7, logoWidth, logoHeight);
      } catch {
        // A failed temporary logo must not prevent storyboard export.
      }
    }

    if (pageIndex === 0) {
      context.font = `14px ${FONT_FAMILY}`;
      context.textAlign = "left";
      context.fillText(
        `画幅比例：${layout.aspectRatio}    镜头总数：${layout.shotCount}`,
        PAGE_MARGIN,
        PAGE_MARGIN + TITLE_HEIGHT + 16,
      );
    }

    let y = PAGE_MARGIN + TITLE_HEIGHT + (pageIndex === 0 ? 28 : 0);
    let x = PAGE_MARGIN;
    layout.fields.forEach((field, index) => {
      const width = widths[index];
      context.fillStyle = "#15803d";
      context.fillRect(x, y, width, HEADER_HEIGHT);
      context.strokeStyle = "#374151";
      context.lineWidth = 1;
      context.strokeRect(x, y, width, HEADER_HEIGHT);
      context.fillStyle = "#ffffff";
      context.font = `bold 15px ${FONT_FAMILY}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(field.label, x + width / 2, y + HEADER_HEIGHT / 2);
      x += width;
    });
    y += HEADER_HEIGHT;

    for (const row of page.rows) {
      x = PAGE_MARGIN;
      for (let index = 0; index < layout.fields.length; index += 1) {
        const field = layout.fields[index];
        const width = widths[index];
        const cell = row.cells[index];
        if (field.type === "image") {
          if (row.showImages) {
            await drawImageCell(context, cell?.images ?? [], x, y, width, row.height, loadImage);
          }
        } else {
          drawTextLines(context, row.cellLines[index] ?? [], x, y);
        }
        context.strokeStyle = "#6b7280";
        context.lineWidth = 1;
        context.strokeRect(x, y, width, row.height);
        x += width;
      }
      y += row.height;
    }

    rendered.push({
      width: layout.width,
      height: layout.height,
      jpeg: await canvasJpeg(canvas),
    });
  }

  return rendered;
}

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function encodePdfPages(pages: PdfPageImage[]): Uint8Array {
  const objectCount = 2 + pages.length * 3;
  const objects: Uint8Array[] = Array.from({ length: objectCount + 1 });
  const pageIds = pages.map((_, index) => 3 + index * 3);

  objects[1] = bytes("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = bytes(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const width = Math.max(1, Math.round(page.width));
    const height = Math.max(1, Math.round(page.height));
    const content = bytes(
      `q\n${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`,
    );

    objects[pageId] = bytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] `
      + `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects[imageId] = joinBytes([
      bytes(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `
        + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode `
        + `/Length ${page.jpeg.length} >>\nstream\n`,
      ),
      page.jpeg,
      bytes("\nendstream"),
    ]);
    objects[contentId] = joinBytes([
      bytes(`<< /Length ${content.length} >>\nstream\n`),
      content,
      bytes("endstream"),
    ]);
  });

  const header = joinBytes([
    bytes("%PDF-1.4\n"),
    Uint8Array.from([0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]),
  ]);
  const documentParts: Uint8Array[] = [header];
  const offsets: number[] = Array.from({ length: objectCount + 1 }, () => 0);
  let documentLength = header.length;

  for (let id = 1; id <= objectCount; id += 1) {
    const object = joinBytes([
      bytes(`${id} 0 obj\n`),
      objects[id],
      bytes("\nendobj\n"),
    ]);
    offsets[id] = documentLength;
    documentParts.push(object);
    documentLength += object.length;
  }

  const xrefOffset = documentLength;
  const xrefEntries = offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  documentParts.push(bytes(
    `xref\n0 ${objectCount + 1}\n`
    + "0000000000 65535 f \n"
    + xrefEntries
    + `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`,
  ));

  return joinBytes(documentParts);
}

export async function exportStoryboardPdf(
  project: StoryboardProject,
  options: ExportOptions = {},
  render: PdfRenderer = (model, exportOptions) => renderPdfPages(model, {}, exportOptions),
): Promise<void> {
  const exportProject = options.documentLabel ? { ...project, title: `${project.title} · ${options.documentLabel}` } : project;
  const pages = await render(buildExportModel(exportProject), options);
  downloadBlob(
    new Blob([new Uint8Array(encodePdfPages(pages))], { type: "application/pdf" }),
    exportFilename(project, "pdf", new Date(), options.documentLabel),
  );
}
