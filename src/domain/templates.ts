import type { TemplateSnapshot, StoryboardTemplate } from "./models";
import {
  DEFAULT_FIELDS,
  type FieldDefinition,
  type Shot,
  type StoryboardProject,
  type StoryboardScene,
} from "./storyboard";

export type { StoryboardTemplate, TemplateSnapshot } from "./models";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type ReadonlyTemplateSnapshot = DeepReadonly<TemplateSnapshot>;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

function cloneFields(fields: readonly DeepReadonly<FieldDefinition>[]): FieldDefinition[] {
  return fields.map((field) => ({
    ...field,
    options: field.options ? [...field.options] : undefined,
  }));
}

function cloneShotsWithoutImages(
  shots: readonly DeepReadonly<Shot>[],
  imageFieldIds: Set<string>,
): Shot[] {
  return shots.map((shot) => ({
    ...shot,
    values: Object.fromEntries(
      Object.entries(shot.values).filter(([fieldId]) => !imageFieldIds.has(fieldId)),
    ),
  }));
}

function cloneScenes(scenes: readonly DeepReadonly<StoryboardScene>[]): StoryboardScene[] {
  return scenes.map((scene) => ({ ...scene }));
}

function snapshot(title: string, fields: readonly DeepReadonly<FieldDefinition>[]): TemplateSnapshot {
  return {
    title,
    aspectRatio: "16:9",
    fields: cloneFields(fields),
    scenes: [],
    shots: [{ id: "1", values: { shotNumber: "1" } }],
  };
}

export const BUILT_IN_TEMPLATES: readonly DeepReadonly<StoryboardTemplate>[] = deepFreeze([
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
]);

export function projectToTemplateSnapshot(project: StoryboardProject): TemplateSnapshot {
  const fields = cloneFields(project.fields);
  const imageFieldIds = new Set(
    fields.filter((field) => field.type === "image").map((field) => field.id),
  );

  return {
    title: project.title,
    aspectRatio: project.aspectRatio,
    fields,
    scenes: cloneScenes(project.scenes),
    shots: cloneShotsWithoutImages(project.shots, imageFieldIds),
  };
}

export function templateToProject(
  template: ReadonlyTemplateSnapshot,
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
    scenes: cloneScenes(template.scenes ?? []),
    shots: cloneShotsWithoutImages(template.shots, imageFieldIds),
  };
}
