import { useCallback, useEffect, useMemo, useState } from "react";
import { GatewayError, type StoryboardGateway } from "../data/gateway";
import type { AuthUser, PlatformAccount } from "../domain/models";

type SupervisorDashboardProps = {
  gateway: StoryboardGateway;
  user: AuthUser;
  onBack: () => void;
};

function statusLabel(status: PlatformAccount["status"]): string {
  if (status === "active") return "正常";
  if (status === "disabled") return "已禁用";
  return "待注册";
}

export function SupervisorDashboard({ gateway, user, onBack }: SupervisorDashboardProps) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [email, setEmail] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setAccounts(await gateway.listPlatformAccounts());
      setError("");
    } catch (caught) {
      setError(caught instanceof GatewayError && caught.code === "not_supervisor" ? "无权访问主管后台" : "账号列表加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleAccounts = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return accounts.filter((account) => !query || account.email.includes(query));
  }, [accounts, filter]);

  async function addEmail() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("请输入注册邮箱");
      return;
    }
    setPendingEmail(normalized);
    try {
      await gateway.invitePlatformAccount(normalized);
      setEmail("");
      await refresh();
    } catch {
      setError("添加邮箱失败，请检查邮箱后重试");
    } finally {
      setPendingEmail(null);
    }
  }

  async function changeStatus(account: PlatformAccount) {
    if (!account.userId || account.userId === user.id) return;
    const nextStatus = account.status === "disabled" ? "active" : "disabled";
    setPendingEmail(account.email);
    try {
      await gateway.setPlatformAccountStatus(account.userId, nextStatus);
      await refresh();
    } catch {
      setError(nextStatus === "disabled" ? "禁用账号失败，请稍后重试" : "恢复账号失败，请稍后重试");
    } finally {
      setPendingEmail(null);
    }
  }

  return (
    <main className="dashboard-shell supervisor-shell">
      <header className="dashboard-header">
        <div>
          <p className="project-header__eyebrow">Storyboard Workbench</p>
          <h1>主管后台</h1>
        </div>
        <div className="dashboard-account">
          <span>{user.email}</span>
          <button className="button-secondary" type="button" onClick={onBack}>返回项目</button>
        </div>
      </header>

      <section className="supervisor-card" aria-labelledby="supervisor-account-title">
        <div className="supervisor-card__heading">
          <div>
            <h2 id="supervisor-account-title">平台注册账号</h2>
            <p>只有添加到列表的邮箱才能注册；禁用账号不会删除项目数据。</p>
          </div>
          <span className="supervisor-card__count">共 {accounts.length} 个邮箱</span>
        </div>
        <div className="supervisor-toolbar">
          <label>
            <span>添加注册邮箱</span>
            <input aria-label="注册邮箱" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" />
          </label>
          <button type="button" disabled={pendingEmail !== null} onClick={() => void addEmail()}>添加邮箱</button>
          <label>
            <span>筛选</span>
            <input aria-label="筛选邮箱" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索邮箱" />
          </label>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {loading ? <p role="status">正在加载账号…</p> : (
          <div className="supervisor-table-wrap">
            <table className="supervisor-table">
              <thead>
                <tr><th>邮箱</th><th>状态</th><th>添加时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => (
                  <tr key={account.email}>
                    <td>{account.email}</td>
                    <td><span className={`account-status account-status--${account.status}`}>{statusLabel(account.status)}</span></td>
                    <td>{new Date(account.createdAt).toLocaleDateString("zh-CN")}</td>
                    <td>
                      {account.userId && account.userId !== user.id && account.status !== "invited" ? (
                        <button className={account.status === "disabled" ? "" : "button-danger"} disabled={pendingEmail === account.email} type="button" onClick={() => void changeStatus(account)}>
                          {account.status === "disabled" ? "恢复" : "禁用"}
                        </button>
                      ) : account.userId === user.id ? "主管账号" : "等待注册"}
                    </td>
                  </tr>
                ))}
                {visibleAccounts.length === 0 ? <tr><td colSpan={4}>没有匹配的邮箱</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
