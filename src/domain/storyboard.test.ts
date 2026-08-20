import {
  DEFAULT_FIELDS,
  SHOT_SIZE_OPTIONS,
  addField,
  addShot,
  assignShotsToScene,
  createScene,
  createProject,
  deleteField,
  deleteScene,
  deleteShot,
  ensureProductionStatusField,
  getProductionSummary,
  moveField,
  moveShot,
  setFieldOptions,
  toggleSceneCollapsed,
  toggleFieldVisibility,
} from "./storyboard";

it("adds the standard production status field once for older projects", () => {
  const project = createProject();
  const withoutStatus = {
    ...project,
    fields: project.fields.filter((field) => field.id !== "productionStatus"),
  };

  const upgraded = ensureProductionStatusField(withoutStatus);

  expect(upgraded.fields[upgraded.fields.length - 1]).toMatchObject({
    id: "productionStatus",
    label: "制作状态",
    type: "singleSelect",
    options: ["待制作", "待拍", "拍摄中", "已确认", "已完成", "需修改"],
  });
  expect(ensureProductionStatusField(upgraded)).toBe(upgraded);
});

it("upgrades legacy production status choices without removing existing project fields", () => {
  const project = createProject();
  const legacyProject = {
    ...project,
    fields: project.fields.map((field) => field.id === "productionStatus" ? {
      ...field,
      options: ["待制作", "待拍", "拍摄中", "已完成", "需修改"],
    } : field),
  };

  const upgraded = ensureProductionStatusField(legacyProject);

  expect(upgraded).not.toBe(legacyProject);
  expect(upgraded.fields.find((field) => field.id === "productionStatus")?.options).toEqual([
    "待制作", "待拍", "拍摄中", "已确认", "已完成", "需修改",
  ]);
});

it("summarizes frame coverage, runtime, and production statuses", () => {
  const project = addShot(createProject());
  project.scenes = [
    {
      id: "scene-1", number: "1", name: "开场", intExt: "", dayNight: "",
      targetDurationSeconds: "", shootDate: "", notes: "", collapsed: false,
    },
  ];
  project.shots[0] = {
    ...project.shots[0],
    sceneId: "scene-1",
    values: { frame: "frame.png", durationSeconds: "12", productionStatus: "待拍" },
  };
  project.shots[1] = {
    ...project.shots[1],
    values: { durationSeconds: "8", productionStatus: "已完成" },
  };

  expect(getProductionSummary(project)).toEqual({
    sceneCount: 1,
    shotCount: 2,
    framesSupplied: 1,
    estimatedRuntimeSeconds: 20,
    pendingShotCount: 1,
    completedShotCount: 1,
    statusCounts: {
      "待制作": 0,
      "待拍": 1,
      "拍摄中": 0,
      "已确认": 0,
      "已完成": 1,
      "需修改": 0,
    },
  });
});

it("seeds the supplied production-ready storyboard template", () => {
  expect(DEFAULT_FIELDS.map((field) => field.label)).toEqual([
    "镜号",
    "画面",
    "参考",
    "景别",
    "时长（秒）",
    "内容",
    "备注",
    "场景",
    "声音",
    "摄影机角度",
    "运镜",
    "摄影机装备",
    "镜头焦段",
    "场号",
    "制作状态",
  ]);
});

it("adds, hides and reorders a project field", () => {
  const project = createProject();
  const withActor = addField(project, { label: "actor", type: "person" });
  const hidden = toggleFieldVisibility(withActor, "actor", false);

  expect(moveField(hidden, "actor", 0).fields[0]).toMatchObject({
    id: "actor",
    visible: false,
  });
});

it("deletes a custom field and its shot values while protecting built-in fields", () => {
  const project = addField(createProject(), { label: "服装备注", type: "text" });
  const withValue = {
    ...project,
    shots: project.shots.map((shot) => ({
      ...shot,
      values: { ...shot.values, "服装备注": "黑色风衣" },
    })),
  };

  const deleted = deleteField(withValue, "服装备注");

  expect(deleted.fields).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "服装备注" })]),
  );
  expect(deleted.shots[0].values).not.toHaveProperty("服装备注");
  expect(() => deleteField(withValue, "shotNumber")).toThrow("cannot be deleted");
});

it("derives a deterministic nonempty id from a Chinese field label", () => {
  const withActor = addField(createProject(), { label: "演员", type: "person" });

  expect(withActor.fields[withActor.fields.length - 1]).toMatchObject({
    id: "演员",
    label: "演员",
  });
});

it("rejects custom image fields while retaining seeded image fields", () => {
  const project = createProject();

  expect(project.fields.filter((field) => field.type === "image").map((field) => field.id)).toEqual([
    "frame",
    "reference",
  ]);
  expect(() =>
    addField(project, {
      label: "额外画面",
      // @ts-expect-error image fields are reserved for the seeded frame and reference fields
      type: "image",
    }),
  ).toThrow("Custom image fields are not supported");
});

it("seeds the six restricted shot-size options", () => {
  const field = createProject().fields.find(({ id }) => id === "shotSize");

  expect(SHOT_SIZE_OPTIONS).toEqual([
    "大远景",
    "远景",
    "全景",
    "中景",
    "近景",
    "特写",
  ]);
  expect(field).toMatchObject({
    type: "singleSelect",
    options: [...SHOT_SIZE_OPTIONS],
    allowCustomValue: false,
  });
});

it("repairs a legacy shot-size field without changing other project fields", () => {
  const project = createProject();
  const legacyProject = {
    ...project,
    fields: project.fields.map((field) => field.id === "shotSize" ? {
      ...field,
      type: "text" as const,
      options: [],
      allowCustomValue: true,
    } : field),
  };

  const upgraded = ensureProductionStatusField(legacyProject);

  expect(upgraded.fields.find((field) => field.id === "shotSize")).toMatchObject({
    type: "singleSelect",
    options: [...SHOT_SIZE_OPTIONS],
    allowCustomValue: false,
  });
  expect(upgraded.fields.find((field) => field.id === "content")).toEqual(
    legacyProject.fields.find((field) => field.id === "content"),
  );
});

it("moves, deletes, and continuously renumbers shots", () => {
  const project = addShot(addShot(createProject()));

  const moved = moveShot(project, "3", 0);
  expect(moved.shots.map(({ id }) => id)).toEqual(["3", "1", "2"]);
  expect(moved.shots.map(({ values }) => values.shotNumber)).toEqual([
    "1",
    "2",
    "3",
  ]);

  const deleted = deleteShot(moved, "1");
  expect(deleted.shots.map(({ id }) => id)).toEqual(["3", "2"]);
  expect(deleted.shots.map(({ values }) => values.shotNumber)).toEqual([
    "1",
    "2",
  ]);
});

it("uses a collision-free local shot id after deleting an earlier row", () => {
  const project = deleteShot(addShot(addShot(createProject())), "2");

  expect(addShot(project).shots.map(({ id }) => id)).toEqual(["1", "3", "4"]);
});

it("keeps scene records independent from their assigned shots", () => {
  const project = addShot(createProject());
  const withScene = createScene(project, {
    name: "夜 · 酒吧门口",
    intExt: "EXT",
    dayNight: "NIGHT",
  });
  const scene = withScene.scenes[0];
  const assigned = assignShotsToScene(withScene, ["1", "2"], scene.id);

  expect(assigned.scenes).toHaveLength(1);
  expect(assigned.shots.map((shot) => shot.sceneId)).toEqual([scene.id, scene.id]);
  expect(assigned.scenes[0]).toMatchObject({
    number: "1",
    name: "夜 · 酒吧门口",
    intExt: "EXT",
    dayNight: "NIGHT",
  });
});

it("initializes projects with an empty shoot-day schedule", () => {
  const project = createProject();

  expect(project).toHaveProperty("shootDays", []);
  expect(project.shots[0]).not.toHaveProperty("shootDayId");
});

it("collapses a scene without changing its shots and can ungroup it safely", () => {
  const withScene = createScene(createProject(), { name: "开场" });
  const sceneId = withScene.scenes[0].id;
  const assigned = assignShotsToScene(withScene, ["1"], sceneId);
  const collapsed = toggleSceneCollapsed(assigned, sceneId);
  const ungrouped = deleteScene(collapsed, sceneId, "ungroup");

  expect(collapsed.scenes[0].collapsed).toBe(true);
  expect(collapsed.shots[0].sceneId).toBe(sceneId);
  expect(ungrouped.scenes).toEqual([]);
  expect(ungrouped.shots[0].sceneId).toBeUndefined();
});

it("deletes a scene together with its shots only when explicitly requested", () => {
  const withScene = createScene(addShot(createProject()), { name: "尾声" });
  const sceneId = withScene.scenes[0].id;
  const assigned = assignShotsToScene(withScene, ["1", "2"], sceneId);

  expect(deleteScene(assigned, sceneId, "delete-shots").shots).toEqual([]);
});

it("stores project-specific dropdown options while allowing custom values", () => {
  const project = setFieldOptions(createProject(), "notes", [
    " 补拍 ",
    "待定",
    "补拍",
    "",
  ]);

  expect(project.fields.find(({ id }) => id === "notes")).toMatchObject({
    type: "singleSelect",
    options: ["补拍", "待定"],
    allowCustomValue: true,
  });
});
