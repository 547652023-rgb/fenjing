import { createProject } from "../domain/storyboard";
import { buildExportModel, exportFilename } from "./storyboardExport";

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

it("limits frame images to five and reference images to one", () => {
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
  expect(row.cells.find((cell) => cell.fieldId === "reference")?.images).toHaveLength(1);
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
