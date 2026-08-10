import { useState } from "react";
import type { StoryboardProject } from "../domain/storyboard";
import type { RemoteImage } from "../domain/models";

type StoryboardReviewProps = {
  project: StoryboardProject;
  onReviewStateChange?: (shotId: string, state: "已确认" | "需修改") => void;
};

export function StoryboardReview({ project, onReviewStateChange }: StoryboardReviewProps) {
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const activeShot = project.shots.find((shot) => shot.id === activeShotId) ?? null;
  const activeFrame = activeShot ? readFrames(activeShot.values.frame)[0] : null;
  const activeShotIndex = activeShot ? project.shots.findIndex((shot) => shot.id === activeShot.id) : -1;

  return (
    <section aria-label="故事板审阅" className="storyboard-review">
      {project.shots.map((shot) => {
        const values = shot.values;
        const shotNumber = values.shotNumber || "未编号";
        const frame = readFrames(values.frame)[0];

        return (
          <article key={shot.id} aria-label={`镜头 ${shotNumber}`} className="storyboard-review__card">
            {frame ? (
              <button
                aria-label={`查看镜头 ${shotNumber} 画面`}
                className="storyboard-review__frame"
                type="button"
                onClick={() => setActiveShotId(shot.id)}
              >
                <img alt={`镜头 ${shotNumber} 画面`} src={frame.url} />
              </button>
            ) : <div className="storyboard-review__frame" aria-label="暂无画面">暂无画面</div>}
            <div className="storyboard-review__card-head">
              <strong>镜头 {shotNumber}</strong>
              <span>{values.productionStatus || "待制作"}</span>
            </div>
            <div className="storyboard-review__metadata">
              <span>{values.shotSize || "未设景别"}</span>
              <span>{values.durationSeconds ? `${values.durationSeconds} 秒` : "未设时长"}</span>
            </div>
            <p>{values.content || "尚未填写镜头内容"}</p>
            {onReviewStateChange ? (
              <div className="storyboard-review__review-actions">
                <button aria-label={`确认镜头 ${shotNumber}`} type="button" onClick={() => onReviewStateChange(shot.id, "已确认")}>已确认</button>
                <button aria-label={`标记镜头 ${shotNumber} 需修改`} type="button" onClick={() => onReviewStateChange(shot.id, "需修改")}>需修改</button>
              </div>
            ) : null}
          </article>
        );
      })}
      {activeShot && activeFrame ? (
        <div aria-label={`镜头 ${activeShot.values.shotNumber || "未编号"} 画面审阅`} className="storyboard-review__lightbox" role="dialog">
          <button aria-label="关闭画面审阅" type="button" onClick={() => setActiveShotId(null)}>关闭</button>
          <button
            aria-label="上一镜头"
            disabled={activeShotIndex <= 0}
            type="button"
            onClick={() => setActiveShotId(project.shots[activeShotIndex - 1]?.id ?? null)}
          >
            上一镜头
          </button>
          <button
            aria-label="下一镜头"
            disabled={activeShotIndex >= project.shots.length - 1}
            type="button"
            onClick={() => setActiveShotId(project.shots[activeShotIndex + 1]?.id ?? null)}
          >
            下一镜头
          </button>
          <img alt={`镜头 ${activeShot.values.shotNumber || "未编号"} 画面`} src={activeFrame.url} />
          <p>镜头 {activeShot.values.shotNumber || "未编号"} · {activeShot.values.content || "尚未填写镜头内容"}</p>
        </div>
      ) : null}
    </section>
  );
}

function readFrames(value: string | undefined): RemoteImage[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((image): image is RemoteImage => Boolean(image && typeof image === "object" && "url" in image && typeof image.url === "string"))
      : [];
  } catch {
    return [];
  }
}
