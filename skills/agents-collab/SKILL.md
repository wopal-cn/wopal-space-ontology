---
name: agents-collab
description: |
  Wopal 与子 Agent（fae、rook 等）交互的基础规范。⚠️ MUST load before ANY delegation — 涵盖委派工具 API、任务生命周期、通知处理、状态检查与恢复。

  🔴 Trigger: "委派"、"delegate"、"让 fae 执行"、"fae 任务"、"rook 审查"、"检查状态"、"取消任务"、"agent 协作"、或任何意图将任务交给子 Agent 执行的场景。

  🔴 严禁不加载本技能就直接委派，这是严重失职。

  注意：本技能不包含与特定工作流（如 dev-flow）绑定的 prompt 模板 — 那些由对应工作流技能提供。
---

# agents-collab — 子 Agent 交互基础

本技能定义**如何**与子 Agent 进行工具级交互。至于**何时**委派、prompt 中应包含哪些工作流特定指令（如 Plan 路径、Done checkbox），由上层工作流技能（如 dev-flow）决定。

---

## 子 Agent 类型

| Agent | 角色 | 职责 | `agent` 参数 |
|-------|------|------|-------------|
| fae | 实施代理 | 编码、重构、文件操作、构建测试、commit | `fae` |
| rook | 审查代理 | 只读审查，不修复不实施；输出 PASS/REVISE/BLOCK | `rook` |

**选择原则**：实施类任务 → fae；审查类任务 → rook。不确定时先评估任务性质再选。

---

## 委派工具

### wopal_task — 启动任务

```typescript
// 启动异步子 Agent 任务，返回 task_id
wopal_task({
  description: "3-5词",
  prompt: "<任务消息>",
  agent: "fae"       // 或 "rook"、"general" 等，默认 "general"
})
// 记录返回的 task_id，用于后续监控和交互
```

- 异步非阻塞：主 session 不等待，可同时启动多个任务
- 全空间视野：子 Agent 看到所有项目，与 Wopal 相同
- 并发上限：最多 3 个任务并行，超出自动排队
- TTL：30min 无交互自动清理

### wopal_task_output — 检查状态与输出

```typescript
// 概要状态
wopal_task_output({ task_id })

// 按维度查看
wopal_task_output({ task_id, section: "tools" })       // 工具调用记录
wopal_task_output({ task_id, section: "text" })         // 文本输出
wopal_task_output({ task_id, section: "reasoning" })    // 思考过程
wopal_task_output({ task_id, section: "text", last_n: 3 })  // 只看最近 3 条
```

### wopal_task_reply — 双向交互

向运行中或 idle 的子 Agent 发送消息，可恢复执行、纠正方向、追加指令。

```typescript
// 发送消息让子 Agent 继续工作
wopal_task_reply({ task_id, message: "继续完善测试覆盖" })

// 中断并重定向（abort 当前工作，处理新消息）
wopal_task_reply({ task_id, message: "停止当前方向，改为...", interrupt: true })
```

支持的任务状态：

| 当前状态 | reply 行为 |
|---------|-----------|
| `waiting` | 发送消息，恢复执行 |
| `running`（活跃） | 发送消息，排队处理 |
| `running` + idle | 清除 idle 标记，发送消息，恢复执行 |
| `completed` | 回退到 running，发新消息，重新执行 |
| `error` | 回退到 running，发新消息，重新执行 |

**关键场景**：
- 产出不达标 → `wopal_task_reply` 让子 Agent 继续完善，不要重新委派
- 任务出错 → `wopal_task_reply` 提供修复方向，让子 Agent 继续
- 需要中止 → `wopal_task_reply({ interrupt: true })` 打断并重定向

### wopal_task_delete — 清理已完成任务

```typescript
wopal_task_delete({ task_id })
```

仅用于已完成（completed/cancelled）的任务。运行中的任务需先用 `wopal_task_reply({ interrupt: true })` 中止。

---

## 任务生命周期

### 状态机

```
pending → running → completed
              ↓         ↓
           waiting    error
              ↓
           running (after reply)
```

### 状态含义

| 状态 | 含义 | Wopal 行动 |
|------|------|-----------|
| `pending` | 排队中 | 等待 |
| `running` | 执行中 | 等待通知或 `wopal_task_output` 检查进度 |
| `waiting` | 子 Agent 在提问 | `wopal_task_reply` 回答 |
| `completed` | 已完成 | 验证产出 → 满意则 `wopal_task_delete`；不满意则 `wopal_task_reply` 返工 |
| `error` | 会话级异常 | `wopal_task_output` 检查日志 → `wopal_task_reply` 引导修复 |
| `cancelled` | 已取消 | `wopal_task_delete` 清理 |

**进度判断**：消息数增长 → 执行中；长时间无新消息 → 可能卡住，检查 reasoning。

---

## 通知驱动机制

任务状态变更通过系统通知 `[WOPAL TASK *]` 告知 Wopal。不要轮询，等待通知。

### 通知类型与处理

| 通知 | 触发条件 | 处理流程 |
|------|---------|---------|
| `[WOPAL TASK PROGRESS]` | 定期心跳 | 了解进度即可，无需行动 |
| `[WOPAL TASK IDLE]` | 子 Agent session idle | ① `wopal_task_output(section="text")` 看输出 → ② 判断：完成则 `wopal_task_delete`；提问则 `wopal_task_reply` 回答；不确定则深入检查 reasoning |
| `[WOPAL TASK WAITING]` | 子 Agent 使用 question tool | `wopal_task_reply` 回答 |
| `[WOPAL TASK ERROR]` | 会话级错误 | `wopal_task_output` 查看日志 → `wopal_task_reply` 引导修复 |
| `[WOPAL TASK STUCK]` | no_activity 或 loop_detected | ① `wopal_task_output(section="reasoning")` 检查思考 → ② 死循环/异常 → `wopal_task_reply({ interrupt: true })` 打断；正常推理 → 继续等待 |

### 错误状态说明

- bash 命令报错（exit 1）是正常任务执行，**不会**触发 `ERROR` 通知
- `ERROR` 仅由会话级异常触发：session.crash、启动失败、promptAsync 失败
- `wopal_task_reply` 无法更换 agent 类型 — agent 在创建时确定。需要换 agent 只能创建新 task

---

## Rook 子代理

### 委派契约格式

委派 rook 时 prompt 需包含：

```yaml
review_type: plan | implementation
goal: <目标描述>
plan_path: <Plan 文档路径>
files_to_read:
  - <上下文文件列表>
focus:
  - <关注点>
depth: standard | deep
```

### 结果处理

rook 返回结构化报告，判定为 `PASS | REVISE | BLOCK`：

| 判定 | 含义 | Wopal 行动 |
|------|------|-----------|
| **PASS** | 目标已达成，无阻塞问题 | 继续推进 |
| **REVISE** | 需修订后重新审查 | 修订方案或要求 fae 修正 → 修正后重新委派 rook |
| **BLOCK** | 存在阻塞问题，必须修复 | 停止推进，根据 Blocker 要求 fae 修复 → 修复后重新委派 rook |

**修订循环上限**：同一审查对象最多 3 轮 REVISE/BLOCK 循环。超过 3 轮由用户在决策节点裁决，不再委派 rook。

### 验证要点

Wopal 收到 rook 报告后需检查：
- 报告包含 `PASS | REVISE | BLOCK` 判定
- Blocker / Warning 带 `file:line` 证据锚点
- 修复建议可执行（非泛泛描述）
- rook 不应有任何文件修改（`git status` 检查工作区）

---

## 验证边界

| 验证类型 | 执行者 | 原因 |
|----------|--------|------|
| 单元测试、集成测试 | fae | 自动化、确定性、可重复 |
| E2E 测试、功能验证 | **Wopal** | 需要观察运行时环境 |
| 技能安装验证 | **Wopal** | 需确认技能在 Agent 上下文中正确加载 |
| Rook 审查结果验证 | **Wopal** | 判定与证据需人工判断是否合理 |

`completed` ≠ 成功。Wopal 必须读取文件、运行命令验证产出。失败时用 `wopal_task_reply` 反馈。

---

## 禁止与限制

| 禁止 | 原因 |
|------|------|
| 不加载本技能就委派 | 缺乏机制指引，必然出错 |
| 频繁轮询 `wopal_task_output` | 浪费上下文，等待通知即可 |
| 嵌套 wopal_task | 子 Agent 已禁用 |
| 同一 task 反复 reply 返工（上下文 >50%） | 高上下文下返工质量下降，应新开 task |

| 限制 | 应对 |
|------|------|
| 并发最大 3 | 超出自动排队 |
| TTL 30min 兜底 | 通知后未处理则自动清理 |

---

## 故障排查

详见 `references/troubleshooting.md`
