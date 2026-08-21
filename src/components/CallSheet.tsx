import { useEffect, useMemo, useState } from "react";
import type { CallSheetAcknowledgement, CallSheetVersion, ProjectMember } from "../domain/models";
import { PRODUCTION_STATUS_OPTIONS, type StoryboardProject } from "../domain/storyboard";

type CallSheetProps = {
  project: StoryboardProject;
  versions?: CallSheetVersion[];
  members?: ProjectMember[];
  acknowledgements?: CallSheetAcknowledgement[];
  currentUserId?: string;
  onAcknowledge?: (versionId: string) => void | Promise<void>;
  onPublish?: (shootDate: string, snapshot: Record<string, unknown>) => void | Promise<void>;
  onDateChange?: (shootDate: string) => void;
  onCreateShootDay?: (input: { title: string; shootDate: string }) => void | Promise<void>;
  onDeleteShootDay?: (shootDayId: string, shootDate: string, withdrawPublished: boolean) => void | Promise<void>;
  onUpdateShootDay?: (shootDay: NonNullable<StoryboardProject["shootDays"]>[number]) => void | Promise<void>;
  onUpdateShot?: (shotId: string, values: { productionStatus: string; notes: string }) => void | Promise<void>;
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

function comparableSnapshot(snapshot: Record<string, unknown>): string {
  const { generatedAt: _generatedAt, ...content } = snapshot;
  return JSON.stringify(content);
}

export function CallSheet({ project, versions = [], members = [], acknowledgements = [], currentUserId, onAcknowledge, onPublish, onDateChange, onCreateShootDay, onDeleteShootDay, onUpdateShootDay, onUpdateShot }: CallSheetProps) {
  const dates = useMemo(() => [...new Set([...(project.shootDays ?? []).flatMap((day) => day.shootDate ? [day.shootDate] : []), ...project.scenes.flatMap((scene) => scene.shootDate ? [scene.shootDate] : [])])], [project.scenes, project.shootDays]);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [acknowledgementError, setAcknowledgementError] = useState("");
  useEffect(() => {
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0] ?? "");
  }, [dates, selectedDate]);
  const scenes = project.scenes.filter((scene) => scene.shootDate === selectedDate);
  const shootDay = (project.shootDays ?? []).find((day) => day.shootDate === selectedDate);
  const scheduledShots = shootDay ? project.shots.filter((shot) => shot.shootDayId === shootDay.id).sort((left, right) => (left.shootOrder ?? 0) - (right.shootOrder ?? 0)) : [];
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));
  const scheduledDurationSeconds = scheduledShots.reduce((total, shot) => total + (Number(shot.values.durationSeconds) || 0), 0);
  const latestVersion = versions.reduce((latest, version) => Math.max(latest, version.versionNumber), 0);
  const activeVersions = versions.filter((version) => !version.withdrawnAt);
  const currentVersion = activeVersions.reduce<CallSheetVersion | undefined>((latest, version) => !latest || version.versionNumber > latest.versionNumber ? version : latest, undefined);
  const currentAcknowledged = acknowledgements.some((row) => row.callSheetVersionId === currentVersion?.id && row.userId === currentUserId);
  const acknowledgementRows = members.map((member) => ({ member, acknowledgement: acknowledgements.find((row) => row.userId === member.userId) }));
  const currentAcknowledgementCount = acknowledgements.filter((row) => row.callSheetVersionId === currentVersion?.id).length;
  const isPublished = activeVersions.length > 0;
  const callSheetStatus = !currentVersion
    ? versions.length ? "已撤销，需重新发布" : "草稿待发布"
    : comparableSnapshot(currentVersion.snapshot) === comparableSnapshot(buildCallSheetSnapshot(project, selectedDate))
      ? `已发布 V${currentVersion.versionNumber}，内容已同步`
      : "存在未发布变更";
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
  const saveSafetyDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shootDay || !onUpdateShootDay) return;
    const form = new FormData(event.currentTarget);
    void onUpdateShootDay({
      ...shootDay,
      weather: String(form.get("weather")),
      rainPlan: String(form.get("rainPlan")),
      safetyNotes: String(form.get("safetyNotes")),
      emergencyContactName: String(form.get("emergencyContactName")),
      emergencyContactRole: String(form.get("emergencyContactRole")),
      emergencyContactPhone: String(form.get("emergencyContactPhone")),
    });
  };
  const saveScheduledShot = (event: React.FormEvent<HTMLFormElement>, shotId: string) => {
    event.preventDefault();
    if (!onUpdateShot) return;
    const form = new FormData(event.currentTarget);
    void onUpdateShot(shotId, {
      productionStatus: String(form.get("productionStatus")),
      notes: String(form.get("notes")),
    });
  };
  const acknowledge = async () => {
    if (!currentVersion || currentAcknowledged || isAcknowledging || !onAcknowledge) return;
    setAcknowledgementError("");
    setIsAcknowledging(true);
    try {
      await onAcknowledge(currentVersion.id);
    } catch {
      setAcknowledgementError("确认回执失败，请稍后重试");
    } finally {
      setIsAcknowledging(false);
    }
  };

  return <section aria-label="拍摄通告" className="call-sheet">
    <header>
      <p>CALL SHEET · {latestVersion ? `V${latestVersion}` : "DRAFT"}</p>
      <h2>{selectedDate || "待选择拍摄日"} 拍摄通告</h2>
      <span>{project.title} · 通告时间待制片确认</span>
      {shootDay ? <span>{shootDay.location || "地点待定"} · 集合 {shootDay.callTime || "待定"} · 收工 {shootDay.wrapTime || "待定"} · {shootDay.coordinator || "负责人待确认"}</span> : null}
      <strong role="status" className="call-sheet__status">{callSheetStatus}</strong>
      {dates.length > 1 ? <label className="call-sheet__date"><span>拍摄日</span><select aria-label="选择拍摄日" value={selectedDate} onChange={(event) => chooseDate(event.currentTarget.value)}>{dates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label> : null}
    </header>
    {onCreateShootDay ? <form className="call-sheet__create" onSubmit={createDraft}>
      <strong>新建拍摄通告</strong><label>通告标题<input aria-label="通告标题" value={draftTitle} onChange={(event) => setDraftTitle(event.currentTarget.value)} placeholder="例如：首日通告" /></label><label>拍摄日期<input aria-label="通告拍摄日期" type="date" value={draftDate} onChange={(event) => setDraftDate(event.currentTarget.value)} /></label><button type="submit" disabled={!draftTitle.trim() || !draftDate}>创建通告草稿</button>
    </form> : null}
    {shootDay && onUpdateShootDay ? <form key={shootDay.id} className="call-sheet__details" onSubmit={saveProductionDetails}><strong>通告制作资料</strong><label>拍摄地点<input aria-label="通告拍摄地点" name="location" defaultValue={shootDay.location} /></label><label>集合时间<input aria-label="通告集合时间" name="callTime" type="time" defaultValue={shootDay.callTime} /></label><label>收工时间<input aria-label="通告收工时间" name="wrapTime" type="time" defaultValue={shootDay.wrapTime} /></label><label>负责人<input aria-label="通告负责人" name="coordinator" defaultValue={shootDay.coordinator} /></label><label>现场备注<input aria-label="通告现场备注" name="notes" defaultValue={shootDay.notes} /></label><button type="submit">保存通告资料</button></form> : null}
    {shootDay && onUpdateShootDay ? <form key={`${shootDay.id}-safety`} className="call-sheet__safety" onSubmit={saveSafetyDetails}><strong>现场保障</strong><label>天气<input aria-label="通告天气" name="weather" defaultValue={shootDay.weather} /></label><label>雨天备选方案<input aria-label="通告雨天备选方案" name="rainPlan" defaultValue={shootDay.rainPlan} /></label><label>安全提示<input aria-label="通告安全提示" name="safetyNotes" defaultValue={shootDay.safetyNotes} /></label><label>紧急联系人<input aria-label="通告紧急联系人" name="emergencyContactName" defaultValue={shootDay.emergencyContactName} /></label><label>紧急联系人职责<input aria-label="通告紧急联系人职责" name="emergencyContactRole" defaultValue={shootDay.emergencyContactRole} /></label><label>紧急联系电话<input aria-label="通告紧急联系电话" name="emergencyContactPhone" type="tel" defaultValue={shootDay.emergencyContactPhone} /></label><button type="submit">保存现场保障</button></form> : null}
    {scenes.length || scheduledShots.length ? <>
      <div className="call-sheet__publish"><span>将当前排期冻结为不可改写的交付版本。</span>{onPublish ? <button type="button" onClick={publish}>发布 V{latestVersion + 1}</button> : null}</div>
      {scenes.map((scene) => {
        const shots = project.shots.filter((shot) => shot.sceneId === scene.id);
        return <article key={scene.id}><div><strong>场次 {scene.number} · {scene.name}</strong><p>{scene.intExt} · {scene.dayNight} · {scene.notes || "制作备注待补充"}</p></div><span>{shots.length} 个镜头 · {scene.targetDurationSeconds || "0"} 秒</span></article>;
      })}
      {scheduledShots.length ? <section className="call-sheet__scheduled" aria-label="排程镜头"><h3>镜头清单 · {scheduledShots.length} 个镜头 · {scheduledDurationSeconds} 秒</h3>{scheduledShots.map((shot) => {
        const scene = shot.sceneId ? scenesById.get(shot.sceneId) : undefined;
        const shotNumber = shot.values.shotNumber || "—";
        return <article key={shot.id}><div><strong>镜头 {shotNumber} · {shot.values.content || "未填写内容"}</strong><p>场次 {scene?.number || shot.values.sceneNumber || "待定"} · {scene?.name || shot.values.scene || "未填写场景"}</p></div><span>{shot.values.shotSize || "景别待定"} · {shot.values.durationSeconds || "0"} 秒 · {shot.values.productionStatus || "待制作"} · {shot.values.notes || "备注待补充"}</span>{onUpdateShot ? <form className="call-sheet__shot-update" onSubmit={(event) => saveScheduledShot(event, shot.id)}><label>现场状态<select aria-label={`通告镜头 ${shotNumber} 现场状态`} name="productionStatus" defaultValue={shot.values.productionStatus || "待制作"}>{PRODUCTION_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label>现场备注<input aria-label={`通告镜头 ${shotNumber} 现场备注`} name="notes" defaultValue={shot.values.notes} /></label><button type="submit">保存镜头 {shotNumber} 现场回写</button></form> : null}</article>;
      })}</section> : null}
    </> : <p className="call-sheet__empty">先在拍摄计划中为场次安排拍摄日，即可生成通告。</p>}
    {currentVersion ? <section className="call-sheet__acknowledgements" aria-label="成员确认">
      <div><h3>成员确认</h3><strong>已确认 {currentAcknowledgementCount} / {members.length}</strong></div>
      {acknowledgementRows.map(({ member, acknowledgement }) => <div className="call-sheet__acknowledgement" key={member.userId}><span>{member.email}</span><span>{acknowledgement ? new Date(acknowledgement.acknowledgedAt).toLocaleString("zh-CN", { hour12: false }) : "待确认"}</span></div>)}
      {!currentAcknowledged && currentUserId && onAcknowledge ? <button type="button" onClick={() => void acknowledge()} disabled={isAcknowledging}>{isAcknowledging ? "正在确认…" : `确认已阅读 V${currentVersion.versionNumber}`}</button> : null}
      {acknowledgementError ? <p role="alert">{acknowledgementError}</p> : null}
    </section> : null}
    {shootDay && onDeleteShootDay ? <section className="call-sheet__delete"><p>{confirmingDelete ? "已发布通告将被撤销，是否继续？" : isPublished ? "删除后将撤销已发布版本，并保留撤销记录。" : "草稿尚未发布，可直接删除。"}</p><button type="button" onClick={deleteCallSheet}>{confirmingDelete ? "确认删除并撤销" : "删除通告"}</button>{confirmingDelete ? <button type="button" onClick={() => setConfirmingDelete(false)}>取消</button> : null}</section> : null}
    {versions.length ? <section className="call-sheet__history" aria-label="通告发布历史"><h3>发布历史</h3>{versions.map((version) => <div key={version.id}><strong>V{version.versionNumber}{version.withdrawnAt ? " · 已撤销" : version.versionNumber < latestVersion ? ` · 已被 V${latestVersion} 替代` : " · 当前版本"}</strong><span>{version.publishedBy} · {new Date(version.publishedAt).toLocaleString("zh-CN", { hour12: false })}</span></div>)}</section> : null}
  </section>;
}
