import { projectWithColumnPresentation } from "../domain/storyboardViews";
import { createProject } from "../domain/storyboard";
import { buildExportModel, exportFilename } from "./storyboardExport";

it("groups overflow fields into labeled details without losing zero, multiline text or reordered photos", () => {
  const project = createProject();
  project.fields = ["shotNumber", "content", "lens", "frame", "reference", "durationSeconds"].map((id, order) => ({
    ...project.fields.find(field => field.id === id)!, order, visible: true,
  }));
  project.shots[0].values = { shotNumber: "1", content: "开场", lens: "35mm", durationSeconds: "0", frame: JSON.stringify([{ path: "a", url: "photo", name: "a.png", position: 0 }]), reference: "" };
  project.shots[0].values.reference = JSON.stringify([{ path: "b", url: "reference", name: "b.png", position: 0 }]);
  project.fields.push({ id: "notes", label: "备注", type: "text", order: 6, visible: true });
  project.shots[0].values.notes = "第一行\n第二行";
  const original = JSON.stringify(project);

  const model = buildExportModel(project, { maxColumns: 4 });

  expect(model.fields.map(field => field.label)).toEqual(["镜号", "内容", "镜头焦段", "其他"]);
  const details = model.rows[0].cells[3];
  expect(details.text).toContain("时长（秒）：0");
  expect(details.text).toContain("备注：第一行\n第二行");
  expect(details.parts?.map(part => [part.text, part.images.map(image => image.url)])).toEqual([
    ["画面：", ["photo"]], ["参考：", ["reference"]], ["时长（秒）：0", []], ["备注：第一行\n第二行", []],
  ]);
  expect(JSON.stringify(project)).toBe(original);
});

it("keeps unlimited and invalid column limits unchanged and retains empty shots", () => {
  const project = createProject();
  for (const maxColumns of [undefined, 0, 3, 15, NaN, 4.5]) {
    expect(buildExportModel(project, { maxColumns }).fields).toEqual(buildExportModel(project).fields);
  }
  const grouped = buildExportModel(project, { maxColumns: 4 });
  expect(grouped.fields).toHaveLength(4);
  expect(grouped.rows).toHaveLength(1);
  expect(grouped.rows[0].cells[3].parts).toEqual([]);
});

it("exports visible fields and shots in workbench order", () => {
  const project = createProject();
  project.title = "广告/片";
  project.fields = project.fields
    .map((field) => field.id === "reference" ? { ...field, visible: false } : field)
    .reverse()
    .map((field, order) => ({ ...field, order }));
  project.shots = [
    { id: "b", values: { shotNumber: "1", content: "第一镜" } },
    { id: "a", values: { shotNumber: "2", content: "第二镜" } },
  ];

  const model = buildExportModel(project);

  expect(model.fields.map(({ id }) => id)).not.toContain("reference");
  expect(model.fields.map(({ order }) => order)).toEqual(
    [...model.fields.map(({ order }) => order)].sort((a, b) => a - b),
  );
  expect(model.rows.map((row) => row.shotId)).toEqual(["b", "a"]);
  expect(model.rows[0].cells.find((cell) => cell.fieldId === "content")?.text)
    .toBe("第一镜");
});

it("limits frame and reference images to five", () => {
  const project = createProject();
  const images = Array.from({ length: 7 }, (_, position) => ({
    path: `p-${position}`,
    url: `https://example.com/${position}.png`,
    name: `${position}.png`,
    position,
  }));
  project.shots[0].values.frame = JSON.stringify(images);
  project.shots[0].values.reference = JSON.stringify(images);

  const [row] = buildExportModel(project).rows;
  expect(row.cells.find((cell) => cell.fieldId === "frame")?.images).toHaveLength(5);
  expect(row.cells.find((cell) => cell.fieldId === "reference")?.images).toHaveLength(5);
});

it("creates a safe dated filename and supports an empty project", () => {
  const project = createProject();
  project.title = "广告/片:*?";
  project.shots = [];
  expect(buildExportModel(project).rows).toEqual([]);
  expect(exportFilename(project, "xlsx", new Date("2026-07-18T00:00:00Z")))
    .toBe("广告-片-分镜表-2026-07-18.xlsx");
});

it("uses the local calendar date rather than the UTC date in export filenames", () => {
  const project = createProject();
  project.title = "本地日期";
  const date = {
    getFullYear: () => 2026,
    getMonth: () => 0,
    getDate: () => 2,
    toISOString: () => "2026-01-01T16:30:00.000Z",
  } as unknown as Date;

  expect(exportFilename(project, "pdf", date))
    .toBe("本地日期-分镜表-2026-01-02.pdf");
});

it("includes a call-sheet date and version in delivery filenames", () => {
  const project = createProject();
  project.title = "夜景广告";

  expect(exportFilename(project, "pdf", new Date("2026-08-10T00:00:00Z"), "拍摄通告-2026-08-13-V2"))
    .toBe("夜景广告-拍摄通告-2026-08-13-V2-2026-08-10.pdf");
});

it("exports the personal column order, visibility and renamed labels without mutating project", () => {
  const project = createProject();
  project.fields.find(field => field.id === "lens")!.label = "焦距";
  project.shots[0].values.lens = "35mm";
  const presentation = [
    { fieldId: "lens", order: 0, visible: true, pinned: false, width: "standard" as const },
    { fieldId: "shotNumber", order: 1, visible: true, pinned: true, width: "compact" as const },
    { fieldId: "frame", order: 2, visible: false, pinned: false, width: "wide" as const },
  ];
  const model = buildExportModel(projectWithColumnPresentation(project, presentation));
  expect(model.fields.slice(0, 2).map(field => field.label)).toEqual(["镜号", "焦距"]);
  expect(model.fields.map(field => field.id)).not.toContain("frame");
  expect(model.rows[0].cells[1].text).toBe("35mm");
  expect(project.fields.find(field => field.id === "frame")!.visible).toBe(true);
});
