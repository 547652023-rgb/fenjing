import type { FieldDefinition } from "./storyboard";

export const STORYBOARD_VIEW_IDS = ["director", "producer", "cinematographer"] as const;

export type StoryboardViewId = (typeof STORYBOARD_VIEW_IDS)[number];
export type ColumnWidth = "compact" | "standard" | "wide";

export type ColumnPresentation = {
  fieldId: string;
  visible: boolean;
  order: number;
  width: ColumnWidth;
  pinned: boolean;
};

export type StoryboardView = {
  id: StoryboardViewId;
  name: string;
  columns: ColumnPresentation[];
};

const VIEW_FIELDS: Record<StoryboardViewId, string[]> = {
  director: [
    "shotNumber",
    "frame",
    "shotSize",
    "durationSeconds",
    "content",
    "notes",
    "productionStatus",
  ],
  producer: [
    "shotNumber",
    "sceneNumber",
    "scene",
    "content",
    "durationSeconds",
    "sound",
    "notes",
    "productionStatus",
  ],
  cinematographer: [
    "shotNumber",
    "frame",
    "shotSize",
    "cameraAngle",
    "cameraMove",
    "cameraGear",
    "lens",
    "reference",
    "productionStatus",
  ],
};

const VIEW_NAMES: Record<StoryboardViewId, string> = {
  director: "导演视图",
  producer: "制片视图",
  cinematographer: "摄影视图",
};

function widthForField(field: FieldDefinition): ColumnWidth {
  if (field.type === "image" || field.id === "content") return "wide";
  if (field.id === "shotNumber" || field.type === "number") return "compact";
  return "standard";
}

export function createDefaultColumnPresentation(
  fields: FieldDefinition[],
): ColumnPresentation[] {
  return [...fields]
    .sort((left, right) => left.order - right.order)
    .map((field, order) => ({
      fieldId: field.id,
      visible: field.visible,
      order,
      width: widthForField(field),
      pinned: field.id === "shotNumber",
    }));
}

export function normalizeColumnPresentation(
  fields: FieldDefinition[],
  presentation: ColumnPresentation[] | undefined,
): ColumnPresentation[] {
  const savedByField = new Map(presentation?.map((column) => [column.fieldId, column]));
  const known = createDefaultColumnPresentation(fields);
  const savedColumns = known
    .filter((column) => savedByField.has(column.fieldId))
    .map((column) => ({ ...column, ...savedByField.get(column.fieldId)! }))
    .sort((left, right) => left.order - right.order);
  const newColumns = known.filter((column) => !savedByField.has(column.fieldId));
  return [...savedColumns, ...newColumns].map((column, order) => ({
    ...column,
    order,
    pinned: column.fieldId === "shotNumber" ? true : column.pinned,
  }));
}

export function createNamedStoryboardView(
  id: StoryboardViewId,
  fields: FieldDefinition[],
): StoryboardView {
  const included = VIEW_FIELDS[id];
  const defaults = createDefaultColumnPresentation(fields);
  const ordered = [
    ...included.map((fieldId) => defaults.find((column) => column.fieldId === fieldId)).filter(Boolean),
    ...defaults.filter((column) => !included.includes(column.fieldId)),
  ] as ColumnPresentation[];
  return {
    id,
    name: VIEW_NAMES[id],
    columns: ordered.map((column, order) => ({
      ...column,
      visible: included.includes(column.fieldId),
      order,
      pinned: column.fieldId === "shotNumber",
    })),
  };
}
