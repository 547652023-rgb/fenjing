import { useEffect, useState, type ReactNode } from "react";
import type { StoryboardGateway } from "../data/gateway";
import type { AuthUser } from "../domain/models";
import { AuthScreen } from "./AuthScreen";

type AuthGateProps = {
  gateway: StoryboardGateway;
  children: (user: AuthUser) => ReactNode;
};

export function AuthGate({ gateway, children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = gateway.onAuthChange((nextUser) => {
      if (active) {
        setUser(nextUser);
        setLoading(false);
      }
    });
    void gateway.getSession().then((session) => {
      if (active) {
        setUser(session);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [gateway]);

  if (loading) {
    return <main className="centered-state" role="status">正在加载账号…</main>;
  }
  if (!user) {
    return <AuthScreen gateway={gateway} />;
  }
  return children(user);
}
