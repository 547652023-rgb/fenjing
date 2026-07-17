import { AuthGate } from "./auth/AuthGate";
import type { StoryboardGateway } from "./data/gateway";

type AppProps = {
  gateway?: StoryboardGateway | null;
};

export function App({ gateway = null }: AppProps) {
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
        <main className="dashboard-shell">
          <header className="dashboard-header">
            <div>
              <p className="project-header__eyebrow">Storyboard Workbench</p>
              <h1>我的项目</h1>
            </div>
            <div className="dashboard-account">
              <span>{user.email}</span>
              <button type="button" onClick={() => void gateway.signOut()}>
                退出登录
              </button>
            </div>
          </header>
        </main>
      )}
    </AuthGate>
  );
}
