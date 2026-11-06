import type { RemoteImage } from "../domain/models";
import type { FieldDefinition, StoryboardProject } from "../domain/storyboard";
import { parseRemoteImages } from "../components/StoryboardTable";

export type ExportCell = {
  fieldId: string;
  fieldType: FieldDefinition["type"];
  text: string;
  images: RemoteImage[];
  /** Ordered labeled sections when several source columns share one export cell. */
  parts?: { text: string; images: RemoteImage[] }[];
};

export type ExportRow = { shotId: string; cells: ExportCell[] };
export type ExportFlowUnit = { kind: "text"; text: string } | { kind: "image"; image: RemoteImage };

export function exportCellFlow(cell: ExportCell, wrap: (text: string) => string[]): ExportFlowUnit[] {
  const parts = cell.parts ?? [{ text: cell.text, images: cell.images }];
  return parts.flatMap(part => [
    ...(part.text ? wrap(part.text).map(text => ({ kind: "text" as const, text })) : []),
    ...part.images.map(image => ({ kind: "image" as const, image })),
  ]);
}

export function flowUnitHeight(unit: ExportFlowUnit, lineHeight: number, imageHeight: number): number {
  return unit.kind === "image" ? imageHeight : lineHeight;
}

/** Consume whole image slots and wrapped text lines; every nonempty flow advances. */
export function takeFlowSegment(flow: ExportFlowUnit[], offset: number, capacity: number, lineHeight: number, imageHeight: number): ExportFlowUnit[] {
  const segment: ExportFlowUnit[] = [];
  let height = 0;
  for (const unit of flow.slice(offset)) {
    const next = flowUnitHeight(unit, lineHeight, imageHeight);
    if (height + next > capacity) break;
    segment.push(unit);
    height += next;
  }
  if (offset < flow.length && !segment.length) throw new Error("页面空间不足以显示图片或文字，请减小图片或文字大小");
  return segment;
}
export type ExportModel = {
  title: string;
  aspectRatio: string;
  shotCount: number;
  fields: FieldDefinition[];
  rows: ExportRow[];
};

export type ExportLogo = {
  name: string;
  url: string;
  type: "image/png" | "image/jpeg" | "image/webp";
};

export type PdfSettings = {
  orientation: "landscape" | "portrait";
  textSize: 12 | 14 | 16;
  imageHeight: 104 | 144 | 184;
};

export const EXPORT_HEADER_COLORS = [
  { value: "#15803d", label: "深绿" }, { value: "#000000", label: "黑色" },
  { value: "#1e3a5f", label: "藏蓝" }, { value: "#7f1d1d", label: "酒红" },
] as const;
export type ExportHeaderColor = typeof EXPORT_HEADER_COLORS[number]["value"];

export function normalizeExportHeaderColor(value: unknown): ExportHeaderColor {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return EXPORT_HEADER_COLORS.find(color => color.value === candidate)?.value ?? "#15803d";
}

export type ExportOptions = { logo?: ExportLogo; documentLabel?: string; pdf?: PdfSettings; maxColumns?: number; headerColor?: ExportHeaderColor; signal?: AbortSignal; onImageError?: (url: string) => void };

export function buildExportModel(project: StoryboardProject, options: Pick<ExportOptions, "maxColumns"> = {}): ExportModel {
  const fields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order)
    .map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
  return groupExportColumns({
    title: project.title,
    aspectRatio: project.aspectRatio || "16:9",
    shotCount: project.shots.length,
    fields,
    rows: project.shots.map((shot) => ({
      shotId: shot.id,
      cells: fields.map((field) => {
        const value = shot.values[field.id] ?? "";
        const maxImages = field.id === "frame" || field.id === "reference" ? 5 : 1;
        return {
          fieldId: field.id,
          fieldType: field.type,
          text: field.type === "image" ? "" : value,
          images: field.type === "image" ? parseRemoteImages(value).slice(0, maxImages) : [],
        };
      }),
    })),
  }, options.maxColumns);
}

export function groupExportColumns(model: ExportModel, maxColumns?: number): ExportModel {
  if (!Number.isInteger(maxColumns) || maxColumns! < 4 || maxColumns! > 14 || model.fields.length <= maxColumns!) return model;
  const retained = maxColumns! - 1;
  let id = "__export_other";
  while (model.fields.some(field => field.id === id)) id += "_";
  const other: FieldDefinition = { id, label: "其他", type: "text", visible: true, order: retained };
  return {
    ...model,
    fields: [...model.fields.slice(0, retained), other],
    rows: model.rows.map(row => {
      const parts = model.fields.slice(retained).flatMap(field => {
        const cell = row.cells.find(cell => cell.fieldId === field.id);
        if (!cell || (!cell.text && !cell.images.length && !cell.parts?.length)) return [];
        return cell.parts ?? [{ text: `${field.label}：${cell.text}`, images: cell.images }];
      });
      return { ...row, cells: [...row.cells.slice(0, retained), {
        fieldId: id, fieldType: "text" as const, text: parts.map(part => part.text).join("\n"),
        images: parts.flatMap(part => part.images), parts,
      }] };
    }),
  };
}

export function exportFilename(
  project: Pick<StoryboardProject, "title">,
  extension: "xlsx" | "pdf",
  date = new Date(),
  documentLabel = "分镜表",
): string {
  const sanitize = (value: string, fallback: string) => value.normalize("NFKC").trim()
    .replace(/[\\\\/:*?"<>|]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
  const safeTitle = sanitize(project.title, "未命名项目");
  const safeDocumentLabel = sanitize(documentLabel, "分镜表");
  const localDate = [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${safeTitle}-${safeDocumentLabel}-${localDate}.${extension}`;
}
