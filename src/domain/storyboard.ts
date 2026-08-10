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

export type Shot = {
  id: string;
  version?: number;
  sceneId?: string;
  values: Record<string, string>;
};

export type StoryboardScene = {
  id: string;
  number: string;
  name: string;
  intExt: "INT" | "EXT" | "INT/EXT" | "";
  dayNight: "DAY" | "NIGHT" | "";
  targetDurationSeconds: string;
  shootDate: string;
  notes: string;
  collapsed: boolean;
};

export type CreateSceneInput = Partial<
  Pick<
    StoryboardScene,
    "name" | "intExt" | "dayNight" | "targetDurationSeconds" | "shootDate" | "notes"
  >
>;

export type StoryboardProject = {
  id: string;
  title: string;
  aspectRatio?: string;
  fields: FieldDefinition[];
  scenes: StoryboardScene[];
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

export const PRODUCTION_STATUS_OPTIONS = [
  "待制作",
  "待拍",
  "拍摄中",
  "已确认",
  "已完成",
  "需修改",
] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUS_OPTIONS)[number];

export type ProductionSummary = {
  sceneCount: number;
  shotCount: number;
  framesSupplied: number;
  estimatedRuntimeSeconds: number;
  pendingShotCount: number;
  completedShotCount: number;
  statusCounts: Record<ProductionStatus, number>;
};

export const DEFAULT_ASPECT_RATIO = "16:9";
export const ASPECT_RATIO_OPTIONS = ["16:9", "9:16", "4:3", "1:1", "2.35:1"] as const;

export function normalizeAspectRatio(value: string): string {
  const normalized = value.trim().normalize("NFKC");
  if (!normalized) throw new Error("Aspect ratio is required");
  return normalized;
}

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
  {
    id: "productionStatus",
    label: "制作状态",
    type: "singleSelect",
    options: [...PRODUCTION_STATUS_OPTIONS],
    allowCustomValue: false,
  },
];

export const DEFAULT_FIELDS: FieldDefinition[] = seededFields.map((field, order) => ({
  ...field,
  visible: true,
  order,
}));

const BUILT_IN_FIELD_IDS = new Set(DEFAULT_FIELDS.map((field) => field.id));

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
    aspectRatio: DEFAULT_ASPECT_RATIO,
    fields: copyFields(DEFAULT_FIELDS),
    scenes: [],
    shots: [{ id: "1", values: { shotNumber: "1" } }],
  };
}

export function ensureProductionStatusField(project: StoryboardProject): StoryboardProject {
  const statusField = project.fields.find((field) => field.id === "productionStatus");
  if (statusField) {
    const includesAllStandardStatuses = PRODUCTION_STATUS_OPTIONS.every((status) => statusField.options?.includes(status));
    if (includesAllStandardStatuses) return project;
    return {
      ...project,
      fields: project.fields.map((field) => field.id === "productionStatus" ? {
        ...field,
        options: [...PRODUCTION_STATUS_OPTIONS],
      } : field),
    };
  }
  return {
    ...project,
    fields: [
      ...copyFields(project.fields),
      {
        id: "productionStatus",
        label: "制作状态",
        type: "singleSelect",
        options: [...PRODUCTION_STATUS_OPTIONS],
        allowCustomValue: false,
        visible: true,
        order: project.fields.length,
      },
    ],
  };
}

export function getProductionSummary(project: StoryboardProject): ProductionSummary {
  const statusCounts = Object.fromEntries(
    PRODUCTION_STATUS_OPTIONS.map((status) => [status, 0]),
  ) as Record<ProductionStatus, number>;
  let framesSupplied = 0;
  let estimatedRuntimeSeconds = 0;

  project.shots.forEach((shot) => {
    if (shot.values.frame?.trim()) framesSupplied += 1;
    const duration = Number(shot.values.durationSeconds);
    if (Number.isFinite(duration) && duration > 0) estimatedRuntimeSeconds += duration;
    const status = shot.values.productionStatus as ProductionStatus;
    if (PRODUCTION_STATUS_OPTIONS.includes(status)) statusCounts[status] += 1;
    else statusCounts["待制作"] += 1;
  });

  return {
    sceneCount: project.scenes.length,
    shotCount: project.shots.length,
    framesSupplied,
    estimatedRuntimeSeconds,
    pendingShotCount: project.shots.length - statusCounts["已完成"],
    completedShotCount: statusCounts["已完成"],
    statusCounts,
  };
}

function normalizeSceneNumbers(scenes: StoryboardScene[]): StoryboardScene[] {
  return scenes.map((scene, index) => ({ ...scene, number: String(index + 1) }));
}

export function createScene(
  project: StoryboardProject,
  input: CreateSceneInput = {},
): StoryboardProject {
  const nextId = Math.max(
    0,
    ...project.scenes.map((scene) => {
      const numericId = Number(scene.id.replace(/^scene-/, ""));
      return Number.isSafeInteger(numericId) ? numericId : 0;
    }),
  ) + 1;
  const scene: StoryboardScene = {
    id: `scene-${nextId}`,
    number: String(project.scenes.length + 1),
    name: input.name?.trim() ?? "未命名场次",
    intExt: input.intExt ?? "",
    dayNight: input.dayNight ?? "",
    targetDurationSeconds: input.targetDurationSeconds ?? "",
    shootDate: input.shootDate ?? "",
    notes: input.notes ?? "",
    collapsed: false,
  };
  return { ...project, scenes: [...project.scenes, scene] };
}

export function assignShotsToScene(
  project: StoryboardProject,
  shotIds: string[],
  sceneId: string | null,
): StoryboardProject {
  if (sceneId !== null && !project.scenes.some((scene) => scene.id === sceneId)) {
    return project;
  }
  const selected = new Set(shotIds);
  return {
    ...project,
    shots: project.shots.map((shot) =>
      selected.has(shot.id)
        ? { ...shot, sceneId: sceneId ?? undefined, values: { ...shot.values } }
        : { ...shot, values: { ...shot.values } },
    ),
  };
}

export function toggleSceneCollapsed(
  project: StoryboardProject,
  sceneId: string,
): StoryboardProject {
  return {
    ...project,
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, collapsed: !scene.collapsed } : { ...scene },
    ),
  };
}

export function deleteScene(
  project: StoryboardProject,
  sceneId: string,
  treatment: "ungroup" | "delete-shots",
): StoryboardProject {
  const scenes = normalizeSceneNumbers(
    project.scenes.filter((scene) => scene.id !== sceneId).map((scene) => ({ ...scene })),
  );
  const shots = treatment === "delete-shots"
    ? project.shots.filter((shot) => shot.sceneId !== sceneId)
    : project.shots.map((shot) =>
      shot.sceneId === sceneId
        ? { ...shot, sceneId: undefined, values: { ...shot.values } }
        : { ...shot, values: { ...shot.values } },
    );
  return { ...project, scenes, shots: normalizeShotNumbers(shots) };
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

export function deleteField(
  project: StoryboardProject,
  fieldId: string,
): StoryboardProject {
  if (BUILT_IN_FIELD_IDS.has(fieldId)) {
    throw new Error("Built-in fields cannot be deleted");
  }

  return {
    ...project,
    fields: withFieldOrder(
      project.fields
        .filter((field) => field.id !== fieldId)
        .map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
    ),
    shots: project.shots.map((shot) => {
      const { [fieldId]: _deletedValue, ...values } = shot.values;
      return { ...shot, values };
    }),
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
