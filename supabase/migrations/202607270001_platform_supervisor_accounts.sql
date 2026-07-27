-- Controlled platform registration and reversible account status.
-- After applying this migration, bootstrap the existing supervisor once:
-- insert into public.platform_supervisors (email)
-- values (lower(trim('主管登录邮箱@example.com')))
-- on conflict (email) do nothing;

create table if not exists public.platform_supervisors (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_accounts (
  email text primary key check (email = lower(trim(email))),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create unique index if not exists platform_accounts_user_id_idx
  on public.platform_accounts(user_id)
  where user_id is not null;

alter table public.platform_supervisors enable row level security;
alter table public.platform_accounts enable row level security;

create or replace function public.is_platform_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.platform_supervisors supervisor
    join auth.users account on lower(trim(account.email)) = supervisor.email
    where account.id = auth.uid()
  );
$$;

create or replace function public.check_platform_registration(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
begin
  if not exists (
    select 1 from public.platform_accounts
    where email = normalized_email and status = 'invited' and user_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'registration_not_allowed';
  end if;
  return true;
end;
$$;

create or replace function public.check_platform_login(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  account_status text;
begin
  -- Supervisors are allowlisted separately and may not yet have a row in
  -- platform_accounts. Password authentication still verifies the identity.
  if exists (
    select 1 from public.platform_supervisors
    where email = normalized_email
  ) then
    return true;
  end if;

  select status into account_status
  from public.platform_accounts
  where email = normalized_email;

  if account_status = 'disabled' then
    raise exception using errcode = 'P0001', message = 'account_disabled';
  end if;
  if account_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'registration_not_allowed';
  end if;
  return true;
end;
$$;

create or replace function public.complete_platform_registration(p_email text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is distinct from p_user_id then
    raise exception using errcode = 'P0001', message = 'not_authenticated';
  end if;

  update public.platform_accounts
  set user_id = p_user_id, status = 'active', updated_at = now(), disabled_at = null
  where email = normalized_email and status = 'invited' and user_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'registration_not_allowed';
  end if;
  return true;
end;
$$;

create or replace function public.supervisor_list_platform_accounts()
returns table (
  email text,
  user_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  disabled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_supervisor() then
    raise exception using errcode = 'P0001', message = 'not_supervisor';
  end if;
  return query
    select account.email, account.user_id, account.status,
      account.created_at, account.updated_at, account.disabled_at
    from public.platform_accounts account
    order by account.email;
end;
$$;

create or replace function public.supervisor_invite_platform_account(p_email text)
returns public.platform_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  account public.platform_accounts;
begin
  if not public.is_platform_supervisor() then
    raise exception using errcode = 'P0001', message = 'not_supervisor';
  end if;
  if normalized_email = '' then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;

  insert into public.platform_accounts (email, status, created_by)
  values (normalized_email, 'invited', auth.uid())
  on conflict (email) do update
    set status = case
      when public.platform_accounts.status = 'disabled' then 'active'
      else public.platform_accounts.status
    end,
    disabled_at = case
      when public.platform_accounts.status = 'disabled' then null
      else public.platform_accounts.disabled_at
    end,
    updated_at = now();

  select * into account from public.platform_accounts where email = normalized_email;
  return account;
end;
$$;

create or replace function public.supervisor_set_platform_account_status(p_user_id uuid, p_status text)
returns public.platform_accounts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account public.platform_accounts;
begin
  if not public.is_platform_supervisor() then
    raise exception using errcode = 'P0001', message = 'not_supervisor';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;
  if exists (
    select 1 from public.platform_supervisors supervisor
    join auth.users supervisor_user on lower(trim(supervisor_user.email)) = supervisor.email
    where supervisor_user.id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'cannot_disable_supervisor';
  end if;

  update public.platform_accounts
  set status = p_status,
      disabled_at = case when p_status = 'disabled' then now() else null end,
      updated_at = now()
  where user_id = p_user_id
  returning * into account;

  if not found then
    raise exception using errcode = 'P0001', message = 'user_not_found';
  end if;
  return account;
end;
$$;

revoke all on function public.is_platform_supervisor() from public, anon, service_role;
revoke all on function public.check_platform_registration(text) from public, service_role;
revoke all on function public.check_platform_login(text) from public, service_role;
revoke all on function public.complete_platform_registration(text, uuid) from public, anon, service_role;
revoke all on function public.supervisor_list_platform_accounts() from public, anon, service_role;
revoke all on function public.supervisor_invite_platform_account(text) from public, anon, service_role;
revoke all on function public.supervisor_set_platform_account_status(uuid, text) from public, anon, service_role;

grant execute on function public.is_platform_supervisor() to authenticated;
grant execute on function public.check_platform_registration(text) to anon, authenticated;
grant execute on function public.check_platform_login(text) to anon, authenticated;
grant execute on function public.complete_platform_registration(text, uuid) to authenticated;
grant execute on function public.supervisor_list_platform_accounts() to authenticated;
grant execute on function public.supervisor_invite_platform_account(text) to authenticated;
grant execute on function public.supervisor_set_platform_account_status(uuid, text) to authenticated;
