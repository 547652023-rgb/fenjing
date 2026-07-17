import { useState, type FormEvent } from "react";
import { GatewayError, type StoryboardGateway } from "../data/gateway";

type AuthScreenProps = {
  gateway: StoryboardGateway;
};

function authErrorMessage(error: unknown): string {
  if (error instanceof GatewayError) {
    if (error.code === "invalid_credentials") {
      return "邮箱或密码不正确";
    }
    if (error.code === "already_registered") {
      return "这个邮箱已经注册，请直接登录";
    }
    if (error.code === "network") {
      return "网络连接失败，请稍后重试";
    }
  }
  return "操作失败，请稍后重试";
}

export function AuthScreen({ gateway }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("请输入邮箱");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 个字符");
      return;
    }

    setPending(true);
    try {
      if (mode === "register") {
        await gateway.signUp(email, password);
      } else {
        await gateway.signIn(email, password);
      }
    } catch (caughtError) {
      setError(authErrorMessage(caughtError));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="project-header__eyebrow">Storyboard Workbench</p>
        <h1>{mode === "login" ? "登录分镜工作台" : "注册分镜工作台"}</h1>
        <p className="auth-card__description">
          登录后可创建多个项目，并邀请成员实时共同编辑。
        </p>
        <form onSubmit={submit}>
          <label>
            <span>邮箱</span>
            <input
              aria-label="邮箱"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              aria-label="密码"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <button disabled={pending} type="submit">
            {pending
              ? "请稍候…"
              : mode === "login"
                ? "登录"
                : "确认注册"}
          </button>
        </form>
        <button
          className="button-link"
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "register" : "login"));
            setError("");
          }}
        >
          {mode === "login" ? "注册账号" : "返回登录"}
        </button>
      </section>
    </main>
  );
}
