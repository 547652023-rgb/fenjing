# Platform Supervisor Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a fixed supervisor account, invite-only registration, and reversible account disabling without deleting project data.

**Architecture:** Store normalized platform email allowlist and account status in Supabase. Expose narrowly-scoped security-definer RPCs for supervisor operations and registration checks, then add gateway methods and a supervisor-only React dashboard. Authentication remains Supabase email/password, but both sign-up and sign-in must pass platform-account status checks.

**Tech Stack:** React 18, TypeScript, Vitest, Supabase Postgres/RLS, existing `StoryboardGateway` and `GatewayError` abstractions.

## Global Constraints

- Only an email in the database `platform_supervisors` allowlist is a supervisor; the frontend never grants supervisor access by itself.
- Registration accepts only emails previously added by the supervisor.
- Disabling and restoring an account never deletes project or shot data.
- Supervisor functions must validate the caller server-side; frontend visibility is not authorization.
- Preserve the existing project owner/editor permissions and public site build.

---

### Task 1: Add platform account schema and secure RPCs

**Files:**
- Create: `supabase/migrations/202607270001_platform_supervisor_accounts.sql`
- Test: `src/data/platformAccounts.contract.test.ts`

**Interfaces:**
- Produces `platform_supervisors` and `platform_accounts`; `platform_accounts` contains `email`, `status`, `user_id`, timestamps, `disabled_at`, and `created_by`.
- Produces RPCs `is_platform_supervisor()`, `check_platform_registration(text)`, `complete_platform_registration(text, uuid)`, `supervisor_list_platform_accounts()`, `supervisor_invite_platform_account(text)`, and `supervisor_set_platform_account_status(uuid, text)`.

- [ ] **Step 1: Write migration contract tests**

Assert that the migration contains the status check (`invited`, `active`, `disabled`), unique normalized email, RLS enabled, supervisor verification through `platform_supervisors`, and grants only to `authenticated` for supervisor RPCs.

- [ ] **Step 2: Run the contract test and confirm it fails**

Run `pnpm vitest run src/data/platformAccounts.contract.test.ts`.
Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the migration**

Create both tables and functions. Use `lower(trim(email))` for identity. `check_platform_registration` returns a boolean/error code and only allows `invited` or `active`. `complete_platform_registration` binds the authenticated user and transitions `invited` to `active`. Supervisor functions verify `auth.uid()` against `platform_supervisors` and reject any status other than `active` or `disabled`; inviting a disabled email resets it to `invited` without deleting related data. Include a one-time SQL setup statement in the migration comments for inserting the supervisor's existing Auth email into `platform_supervisors`.

- [ ] **Step 4: Run the contract test**

Run `pnpm vitest run src/data/platformAccounts.contract.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit the database boundary**

```bash
git add supabase/migrations/202607270001_platform_supervisor_accounts.sql src/data/platformAccounts.contract.test.ts
git commit -m "feat: add secure platform account controls"
```

### Task 2: Extend gateway and fake gateway for account controls

**Files:**
- Modify: `src/data/gateway.ts`
- Modify: `src/data/supabaseGateway.ts`
- Modify: `src/data/fakeGateway.ts`
- Modify: `src/domain/models.ts`
- Test: `src/data/supabaseGateway.test.ts`
- Test: `src/data/fakeGateway.test.ts`

**Interfaces:**
- Add `PlatformAccountStatus = "invited" | "active" | "disabled"` and `PlatformAccount` with `email`, `userId`, `status`, `createdAt`, `updatedAt`, `disabledAt`.
- Add gateway methods `isSupervisor()`, `listPlatformAccounts()`, `invitePlatformAccount(email)`, and `setPlatformAccountStatus(userId, status)`.

- [ ] **Step 1: Add failing gateway tests**

Cover RPC payloads, normalized email, supervisor detection, disabled account error mapping, invite restore behavior, and fake gateway parity.

- [ ] **Step 2: Run focused tests and confirm failure**

Run `pnpm vitest run src/data/supabaseGateway.test.ts src/data/fakeGateway.test.ts`.
Expected: FAIL because the new interface methods do not exist.

- [ ] **Step 3: Implement Supabase gateway methods**

Call the named RPCs, map returned rows to `PlatformAccount`, and map `not_supervisor`, `registration_not_allowed`, and `account_disabled` to `GatewayError` codes. `signUp` must call `check_platform_registration` before `auth.signUp` and `complete_platform_registration` after a successful auth response. `signIn` must check the account status after password authentication and sign out immediately when disabled.

- [ ] **Step 4: Implement fake gateway parity**

Keep an in-memory normalized allowlist. Seed test users only through the same invitation rule, support disabled/restored state, and preserve all existing project data on status changes.

- [ ] **Step 5: Run focused tests**

Run `pnpm vitest run src/data/supabaseGateway.test.ts src/data/fakeGateway.test.ts`.
Expected: PASS.

- [ ] **Step 6: Commit gateway behavior**

```bash
git add src/data/gateway.ts src/data/supabaseGateway.ts src/data/fakeGateway.ts src/domain/models.ts src/data/supabaseGateway.test.ts src/data/fakeGateway.test.ts
git commit -m "feat: enforce invite-only platform accounts"
```

### Task 3: Add supervisor dashboard and authenticated route

**Files:**
- Create: `src/projects/SupervisorDashboard.tsx`
- Create: `src/projects/SupervisorDashboard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes the gateway methods from Task 2.
- Produces a supervisor-only route or panel with email-only invite input, status table, filter input, disable button, and restore button.

- [ ] **Step 1: Write failing component tests**

Test that a supervisor sees the panel, adding an email calls `invitePlatformAccount`, disabled rows show “恢复”, active rows show “禁用”, filtering narrows the list, and the supervisor’s own row has no disable action. Test that a non-supervisor does not render the panel.

- [ ] **Step 2: Run focused component tests and confirm failure**

Run `pnpm vitest run src/projects/SupervisorDashboard.test.tsx`.
Expected: FAIL because the component and route do not exist.

- [ ] **Step 3: Implement the dashboard**

Load `isSupervisor()` and account rows on mount. Use a single email input, normalize only at submission, show explicit status labels, disable buttons while pending, and display gateway errors in a `role="alert"`. Do not expose password fields or account deletion controls.

- [ ] **Step 4: Wire the route into the authenticated app**

Add a supervisor entry point visible only when `isSupervisor()` is true. Keep project home and workbench routing unchanged for ordinary members.

- [ ] **Step 5: Add focused styles**

Add responsive table/card styles consistent with the current project dashboard and clear disabled/active status colors.

- [ ] **Step 6: Run component tests**

Run `pnpm vitest run src/projects/SupervisorDashboard.test.tsx src/App.test.tsx`.
Expected: PASS.

- [ ] **Step 7: Commit the supervisor UI**

```bash
git add src/projects/SupervisorDashboard.tsx src/projects/SupervisorDashboard.test.tsx src/App.tsx src/styles.css
git commit -m "feat: add supervisor account dashboard"
```

### Task 4: Update auth messaging and integration coverage

**Files:**
- Modify: `src/auth/AuthScreen.tsx`
- Modify: `src/auth/AuthScreen.test.tsx`
- Modify: `src/data/supabaseGateway.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes gateway error codes from Task 2.
- Documents supervisor email configuration and invite-only registration behavior.

- [ ] **Step 1: Add failing auth tests**

Assert that `registration_not_allowed` renders “请联系主管添加邮箱”, `account_disabled` renders “账号已被主管禁用”, and ordinary invalid credentials retain the existing message.

- [ ] **Step 2: Implement error messages**

Extend `authErrorMessage` without changing the existing form validation or login/register toggle.

- [ ] **Step 3: Run auth tests**

Run `pnpm vitest run src/auth/AuthScreen.test.tsx src/data/supabaseGateway.test.ts`.
Expected: PASS.

- [ ] **Step 4: Document setup**

Document the required Supabase migration, how to add the supervisor's existing Auth email to `platform_supervisors`, how the supervisor adds the first member, and how to restore a disabled account.

- [ ] **Step 5: Commit auth and documentation**

```bash
git add src/auth/AuthScreen.tsx src/auth/AuthScreen.test.tsx src/data/supabaseGateway.test.ts README.md
git commit -m "feat: explain controlled registration and account recovery"
```

### Task 5: Full verification and deployment

**Files:**
- Modify only files required by preceding tasks; do not include unrelated `pnpm-lock.yaml` or workspace changes.

- [ ] **Step 1: Run the complete test suite**

Run `pnpm test -- --run`.
Expected: all test files and tests pass.

- [ ] **Step 2: Run the production build**

Run `pnpm build`.
Expected: TypeScript check and Vite production build pass.

- [ ] **Step 3: Apply the migration to the Supabase project**

Run the migration in the authenticated Supabase SQL editor, add the supervisor's existing Auth email to `platform_supervisors`, and verify the success result before testing the UI.

- [ ] **Step 4: Verify the deployed UI**

As supervisor: add a test email, verify it appears as `待注册`, register it, disable it, confirm login is rejected, restore it, and confirm login succeeds. Confirm the test user’s project data remains present.

- [ ] **Step 5: Deploy and verify GitHub Actions**

Push the intentional commits to `agent/add-storyboard-saas-design`, wait for GitHub Pages to complete successfully, then repeat the supervisor smoke test against `https://547652023-rgb.github.io/fenjing/`.
