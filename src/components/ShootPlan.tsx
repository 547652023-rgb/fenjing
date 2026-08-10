import type { StoryboardProject, StoryboardScene } from "../domain/storyboard";

type ShootPlanProps = { project: StoryboardProject; onUpdateScene: (scene: StoryboardScene) => void | Promise<void> };

export function ShootPlan({ project, onUpdateScene }: ShootPlanProps) {
  const groups = new Map<string, StoryboardScene[]>();
  project.scenes.forEach((scene) => {
    const key = scene.shootDate || "待排期";
    groups.set(key, [...(groups.get(key) ?? []), scene]);
  });
  if (groups.size === 0) groups.set("待排期", []);
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
        }) : <p className="shoot-plan__empty">尚未安排场次</p>}
      </section>
    ))}
  </section>;
}
