import { useEffect, useMemo, useState } from "react";
import type { CallSheetVersion } from "../domain/models";
import type { StoryboardProject } from "../domain/storyboard";

type CallSheetProps = {
  project: StoryboardProject;
  versions?: CallSheetVersion[];
  onPublish?: (shootDate: string, snapshot: Record<string, unknown>) => void | Promise<void>;
  onDateChange?: (shootDate: string) => void;
  onCreateShootDay?: (input: { title: string; shootDate: string }) => void | Promise<void>;
  onDeleteShootDay?: (shootDayId: string, shootDate: string, withdrawPublished: boolean) => void | Promise<void>;
  onUpdateShootDay?: (shootDay: NonNullable<StoryboardProject["shootDays"]>[number]) => void | Promise<void>;
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

export function CallSheet({ project, versions = [], onPublish, onDateChange, onCreateShootDay, onDeleteShootDay, onUpdateShootDay }: CallSheetProps) {
  const dates = useMemo(() => [...new Set([...(project.shootDays ?? []).flatMap((day) => day.shootDate ? [day.shootDate] : []), ...project.scenes.flatMap((scene) => scene.shootDate ? [scene.shootDate] : [])])], [project.scenes, project.shootDays]);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0] ?? "");
  }, [dates, selectedDate]);
  const scenes = project.scenes.filter((scene) => scene.shootDate === selectedDate);
  const shootDay = (project.shootDays ?? []).find((day) => day.shootDate === selectedDate);
  const scheduledShots = shootDay ? project.shots.filter((shot) => shot.shootDayId === shootDay.id).sort((left, right) => (left.shootOrder ?? 0) - (right.shootOrder ?? 0)) : [];
  const latestVersion = versions.reduce((latest, version) => Math.max(latest, version.versionNumber), 0);
  const activeVersions = versions.filter((version) => !version.withdrawnAt);
  const isPublished = activeVersions.length > 0;
  const publish = () => {
    if (!selectedDate || !onPublish) return;
    void onPublish(selectedDate, buildCallSheetSnapshot(project, selectedDate));
  };
  const chooseDate = (date: string) => {
    setSelectedDate(date);
    setConfirmingDelete(false);
    onDateChange?.(date);
  };
  const createDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftTitle.trim() || !draftDate || !onCreateShootDay) return;
    void onCreateShootDay({ title: draftTitle.trim(), shootDate: draftDate });
    setDraftTitle("");
    setDraftDate("");
  };
  const deleteCallSheet = () => {
    if (!shootDay || !onDeleteShootDay) return;
    if (isPublished && !confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    void onDeleteShootDay(shootDay.id, selectedDate, isPublished);
  };
  const saveProductionDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shootDay || !onUpdateShootDay) return;
    const form = new FormData(event.currentTarget);
    void onUpdateShootDay({
      ...shootDay,
      location: String(form.get("location")),
      callTime: String(form.get("callTime")),
      wrapTime: String(form.get("wrapTime")),
      coordinator: String(form.get("coordinator")),
      notes: String(form.get("notes")),
    });
  };

  return <section aria-label="拍摄通告" className="call-sheet">
    <header>
      <p>CALL SHEET · {latestVersion ? `V${latestVersion}` : "DRAFT"}</p>
      <h2>{selectedDate || "待选择拍摄日"} 拍摄通告</h2>
      <span>{project.title} · 通告时间待制片确认</span>
      {shootDay ? <span>{shootDay.location || "地点待定"} · 集合 {shootDay.callTime || "待定"} · 收工 {shootDay.wrapTime || "待定"} · {shootDay.coordinator || "负责人待确认"}</span> : null}
      {dates.length > 1 ? <label className="call-sheet__date"><span>拍摄日</span><select aria-label="选择拍摄日" value={selectedDate} onChange={(event) => chooseDate(event.currentTarget.value)}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label> : null}
    </header>
    {onCreateShootDay ? <form className="call-sheet__create" onSubmit={createDraft}>
      <strong>新建拍摄通告</strong><label>通告标题<input aria-label="通告标题" value={draftTitle} onChange={(event) => setDraftTitle(event.currentTarget.value)} placeholder="例如：首日通告" /></label><label>拍摄日期<input aria-label="通告拍摄日期" type="date" value={draftDate} onChange={(event) => setDraftDate(event.currentTarget.value)} /></label><button type="submit" disabled={!draftTitle.trim() || !draftDate}>创建通告草稿</button>
    </form> : null}
    {shootDay && onUpdateShootDay ? <form key={shootDay.id} className="call-sheet__details" onSubmit={saveProductionDetails}><strong>通告制作资料</strong><label>拍摄地点<input aria-label="通告拍摄地点" name="location" defaultValue={shootDay.location} /></label><label>集合时间<input aria-label="通告集合时间" name="callTime" type="time" defaultValue={shootDay.callTime} /></label><label>收工时间<input aria-label="通告收工时间" name="wrapTime" type="time" defaultValue={shootDay.wrapTime} /></label><label>负责人<input aria-label="通告负责人" name="coordinator" defaultValue={shootDay.coordinator} /></label><label>现场备注<input aria-label="通告现场备注" name="notes" defaultValue={shootDay.notes} /></label><button type="submit">保存通告资料</button></form> : null}
    {scenes.length || scheduledShots.length ? <>
      <div className="call-sheet__publish"><span>将当前排期冻结为不可改写的交付版本。</span>{onPublish ? <button type="button" onClick={publish}>发布 V{latestVersion + 1}</button> : null}</div>
      {scenes.map((scene) => {
        const shots = project.shots.filter((shot) => shot.sceneId === scene.id);
        return <article key={scene.id}><div><strong>场次 {scene.number} · {scene.name}</strong><p>{scene.intExt} · {scene.dayNight} · {scene.notes || "制作备注待补充"}</p></div><span>{shots.length} 个镜头 · {scene.targetDurationSeconds || "0"} 秒</span></article>;
      })}
      {scheduledShots.length ? <section className="call-sheet__scheduled" aria-label="排程镜头"><h3>镜头清单</h3>{scheduledShots.map((shot) => <article key={shot.id}><strong>镜头 {shot.values.shotNumber || "—"} · {shot.values.content || "未填写内容"}</strong><span>{shot.values.durationSeconds || "0"} 秒 · {shot.values.productionStatus || "待制作"}</span></article>)}</section> : null}
    </> : <p className="call-sheet__empty">先在拍摄计划中为场次安排拍摄日，即可生成通告。</p>}
    {shootDay && onDeleteShootDay ? <section className="call-sheet__delete"><p>{confirmingDelete ? "已发布通告将被撤销，是否继续？" : isPublished ? "删除后将撤销已发布版本，并保留撤销记录。" : "草稿尚未发布，可直接删除。"}</p><button type="button" onClick={deleteCallSheet}>{confirmingDelete ? "确认删除并撤销" : "删除通告"}</button>{confirmingDelete ? <button type="button" onClick={() => setConfirmingDelete(false)}>取消</button> : null}</section> : null}
    {versions.length ? <section className="call-sheet__history" aria-label="通告发布历史"><h3>发布历史</h3>{versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}{version.withdrawnAt ? " · 已撤销" : version.versionNumber < latestVersion ? ` · 已被 V${latestVersion} 替代` : " · 当前版本"}</strong><span>{version.publishedBy} · {new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false })}</span></div>)}</section> : null}
  </section>;
}
