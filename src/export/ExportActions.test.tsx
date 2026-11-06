import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { createProject } from "../domain/storyboard";
import * as download from "./download";
import { ExportActions } from "./ExportActions";
import type { ExportOptions } from "./storyboardExport";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("applies the shared column limit and header color to Excel and regenerates a changed PDF preview", async () => {
  const project = createProject();
  const first = new Blob(["first"], { type: "application/pdf" });
  const second = new Blob(["second"], { type: "application/pdf" });
  const createPdfPreview = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const exportExcel = vi.fn(async (_project: ReturnType<typeof createProject>, _options?: ExportOptions) => {});
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  const user = userEvent.setup();
  render(<ExportActions project={project} createPdfPreview={createPdfPreview} exportExcel={exportExcel} />);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  const limit = screen.getByLabelText("最多显示列数");
  expect(within(limit).getAllByRole("option").map(option => (option as HTMLOptionElement).value)).toEqual(["", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
  await user.selectOptions(limit, "4");
  await user.click(screen.getByText("PDF 排版与预览"));
  await user.click(screen.getByRole("button", { name: "生成 PDF 预览" }));
  expect(await screen.findByTitle("分镜 PDF 分页预览")).toBeVisible();
  expect(createPdfPreview.mock.calls[0][1]).toMatchObject({ maxColumns: 4, headerColor: "#15803d" });
  await user.selectOptions(screen.getByLabelText("表头颜色"), "#1e3a5f");
  expect(screen.queryByTitle("分镜 PDF 分页预览")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("设置已变更");
  await user.click(screen.getByRole("button", { name: "生成 PDF 预览" }));
  expect(await screen.findByTitle("分镜 PDF 分页预览")).toBeVisible();
  expect(createPdfPreview.mock.calls[1][1]).toMatchObject({ maxColumns: 4, headerColor: "#1e3a5f" });
  await user.click(screen.getByRole("button", { name: "导出 PDF" }));
  expect(save.mock.calls[0][0]).toBe(second);
  expect(createPdfPreview).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  expect(exportExcel.mock.calls[0][1]).toMatchObject({ maxColumns: 4, headerColor: "#1e3a5f" });
});

it("invalidates a reviewed Excel workbook after either shared setting changes", async () => {
  const blobs = [new Blob(["one"]), new Blob(["two"]), new Blob(["three"])];
  const options: ExportOptions[] = [];
  const createExcel = async (_project: ReturnType<typeof createProject>, value: ExportOptions = {}) => {
    options.push(value);
    value.onImageError?.("missing");
    return blobs[options.length - 1];
  };
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  const user = userEvent.setup();
  render(<ExportActions project={createProject()} createExcel={createExcel} />);
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  await user.selectOptions(screen.getByLabelText("最多显示列数"), "4");
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  expect(await screen.findByRole("button", { name: "下载含缺图标记的 Excel" })).toBeEnabled();
  await user.selectOptions(screen.getByLabelText("最多显示列数"), "5");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  expect(await screen.findByRole("button", { name: "下载含缺图标记的 Excel" })).toBeEnabled();
  await user.selectOptions(screen.getByLabelText("表头颜色"), "#7f1d1d");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  await user.click(await screen.findByRole("button", { name: "下载含缺图标记的 Excel" }));
  expect(options.map(option => [option.maxColumns, option.headerColor])).toEqual([[4, "#15803d"], [5, "#15803d"], [5, "#7f1d1d"]]);
  expect(save.mock.calls[0][0]).toBe(blobs[2]);
});

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

it("warns about missing preview images and clears the warning after a successful retry", async () => {
  const createPdfPreview = vi.fn(async (_project, options) => {
    if (createPdfPreview.mock.calls.length === 1) {
      options.onImageError("broken");
      options.onImageError("broken");
    }
    return new Blob(["pdf"]);
  });
  render(<ExportActions project={createProject()} createPdfPreview={createPdfPreview} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  fireEvent.click(screen.getByText("PDF 排版与预览"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "生成 PDF 预览" })));
  expect(screen.getByRole("alert")).toHaveTextContent("有 1 张图片加载失败（含 Logo），PDF 可能缺图。请重试或检查预览后下载。");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "重试加载图片" })));
  expect(createPdfPreview).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("holds a direct PDF download with missing images for review", async () => {
  const createPdfPreview = vi.fn(async (_project, options) => {
    options.onImageError("broken");
    return new Blob(["pdf"]);
  });
  render(<ExportActions project={createProject()} createPdfPreview={createPdfPreview} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 PDF" })));
  expect(createPdfPreview).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("有 1 张图片加载失败");
  expect(screen.getByRole("button", { name: "下载含缺图标记的 PDF" })).toBeEnabled();
  expect(screen.getByTitle("分镜 PDF 分页预览")).toBeVisible();
});


it("downloads the exact reviewed incomplete PDF only after an explicit click", async () => {
  const blob = new Blob(["incomplete"]);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  const createPdfPreview = vi.fn(async (_project, options) => {
    options.onImageError("broken");
    return blob;
  });
  render(<ExportActions project={createProject()} createPdfPreview={createPdfPreview} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 PDF" })));
  expect(save).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "下载含缺图标记的 PDF" })));
  expect(createPdfPreview).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(blob, expect.stringContaining(".pdf"));
  save.mockRestore();
});

it("downloads a complete direct PDF without leaving a redundant preview URL", async () => {
  const blob = new Blob(["complete"]);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  const createUrl = vi.spyOn(URL, "createObjectURL");
  render(<ExportActions project={createProject()} createPdfPreview={async () => blob} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 PDF" })));
  expect(save).toHaveBeenCalledWith(blob, expect.stringContaining(".pdf"));
  expect(createUrl).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  save.mockRestore();
  createUrl.mockRestore();
});

it("holds an incomplete Excel workbook and downloads the exact generated blob only on acceptance", async () => {
  const blob = new Blob(["incomplete workbook"]);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  const createExcel = vi.fn(async (_project, options) => {
    options.onImageError("broken");
    options.onImageError("broken");
    options.onImageError("logo");
    return blob;
  });
  render(<ExportActions project={createProject()} createExcel={createExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 Excel" })));
  expect(screen.getByRole("alert")).toHaveTextContent("有 2 张图片加载失败（含 Logo），Excel 可能缺图");
  expect(save).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "下载含缺图标记的 Excel" })));
  expect(save).toHaveBeenCalledWith(blob, expect.stringContaining(".xlsx"));
  expect(createExcel).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("retries failed Excel images and downloads the recovered workbook", async () => {
  const recovered = new Blob(["recovered workbook"]);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  let attempt = 0;
  const createExcel = vi.fn(async (_project, options) => {
    if (++attempt === 1) { options.onImageError("broken"); return new Blob(["incomplete"]); }
    return recovered;
  });
  render(<ExportActions project={createProject()} createExcel={createExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 Excel" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "重试加载 Excel 图片" })));
  expect(save).toHaveBeenCalledWith(recovered, expect.stringContaining(".xlsx"));
  expect(createExcel).toHaveBeenCalledTimes(2);
});

it("cancels direct Excel generation and rejects its late download", async () => {
  const pending = deferred<Blob>();
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  let signal: AbortSignal | undefined;
  const createExcel = vi.fn((_project, options) => { signal = options.signal; return pending.promise; });
  render(<ExportActions project={createProject()} createExcel={createExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 Excel" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "取消生成 Excel" })));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  await act(async () => pending.resolve(new Blob(["late workbook"])));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("times out direct Excel generation, aborts its request, and allows a fresh retry", async () => {
  vi.useFakeTimers();
  const pending = deferred<Blob>();
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  let signal: AbortSignal | undefined;
  let attempt = 0;
  const recovered = new Blob(["retry"]);
  const createExcel = vi.fn((_project, options) => {
    signal = options.signal;
    return ++attempt === 1 ? pending.promise : Promise.resolve(recovered);
  });
  render(<ExportActions project={createProject()} createExcel={createExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 Excel" }));
  await act(() => vi.advanceTimersByTimeAsync(45_000));
  expect(screen.getByRole("alert")).toHaveTextContent("Excel 导出生成超时");
  expect(signal?.aborted).toBe(true);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "重试导出 Excel" })));
  expect(save).toHaveBeenCalledWith(recovered, expect.stringContaining(".xlsx"));
  await act(async () => pending.resolve(new Blob(["late"])));
  expect(save).toHaveBeenCalledOnce();
});

it("preserves a reviewed PDF when Excel generation is cancelled", async () => {
  const pending = deferred<Blob>();
  const pdf = new Blob(["pdf"]);
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  render(<ExportActions project={createProject()} createPdfPreview={async () => pdf} createExcel={() => pending.promise} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  fireEvent.click(screen.getByText("PDF 排版与预览"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "生成 PDF 预览" })));
  const previewUrl = screen.getByTitle("分镜 PDF 分页预览").getAttribute("src");
  fireEvent.click(screen.getByRole("button", { name: "导出 Excel" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "取消生成 Excel" })));
  expect(screen.getByTitle("分镜 PDF 分页预览")).toHaveAttribute("src", previewUrl);
  await act(async () => pending.resolve(new Blob(["late"])));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "导出 PDF" })));
  expect(save).toHaveBeenCalledWith(pdf, expect.stringContaining(".pdf"));
});

it.each(["project", "scope"] as const)("invalidates a running Excel export when its %s changes", async change => {
  const project = createProject();
  project.shots = [project.shots[0], { ...project.shots[0], id: "second" }];
  const pending = deferred<Blob>();
  const save = vi.spyOn(download, "downloadBlob").mockImplementation(() => {});
  let signal: AbortSignal | undefined;
  const createExcel = vi.fn((_project, options) => { signal = options.signal; return pending.promise; });
  const { rerender } = render(<ExportActions project={project} filteredShotIds={[project.shots[0].id]} createExcel={createExcel} />);
  fireEvent.click(screen.getByRole("button", { name: "导出文件" }));
  if (change === "scope") fireEvent.change(screen.getByLabelText("导出范围"), { target: { value: "filtered" } });
  fireEvent.click(screen.getByRole("button", { name: "导出 Excel" }));
  rerender(<ExportActions project={change === "project" ? { ...project, title: "Updated project" } : project}
    filteredShotIds={change === "scope" ? ["second"] : [project.shots[0].id]} createExcel={createExcel} />);
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  await act(async () => pending.resolve(new Blob(["stale workbook"])));
  expect(save).not.toHaveBeenCalled();
});
