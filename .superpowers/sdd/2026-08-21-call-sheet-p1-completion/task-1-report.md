# Task 1: 拍摄通告回执数据层报告

## 实现

- 新增 `CallSheetAcknowledgement` 领域类型，以及网关的列表与确认契约。
- Fake gateway 按通告版本和当前成员保存回执；确认前检查成员资格与撤回状态，重复确认返回已存在的回执。
- Supabase gateway 使用 `insert(...).select(...)` 写入回执；唯一冲突（`23505`）时按版本和当前用户回读既有记录。
- 新增回执表、复合主键、级联删除和 RLS 策略。插入策略仅允许当前用户对未撤回、其所属项目的通告版本确认。

## 文件变更

- `src/domain/models.ts`
- `src/data/gateway.ts`
- `src/data/fakeGateway.ts`
- `src/data/supabaseGateway.ts`
- `src/data/fakeGateway.test.ts`
- `src/data/supabaseGateway.test.ts`
- `supabase/migrations/202608210003_call_sheet_acknowledgements.sql`

## TDD 证据

RED：

```text
$ npm test -- --run src/data/fakeGateway.test.ts
Test Files  1 failed (1)
Tests  2 failed | 16 passed (18)
TypeError: gateway.acknowledgeCallSheet is not a function
```

另对 Supabase 重复确认回读测试执行 RED：

```text
$ npm test -- --run src/data/supabaseGateway.test.ts
Test Files  1 failed (1)
Tests  1 failed | 17 passed (18)
TypeError: gateway.acknowledgeCallSheet is not a function
```

GREEN：

```text
$ npm test -- --run src/data/fakeGateway.test.ts src/data/supabaseGateway.test.ts
Test Files  2 passed (2)
Tests  36 passed (36)
```

## 全量验证

```text
$ npm test -- --run
Test Files  40 passed (40)
Tests  244 passed (244)

$ npm run build
tsc --noEmit && vite build
✓ built in 98ms
```

## 自审

- 领域类型和两个网关签名与简报精确契约一致。
- Fake 实现对不存在版本返回 `not_found`，对非成员或已撤回版本返回 `forbidden`；返回值为副本，避免调用方改变存储记录。
- Supabase 的成员/撤回校验由迁移中的 RLS `insert with check` 强制执行；唯一冲突仅回读当前用户的现有回执。
- 迁移包含指定表结构、RLS 启用和两条命名策略；未发现本任务范围内缺陷。

## 顾虑

- 测试和构建均输出既存 Vite `configLoader: 'native'` 配置警告；这是已裁定的基线警告，非本任务引入。
- 构建还输出既有的单个压缩后 JS chunk 超过 500 kB 警告；未改动打包结构。
