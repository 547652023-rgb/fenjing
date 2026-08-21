import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Shot, StoryboardScene } from "../domain/storyboard";
import type { CallSheetPrintModel } from "./callSheetPrint";

function Detail({ label, value, fallback = "待定" }: { label: string; value: string; fallback?: string }) {
  return <div><dt>{label}</dt><dd>{value || fallback}</dd></div>;
}

function SceneShots({ scene, shots }: { scene: StoryboardScene; shots: Shot[] }) {
  return <section className="call-sheet-print__scene">
    <h3>场次 {scene.number || "—"} · {scene.name || "未命名场次"}</h3>
    <p>{scene.intExt || "内外景待定"} · {scene.dayNight || "日夜待定"} · {scene.notes || "制作备注待补充"}</p>
    {shots.length ? <ul>{shots.map((shot) => <li key={shot.id}><strong>镜头 {shot.values.shotNumber || "—"} · {shot.values.content || "未填写内容"}</strong><span>{shot.values.shotSize || "景别待定"} · {shot.values.durationSeconds || "0"} 秒 · {shot.values.productionStatus || "待制作"} · {shot.values.notes || "备注待补充"}</span></li>)}</ul> : <p>暂无已排镜头</p>}
  </section>;
}

export function CallSheetPrintView({ model, onClose }: { model: CallSheetPrintModel; onClose: () => void }) {
  const day = model.shootDay;
  const publicationTime = new Date(model.publishedAt).toLocaleString("zh-CN", { hour12: false });
  const emergencyContact = [day.emergencyContactName, day.emergencyContactRole, day.emergencyContactPhone].filter(Boolean).join(" · ");
  useEffect(() => {
    document.body.classList.add("call-sheet-printing");
    return () => document.body.classList.remove("call-sheet-printing");
  }, []);

  return createPortal(<section className="call-sheet-print" aria-label="正式拍摄通告">
    <div className="call-sheet-print__actions"><button type="button" onClick={() => window.print()}>打印正式通告</button><button type="button" onClick={onClose}>关闭</button></div>
    <header><p>{model.projectTitle}</p><h2>正式拍摄通告 · V{model.versionNumber}</h2><p>发布于 {publicationTime}</p><p>{day.title || "拍摄日"} · {day.shootDate || "日期待定"} · {day.location || "地点待定"}</p></header>
    <dl className="call-sheet-print__details"><Detail label="集合" value={day.callTime} /><Detail label="收工" value={day.wrapTime} /><Detail label="负责人" value={day.coordinator} fallback="待确认" /><Detail label="制作备注" value={day.notes} fallback="—" /></dl>
    <section className="call-sheet-print__safety"><h3>现场保障</h3><dl><Detail label="天气" value={day.weather} /><Detail label="雨天备选方案" value={day.rainPlan} /><Detail label="安全提示" value={day.safetyNotes} /><Detail label="紧急联系人" value={emergencyContact} /></dl></section>
    <section className="call-sheet-print__scenes"><h3>场次与镜头</h3>{model.scenes.map((scene) => <SceneShots key={scene.id} scene={scene} shots={model.shots.filter((shot) => shot.sceneId === scene.id)} />)}</section>
    <p className="call-sheet-print__acknowledgement">成员确认：{model.acknowledgementSummary.acknowledged} / {model.acknowledgementSummary.total}</p>
  </section>, document.body);
}
