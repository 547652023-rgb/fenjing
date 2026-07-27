import { describe, expect, it, vi } from "vitest";
import { createSupabaseGateway } from "./supabaseGateway";
import { FakeStoryboardGateway } from "./fakeGateway";

function accountClient() {
  const rpc = vi.fn(async (name: string) => {
    if (name === "check_platform_registration" || name === "check_platform_login") {
      return { data: true, error: null };
    }
    if (name === "complete_platform_registration") {
      return { data: true, error: null };
    }
    if (name === "is_platform_supervisor") return { data: true, error: null };
    if (name === "supervisor_list_platform_accounts") {
      return {
        data: [{ email: "member@example.com", user_id: "user-2", status: "active", created_at: "2026-07-27T01:00:00.000Z", updated_at: "2026-07-27T01:00:00.000Z", disabled_at: null }],
        error: null,
      };
    }
    if (name === "supervisor_invite_platform_account") {
      return { data: [{ email: "member@example.com", user_id: null, status: "invited", created_at: "2026-07-27T01:00:00.000Z", updated_at: "2026-07-27T01:00:00.000Z", disabled_at: null }], error: null };
    }
    return { data: [{ email: "member@example.com", user_id: "user-2", status: "disabled", created_at: "2026-07-27T01:00:00.000Z", updated_at: "2026-07-27T01:00:00.000Z", disabled_at: "2026-07-27T02:00:00.000Z" }], error: null };
  });
  return {
    rpc,
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: "user-2", email: "member@example.com" } }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "user-2", email: "member@example.com" } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("platform account gateway", () => {
  it("checks the invite before registering and completes the invited account", async () => {
    const client = accountClient();
    const gateway = createSupabaseGateway(client);

    await gateway.signUp(" Member@Example.com ", "password123");

    expect(client.rpc).toHaveBeenNthCalledWith(1, "check_platform_registration", {
      p_email: "member@example.com",
    });
    expect(client.auth.signUp).toHaveBeenCalledWith({ email: "member@example.com", password: "password123" });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "complete_platform_registration", {
      p_email: "member@example.com",
      p_user_id: "user-2",
    });
  });

  it("checks active status before password authentication", async () => {
    const client = accountClient();
    const gateway = createSupabaseGateway(client);

    await gateway.signIn(" Member@Example.com ", "password123");

    expect(client.rpc).toHaveBeenNthCalledWith(1, "check_platform_login", {
      p_email: "member@example.com",
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "member@example.com", password: "password123" });
  });

  it("maps supervisor account rows and mutations", async () => {
    const client = accountClient();
    const gateway = createSupabaseGateway(client);

    await expect(gateway.isSupervisor()).resolves.toBe(true);
    await expect(gateway.listPlatformAccounts()).resolves.toMatchObject([{ email: "member@example.com", status: "active" }]);
    await expect(gateway.invitePlatformAccount(" Member@Example.com ")).resolves.toMatchObject({ email: "member@example.com", status: "invited" });
    await expect(gateway.setPlatformAccountStatus("user-2", "disabled")).resolves.toMatchObject({ email: "member@example.com", status: "disabled" });

    expect(client.rpc).toHaveBeenCalledWith("supervisor_invite_platform_account", { p_email: "member@example.com" });
    expect(client.rpc).toHaveBeenCalledWith("supervisor_set_platform_account_status", { p_user_id: "user-2", p_status: "disabled" });
  });

  it("restores a disabled member without deleting the member account", async () => {
    const gateway = new FakeStoryboardGateway();
    const supervisor = await gateway.signUp("主管@example.com", "password123");
    await gateway.invitePlatformAccount("member@example.com");
    const member = await gateway.signUp("member@example.com", "password123");
    await gateway.signOut();
    await gateway.signIn(supervisor.email, "password123");

    await gateway.setPlatformAccountStatus(member.id, "disabled");
    await gateway.signOut();
    await expect(gateway.signIn(member.email, "password123")).rejects.toMatchObject({ code: "account_disabled" });

    await gateway.signIn(supervisor.email, "password123");
    await expect(gateway.setPlatformAccountStatus(member.id, "active")).resolves.toMatchObject({ status: "active" });
    await gateway.signOut();
    await expect(gateway.signIn(member.email, "password123")).resolves.toMatchObject({ id: member.id });
  });
});
