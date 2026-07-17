import { useState } from "react";
import { AuthGate } from "./auth/AuthGate";
import type { StoryboardGateway } from "./data/gateway";
import { ProjectDashboard } from "./projects/ProjectDashboard";
import { ProjectWorkbench } from "./workbench/ProjectWorkbench";

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
          <ProjectWorkbench
            gateway={gateway}
            onBack={() => setCurrentProjectId(null)}
            projectId={currentProjectId}
            user={user}
          />
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
