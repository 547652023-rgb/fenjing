import type { ShootDayExportModel } from "./shootDayExport";

export function ShootDayPrintView({ model, onClose }: { model: ShootDayExportModel; onClose: () => void }) {
  const day = model.shootDay;
  return <section className="shoot-day-print" aria-label="拍摄日通告单">
    <div className="shoot-day-print__actions"><button type="button" onClick={() => window.print()}>打印通告单</button><button type="button" onClick={onClose}>关闭</button></div>
    <header><p>{model.projectTitle}</p><h2>{day.title} 拍摄通告</h2><p>{day.shootDate || "日期待定"} · {day.location || "地点待定"}</p></header>
    <dl><div><dt>集合</dt><dd>{day.callTime || "待定"}</dd></div><div><dt>收工</dt><dd>{day.wrapTime || "待定"}</dd></div><div><dt>负责人</dt><dd>{day.coordinator || "待确认"}</dd></div><div><dt>备注</dt><dd>{day.notes || "—"}</dd></div></dl>
    <p>镜头 {model.summary.shotCount} 个 · 总时长 {model.summary.totalDurationSeconds} 秒</p>
    {model.rows.length ? <table><thead><tr>{model.fields.map((field) => <th key={field.id}>{field.label}</th>)}</tr></thead><tbody>{model.rows.map((row) => <tr key={row.shotId}>{model.fields.map((field) => <td key={field.id}>{row.cells.find((cell) => cell.fieldId === field.id)?.text || "—"}</td>)}</tr>)}</tbody></table> : <p>暂无已排镜头</p>}
  </section>;
}
