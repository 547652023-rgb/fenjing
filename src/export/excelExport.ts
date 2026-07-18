import type { StoryboardProject } from "../domain/storyboard";
import { downloadBlob } from "./download";
import {
  buildExportModel,
  exportFilename,
  type ExportModel,
} from "./storyboardExport";
import { createZip } from "./zip";

export type LoadedImage = {
  bytes: Uint8Array;
  extension: "png" | "jpeg" | "gif";
};

export type XlsxImageLoadDependencies = {
  fetch?: typeof fetch;
  createImageBitmap?: (image: ImageBitmapSource) => Promise<ImageBitmap>;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
};

type EmbeddedImage = LoadedImage & {
  relationshipId: string;
  mediaName: string;
};

type CellAnchor = {
  column: number;
  row: number;
  images: EmbeddedImage[];
};

const encoder = new TextEncoder();
const CELL_WIDTH_EMU = 2_181_225;
const ROW_HEIGHT_EMU = 1_270_000;

function spreadsheetText(value: string): string {
  return value
    .replace(/_x[0-9a-fA-F]{4}_/g, (token) => `_x005F_${token.slice(1)}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, (character) =>
      `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`
    )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function inlineCell(column: number, row: number, value: string, style?: number): string {
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  return `<c r="${columnName(column)}${row}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${spreadsheetText(value)}</t></is></c>`;
}

function imageExtension(
  contentType: string | null,
  url: string,
): LoadedImage["extension"] | null {
  const normalizedType = contentType?.split(";", 1)[0].trim().toLowerCase();
  if (normalizedType === "image/png") return "png";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") return "jpeg";
  if (normalizedType === "image/gif") return "gif";
  if (normalizedType?.startsWith("image/")) return null;

  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (pathname.endsWith(".png")) return "png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "jpeg";
  if (pathname.endsWith(".gif")) return "gif";
  return null;
}

function createBrowserImageCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadRemoteImage(
  url: string,
  dependencies: XlsxImageLoadDependencies = {},
): Promise<LoadedImage> {
  const fetchImage = dependencies.fetch ?? fetch;
  const response = await fetchImage(url);
  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const extension = imageExtension(response.headers.get("content-type") || blob.type, url);
  if (extension) return { bytes: await blobBytes(blob), extension };

  const decodeImage = dependencies.createImageBitmap ?? createImageBitmap;
  const createCanvas = dependencies.createCanvas ?? createBrowserImageCanvas;
  const bitmap = await decodeImage(blob);
  try {
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);
    const canvas = createCanvas(width, height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvasPng(canvas);
  } finally {
    bitmap.close();
  }
}

function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

function canvasPng(canvas: HTMLCanvasElement): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas PNG encoding failed"));
        return;
      }
      blobBytes(blob).then(
        (imageBytes) => resolve({ bytes: imageBytes, extension: "png" }),
        reject,
      );
    }, "image/png");
  });
}

async function createFailurePlaceholderImage(): Promise<LoadedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.fillStyle = "#fff7f7";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#b91c1c";
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.fillStyle = "#b91c1c";
  context.font = 'bold 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("图片加载失败", canvas.width / 2, canvas.height / 2);
  return canvasPng(canvas);
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="分镜表" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF70AD47"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function worksheetXml(model: ExportModel, failedCells: Set<string>): string {
  const lastColumn = columnName(Math.max(0, model.fields.length - 1));
  const lastRow = Math.max(1, model.rows.length + 1);
  const columns = model.fields.map((field, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${field.type === "image" ? 32 : 18}" customWidth="1"/>`,
  ).join("");
  const header = model.fields.map((field, index) => inlineCell(index, 1, field.label, 1)).join("");
  const rows = model.rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const hasImageCell = row.cells.some((cell) => cell.fieldType === "image");
    const cells = model.fields.map((field, columnIndex) => {
      const cell = row.cells.find((candidate) => candidate.fieldId === field.id);
      if (field.type === "image") {
        const failed = failedCells.has(`${rowIndex}:${columnIndex}`);
        return inlineCell(columnIndex, excelRow, failed ? "图片加载失败" : "");
      }
      return inlineCell(columnIndex, excelRow, cell?.text ?? "");
    }).join("");
    const height = hasImageCell ? ' ht="100" customHeight="1"' : "";
    return `<row r="${excelRow}"${height}>${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columns}</cols><sheetData><row r="1">${header}</row>${rows}</sheetData><drawing r:id="rId1"/></worksheet>`;
}

function worksheetRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
}

function drawingXml(anchors: CellAnchor[]): string {
  let imageNumber = 0;
  const drawings = anchors.flatMap((anchor) => anchor.images.map((image, slot) => {
    imageNumber += 1;
    const start = Math.floor(CELL_WIDTH_EMU * slot / anchor.images.length);
    const end = Math.floor(CELL_WIDTH_EMU * (slot + 1) / anchor.images.length);
    const endColumn = end === CELL_WIDTH_EMU ? anchor.column + 1 : anchor.column;
    const endOffset = end === CELL_WIDTH_EMU ? 0 : end;
    return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${anchor.column}</xdr:col><xdr:colOff>${start}</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${endColumn}</xdr:col><xdr:colOff>${endOffset}</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>${ROW_HEIGHT_EMU}</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageNumber}" name="Image ${imageNumber}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${image.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  })).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawings}</xdr:wsDr>`;
}

function drawingRelationshipsXml(images: EmbeddedImage[]): string {
  const relationships = images.map((image) =>
    `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${image.mediaName}"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}

export async function buildXlsxPackage(
  model: ExportModel,
  loadImage: ((url: string) => Promise<LoadedImage>) | undefined = undefined,
  createFailurePlaceholder: () => Promise<LoadedImage> = createFailurePlaceholderImage,
  imageDependencies: XlsxImageLoadDependencies = {},
): Promise<Map<string, Uint8Array>> {
  const images: EmbeddedImage[] = [];
  const anchors: CellAnchor[] = [];
  const failedCells = new Set<string>();
  const imageLoader = loadImage ?? ((url: string) => loadRemoteImage(url, imageDependencies));

  for (const [rowIndex, row] of model.rows.entries()) {
    for (const [columnIndex, field] of model.fields.entries()) {
      if (field.type !== "image") continue;
      const cell = row.cells.find((candidate) => candidate.fieldId === field.id);
      const cellImages: EmbeddedImage[] = [];
      for (const remoteImage of cell?.images ?? []) {
        let loaded: LoadedImage;
        try {
          loaded = await imageLoader(remoteImage.url);
        } catch {
          failedCells.add(`${rowIndex}:${columnIndex}`);
          loaded = await createFailurePlaceholder();
        }
        const number = images.length + 1;
        const embedded: EmbeddedImage = {
          ...loaded,
          relationshipId: `rId${number}`,
          mediaName: `image${number}.${loaded.extension}`,
        };
        images.push(embedded);
        cellImages.push(embedded);
      }
      if (cellImages.length > 0) {
        anchors.push({ column: columnIndex, row: rowIndex + 1, images: cellImages });
      }
    }
  }

  const files = new Map<string, Uint8Array>();
  files.set("[Content_Types].xml", encoder.encode(contentTypesXml()));
  files.set("_rels/.rels", encoder.encode(rootRelationshipsXml()));
  files.set("xl/workbook.xml", encoder.encode(workbookXml()));
  files.set("xl/_rels/workbook.xml.rels", encoder.encode(workbookRelationshipsXml()));
  files.set("xl/styles.xml", encoder.encode(stylesXml()));
  files.set("xl/worksheets/sheet1.xml", encoder.encode(worksheetXml(model, failedCells)));
  files.set("xl/worksheets/_rels/sheet1.xml.rels", encoder.encode(worksheetRelationshipsXml()));
  files.set("xl/drawings/drawing1.xml", encoder.encode(drawingXml(anchors)));
  files.set("xl/drawings/_rels/drawing1.xml.rels", encoder.encode(drawingRelationshipsXml(images)));
  for (const image of images) {
    files.set(`xl/media/${image.mediaName}`, image.bytes);
  }
  return files;
}

export async function exportStoryboardExcel(project: StoryboardProject): Promise<void> {
  const files = await buildXlsxPackage(buildExportModel(project));
  const bytes = createZip([...files].map(([name, data]) => ({ name, data })));
  downloadBlob(
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    exportFilename(project, "xlsx"),
  );
}
