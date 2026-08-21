# 拍摄日工作台设计

## 目标

将当前只按场次展示日期的拍摄计划升级为可执行的拍摄日工作台：制片可创建拍摄日，把任意镜头编入当天并排序，查看当日汇总，并从该计划生成可追溯的拍摄通告。

## 范围与原则

- 排程单位是镜头；镜头原有的场次归属保持不变。
- 一个镜头最多属于一个拍摄日；未归属的镜头显示在待排镜头池。
- 镜头在拍摄日内以 `shootOrder` 升序展示；编入、移出与重排都立即持久化。
- 不引入依赖，不实现演员、器材、天气或跨日冲突检测。拍摄日只承载首版必要的制作资料。
- 现有项目的数据必须继续可读：没有拍摄日与排程字段时，所有镜头均视为待排。

## 数据模型

新增 `ShootDay`：

```ts
type ShootDay = {
  id: string;
  projectId: string;
  title: string;
  shootDate: string;
  location: string;
  callTime: string;
  wrapTime: string;
  coordinator: string;
  notes: string;
  order: number;
};
```

`Shot` 新增可选字段：

```ts
shootDayId?: string;
shootOrder?: number;
```

Supabase 新建 `shoot_days` 表（项目成员具备读写权限、项目删除时级联删除、加入 realtime）；`shots` 新增 `shoot_day_id` 外键（删除拍摄日时置空）和非空默认 `shoot_order`。对 `shoot_day_id, shoot_order` 建索引。

`StoryboardProject` 新增 `shootDays: ShootDay[]`。模板快照不包含拍摄日和镜头排程，以免从模板继承过期生产计划。

## 网关与持久化

`StoryboardGateway` 增加：

```ts
createShootDay(projectId, input): Promise<ShootDay>
updateShootDay(projectId, shootDay): Promise<void>
deleteShootDay(projectId, shootDayId): Promise<void>
assignShotsToShootDay(projectId, shotIds, shootDayId | null): Promise<void>
reorderShootDayShots(projectId, shootDayId, orderedShotIds): Promise<void>
```

`assignShotsToShootDay` 按传入顺序为镜头分配连续 `shootOrder`；移出时清除 `shootDayId`。`reorderShootDayShots` 必须拒绝不完全属于目标拍摄日的 ID。两种网关（Fake 与 Supabase）在结构变更后广播 `structure.changed`，工作台以现有重载机制同步。

## 界面

拍摄计划页采用三栏布局：

1. **待排镜头池**：列出未编入任何拍摄日的镜头，支持按状态筛选、复选和“加入拍摄日”。镜头卡包含镜号、内容、场次、景别、时长与制作状态；缺失字段显示明确占位文案。
2. **拍摄日时间线**：创建、选择及编辑拍摄日。选中的拍摄日显示可拖拽镜头列表；拖入、移出、拖动排序和批量加入均可操作。空状态解释下一步操作。
3. **当日摘要**：显示日期、地点、集合/收工时间、负责人，以及镜头数、总镜头时长、已确认数、未填时长数。镜头按当前顺序显示。

为避免原生拖放在触屏设备不可用，首版同时提供“上移 / 下移”和“移出计划”按钮；拖放是桌面端的快捷方式，非唯一流程。

## 拍摄通告

拍摄通告以拍摄日 ID 为选择和版本归档单位，而非日期字符串。快照包含拍摄日全部制作资料，及按 `shootOrder` 排序的镜头；每个镜头保留其场次摘要。通告页显示拍摄日标题、地点、集合/收工时间、负责人、制作备注及镜头清单。既有仅有 `shootDate` 的场次继续作为旧通告兼容路径，直到用户创建拍摄日。

## 错误与边界

- 不允许发布空拍摄日；页面说明原因。
- 删除拍摄日会将镜头退回待排池，不删除镜头或其场次归属。
- 当拍摄日没有地点、时间或负责人时，摘要与通告标记“待确认”，但不阻止保存。
- 写入失败沿用工作台既有保存错误状态并重载服务端数据。

## 测试

- 领域与 Fake Gateway：创建/更新/删除拍摄日、编入/移出镜头、排序校验、删除后镜头回到待排池。
- Supabase Gateway：行映射、写入字段与排序请求。
- 拍摄计划组件：未排镜头元数据、批量编入、上移/下移、摘要统计和空状态。
- 工作台集成：操作后数据持久化且故事板原始镜头顺序不变。
- 通告：快照包含拍摄日资料并按排程顺序冻结；空拍摄日不可发布。
