# 分镜工作台

React + TypeScript 分镜制作工作台，发布在 GitHub Pages。当前在线协作版本使用 Supabase 提供账号、数据库、私有图片和实时同步。

## 本地运行

1. 复制 `.env.example` 为 `.env.local`。
2. 填入 Supabase 项目 URL 和客户端公开 anon key。
3. 安装依赖并运行 `pnpm dev`。

不要把 service-role key 放进 `.env`、前端源码、GitHub 仓库或 GitHub Pages 构建配置。

## Supabase 初始化

1. 创建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/202607170001_online_storyboards.sql`，或使用 Supabase CLI 执行迁移。
3. 确认 `storyboard-images` bucket 存在且为 private。
4. 在 Authentication 中启用 Email/Password。
5. 把 `https://547652023-rgb.github.io/fenjing/` 加入允许的站点/跳转地址。
6. 执行 `supabase/migrations/202607270001_platform_supervisor_accounts.sql`。
7. 在 SQL Editor 中将主管已有的 Auth 邮箱加入 `platform_supervisors`：

   ```sql
   insert into public.platform_supervisors (email)
   values (lower(trim('主管登录邮箱@example.com')))
   on conflict (email) do nothing;
   ```

8. 主管登录后进入“主管后台”，先添加成员邮箱；成员使用该邮箱注册后才能进入平台。
9. 主管可以禁用或恢复成员账号。恢复只恢复登录权限，不删除项目和分镜数据。

## 验证

```bash
pnpm test -- --run
pnpm build
```

安装 Supabase CLI 后可运行数据库测试：

```bash
supabase db reset
supabase test db
```

## GitHub Pages 配置

在仓库的 Actions secrets/variables 中配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

两项都是浏览器客户端配置；数据安全由数据库 RLS 和 Storage policies 保证。
