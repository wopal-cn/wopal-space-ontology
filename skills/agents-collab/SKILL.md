---
name: agents-collab
description: |
  Wopal 与子 Agent（fae、rook 等）交互的基础规范。⚠️ MUST load before ANY delegation — 涵盖委派工具 API、任务生命周期、通知处理、状态检查与恢复。

  🔴 Trigger: "委派"、"delegate"、"让 fae 执行"、"fae 任务"、"rook 审查"、"检查状态"、"取消任务"、"abort 任务"、"agent 协作"、或任何意图将任务交给子 Agent 执行的场景。

  🔴 严禁不加载本技能就直接委派，这是严重失职。

  注意：本技能不包含与特定工作流（如 dev-flow）绑定的 prompt 模板 — 那些由对应工作流技能提供。
---

# agents-collab — 子 Agent 交互基础

本技能定义**如何**与子 Agent 进行工具级交互。至于**何时**委派、prompt 中应包含哪些工作流特定指令（如 Plan 路径、Done checkbox），由上层工作流技能（如 dev-flow）决定。

---

## 工具优先级

必须优先用 `wopal_task` 委派任务，只有当 `wopal_task` 不可用时才用内置 `task` 工具。
`wopal_task` 提供：双向通信、进度监控、非阻塞执行。用 `task` = 放弃以上能力 = 降级执行。

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

### wopal_task_reply — 通信/恢复/重定向

向 idle/waiting/error 任务发送消息，可恢复执行、纠正方向、追加指令。

```typescript
// 发送消息让子 Agent 继续工作
wopal_task_reply({ task_id, message: "继续完善测试覆盖" })

// 中断活跃执行并重定向（abort + message injection）
wopal_task_reply({ task_id, message: "停止当前方向，改为...", interrupt: true })
```

**适用状态**：

| 当前状态 | reply 行为 |
|---------|-----------|
| `waiting` | 发送消息，恢复执行 |
| `running`（idle phase）| 清除 idle 标记，发送消息，恢复执行 |
| `error` | 发送消息，重新执行 |

**关键规则**：
- `interrupt=true` = `wopal_task_abort` + message injection（abort 当前执行 + 发送新消息）
- 活跃 running 任务必须用 `interrupt=true`，否则消息排队处理
- **这不是关闭任务的工具** — 子 Agent 会被唤醒继续工作

**错误操作**：
- ❌ `wopal_task_reply({ task_id, message: "任务完成" })` — 子 Agent 被唤醒继续运行，形成无意义循环

### wopal_task_abort — 停止活跃运行任务

纯 abort 工具。只停止活跃 running 任务，不发送消息，不唤醒子 Agent。

```typescript
wopal_task_abort({ task_id })
```

**行为**：
- Abort session execution immediately
- Task 进入 idle phase（`status=running` + `idleNotified=true`）
- 不发送任何消息
- 子 Agent 不会被 promptAsync 唤醒
- 后续可用 `wopal_task_finish` 终结或 `wopal_task_reply` 恢复

**适用场景**：
- 只想停止任务，不需要发送新消息
- 任务卡住，需要先停止再判断下一步
- 与 `wopal_task_reply(interrupt=true)` 区别：abort 不注入消息，reply-interrupt 会注入消息并唤醒

### wopal_task_finish — 终结任务

```typescript
wopal_task_finish({ task_id })
```

终结 pending/idle/error/waiting 任务并删除子会话。子 Agent **不会**被唤醒。运行中任务需先 `wopal_task_abort` 或 `wopal_task_reply(interrupt=true)`。

**适用场景**：
- 验收通过后主动释放资源（替代 TTL 自动清理）
- 清理失败/error 任务
- 清理不再需要的 waiting 任务
- 清理排队中的 pending 任务

---

## 任务生命周期

### 真实状态模型

**Stored Status（数据库存储状态）**：

```
pending → running → error
              ↓
           waiting
              ↓
           running (after reply)
```

**Phase/Display Status（显示状态）**：

| 孕算条件 | 显示状态 | 说明 |
|---------|---------|------|
| `status=running` + `idleNotified=false` | `running`（活跃）| 正在执行，未收到 Wopal 判断 |
| `status=running` + `idleNotified=true` | `idle`（idle phase）| 已通知 Wopal，等待判断 |

**关键理解**：
- `idle` 不是独立存储状态，是 `running + idleNotified=true` 的 phase/display 状态
- `finish` 是终结动作（删除任务），不是状态
- 没有 `completed` / `cancelled` 状态

### 状态含义

| 存储状态 | 含义 | Wopal 行动 |
|---------|------|-----------|
| `pending` | 排队中（并发槽位满）| `wopal_task_finish` 清理（如不再需要）|
| `running`（活跃）| 执行中 | 等待通知或 `wopal_task_output` 检查进度 |
| `running`（idle phase）| Session idle，等待判断 | 验收 → `finish` 或 `reply` 返工 |
| `waiting` | 子 Agent 在提问 | `wopal_task_reply` 回答 |
| `error` | 会话级异常 | 检查日志 → `reply` 引导修复 或 `finish` 清理 |

---

## 三工具分工

| 工具 | 作用 | 适用状态 | 是否唤醒子 Agent |
|------|------|---------|-----------------|
| **wopal_task_reply** | 通信/恢复/重定向 | idle/waiting/error | ✅ 唤醒 |
| **wopal_task_abort** | 停止活跃执行 | running（活跃）| ❌ 不唤醒 |
| **wopal_task_finish** | 终结并删除任务 | pending/idle/error/waiting | ❌ 不唤醒 |

**组合使用**：
- 停止 + 重定向：`wopal_task_reply(interrupt=true)`（abort + message injection）
- 纯停止：`wopal_task_abort`（不发送消息）
- 停止 + 终结：`wopal_task_abort` → `wopal_task_finish`

---

## 通知驱动机制

任务状态变更通过系统通知 `[WOPAL TASK *]` 告知 Wopal。不要轮询，等待通知。

### 通知类型与处理

| 通知 | 触发条件 | 处理流程 |
|------|---------|---------|
| `[WOPAL TASK PROGRESS]` | 定期心跳 | 了解进度即可，无需行动 |
| `[WOPAL TASK IDLE]` | 子 Agent session idle | ① `wopal_task_output(section="text")` 看输出 → ② 判断：通过则 `finish`；不通过则 `reply` 返工；提问则 `reply` 回答 |
| `[WOPAL TASK WAITING]` | 子 Agent 使用 question tool | `wopal_task_reply` 回答 |
| `[WOPAL TASK ERROR]` | 会话级错误 | `wopal_task_output` 查看日志 → `reply` 引导修复 或 `finish` 清理 |
| `[WOPAL TASK STUCK]` | no_activity 或 loop_detected | ① `wopal_task_output(section="reasoning")` 检查思考 → ② 死循环/异常 → `abort` 或 `reply(interrupt=true)`；正常推理 → 继续等待 |

### 错误状态说明

- bash 命令报错（exit 1）是正常任务执行，**不会**触发 `ERROR` 通知
- `ERROR` 仅由会话级异常触发：session.crash、启动失败、promptAsync 失败
- `wopal_task_reply` 无法更换 agent 类型 — agent 在创建时确定。需要换 agent 只能创建新 task

---

## IDLE 任务处理决策树

收到 `[WOPAL TASK IDLE]` 通知后，按以下决策树处理：

```
IDLE 通知到达
    ↓
① wopal_task_output(section="text") 查看输出
    ↓
② 验收判定
    ├─ 通过 → wopal_task_finish 释放资源
    │         （或什么都不做 → TTL 30min 自动清理）
    │
    ├─ 不通过 → wopal_task_reply 要求返工
    │            （⚠️ 高上下文 >50% 时不应这么做，见"高上下文返工"章节）
    │
    └─ 子 Agent 提问 → wopal_task_reply 回答
```

### 核心规则

| 场景 | 正确操作 | 错误操作（禁止） |
|------|---------|----------------|
| 验收通过 | `wopal_task_finish`（主动释放）<br>或什么都不做（等待 TTL） | `wopal_task_reply("任务完成")`<br>❌ 子 Agent 被唤醒重新运行 |
| 验收不通过 | `wopal_task_reply` 返工要求 | `wopal_task_finish`<br>❌ 未返工直接终结 = 放弃质量 |
| 子 Agent 提问 | `wopal_task_reply` 回答问题 | 什么都不做<br>❌ 任务永久阻塞 |

### 为什么不能 reply "任务完成"

**根本原因**：子 Agent **没有关闭自身会话的能力**（ellamaka 设计限制）

**错误链条**：
1. 主 Agent: `wopal_task_reply("任务完成，请关闭")`
2. 子 Agent 被唤醒，收到消息
3. 子 Agent: "我无法关闭自己，任务已完成"
4. 主 Agent 再次收到 IDLE 通知
5. 形成无意义循环，浪费 token

**正确理解**：IDLE 状态本身就是"任务完成信号"，无需再次通知。验收通过后用 `wopal_task_finish` 终结。

---

## 返工与复审复用策略

### 主控职责边界

- 委派协作规范、复盘结论、何时复用/何时换 task 的判断，由 **Wopal** 负责。
- fae 负责实施，rook 负责审查；它们**不负责**总结委派机制经验，也不应被要求编写这类规范。
- 收到审查结论后，Wopal 必须主动推进下一步（返工 / 复审 / 验收 / 终结），不要停在汇报状态等待用户重复授权。

### 任务复用优先级

只要 task **还活着**、scope **未实质变化**、上下文 **仍健康**，优先复用已有 task：

| 场景 | 首选操作 | 不推荐操作 |
|------|---------|-----------|
| fae 实施结果需小幅返工 | `wopal_task_reply` 续做 | 为了"干净上下文"直接新开 fae task |
| rook 已给出 REVISE/BLOCK，修完后要复审 | `wopal_task_reply` 续审原 rook task | 只为拿一份"新 verdict"就新开 rook task |
| 子任务只是需要补充信息/继续执行 | `wopal_task_reply` | 终结后再重建同 scope task |

### 何时不要继续 reply 旧 task

满足任一条件时，应停止复用旧 task，改为新开 task 或由 Wopal 自己收尾：

1. 上下文已进入高风险区（**硬阈值：>50%**）
2. 已发生一轮 `IDLE → 审查/验收 → reply 返工`，且上下文已到 **45%+ 警戒区**
3. 任务 scope 已实质变化（例如：从代码修复变成规范编写、从实现变成架构评估）
4. 子 Agent 已出现明显跑偏、循环、质量持续下降

**经验法则**：
- 运行中且上下文健康 → 让它做完，不要中途打断
- idle 后若质量不达标，但上下文已偏高 → 不要硬 reply 同一 task 做第二轮重修
- 规范编写、委派经验沉淀、最终裁决属于 Wopal，不应继续压给 fae/rook

---

## 子会话上下文压缩

### 监控与决策

收到 `[WOPAL TASK PROGRESS]` 通知时检查上下文占用：

| 占用 | 建议 |
|------|------|
| < 45% | 无需关注 |
| 45-55% | 评估任务复杂度和剩余工作量 |
| ≥ 55% | 建议压缩（子会话质量下降风险） |
| ≥ 75% | 紧急压缩 |

压缩前确认：无关键未提交变更、无阻塞依赖、子会话非 stuck 状态。

### 执行

**主会话压缩**：

```
context_manage(action="compact")
```

压缩后 session 进入 IDLE，Plugin 自动发送恢复指令。

**子会话压缩**：

```
context_manage(action="compact", session_id="wopal-task-xxx")
```

压缩后 Plugin 发送 `[WOPAL TASK COMPACTED]` 通知，Wopal 用 `wopal_task_reply` 发送精准恢复指令（含当前目标、下一步操作、必需上下文）。

### 高上下文返工

子 Agent 上下文 >50% 时不应用 `wopal_task_reply` 反复返工——高上下文下返工质量下降。应新开 task 重新委派。

补充规则：若 task 已经历 `IDLE → 审查/验收 → reply` 的返工循环，且上下文已到 45%+，应优先停用旧 task；不要因为它"还活着"就机械复用。

---

## 并行委派中的产物交叉

多 Agent 并行时，`wopal_task_output` 返回的文件列表可能含其他 Agent 的工作成果。

**正确做法**：只关注当前任务的预期产出，通过 `git status` 在对应项目目录检查。不要误判为异常或尝试删除其他 Agent 的文件。

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

**复审复用原则**：若原 rook task 仍存活、审查 scope 未变、上下文健康，优先 `wopal_task_reply` 让原 rook 基于修复结果继续复审；不要只为拿一份"新的 verdict"就新开 reviewer task。

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

`idle` ≠ 成功。Wopal 必须读取文件、运行命令验证产出。失败时用 `wopal_task_reply` 反馈。

---

## 禁止与限制

| 禁止 | 原因 |
|------|------|
| 不加载本技能就委派 | 缺乏机制指引，必然出错 |
| 频繁轮询 `wopal_task_output` | 浪费上下文，等待通知即可 |
| 嵌套 wopal_task | 子 Agent 已禁用 |
| 同一 task 反复 reply 返工（上下文 >50%） | 高上下文下返工质量下降，应新开 task |
| `wopal_task_reply("任务完成")` | 子 Agent 被唤醒继续运行，形成无意义循环 |

| 限制 | 应对 |
|------|------|
| 并发最大 3 | 超出自动排队 |
| TTL 30min 兜底 | 通知后未处理则自动清理 |

---

## 故障排查

详见 `references/troubleshooting.md`
