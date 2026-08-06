import { useEffect, useState } from "react";
import type { StoryboardProject } from "../domain/storyboard";
import { exportStoryboardExcel } from "./excelExport";
import { exportStoryboardPdf } from "./pdfExport";
import type { ExportLogo, ExportOptions } from "./storyboardExport";

type ExportActionsProps = {
  project: StoryboardProject;
  exportExcel?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
  exportPdf?: (project: StoryboardProject, options?: ExportOptions) => Promise<void>;
};

export function ExportActions({
  project,
  exportExcel = exportStoryboardExcel,
  exportPdf = exportStoryboardPdf,
}: ExportActionsProps) {
  const [active, setActive] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [logo, setLogo] = useState<ExportLogo | undefined>();

  useEffect(() => () => {
    if (logo) URL.revokeObjectURL(logo.url);
  }, [logo]);

  function close() {
    if (active) return;
    setOpen(false);
    setError("");
    setLogo(undefined);
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
    if (active) return;
    setActive(format);
    setError("");
    try {
      await (format === "excel" ? exportExcel(project, { logo }) : exportPdf(project, { logo }));
      close();
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setActive(null);
    }
  }

  return (
    <div className="export-actions">
      <button aria-label="导出文件" type="button" onClick={() => setOpen(true)}>导出交付</button>
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
            <div><dt>画幅</dt><dd>{project.aspectRatio || "16:9"}</dd></div>
            <div><dt>镜头</dt><dd>{project.shots.length} 个</dd></div>
          </dl>
          <label className="export-dialog__logo">
            <span>本次导出 Logo</span>
            <input aria-label="本次导出 Logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} />
          </label>
          {logo ? <div className="export-dialog__logo-preview"><img src={logo.url} alt="Logo 预览" /><span>{logo.name}</span><button className="button-quiet" type="button" onClick={() => setLogo(undefined)}>移除</button></div> : null}
          {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
          <div className="export-dialog__formats">
            <button className="export-format-option" disabled={active !== null} type="button" onClick={() => void run("excel")}>
              <span>Excel</span><strong>可编辑镜头清单</strong><small>{active === "excel" ? "正在生成文件…" : "供制片、排期与现场协作使用"}</small>
            </button>
            <button className="export-format-option export-format-option--dark" disabled={active !== null} type="button" onClick={() => void run("pdf")}>
              <span>PDF</span><strong>审阅用制片稿</strong><small>{active === "pdf" ? "正在生成文件…" : "供导演、客户与团队确认使用"}</small>
            </button>
          </div>
          <div className="export-dialog__footer"><span>文件将在浏览器中下载</span><button className="button-quiet" disabled={active !== null} type="button" onClick={close}>取消</button></div>
        </section>
      </div> : null}
    </div>
  );
}
