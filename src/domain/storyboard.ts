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
  options?: string[];
  allowCustomValue?: boolean;
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

export const SHOT_SIZE_OPTIONS = [
  "大远景",
  "远景",
  "全景",
  "中景",
  "近景",
  "特写",
] as const;

const seededFields: Array<
  Pick<
    FieldDefinition,
    "id" | "label" | "type" | "options" | "allowCustomValue"
  >
> = [
  { id: "shotNumber", label: "镜号", type: "number" },
  { id: "frame", label: "画面", type: "image" },
  { id: "reference", label: "参考", type: "image" },
  {
    id: "shotSize",
    label: "景别",
    type: "singleSelect",
    options: [...SHOT_SIZE_OPTIONS],
    allowCustomValue: false,
  },
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
  return fields.map((field) => ({
    ...field,
    options: field.options ? [...field.options] : undefined,
  }));
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
  const nextId =
    Math.max(
      0,
      ...project.shots.map(({ id }) => {
        const numericId = Number(id);
        return Number.isSafeInteger(numericId) ? numericId : 0;
      }),
    ) + 1;
  return {
    ...project,
    shots: normalizeShotNumbers([
      ...project.shots.map((shot) => ({ ...shot, values: { ...shot.values } })),
      { id: String(nextId), values: {} },
    ]),
  };
}

export function normalizeShotNumbers(shots: Shot[]): Shot[] {
  return shots.map((shot, index) => ({
    ...shot,
    values: { ...shot.values, shotNumber: String(index + 1) },
  }));
}

export function moveShot(
  project: StoryboardProject,
  shotId: string,
  targetIndex: number,
): StoryboardProject {
  const shots = project.shots.map((shot) => ({
    ...shot,
    values: { ...shot.values },
  }));
  const sourceIndex = shots.findIndex((shot) => shot.id === shotId);
  if (sourceIndex === -1) {
    return { ...project, shots };
  }

  const [shot] = shots.splice(sourceIndex, 1);
  const destination = Math.max(0, Math.min(targetIndex, shots.length));
  shots.splice(destination, 0, shot);

  return { ...project, shots: normalizeShotNumbers(shots) };
}

export function deleteShot(
  project: StoryboardProject,
  shotId: string,
): StoryboardProject {
  return {
    ...project,
    shots: normalizeShotNumbers(
      project.shots
        .filter((shot) => shot.id !== shotId)
        .map((shot) => ({ ...shot, values: { ...shot.values } })),
    ),
  };
}

export function setFieldOptions(
  project: StoryboardProject,
  fieldId: string,
  options: string[],
): StoryboardProject {
  const normalizedOptions = [
    ...new Set(options.map((option) => option.trim()).filter(Boolean)),
  ];

  return {
    ...project,
    fields: project.fields.map((field) => {
      if (field.id !== fieldId || field.type === "image") {
        return {
          ...field,
          options: field.options ? [...field.options] : undefined,
        };
      }

      return {
        ...field,
        type: "singleSelect",
        options:
          fieldId === "shotSize"
            ? [...SHOT_SIZE_OPTIONS]
            : normalizedOptions,
        allowCustomValue: fieldId !== "shotSize",
      };
    }),
  };
}

export function updateShotValue(
  project: StoryboardProject,
  shotId: string,
  fieldId: string,
  value: string,
): StoryboardProject {
  if (
    fieldId === "shotSize" &&
    value !== "" &&
    !SHOT_SIZE_OPTIONS.includes(value as (typeof SHOT_SIZE_OPTIONS)[number])
  ) {
    return project;
  }

  return {
    ...project,
    shots: project.shots.map((shot) =>
      shot.id === shotId ? { ...shot, values: { ...shot.values, [fieldId]: value } } : { ...shot, values: { ...shot.values } },
    ),
  };
}
