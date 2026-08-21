import { useEffect, useMemo, useState } from "react";
import type { CallSheetVersion } from "../domain/models";
import type { StoryboardProject } from "../domain/storyboard";

type CallSheetProps = {
  project: StoryboardProject;
  versions?: CallSheetVersion[];
  onPublish?: (shootDate: string, snapshot: Record<string, unknown>) => void | Promise<void>;
  onDateChange?: (shootDate: string) => void;
};

export function buildCallSheetSnapshot(project: StoryboardProject, shootDate: string): Record<string, unknown> {
  const shootDay = (project.shootDays ?? []).find((day) => day.shootDate === shootDate);
  const scheduledShots = shootDay
    ? project.shots.filter((shot) => shot.shootDayId === shootDay.id).sort((left, right) => (left.shootOrder ?? 0) - (right.shootOrder ?? 0))
    : [];
  const scenes = project.scenes
    .filter((scene) => scene.shootDate === shootDate)
    .map((scene) => ({
      ...scene,
      shots: project.shots.filter((shot) => shot.sceneId === scene.id).map((shot) => ({
        ...shot,
        values: { ...shot.values },
      })),
    }));
  return {
    projectTitle: project.title,
    aspectRatio: project.aspectRatio,
    shootDate,
    shootDay: shootDay ? { ...shootDay } : null,
    shots: scheduledShots.map((shot) => ({ ...shot, values: { ...shot.values } })),
    generatedAt: new Date().toISOString(),
    scenes,
  };
}

export function CallSheet({ project, versions = [], onPublish, onDateChange }: CallSheetProps) {
  const dates = useMemo(() => [...new Set([...(project.shootDays ?? []).flatMap((day) => day.shootDate ? [day.shootDate] : []), ...project.scenes.flatMap((scene) => scene.shootDate ? [scene.shootDate] : [])])], [project.scenes, project.shootDays]);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  useEffect(() => {
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0] ?? "");
  }, [dates, selectedDate]);
  const scenes = project.scenes.filter((scene) => scene.shootDate === selectedDate);
  const shootDay = (project.shootDays ?? []).find((day) => day.shootDate === selectedDate);
  const scheduledShots = shootDay ? project.shots.filter((shot) => shot.shootDayId === shootDay.id).sort((left, right) => (left.shootOrder ?? 0) - (right.shootOrder ?? 0)) : [];
  const latestVersion = versions.reduce((latest, version) => Math.max(latest, version.versionNumber), 0);
  const publish = () => {
    if (!selectedDate || !onPublish) return;
    void onPublish(selectedDate, buildCallSheetSnapshot(project, selectedDate));
  };
  const chooseDate = (date: string) => {
    setSelectedDate(date);
    onDateChange?.(date);
  };

  return <section aria-label="拍摄通告" className="call-sheet">
    <header>
      <p>CALL SHEET · {latestVersion ? `V${latestVersion}` : "DRAFT"}</p>
      <h2>{selectedDate || "待选择拍摄日"} 拍摄通告</h2>
      <span>{project.title} · 通告时间待制片确认</span>
      {shootDay ? <span>{shootDay.location || "地点待定"} · 集合 {shootDay.callTime || "待定"} · 收工 {shootDay.wrapTime || "待定"} · {shootDay.coordinator || "负责人待确认"}</span> : null}
      {dates.length > 1 ? <label className="call-sheet__date"><span>拍摄日</span><select aria-label="选择拍摄日" value={selectedDate} onChange={(event) => chooseDate(event.currentTarget.value)}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label> : null}
    </header>
    {scenes.length || scheduledShots.length ? <>
      <div className="call-sheet__publish"><span>将当前排期冻结为不可改写的交付版本。</span>{onPublish ? <button type="button" onClick={publish}>发布 V{latestVersion + 1}</button> : null}</div>
      {scenes.map((scene) => {
        const shots = project.shots.filter((shot) => shot.sceneId === scene.id);
        return <article key={scene.id}><div><strong>场次 {scene.number} · {scene.name}</strong><p>{scene.intExt} · {scene.dayNight} · {scene.notes || "制作备注待补充"}</p></div><span>{shots.length} 个镜头 · {scene.targetDurationSeconds || "0"} 秒</span></article>;
      })}
      {scheduledShots.length ? <section className="call-sheet__scheduled" aria-label="排程镜头"><h3>镜头清单</h3>{scheduledShots.map((shot) => <article key={shot.id}><strong>镜头 {shot.values.shotNumber || "—"} · {shot.values.content || "未填写内容"}</strong><span>{shot.values.durationSeconds || "0"} 秒 · {shot.values.productionStatus || "待制作"}</span></article>)}</section> : null}
    </> : <p className="call-sheet__empty">先在拍摄计划中为场次安排拍摄日，即可生成通告。</p>}
    {versions.length ? <section className="call-sheet__history" aria-label="通告发布历史"><h3>发布历史</h3>{versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}{version.versionNumber < latestVersion ? ` · 已被 V${latestVersion} 替代` : " · 当前版本"}</strong><span>{version.publishedBy} · {new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false })}</span></div>)}</section> : null}
  </section>;
}
