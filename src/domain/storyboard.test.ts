import {
  DEFAULT_FIELDS,
  SHOT_SIZE_OPTIONS,
  addField,
  addShot,
  createProject,
  deleteShot,
  moveField,
  moveShot,
  setFieldOptions,
  toggleFieldVisibility,
} from "./storyboard";

it("seeds the supplied 14-column storyboard template", () => {
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
