import { withDeadline } from "../lib/requestDeadline";
import { useEffect, useRef, useState } from "react";
import { projectWithColumnPresentation, type ColumnPresentation } from "../domain/storyboardViews";
import type { StoryboardProject } from "../domain/storyboard";
import { exportStoryboardExcel } from "./excelExport";
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
  filteredShotIds?: string[];
  selectedShotIds?: string[];
  project: StoryboardProject;
  documentLabel?: string;
  columnPresentation?: ColumnPresentation[];
  createPdfPreview?: typeof createStoryboardPdf;
  exportExcel?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
  exportPdf?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
};

export function ExportActions({
  project,
  filteredShotIds,
  selectedShotIds,
  documentLabel,
  columnPresentation,
  createPdfPreview = createStoryboardPdf,
  exportExcel = exportStoryboardExcel,
  exportPdf = exportStoryboardPdf,
}: ExportActionsProps) {
  const [active, setActive] = useState<"excel" | "pdf" | null>(null);
  const previewRequest = useRef<AbortController>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [logo, setLogo] = useState<ExportLogo | undefined>();

  const [pdf, setPdf] = useState<PdfSettings>({ orientation: "landscape", textSize: 14, imageHeight: 144 });
  const [pdfColumns, setPdfColumns] = useState<string[]>();
  const [preview, setPreview] = useState<{ url: string; blob: Blob; key: string }>();
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

  useEffect(() => () => previewRequest.current?.abort(), []);

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

  function cancelPreview() {
    previewRequest.current?.abort();
    previewRequest.current = undefined;
    setIsPreviewing(false);
  }

  async function generatePreview() {
    if (previewRequest.current) return;
    const controller = new AbortController();
    previewRequest.current = controller;
    setError("");
    setIsPreviewing(true);
    try {
      const blob = await withDeadline(
        createPdfPreview(pdfProject, pdfOptions), 45_000, "PDF 预览生成超时，请重试", controller.signal,
      );
      if (previewRequest.current === controller) setPreview({ url: URL.createObjectURL(blob), blob, key: previewKey });
    } catch (failure) {
      if (previewRequest.current === controller) setError(failure instanceof Error ? failure.message : "生成 PDF 预览失败");
    } finally {
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
    if (active) return;
    cancelPreview();
    setOpen(false);
    setError("");
    setLogo(undefined);
    setPreview(undefined);
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
    if (active || emptyScope) return;
    setActive(format);
    setError("");
    try {
      if (format === "excel") {
        await exportExcel(deliveryProject, { logo: logo ?? defaultLogo, documentLabel });
      } else if (currentPreview && exportPdf === exportStoryboardPdf) {
        downloadBlob(currentPreview.blob, exportFilename(project, "pdf", new Date(), documentLabel));
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
      <button aria-label="导出文件" type="button" onClick={() => { setScope("all"); setOpen(true); }}>导出交付</button>
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
              <select disabled={active !== null} value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
                <option value="all">全部镜头</option>
                {filteredShotIds ? <option value="filtered">当前筛选结果</option> : null}
                {selectedShotIds ? <option value="selected">已勾选镜头</option> : null}
              </select>
              {emptyScope ? <span role="status">此范围没有镜头，请选择其他范围。</span> : null}
            </label>
          ) : null}
          <label className="export-dialog__logo">
            <span>本次导出 Logo</span>
            <input aria-label="本次导出 Logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} />
          </label>
          <div className="export-dialog__logo-preview"><img src={logo?.url ?? defaultLogo.url} alt="Logo 预览" /><span>{logo?.name ?? defaultLogo.name}</span>{logo ? <button className="button-quiet" type="button" onClick={() => setLogo(undefined)}>恢复默认 Logo</button> : null}</div>
          <details className="export-pdf-settings">
            <summary>PDF 排版与预览</summary>
            <fieldset disabled={active !== null}>
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
              <fieldset disabled={active !== null}>
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
            <button type="button" disabled={active !== null || isPreviewing || emptyScope || !selectedColumns.length} onClick={() => void generatePreview()}>
              {isPreviewing ? "正在生成 PDF 预览…" : "生成 PDF 预览"}
            </button>
            {isPreviewing ? <button className="button-quiet" type="button" onClick={cancelPreview}>取消生成预览</button> : null}
            {currentPreview ? <><iframe title="分镜 PDF 分页预览" src={currentPreview.url} />
              <a href={currentPreview.url} target="_blank" rel="noreferrer">在新标签页打开预览</a></> : null}
            {preview && !currentPreview ? <p role="status">设置已变更，请重新生成预览。</p> : null}
          </details>
          {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
          <div className="export-dialog__formats">
            <button aria-label="导出 Excel" className="export-format-option" disabled={active !== null || emptyScope} type="button" onClick={() => void run("excel")}>
              <span>Excel</span><strong>可编辑镜头清单</strong><small>{active === "excel" ? "正在生成文件…" : "供制片、排期与现场协作使用"}</small>
            </button>
            <button aria-label="导出 PDF" className="export-format-option export-format-option--dark" disabled={active !== null || isPreviewing || emptyScope || !selectedColumns.length} type="button" onClick={() => void run("pdf")}>
              <span>PDF</span><strong>审阅用制片稿</strong><small>{active === "pdf" ? "正在生成文件…" : "供导演、客户与团队确认使用"}</small>
            </button>
          </div>
          <div className="export-dialog__footer"><span>文件将在浏览器中下载</span><button className="button-quiet" disabled={active !== null} type="button" onClick={close}>取消</button></div>
        </section>
      </div> : null}
    </div>
  );
}
