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
