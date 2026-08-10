import type { RemoteImage } from "../domain/models";
import type { FieldDefinition, StoryboardProject } from "../domain/storyboard";
import { parseRemoteImages } from "../components/StoryboardTable";

export type ExportCell = {
  fieldId: string;
  fieldType: FieldDefinition["type"];
  text: string;
  images: RemoteImage[];
};

export type ExportRow = { shotId: string; cells: ExportCell[] };
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

export type ExportOptions = { logo?: ExportLogo; documentLabel?: string };

export function buildExportModel(project: StoryboardProject): ExportModel {
  const fields = project.fields
    .filter((field) => field.visible)
    .sort((left, right) => left.order - right.order)
    .map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
  return {
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
