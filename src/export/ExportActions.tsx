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
      <button type="button" onClick={() => setOpen(true)}>导出文件</button>
      {open ? <div className="export-dialog" role="dialog" aria-modal="true" aria-label="导出文件设置">
        <h2>导出文件</h2>
        <p>项目名称：{project.title}</p>
        <p>画幅比例：{project.aspectRatio || "16:9"}</p>
        <p>镜头总数：{project.shots.length}</p>
        <label>
          本次导出 Logo
          <input aria-label="本次导出 Logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} />
        </label>
        {logo ? <div><img src={logo.url} alt="Logo 预览" /><span>{logo.name}</span><button type="button" onClick={() => setLogo(undefined)}>移除 Logo</button></div> : null}
        {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
        <div className="export-dialog__buttons">
          <button disabled={active !== null} type="button" onClick={() => void run("excel")}>{active === "excel" ? "正在导出 Excel…" : "导出 Excel"}</button>
          <button disabled={active !== null} type="button" onClick={() => void run("pdf")}>{active === "pdf" ? "正在导出 PDF…" : "导出 PDF"}</button>
          <button disabled={active !== null} type="button" onClick={close}>取消</button>
        </div>
      </div> : null}
    </div>
  );
}
