import type { StoryboardProject } from "../domain/storyboard";

export function CallSheet({ project }: { project: StoryboardProject }) {
  const date = project.scenes.map((scene) => scene.shootDate).find(Boolean) ?? "待选择拍摄日";
  const scenes = project.scenes.filter((scene) => scene.shootDate === date);
  return <section aria-label="拍摄通告" className="call-sheet">
    <header><p>CALL SHEET · DRAFT</p><h2>{date} 拍摄通告</h2><span>{project.title} · 通告时间待制片确认</span></header>
    {scenes.length ? scenes.map((scene) => {
      const shots = project.shots.filter((shot) => shot.sceneId === scene.id);
      return <article key={scene.id}><div><strong>场次 {scene.number} · {scene.name}</strong><p>{scene.intExt} · {scene.dayNight} · {scene.notes || "制作备注待补充"}</p></div><span>{shots.length} 个镜头 · {scene.targetDurationSeconds || "0"} 秒</span></article>;
    }) : <p className="call-sheet__empty">先在拍摄计划中为场次安排拍摄日，即可生成通告。</p>}
  </section>;
}
