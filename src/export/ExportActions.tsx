import { useState } from "react";
import type { StoryboardProject } from "../domain/storyboard";
import { exportStoryboardExcel } from "./excelExport";
import { exportStoryboardPdf } from "./pdfExport";

type ExportActionsProps = {
  project: StoryboardProject;
  exportExcel?: (project: StoryboardProject) => Promise<void>;
  exportPdf?: (project: StoryboardProject) => Promise<void>;
};

export function ExportActions({
  project,
  exportExcel = exportStoryboardExcel,
  exportPdf = exportStoryboardPdf,
}: ExportActionsProps) {
  const [active, setActive] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState("");

  async function run(format: "excel" | "pdf") {
    if (active) return;
    setActive(format);
    setError("");
    try {
      await (format === "excel" ? exportExcel(project) : exportPdf(project));
    } catch {
      setError("导出失败，请稍后重试");
    } finally {
      setActive(null);
    }
  }

  return (
    <div className="export-actions">
      <button
        disabled={active !== null}
        type="button"
        onClick={() => void run("excel")}
      >
        {active === "excel" ? "正在导出 Excel…" : "导出 Excel"}
      </button>
      <button
        disabled={active !== null}
        type="button"
        onClick={() => void run("pdf")}
      >
        {active === "pdf" ? "正在导出 PDF…" : "导出 PDF"}
      </button>
      {error ? <p className="export-actions__error" role="alert">{error}</p> : null}
    </div>
  );
}
