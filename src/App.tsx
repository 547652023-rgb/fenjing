import { useState } from "react";
import { AuthGate } from "./auth/AuthGate";
import type { StoryboardGateway } from "./data/gateway";
import { ProjectDashboard } from "./projects/ProjectDashboard";

type AppProps = {
  gateway?: StoryboardGateway | null;
};

export function App({ gateway = null }: AppProps) {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  if (!gateway) {
    return (
      <main className="centered-state setup-state">
        <section>
          <h1>需要配置在线服务</h1>
          <p>请先配置 Supabase 项目地址和客户端公开密钥。</p>
          <p>配置完成后即可使用账号登录、多项目和实时协作。</p>
        </section>
      </main>
    );
  }

  return (
    <AuthGate gateway={gateway}>
      {(user) => (
        currentProjectId ? (
          <main className="centered-state">
            <section>
              <h1>项目正在加载</h1>
              <button type="button" onClick={() => setCurrentProjectId(null)}>
                返回项目
              </button>
            </section>
          </main>
        ) : (
          <ProjectDashboard
            gateway={gateway}
            onOpenProject={setCurrentProjectId}
            onSignOut={() => void gateway.signOut()}
            user={user}
          />
        )
      )}
    </AuthGate>
  );
}
