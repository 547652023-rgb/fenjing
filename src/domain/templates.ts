import type { TemplateSnapshot, StoryboardTemplate } from "./models";
import { DEFAULT_FIELDS, type FieldDefinition, type Shot, type StoryboardProject } from "./storyboard";

export type { StoryboardTemplate, TemplateSnapshot } from "./models";

function cloneFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field) => ({
    ...field,
    options: field.options ? [...field.options] : undefined,
  }));
}

function cloneShotsWithoutImages(shots: Shot[], imageFieldIds: Set<string>): Shot[] {
  return shots.map((shot) => ({
    ...shot,
    values: Object.fromEntries(
      Object.entries(shot.values).filter(([fieldId]) => !imageFieldIds.has(fieldId)),
    ),
  }));
}

function snapshot(title: string, fields: FieldDefinition[]): TemplateSnapshot {
  return {
    title,
    aspectRatio: "16:9",
    fields: cloneFields(fields),
    shots: [{ id: "1", values: { shotNumber: "1" } }],
  };
}

export const BUILT_IN_TEMPLATES: StoryboardTemplate[] = [
  {
    id: "builtin:professional",
    name: "专业",
    builtIn: true,
    updatedAt: "2026-07-21T00:00:00.000Z",
    snapshot: snapshot("专业分镜", DEFAULT_FIELDS),
  },
  {
    id: "builtin:simple",
    name: "简洁",
    builtIn: true,
    updatedAt: "2026-07-21T00:00:00.000Z",
    snapshot: snapshot(
      "简洁分镜",
      DEFAULT_FIELDS.filter(({ id }) => ["shotNumber", "frame", "content", "notes"].includes(id)),
    ),
  },
  {
    id: "builtin:promotion",
    name: "宣传片",
    builtIn: true,
    updatedAt: "2026-07-21T00:00:00.000Z",
    snapshot: snapshot("宣传片分镜", DEFAULT_FIELDS),
  },
];

export function projectToTemplateSnapshot(project: StoryboardProject): TemplateSnapshot {
  const fields = cloneFields(project.fields);
  const imageFieldIds = new Set(
    fields.filter((field) => field.type === "image").map((field) => field.id),
  );

  return {
    title: project.title,
    aspectRatio: project.aspectRatio,
    fields,
    shots: cloneShotsWithoutImages(project.shots, imageFieldIds),
  };
}

export function templateToProject(
  template: TemplateSnapshot,
  id: string,
  title: string,
): StoryboardProject {
  const fields = cloneFields(template.fields);
  const imageFieldIds = new Set(
    fields.filter((field) => field.type === "image").map((field) => field.id),
  );

  return {
    id,
    title,
    aspectRatio: template.aspectRatio,
    fields,
    shots: cloneShotsWithoutImages(template.shots, imageFieldIds),
  };
}
