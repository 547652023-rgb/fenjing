import { useState } from "react";
import type { StoryboardGateway } from "../data/gateway";
import type { AuthUser } from "../domain/models";
import { loadProject } from "../storage/projectRepository";
import { importLocalProject, importMarkerKey } from "./importLocalProject";

type LocalImportPromptProps = {
  gateway: StoryboardGateway;
  user: AuthUser;
  onImported: () => void;
};

export function LocalImportPrompt({
  gateway,
  user,
  onImported,
}: LocalImportPromptProps) {
  const [project] = useState(() => loadProject());
  const [visible, setVisible] = useState(
    () => Boolean(project) && localStorage.getItem(importMarkerKey(user.id)) !== "true",
  );
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");

  if (!visible || !project) return null;

  async function startImport() {
    setStatus("importing");
    const result = await importLocalProject({ gateway, project: project!, userId: user.id });
    if (result.ok) {
      setStatus("done");
      onImported();
    } else {
      setStatus("error");
    }
  }

  return (
    <section className="local-import-prompt" aria-label="旧项目导入">
      <div>
        <h2>发现电脑里的旧分镜项目</h2>
        <p>可以复制到在线项目；电脑里的原数据会继续保留。</p>
      </div>
      {status === "done" ? <p role="status">旧项目已安全导入</p> : null}
      {status === "error" ? <p role="alert">导入失败，本地数据未删除，请稍后重试</p> : null}
      {status !== "done" ? (
        <div>
          <button disabled={status === "importing"} type="button" onClick={() => void startImport()}>
            {status === "importing" ? "正在导入…" : "导入旧项目"}
          </button>
          <button className="button-secondary" type="button" onClick={() => setVisible(false)}>
            以后再说
          </button>
        </div>
      ) : null}
    </section>
  );
}
