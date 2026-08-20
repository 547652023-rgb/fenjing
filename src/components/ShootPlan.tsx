import type { StoryboardProject, StoryboardScene } from "../domain/storyboard";

type ShootPlanProps = { project: StoryboardProject; onUpdateScene: (scene: StoryboardScene) => void | Promise<void> };

export function ShootPlan({ project, onUpdateScene }: ShootPlanProps) {
  const groups = new Map<string, StoryboardScene[]>();
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const unassignedShots = project.shots.filter((shot) => !shot.sceneId || !sceneIds.has(shot.sceneId));
  project.scenes.forEach((scene) => {
    const key = scene.shootDate || "待排期";
    groups.set(key, [...(groups.get(key) ?? []), scene]);
  });
  if (groups.size === 0 || unassignedShots.length > 0) groups.set("待排期", groups.get("待排期") ?? []);
  return <section aria-label="拍摄计划" className="shoot-plan">
    <header><p>PRODUCTION SCHEDULE</p><h2>拍摄计划</h2><span>按拍摄日排程，不改变故事板镜头顺序</span></header>
    {[...groups.entries()].sort(([a], [b]) => a === "待排期" ? 1 : b === "待排期" ? -1 : a.localeCompare(b)).map(([date, scenes]) => (
      <section key={date} className="shoot-plan__day" aria-label={`${date} 拍摄日`}>
        <h3>{date}</h3>
        {scenes.length ? scenes.map((scene) => {
          const shots = project.shots.filter((shot) => shot.sceneId === scene.id);
          const confirmed = shots.filter((shot) => shot.values.productionStatus === "已确认").length;
          return <article key={scene.id} className="shoot-plan__scene">
            <div><strong>场次 {scene.number} · {scene.name}</strong><p>{[scene.intExt, scene.dayNight, scene.notes || "未填写制作备注"].filter(Boolean).join(" · ")}</p></div>
            <div className="shoot-plan__metrics"><span>{shots.length} 个镜头 · {scene.targetDurationSeconds || "0"} 秒</span><span>{confirmed}/{shots.length} 已确认</span></div>
            <label>拍摄日<input aria-label={`设置场次 ${scene.number} 拍摄日`} type="date" value={scene.shootDate} onChange={(event) => void onUpdateScene({ ...scene, shootDate: event.currentTarget.value })} /></label>
          </article>;
        }) : date === "待排期" && unassignedShots.length ? <section className="shoot-plan__unassigned" aria-label="未分组镜头">
          <div><strong>未分组镜头</strong><p>请在工作台创建场次并归入镜头，再安排拍摄日。</p></div>
          {unassignedShots.map((shot) => <article key={shot.id} className="shoot-plan__shot">
            <strong>镜头 {shot.values.shotNumber || "—"} · {shot.values.content || "未填写内容"}</strong>
            <span>{shot.values.durationSeconds || "0"} 秒 · {shot.values.productionStatus || "待制作"}</span>
          </article>)}
        </section> : <p className="shoot-plan__empty">尚未安排场次</p>}
      </section>
    ))}
  </section>;
}
