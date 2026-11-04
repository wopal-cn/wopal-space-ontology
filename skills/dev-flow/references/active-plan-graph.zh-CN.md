# Active Plan Graph — 当前 Plan 编排规则

Active Plan Graph 是一个 Space 从 **submit 到 archive** 这段受管理生命周期的统一编排面。它记录**已提交且尚未归档的 Plan 节点、Plan 间实施顺序/硬约束，以及用于组织多份 Plan 的 Graph groups**；Plan 自身状态仍由 dev-flow Plan 文件唯一持有。

当前实践阶段不提供 Graph CLI。**主控 Agent 在 dev-flow 生命周期节点中直接维护** `.wopal-space/plans/active-graph.json`。被委派的实施者不编辑 Graph。

## Truth Ownership

| 事实 | 唯一真相源 |
|---|---|
| Plan 目标、范围、Task、验收与 workflow 状态 | Plan 文件 / dev-flow |
| 当前 Plan 的实施先后、硬依赖与组织分组 | `active-graph.json` |
| Phase 目标、范围、Gap 与完成标准 | Phase 文档 |

因此：

- 不把 Graph edge 复制回 Plan 的 `Depends On`、Required Inputs 或 Phase 的 Plan 执行 DAG；Plan 可以在 Context 中解释业务背景，但不能把它当第二份编排真相。
- Graph 不复制 `planning / reviewing / executing / verifying / done` 状态；需要状态时读取 Plan。
- Graph group 只负责组织，不是 Plan：没有 Issue、状态机、Acceptance Criteria、worktree 或 Delivery。
- Phase `Related Plans` 只做稳定 traceability，不保存 Plan 状态；Plan 级执行顺序只存在 Graph。

## File Contract

当前固定文件：

```text
<space>/.wopal-space/plans/active-graph.json
```

Graph 至少包含：

- `schema`、`space`、`updated`；
- `membership`：说明当前采用的 submit/archive 进入退出规则；
- `nodes`：已 submit 且尚未 archive 的 Plans；
- `edges`：Plan 间实施顺序与硬约束；
- `groups`：纯组织结构，只用于已确认的共同交付目标，不用项目、Phase 或时间范围代替分组依据。

当前实践阶段禁止加入 cron、timezone、priority、dispatch、notBefore、maxRuntime、nextRun 等自动调度字段；这些属于后续 P4 Scheduler 能力。

## Membership

Graph membership 由生命周期事件锁存，不只由当前 `Status` 推导：

| Plan 情况 | Graph |
|---|---|
| 从未 submit 的 `planning` 草稿 | node 不存在 |
| `reviewing` | node 存在 |
| `executing` | node 存在 |
| `verifying` | node 存在 |
| `done` | node 仍存在 |
| 已 submit 后被 `reset` 回 `planning` | node 仍存在 |
| `archived` | node 不存在 |

第一次 `submit` 成功后，主控立即添加 node。`planning` 草稿在首次 submit 前不进入 Graph。

`verify --confirm` 成功把 Plan 推进到 `done` 时 **不改变 membership**。Plan 与相关 edges 继续保留，用于总体视图展示完整实施顺序。只有 `archive` 成功后才删除 node、incident edges 和 group membership。

`reset` 本身不改变 Graph membership。一个已经 submit、尚未 archive 的 Plan 即使回到 `planning`，仍保留在 Graph，原 edges 也保留，除非用户明确调整编排关系。

## Edge Semantics

Edge 使用 `from → to`，表示：**`to` 开始实施前，`from` 必须已经达到 `done`**。

```json
{
  "from": "project/producer-plan",
  "to": "project/consumer-plan",
  "reason": "为什么 consumer 必须等 producer 完成"
}
```

规则：

- edge 只连接当前 `nodes` 中的 Plan；
- `reason` 必填，说明真实实施约束；
- 禁止自依赖、重复 edge 和环；
- edge 是 Graph 自己的事实，不从 Plan Markdown 自动解析或推导；
- 没有明确硬约束的工作保持并列 root；不要为了制造唯一“下一步”伪造依赖；
- producer 达到 `done` 后 edge **已满足但仍保留**，直到 producer 或 consumer archive 时随 incident edge 一起删除；这样 UI 能继续展示完整实施顺序；
- 只对尚未开始实施的 consumer 新增未满足 incoming edge；已经 `executing` / `verifying` 的 Plan 不得突然获得新的前置约束。若执行关系必须重做，先交回用户决定是否 reset/re-plan。

## Groups

Group 是当前 Graph 中的**单层组织容器**：把共同完成一个已确认总体交付目标的多份独立 Plan 组织起来。Group 不替代 Plan，也不是标签、项目或 Phase 的镜像；只有同项目、同 Phase、同时间段、相似主题，不足以作为建组依据。

Group 的最小结构：

```json
{
  "id": "shared-delivery",
  "title": "Shared Delivery",
  "goal": "这组 Plans 共同要达成的整体结果",
  "members": [
    {
      "planId": "project/plan-a",
      "responsibility": "该 Plan 在整体目标中的职责"
    }
  ]
}
```

规则：

- `id` 在当前 Graph 内唯一且稳定；`title` / `goal` 让 UI 和 Agent 能理解这组工作的整体意图；
- **命名要能看懂**：`id` 和 `title` 必须说明这组工作实际交付什么，具体到没看过成员 Plan 的读者也能抓住共同目标。禁止用空泛的伞词（`delivery`、`platform`、`foundation`、`misc`）当区分性部分：`platform-sdk-release` 能看懂，`platform-delivery` 看不懂。`id` 建立后保持稳定，想更易懂时改 `title`/`goal`，不要改名。
- `members[].planId` 必须指向当前 `nodes`（已经 submit、尚未 archive）；`responsibility` 只说明职责，不表达依赖；禁止把未 submit 草稿写入 nodes 或 group；
- **一个 Plan 最多属于一个 group**，也不能在同一 group 内重复出现。Group 只能直接包含 Plan node，禁止 group 嵌套 group；不属于任何 group 的 Plan 可以独立留在 Graph；
- group 不拥有 workflow 状态、进度百分比或完成门。UI 读取 member Plans 的实时状态后动态投影进展；
- group 不拥有执行顺序。所有先后与阻塞只由全局 `edges` 表达；仅仅同组不意味着成员之间有依赖，也不能自动生成 edges；
- **用户授权边界**：建立 group、改变其总体 `goal` 或实质调整成员范围，必须有用户已确认的总体拆分/组织意图。Agent 不得凭 Plan 内容相似自行发明 group；已经确认的拆分无需每次 submit 再请示；
- **建立与扩充**：第一个已 submit 的成员出现时即可建立对应 group，即使其余规划中的成员还未 submit，group 暂时只有一个 member 也合法。后续成员成功 submit 后按已确认拆分逐个加入。尚未 submit 的成员不预写进 group；
- **变更**：根据已确认的组织调整成员职责、名称或归属；对实质性的目标/范围变更先取得用户确认。`id` 尽量保持稳定，避免随展示标题改名；
- **退出**：member archive 后立即从 group 中删除；即使只剩一个 member 也保留 group，直到最后一个 member archive，再删除空 group。这是生命周期的机械清理，无需另设 group 关闭动作；
- Graph 只保存当前工作面，不为已结束 group 额外建立历史对象；需要追溯时使用 Git 历史和归档 Plan。

## Lifecycle Hooks

当前没有 Graph CLI，因此每个生命周期命令与 Graph 维护是两个连续动作。命令成功后，主控必须立即完成对应 Graph 操作，再继续下一项工作。

| dev-flow 时点 | 主控 Graph 动作 |
|---|---|
| `plan new` | membership 不变；草稿不进入 Graph |
| `submit` 成功 | 添加 node；如果属于已确认分组则创建/更新 group 成员；若已存在则保持幂等 |
| 多 Plan 组织关系变化 | 根据用户已确认的拆分/调整维护 `groups`；实施顺序变化单独维护 `edges`，不能从组员关系推导 |
| `approve --confirm` 前 | Plan 必须在 Graph；每个 incoming edge 的 producer 必须已 `done` |
| `approve --confirm` 后 | membership 不变 |
| `complete` | membership 不变 |
| `verify --confirm` 成功 | membership 不变；`done` node 与 edges 继续保留 |
| `archive` 成功 | 删除 node + incident edges + group membership；空 group 一并删除 |
| `reset` | membership 不变；已 submit 未 archive 的 Plan 即使回 planning 仍在 Graph |

Graph 手工维护失败时，不伪造生命周期回滚。保留已经成功的 dev-flow 状态，立即修复 Graph；在 Graph 恢复一致前，不批准或启动新的 Plan。

## Manual Validation

每次手工修改后至少检查：

1. JSON 可解析；
2. 每个已 submit 且尚未 archive 的 Plan 恰好一个 node；从未 submit 的 planning 草稿和已 archive Plan 没有 node；
3. edge 两端都存在于 nodes；
4. 无 self-edge、duplicate edge、cycle；
5. 每个 group 的 `id` 唯一，`members[].planId` 都存在于 nodes；同组成员不重复、不同 group 成员不重叠，group 不嵌套；
6. 每个 group 有可解释的共同交付目标与已确认的组织依据；group 不保存 Plan 状态或执行顺序，不从组员关系推导 edge，edge 不复制到 Plan/Phase；
7. 当前实践阶段不存在 scheduling 字段。

可以使用一次性的 `python3` / `jq` 做检查；不要因此新增 Graph CLI 或把校验结果写回 Plan/Phase。

## Phase Boundary

Phase 可以保留稳定的 capability-level 先后关系，但**不得维护 Plan 级 DAG、实时 Plan 状态或“下一步执行谁”**。`Related Plans` 只登记 Plan 与阶段范围/Gap 的对应关系；当前实施关系和多 Plan 组织都以 Active Plan Graph 为准。
