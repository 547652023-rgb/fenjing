import {
  DEFAULT_FIELDS,
  addField,
  createProject,
  moveField,
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
