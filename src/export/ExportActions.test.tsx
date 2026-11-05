import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { ExportActions } from "./ExportActions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("opens export settings and passes a temporary logo to the selected exporter", async () => {
  const project = createProject();
  const pending = deferred<void>();
  const exportExcel = vi.fn(() => pending.promise);
  const exportPdf = vi.fn(async () => {});
  const user = userEvent.setup();

  render(
    <ExportActions
      exportExcel={exportExcel}
      exportPdf={exportPdf}
      project={project}
    />,
  );

  expect(screen.getByRole("button", { name: "导出文件" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "导出文件" }));

  const dialog = screen.getByRole("dialog", { name: "导出交付" });
  expect(within(dialog).getByText(project.title)).toBeVisible();
  expect(within(dialog).getByText("16:9")).toBeVisible();
  expect(within(dialog).getByText("1 个")).toBeVisible();
  expect(within(dialog).getByText("可编辑镜头清单")).toBeVisible();
  expect(within(dialog).getByText("审阅用制片稿")).toBeVisible();
  const logo = new File(["logo"], "logo.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("本次导出 Logo"), logo);
  expect(screen.getByText("logo.png")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "导出 Excel" }));

  expect(exportExcel).toHaveBeenCalledWith(project, expect.objectContaining({
    logo: expect.objectContaining({ name: "logo.png", url: expect.any(String) }),
  }));
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();

  pending.resolve();
  expect(await screen.findByRole("button", { name: "导出文件" })).toBeEnabled();
});

it("uses the built-in 大拍档 logo when no temporary logo is selected", async () => {
  const project = createProject();
  const exportExcel = vi.fn(async () => {});
  const user = userEvent.setup();

  render(<ExportActions exportExcel={exportExcel} exportPdf={async () => {}} project={project} />);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.getByText("大拍档logo.png")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));

  expect(exportExcel).toHaveBeenCalledWith(project, expect.objectContaining({
    logo: expect.objectContaining({ name: "大拍档logo.png", type: "image/png" }),
  }));
});

it("keeps settings open after an export error and clears the temporary logo when closed", async () => {
  const project = createProject();
  const pending = deferred<void>();
  const user = userEvent.setup();

  render(
    <ExportActions
      exportExcel={() => pending.promise}
      exportPdf={async () => {}}
      project={project}
    />,
  );

  await user.click(screen.getByRole("button", { name: "导出文件" }));
  const logo = new File(["logo"], "logo.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("本次导出 Logo"), logo);
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  pending.reject(new Error("download failed"));

  expect(await screen.findByRole("alert")).toHaveTextContent("导出失败，请稍后重试");
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "取消" }));
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.queryByText("logo.png")).not.toBeInTheDocument();
});

it("identifies a call-sheet delivery in the export dialog and exporter options", async () => {
  const project = createProject();
  const exportExcel = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<ExportActions project={project} documentLabel="拍摄通告 · 2026-08-13 · V2" exportExcel={exportExcel} exportPdf={async () => {}} />);

  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.getByText("拍摄通告 · 2026-08-13 · V2")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  expect(exportExcel).toHaveBeenCalledWith(project, expect.objectContaining({ documentLabel: "拍摄通告 · 2026-08-13 · V2" }));
});

it("sends the current visible column order to both delivery formats", async () => {
  const project = createProject();
  const captured: string[][] = [];
  const exporter = async (delivery: typeof project) => {
    captured.push(delivery.fields.filter(field => field.visible).sort((a, b) => a.order - b.order).map(field => field.id));
  };
  const columns = project.fields.map(field => ({ fieldId: field.id, order: field.id === "lens" ? 1 : field.order + 2, visible: ["shotNumber", "lens", "frame"].includes(field.id), width: "standard" as const, pinned: field.id === "shotNumber" }));
  const user = userEvent.setup();
  render(<ExportActions project={project} columnPresentation={columns} exportExcel={exporter} exportPdf={exporter} />);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  await user.click(screen.getByRole("button", { name: "导出 PDF" }));
  expect(captured).toEqual([["shotNumber", "lens", "frame"], ["shotNumber", "lens", "frame"]]);
});

it("exports only the chosen scope in project order and prevents empty exports", async () => {
  const project = createProject();
  const first = project.shots[0];
  project.shots = [first, { ...first, id: "2" }, { ...first, id: "3" }];
  const excel = vi.fn(async () => {});
  const pdf = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<ExportActions project={project} filteredShotIds={[]} selectedShotIds={["3", first.id]} exportExcel={excel} exportPdf={pdf} />);

  await user.click(screen.getByRole("button", { name: "导出文件" }));
  const scope = screen.getByLabelText("导出范围");
  expect(scope).toHaveValue("all");
  await user.selectOptions(scope, "filtered");
  expect(screen.getByText("0 个")).toBeVisible();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();
  await user.selectOptions(scope, "selected");
  expect(screen.getByText("2 个")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "导出 PDF" }));
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ shots: [first, project.shots[2]] }), expect.anything());

  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.getByLabelText("导出范围")).toHaveValue("all");
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  expect(excel).toHaveBeenCalledWith(project, expect.anything());
});

it("opens PDF settings with page orientation and a preview action", async () => {
  const user = userEvent.setup();
  render(<ExportActions project={createProject()} />);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  await user.click(screen.getByText("PDF 排版与预览"));
  expect(screen.getByLabelText("纸张方向")).toHaveValue("landscape");
  expect(screen.getByRole("button", { name: "生成 PDF 预览" })).toBeVisible();
});

it("cancels a stalled preview and keeps Excel available", async () => {
  const pending = deferred<Blob>();
  const createPdfPreview = vi.fn(() => pending.promise);
  const exportExcel = vi.fn(async () => {});
  render(<ExportActions project={createProject()} createPdfPreview={createPdfPreview} exportExcel={exportExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  fireEvent.click(screen.getByText("PDF 排版与预览"));
  fireEvent.click(screen.getByRole("button", { name: "生成 PDF 预览" }));
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "取消生成预览" })));
  expect(screen.getByRole("button", { name: "生成 PDF 预览" })).toBeEnabled();
  await act(async () => pending.resolve(new Blob(["late"])));
  expect(screen.queryByTitle("分镜 PDF 分页预览")).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 Excel" })));
  expect(exportExcel).toHaveBeenCalledOnce();
});

it("offers retry after the preview deadline expires", async () => {
  vi.useFakeTimers();
  try {
    const createPdfPreview = vi.fn(() => new Promise<Blob>(() => {}));
    render(<ExportActions project={createProject()} createPdfPreview={createPdfPreview} />);
    fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
    fireEvent.click(screen.getByText("PDF 排版与预览"));
    fireEvent.click(screen.getByRole("button", { name: "生成 PDF 预览" }));
    await act(() => vi.advanceTimersByTimeAsync(45_000));
    expect(screen.getByRole("alert")).toHaveTextContent("PDF 预览生成超时");
    expect(screen.getByRole("button", { name: "生成 PDF 预览" })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});
