# 主管账号与受控注册设计

## 目标

为分镜平台增加固定主管账号和受控注册机制：只有主管预先添加的邮箱才能注册；主管可以禁用账号，也可以恢复被禁用的邮箱。禁用和恢复不删除用户历史项目或项目内容。

## 权限模型

- `supervisor`: 存在于数据库 `platform_supervisors` 白名单中的固定邮箱，拥有主管后台权限。
- `member`: 普通平台注册用户，只能访问自己拥有或被邀请加入的项目。

主管账号本身不能被禁用。邮箱比较统一使用小写、去除首尾空格后的值。

## 数据模型

新增 `platform_accounts` 表：

- `email`：唯一、规范化后的邮箱。
- `status`：`invited`、`active`、`disabled`。
- `user_id`：注册完成后关联 `auth.users.id`，注册前为空。
- `created_at`、`updated_at`、`disabled_at`。
- `created_by`：添加该邮箱的主管用户 ID。

新增数据库函数：

- `supervisor_list_platform_accounts()`：主管查看账号列表。
- `supervisor_invite_platform_account(email)`：主管添加邮箱，重复的禁用邮箱恢复为 `invited`。
- `supervisor_set_platform_account_status(user_id, status)`：主管禁用或恢复账号。
- `check_platform_registration(email)`：注册前检查邮箱是否在白名单且不是禁用状态。
- `complete_platform_registration(email, user_id)`：注册成功后将 `invited` 账号绑定到用户并转为 `active`。

所有主管函数使用 `SECURITY DEFINER`，在函数内部验证 `auth.uid()` 对应的邮箱是否存在于 `platform_supervisors`；普通客户端不能直接写入账号表。首次部署由项目管理员在 Supabase SQL 编辑器将主管邮箱加入该白名单，前端不承担权限判断。

## 注册与登录流程

1. 注册页面提交邮箱和密码。
2. 客户端调用注册检查函数；未被主管添加的邮箱显示“请联系主管添加邮箱”。
3. 通过检查后调用 Supabase Auth 注册。
4. 注册成功后绑定 `user_id` 并将账号置为 `active`。
5. 登录成功后读取账号状态；`disabled` 账号立即退出并显示“账号已被主管禁用”。
6. 主管恢复账号后，账号可再次登录，原有项目数据保持不变。

## 主管后台界面

新增 `SupervisorDashboard` 页面，仅主管可见：

- 邮箱输入框和“添加邮箱”按钮。
- 账号列表：邮箱、状态、注册时间、最近更新时间。
- `active` 账号显示“禁用”按钮。
- `disabled` 账号显示“恢复”按钮。
- `invited` 账号显示“等待注册”。
- 支持按邮箱筛选。
- 主管自己的邮箱只显示状态，不显示禁用按钮。

## 错误处理

- 未授权主管调用返回 `not_supervisor`。
- 非白名单注册返回 `registration_not_allowed`。
- 禁用账号登录返回 `account_disabled`，客户端清理会话。
- 重复添加正常账号返回可理解的提示，不创建重复记录。
- 网络错误沿用现有 `GatewayError` 映射。

## 测试范围

- 数据库迁移合同测试：状态约束、唯一邮箱、主管函数权限和 RLS。
- Gateway 测试：添加、禁用、恢复、注册检查和禁用登录。
- 主管后台组件测试：列表、搜索、添加、禁用、恢复和自我保护。
- AuthScreen 测试：未授权注册、禁用登录和正常注册路径。
- 生产构建与 GitHub Pages 部署后，使用主管账号实际点击验收。
