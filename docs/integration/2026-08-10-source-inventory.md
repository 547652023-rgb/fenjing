# 2026-08-10 分镜平台集成来源清单

## 接收基线

- 集成分支：`integration/storyboard-platform`
- 基线：`origin/agent/next-optimization` / `95ed304`
- 基线验证：`pnpm test --run` 为 204/204 通过；`pnpm build` 成功。

## 已冻结的来源

| 来源 | 分支/提交 | 状态 | 接收方式 |
|---|---|---|---|
| 优化主线远程仓库 | `origin/agent/next-optimization` / `95ed304` | 基线 | 已检出 |
| 优化主线本地工作区 `/Volumes/2T/辽超ai/图片/fenjing` | `agent/next-optimization` / `8f32e27` | 任务已停止；未跟踪文件均为 `._*` macOS 元数据 | 接收 `8f32e27`，忽略元数据 |
| 设计与导出分支 | `origin/agent/add-storyboard-saas-design` / `9e0bd81` | 已推送，和基线分叉 | Git 合并并逐项解决冲突 |
| 历史旧工作区 `/Users/anshandapaidangmacm4/Documents/Codex/2026-07-16/ni-h/work/fenjing-repo` | `agent/add-storyboard-saas-design` / `033a1c1` | 有未提交修改 | 仅审查，不自动接收 |

## 历史旧工作区补丁摘要

1. `src/components/StoryboardTable.test.tsx`：仅新增一项断言，要求“画面”列表头最小宽度为 `20rem`。待与当前 UI 行为比对后决定是否接收。
2. `pnpm-lock.yaml`：由一次依赖更新产生，混入 Vite、Supabase 与测试库版本变化；没有匹配的 `package.json` 意图，不接收。
3. `pnpm-workspace.yaml`：只包含针对 `@testing-library/jest-dom@7.0.0` 的发布年龄豁免；没有当前安装阻塞证据，不接收。

原工作区保持原样，未执行清理、重置、删除或写入。

## 任务与数据库记录

- `优化分镜平台界面 (2)`：已停止写入，最终提交为 `8f32e27`；修复 PDF 中横/竖图被拉伸的问题。
- `导出解决`：导出排版、参考图与品牌导出改动在设计分支中，随后与主线统一验证。
- `分镜平台`、`分镜平台 (2)`、`分镜平台支线1`：涉及项目初始化、模板与 Supabase 权限/迁移；迁移是否已在线执行不能由 Git 判断，须建立迁移账本后逐条核对。
- `分镜平台2`：第三方页面调研，无本项目代码。

## 排除项

- 所有 `._*` 文件都是 macOS 资源分叉元数据，不能作为产品源代码纳入版本控制。
- 与本项目无关的聊天未纳入此清单。
