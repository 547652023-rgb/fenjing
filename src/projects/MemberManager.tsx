import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GatewayError, type StoryboardGateway } from "../data/gateway";
import type { ProjectMember } from "../domain/models";

type MemberManagerProps = {
  gateway: StoryboardGateway;
  projectId: string;
  onClose: () => void;
};

export function MemberManager({ gateway, projectId, onClose }: MemberManagerProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setMembers(await gateway.listMembers(projectId));
  }, [gateway, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("请输入成员邮箱");
      return;
    }
    setPending(true);
    setError("");
    try {
      await gateway.inviteMember(projectId, email);
      setEmail("");
      await refresh();
    } catch (caughtError) {
      if (caughtError instanceof GatewayError) {
        if (caughtError.code === "user_not_found") {
          setError("该邮箱尚未注册，请对方注册后再邀请");
        } else if (caughtError.code === "already_member") {
          setError("该用户已经是项目成员");
        } else if (caughtError.code === "forbidden") {
          setError("只有项目所有者可以邀请成员");
        } else {
          setError("邀请失败，请稍后重试");
        }
      } else {
        setError("邀请失败，请稍后重试");
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(member: ProjectMember) {
    if (!window.confirm(`确定移除成员 ${member.email} 吗？`)) {
      return;
    }
    setError("");
    try {
      await gateway.removeMember(projectId, member.userId);
      await refresh();
    } catch {
      setError("移除成员失败，请稍后重试");
    }
  }

  return (
    <dialog aria-labelledby="member-manager-title" className="member-manager" open>
      <header>
        <div>
          <p className="project-header__eyebrow">项目权限</p>
          <h2 id="member-manager-title">成员管理</h2>
        </div>
        <button aria-label="关闭成员管理" type="button" onClick={onClose}>×</button>
      </header>
      <form onSubmit={invite}>
        <label>
          <span>成员邮箱</span>
          <input
            aria-label="成员邮箱"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button disabled={pending} type="submit">邀请成员</button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId}>
            <div>
              <strong>{member.email}</strong>
              <span>{member.role === "owner" ? "所有者" : "可编辑"}</span>
            </div>
            {member.role === "editor" ? (
              <button
                aria-label={`移除 ${member.email}`}
                className="button-danger"
                type="button"
                onClick={() => void remove(member)}
              >
                移除
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
