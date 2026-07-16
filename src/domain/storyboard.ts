export type FieldType =
  | "text"
  | "number"
  | "date"
  | "singleSelect"
  | "multiSelect"
  | "person"
  | "image";

export type FieldDefinition = {
  id: string;
  label: string;
  type: FieldType;
  visible: boolean;
  order: number;
};

export type CustomFieldType = Exclude<FieldType, "image">;

export type AddFieldInput = Pick<FieldDefinition, "label"> & {
  type: CustomFieldType;
};

export type Shot = { id: string; values: Record<string, string> };

export type StoryboardProject = {
  id: string;
  title: string;
  fields: FieldDefinition[];
  shots: Shot[];
};

export type ProjectUpdate =
  | StoryboardProject
  | ((project: StoryboardProject) => StoryboardProject);

const seededFields: Array<Pick<FieldDefinition, "id" | "label" | "type">> = [
  { id: "shotNumber", label: "镜号", type: "number" },
  { id: "frame", label: "画面", type: "image" },
  { id: "reference", label: "参考", type: "image" },
  { id: "shotSize", label: "景别", type: "text" },
  { id: "durationSeconds", label: "时长（秒）", type: "number" },
  { id: "content", label: "内容", type: "text" },
  { id: "notes", label: "备注", type: "text" },
  { id: "scene", label: "场景", type: "text" },
  { id: "sound", label: "声音", type: "text" },
  { id: "cameraAngle", label: "摄影机角度", type: "text" },
  { id: "cameraMove", label: "运镜", type: "text" },
  { id: "cameraGear", label: "摄影机装备", type: "text" },
  { id: "lens", label: "镜头焦段", type: "text" },
  { id: "sceneNumber", label: "场号", type: "text" },
];

export const DEFAULT_FIELDS: FieldDefinition[] = seededFields.map((field, order) => ({
  ...field,
  visible: true,
  order,
}));

function copyFields(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field) => ({ ...field }));
}

function fieldIdFromLabel(label: string): string {
  return label
    .normalize("NFKC")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function withFieldOrder(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((field, order) => ({ ...field, order }));
}

export function createProject(): StoryboardProject {
  return {
    id: "storyboard-project",
    title: "未命名项目",
    fields: copyFields(DEFAULT_FIELDS),
    shots: [{ id: "1", values: { shotNumber: "1" } }],
  };
}

export function addField(
  project: StoryboardProject,
  field: AddFieldInput,
): StoryboardProject;
export function addField(
  project: StoryboardProject,
  field: Pick<FieldDefinition, "label" | "type">,
): StoryboardProject {
  if (field.type === "image") {
    throw new Error("Custom image fields are not supported");
  }

  const id = fieldIdFromLabel(field.label);
  if (!id) {
    throw new Error("Field label must contain letters or numbers");
  }
  if (project.fields.some((existingField) => existingField.id === id)) {
    throw new Error(`A field with id '${id}' already exists`);
  }

  return {
    ...project,
    fields: [
      ...copyFields(project.fields),
      { id, label: field.label, type: field.type, visible: true, order: project.fields.length },
    ],
  };
}

export function toggleFieldVisibility(
  project: StoryboardProject,
  fieldId: string,
  visible: boolean,
): StoryboardProject {
  return {
    ...project,
    fields: project.fields.map((field) =>
      field.id === fieldId ? { ...field, visible } : { ...field },
    ),
  };
}

export function moveField(
  project: StoryboardProject,
  fieldId: string,
  targetIndex: number,
): StoryboardProject {
  const orderedFields = [...project.fields].sort((left, right) => left.order - right.order);
  const currentIndex = orderedFields.findIndex((field) => field.id === fieldId);
  if (currentIndex === -1) {
    return { ...project, fields: copyFields(project.fields) };
  }

  const [field] = orderedFields.splice(currentIndex, 1);
  const destination = Math.max(0, Math.min(targetIndex, orderedFields.length));
  orderedFields.splice(destination, 0, field);

  return { ...project, fields: withFieldOrder(orderedFields) };
}

export function addShot(project: StoryboardProject): StoryboardProject {
  const nextNumber = project.shots.length + 1;
  return {
    ...project,
    shots: [
      ...project.shots.map((shot) => ({ ...shot, values: { ...shot.values } })),
      { id: String(nextNumber), values: { shotNumber: String(nextNumber) } },
    ],
  };
}

export function updateShotValue(
  project: StoryboardProject,
  shotId: string,
  fieldId: string,
  value: string,
): StoryboardProject {
  return {
    ...project,
    shots: project.shots.map((shot) =>
      shot.id === shotId ? { ...shot, values: { ...shot.values, [fieldId]: value } } : { ...shot, values: { ...shot.values } },
    ),
  };
}
