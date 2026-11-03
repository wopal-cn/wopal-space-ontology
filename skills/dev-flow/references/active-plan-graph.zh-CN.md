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
- `groups`：纯组织结构，用于把多份 Plan 聚合为同一个目标或工作面。

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

当一个目标需要多份实施时，不创建额外协调 Plan；直接在 Graph 中增加 group。

Group 的最小结构：

```json
{
  "id": "platform-delivery",
  "title": "Platform Delivery",
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
- `members[].planId` 必须指向当前 `nodes`；`responsibility` 只说明职责，不表达依赖；
- group 不拥有 workflow 状态、进度百分比或完成门。UI 读取 member Plans 的实时状态后动态投影进展；
- group 不拥有执行顺序。所有先后与阻塞只由全局 `edges` 表达；
- group 可以按用户确认的组织意图直接创建、改名、增删成员；这些变化不改变任何 Plan 生命周期；
- member archive 后从 group 中删除；最后一个 member 离开后删除空 group；
- Graph 只保存当前工作面，不为已结束 group 额外建立历史对象；需要追溯时使用 Git 历史和归档 Plan。

## Lifecycle Hooks

当前没有 Graph CLI，因此每个生命周期命令与 Graph 维护是两个连续动作。命令成功后，主控必须立即完成对应 Graph 操作，再继续下一项工作。

| dev-flow 时点 | 主控 Graph 动作 |
|---|---|
| `plan new` | membership 不变；草稿不进入 Graph |
| `submit` 成功 | 添加 node；若已存在则保持幂等 |
| 多 Plan 组织关系变化 | 直接维护 `groups`；实施顺序变化维护 `edges` |
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
5. 每个 group 的 `id` 唯一，`members[].planId` 都存在于 nodes；
6. group 不保存 Plan 状态或执行顺序，edge 不复制到 Plan/Phase；
7. 当前实践阶段不存在 scheduling 字段。

可以使用一次性的 `python3` / `jq` 做检查；不要因此新增 Graph CLI 或把校验结果写回 Plan/Phase。

## Phase Boundary

Phase 可以保留稳定的 capability-level 先后关系，但**不得维护 Plan 级 DAG、实时 Plan 状态或“下一步执行谁”**。`Related Plans` 只登记 Plan 与阶段范围/Gap 的对应关系；当前实施关系和多 Plan 组织都以 Active Plan Graph 为准。
