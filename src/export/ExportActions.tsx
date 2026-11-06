import { withDeadline } from "../lib/requestDeadline";
import { useEffect, useRef, useState } from "react";
import { projectWithColumnPresentation, type ColumnPresentation } from "../domain/storyboardViews";
import type { StoryboardProject } from "../domain/storyboard";
import { createStoryboardExcel } from "./excelExport";
import { createStoryboardPdf, exportStoryboardPdf } from "./pdfExport";
import { exportFilename, type ExportLogo, type ExportOptions, type PdfSettings } from "./storyboardExport";
import { downloadBlob } from "./download";
import defaultLogoUrl from "../assets/dapaidang-logo.png";

const defaultLogo: ExportLogo = {
  name: "大拍档logo.png",
  url: defaultLogoUrl,
  type: "image/png",
};

type ExportScope = "all" | "filtered" | "selected";

type ExportActionsProps = {
  pendingImages?: number;
  filteredShotIds?: string[];
  selectedShotIds?: string[];
  project: StoryboardProject;
  documentLabel?: string;
  columnPresentation?: ColumnPresentation[];
  createPdfPreview?: typeof createStoryboardPdf;
  createExcel?: typeof createStoryboardExcel;
  exportExcel?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
  exportPdf?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
};

export function ExportActions({
  project,
  pendingImages = 0,
  filteredShotIds,
  selectedShotIds,
  documentLabel,
  columnPresentation,
  createPdfPreview = createStoryboardPdf,
  createExcel = createStoryboardExcel,
  exportExcel,
  exportPdf = exportStoryboardPdf,
}: ExportActionsProps) {
  const [active, setActive] = useState<"excel" | "pdf" | null>(null);
  const excelRequest = useRef<AbortController>();
  const [excelError, setExcelError] = useState("");
  const [workbook, setWorkbook] = useState<{ blob: Blob; key: string; missingCount: number; filename: string }>();
  const previewRequest = useRef<AbortController>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [logo, setLogo] = useState<ExportLogo | undefined>();

  const [pdf, setPdf] = useState<PdfSettings>({ orientation: "landscape", textSize: 14, imageHeight: 144 });
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const [pdfColumns, setPdfColumns] = useState<string[]>();
  const [preview, setPreview] = useState<{ url: string; blob: Blob; key: string; missingCount: number }>();
  const [scope, setScope] = useState<ExportScope>("all");
  const scopedIds = scope === "filtered" ? filteredShotIds : scope === "selected" ? selectedShotIds : undefined;
  const idSet = new Set(scopedIds);
  const shots = scope === "all" ? project.shots : project.shots.filter((shot) => idSet.has(shot.id));
  const emptyScope = scope !== "all" && shots.length === 0;

  useEffect(() => () => {
    if (logo) URL.revokeObjectURL(logo.url);
  }, [logo]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => () => {
    previewRequest.current?.abort();
    excelRequest.current?.abort();
  }, []);

  const deliveryProject = projectWithColumnPresentation(scope === "all" ? project : { ...project, shots }, columnPresentation);
  const availableFields = [...deliveryProject.fields].sort((left, right) => left.order - right.order);
  const selectedColumns = pdfColumns?.filter(id => availableFields.some(field => field.id === id))
    ?? availableFields.filter(field => field.visible).map(field => field.id);
  const pdfProject = pdfColumns ? {
    ...deliveryProject,
    fields: availableFields.map(field => ({
      ...field, visible: selectedColumns.includes(field.id), order: selectedColumns.indexOf(field.id),
    })),
  } : deliveryProject;
  const pdfOptions = { logo: logo ?? defaultLogo, documentLabel, pdf };
  const previewKey = open ? JSON.stringify([pdfProject, pdfOptions]) : "";
  const currentPreview = preview?.key === previewKey ? preview : undefined;
  const workbookKey = open ? JSON.stringify([deliveryProject, logo ?? defaultLogo, documentLabel]) : "";
  const currentWorkbook = workbook?.key === workbookKey ? workbook : undefined;

  useEffect(() => {
    const request = excelRequest.current;
    if (request) {
      excelRequest.current = undefined;
      request.abort();
      setActive(null);
    }
    setWorkbook(undefined);
    setExcelError("");
  }, [workbookKey]);

  function cancelPreview() {
    previewRequest.current?.abort();
    previewRequest.current = undefined;
    setIsPreviewing(false);
  }

  function cancelExcel() {
    excelRequest.current?.abort();
    excelRequest.current = undefined;
    setActive(null);
  }

  async function generateExcel() {
    if (active || excelRequest.current || emptyScope || pendingImages > 0) return;
    cancelPreview();
    const controller = new AbortController();
    excelRequest.current = controller;
    setActive("excel");
    setExcelError("");
    setWorkbook(undefined);
    const missing = new Set<string>();
    const options = { logo: logo ?? defaultLogo, documentLabel, signal: controller.signal, onImageError: (url: string) => { missing.add(url); } };
    try {
      const filename = exportFilename(project, "xlsx", new Date(), documentLabel);
      if (exportExcel) {
        await withDeadline(exportExcel(deliveryProject, options), 45_000, "Excel 导出生成超时，请重试", controller.signal);
        if (excelRequest.current === controller && !controller.signal.aborted) close();
      } else {
        const blob = await withDeadline(createExcel(deliveryProject, options), 45_000, "Excel 导出生成超时，请重试", controller.signal);
        if (excelRequest.current !== controller || controller.signal.aborted) return;
        if (missing.size) {
          setWorkbook({ blob, key: workbookKey, missingCount: missing.size, filename });
        } else {
          downloadBlob(blob, filename);
          close();
        }
      }
    } catch (failure) {
      if (excelRequest.current === controller && !controller.signal.aborted) {
        setExcelError(failure instanceof Error && failure.message.includes("超时") ? failure.message : "导出失败，请稍后重试");
      }
    } finally {
      controller.abort();
      if (excelRequest.current === controller) {
        excelRequest.current = undefined;
        setActive(null);
      }
    }
  }

  async function generatePreview(downloadWhenReady = false) {
    if (previewRequest.current || pendingImages > 0) return;
    const controller = new AbortController();
    previewRequest.current = controller;
    setError("");
    setIsPreviewing(true);
    const missing = new Set<string>();
    try {
      const blob = await withDeadline(
        createPdfPreview(pdfProject, { ...pdfOptions, signal: controller.signal, onImageError: url => { missing.add(url); } }), 45_000, "PDF 预览生成超时，请重试", controller.signal,
      );
      if (previewRequest.current === controller) {
        if (downloadWhenReady && !missing.size) {
          downloadBlob(blob, exportFilename(project, "pdf", new Date(), documentLabel));
          close();
        } else {
          setPreview({ url: URL.createObjectURL(blob), blob, key: previewKey, missingCount: missing.size });
          if (missing.size) setShowPdfSettings(true);
        }
      }
    } catch (failure) {
      if (previewRequest.current === controller) setError(failure instanceof Error ? failure.message : "生成 PDF 预览失败");
    } finally {
      controller.abort();
      if (previewRequest.current === controller) {
        previewRequest.current = undefined;
        setIsPreviewing(false);
      }
    }
  }

  function movePdfColumn(id: string, offset: number) {
    const order = [...selectedColumns];
    const index = order.indexOf(id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= order.length) return;
    [order[index], order[destination]] = [order[destination], order[index]];
    setPdfColumns(order);
  }

  function close() {
    cancelExcel();
    cancelPreview();
    setOpen(false);
    setError("");
    setLogo(undefined);
    setPreview(undefined);
    setWorkbook(undefined);
    setExcelError("");
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg" && file.type !== "image/webp") {
      setError("请选择有效的 PNG、JPG 或 WebP 图片");
      return;
    }
    setError("");
    setLogo({
      name: file.name,
      url: URL.createObjectURL(file),
      type: file.type,
    });
  }

  async function run(format: "excel" | "pdf") {
    if (active || emptyScope || pendingImages > 0) return;
    if (format === "excel") {
      if (currentWorkbook) {
        downloadBlob(currentWorkbook.blob, currentWorkbook.filename);
        close();
      } else {
        await generateExcel();
      }
      return;
    }
    cancelPreview();
    setActive(format);
    setError("");
    try {
      if (exportPdf === exportStoryboardPdf) {
        if (currentPreview) {
          downloadBlob(currentPreview.blob, exportFilename(project, "pdf", new Date(), documentLabel));
        } else {
          await generatePreview(true);
          return;
        }
      } else {
        await exportPdf(pdfProject, pdfOptions);
      }
      close();
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setActive(null);
    }
  }

  return (
    <div className="export-actions">
      <button aria-label="导出文件" disabled={pendingImages > 0} title={pendingImages > 0 ? "图片上传完成后可导出" : undefined} type="button" onClick={() => { setScope("all"); setOpen(true); }}>导出交付</button>
      {open ? <div className="export-overlay">
        <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
          <header className="export-dialog__header">
            <div>
              <p className="export-dialog__kicker">DELIVERY ROOM</p>
              <h2 id="export-dialog-title">导出交付</h2>
            </div>
            <button aria-label="关闭导出交付" className="export-dialog__close" disabled={active !== null} type="button" onClick={close}>×</button>
          </header>
          <dl className="export-dialog__summary">
            <div><dt>项目</dt><dd>{project.title}</dd></div>
            {documentLabel ? <div><dt>交付版本</dt><dd>{documentLabel}</dd></div> : null}
            <div><dt>画幅</dt><dd>{project.aspectRatio || "16:9"}</dd></div>
            <div><dt>镜头</dt><dd>{shots.length} 个</dd></div>
          </dl>
          {filteredShotIds || selectedShotIds ? (
            <label className="export-dialog__logo export-dialog__scope">
              <span>导出范围</span>
              <select disabled={active !== null || isPreviewing} value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
                <option value="all">全部镜头</option>
                {filteredShotIds ? <option value="filtered">当前筛选结果</option> : null}
                {selectedShotIds ? <option value="selected">已勾选镜头</option> : null}
              </select>
              {emptyScope ? <span role="status">此范围没有镜头，请选择其他范围。</span> : null}
            </label>
          ) : null}
          <label className="export-dialog__logo">
            <span>本次导出 Logo</span>
            <input disabled={active !== null || isPreviewing} aria-label="本次导出 Logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} />
          </label>
          <div className="export-dialog__logo-preview"><img src={logo?.url ?? defaultLogo.url} alt="Logo 预览" /><span>{logo?.name ?? defaultLogo.name}</span>{logo ? <button className="button-quiet" disabled={active !== null || isPreviewing} type="button" onClick={() => setLogo(undefined)}>恢复默认 Logo</button> : null}</div>
          <details className="export-pdf-settings" open={showPdfSettings} onToggle={event => setShowPdfSettings(event.currentTarget.open)}>
            <summary>PDF 排版与预览</summary>
            <fieldset disabled={active !== null || isPreviewing}>
              <legend>页面设置</legend>
              <label>纸张方向<select value={pdf.orientation} onChange={event => setPdf({ ...pdf, orientation: event.target.value as PdfSettings["orientation"] })}>
                <option value="landscape">横版</option><option value="portrait">竖版</option>
              </select></label>
              <label>文字大小<select value={pdf.textSize} onChange={event => setPdf({ ...pdf, textSize: Number(event.target.value) as PdfSettings["textSize"] })}>
                <option value={12}>小</option><option value={14}>中</option><option value={16}>大</option>
              </select></label>
              <label>图片大小<select value={pdf.imageHeight} onChange={event => setPdf({ ...pdf, imageHeight: Number(event.target.value) as PdfSettings["imageHeight"] })}>
                <option value={104}>小</option><option value={144}>中</option><option value={184}>大</option>
              </select></label>
            </fieldset>
            <details>
              <summary>导出列（{selectedColumns.length}）</summary>
              <fieldset disabled={active !== null || isPreviewing}>
                <legend>选择和排列 PDF 列</legend>
                {[...selectedColumns, ...availableFields.map(field => field.id).filter(id => !selectedColumns.includes(id))].map(id => {
                  const field = availableFields.find(item => item.id === id);
                  if (!field) return null;
                  const index = selectedColumns.indexOf(id);
                  return <div key={id} className="export-pdf-column">
                    <label><input type="checkbox" checked={index >= 0} onChange={event => setPdfColumns(event.target.checked ? [...selectedColumns, id] : selectedColumns.filter(column => column !== id))} />{field.label}</label>
                    {index >= 0 ? <><button type="button" aria-label={`上移 ${field.label}`} disabled={index === 0} onClick={() => movePdfColumn(id, -1)}>↑</button>
                    <button type="button" aria-label={`下移 ${field.label}`} disabled={index === selectedColumns.length - 1} onClick={() => movePdfColumn(id, 1)}>↓</button></> : null}
                  </div>;
                })}
              </fieldset>
            </details>
            <button type="button" disabled={active !== null || isPreviewing || pendingImages > 0 || emptyScope || !selectedColumns.length} onClick={() => void generatePreview()}>
              {isPreviewing ? "正在生成 PDF 预览…" : "生成 PDF 预览"}
            </button>
            {isPreviewing ? <button className="button-quiet" type="button" onClick={cancelPreview}>取消生成预览</button> : null}
            {currentPreview ? <><iframe title="分镜 PDF 分页预览" src={currentPreview.url} />
              <a href={currentPreview.url} target="_blank" rel="noreferrer">在新标签页打开预览</a></> : null}
            {preview && !currentPreview ? <p role="status">设置已变更，请重新生成预览。</p> : null}
          </details>
          {currentPreview && currentPreview.missingCount > 0 ? <div>
            <p className="export-actions__error" role="alert">有 {currentPreview.missingCount} 张图片加载失败（含 Logo），PDF 可能缺图。请重试或检查预览后下载。</p>
            <button type="button" disabled={active !== null || isPreviewing || pendingImages > 0 || emptyScope} onClick={() => void generatePreview()}>重试加载图片</button>
          </div> : null}
          {pendingImages > 0 ? <p role="status">图片仍在上传，完成后可导出。</p> : null}
          {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
          {excelError ? <div className="export-actions__error">
            <p role="alert">{excelError}</p>
            <button type="button" disabled={active !== null || pendingImages > 0 || emptyScope} onClick={() => void generateExcel()}>重试导出 Excel</button>
          </div> : null}
          {currentWorkbook ? <div className="export-actions__error">
            <p role="alert">有 {currentWorkbook.missingCount} 张图片加载失败（含 Logo），Excel 可能缺图。请重试或确认后下载。</p>
            <button type="button" disabled={active !== null || pendingImages > 0 || emptyScope} onClick={() => void generateExcel()}>重试加载 Excel 图片</button>
          </div> : null}
          <div className="export-dialog__formats">
            <button aria-label={currentWorkbook ? "下载含缺图标记的 Excel" : "导出 Excel"} className="export-format-option" disabled={active !== null || pendingImages > 0 || emptyScope} type="button" onClick={() => void run("excel")}>
              <span>Excel</span><strong>{currentWorkbook ? "下载含缺图标记的 Excel" : "可编辑镜头清单"}</strong><small>{active === "excel" ? "正在生成文件…" : "供制片、排期与现场协作使用"}</small>
            </button>
            <button aria-label={currentPreview?.missingCount ? "下载含缺图标记的 PDF" : "导出 PDF"} className="export-format-option export-format-option--dark" disabled={active !== null || isPreviewing || pendingImages > 0 || emptyScope || !selectedColumns.length} type="button" onClick={() => void run("pdf")}>
              <span>PDF</span><strong>{currentPreview?.missingCount ? "下载含缺图标记的 PDF" : "审阅用制片稿"}</strong><small>{active === "pdf" ? "正在生成文件…" : "供导演、客户与团队确认使用"}</small>
            </button>
          </div>
          <div className="export-dialog__footer"><span>文件将在浏览器中下载</span>{active === "excel"
            ? <button className="button-quiet" type="button" onClick={cancelExcel}>取消生成 Excel</button>
            : <button className="button-quiet" disabled={active !== null} type="button" onClick={close}>取消</button>}</div>
        </section>
      </div> : null}
    </div>
  );
}
