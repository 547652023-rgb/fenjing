import { describe, expect, it } from "vitest";
import migration from "../../supabase/migrations/202607270001_platform_supervisor_accounts.sql?raw";

describe("platform supervisor account migration", () => {
  it("defines constrained platform account states and normalized email identity", () => {
    expect(migration).toMatch(/create table if not exists public\.platform_accounts/i);
    expect(migration).toMatch(/status\s+text\s+not null[\s\S]*?check\s*\(status in \('invited', 'active', 'disabled'\)\)/i);
    expect(migration).toMatch(/email\s+text\s+primary key/i);
    expect(migration).toMatch(/lower\(trim\(email\)\)/i);
    expect(migration).toMatch(/alter table public\.platform_accounts enable row level security/i);
  });

  it("exposes only authenticated supervisor RPCs and registration boundaries", () => {
    expect(migration).toMatch(/create or replace function public\.is_platform_supervisor\(\)/i);
    expect(migration).toMatch(/create or replace function public\.check_platform_registration\(p_email text\)/i);
    expect(migration).toMatch(/create or replace function public\.check_platform_login\(p_email text\)/i);
    expect(migration).toMatch(/if exists \(\s*select 1 from public\.platform_supervisors/i);
    expect(migration).toMatch(/return true;[\s\S]*?end if;[\s\S]*?select status into account_status/i);
    expect(migration).toMatch(/create or replace function public\.complete_platform_registration\(p_email text, p_user_id uuid\)/i);
    expect(migration).toMatch(/create or replace function public\.supervisor_list_platform_accounts\(\)/i);
    expect(migration).toMatch(/create or replace function public\.supervisor_invite_platform_account\(p_email text\)/i);
    expect(migration).toMatch(/create or replace function public\.supervisor_set_platform_account_status\(p_user_id uuid, p_status text\)/i);
    expect(migration).toMatch(/grant execute on function public\.supervisor_list_platform_accounts\(\) to authenticated/i);
    expect(migration).not.toMatch(/grant execute on function public\.supervisor_list_platform_accounts\(\) to anon/i);
  });

  it("protects supervisor operations and preserves data when restoring accounts", () => {
    expect(migration).toMatch(/platform_supervisors/i);
    expect(migration).toMatch(/not_supervisor/i);
    expect(migration).toMatch(/registration_not_allowed/i);
    expect(migration).toMatch(/account_disabled/i);
    expect(migration).toMatch(/update public\.platform_accounts[\s\S]*status = 'invited'/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(?:projects|project_members)/i);
  });
});
