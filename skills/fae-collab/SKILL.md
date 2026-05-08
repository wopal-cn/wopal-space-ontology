---
name: fae-collab
description: |
    Wopal 与 Fae 协作的完整生命周期指南。⚠️ **MUST load before ANY delegation to fae** — 委派、检查、监控、验证、收尾全覆盖。🔴 Trigger: "委派"、"delegate"、"让 fae 执行"、"fae 任务"、"检查 fae 状态"、"取消任务"、"fae 协作"、或任何意图将任务交给 fae 执行的场景。**严禁不加载本技能就直接委派任务给 fae，这是严重失职。**
---

# Fae 协作

```
委派 → 检查 → 监控 → 异常处理 → 验证 → 收尾
```

---

## 两种模式

### 异步协作模式（wopal_task）— 主力模式

最成熟的委派方式。Wopal 委派后可继续其他工作，Fae 在空间全视野下执行，Wopal 随时监控和交互。

**协作闭环**：

```
委派 wopal_task → 继续其他工作 → 收到通知 → 检查产出 → 满意/继续完善
                  ↑                                        │
                  ├─ 收到 [IDLE] → 检查 → cancel/reply ──┤
                  └─ 收到 [WAITING] → wopal_reply 回答 ──┘
```

**能力**：
- **全空间视野**：Fae 看到所有项目，与 Wopal 相同
- **异步不阻塞**：委派后 Wopal 继续工作，互不等待
- **状态监控**：`wopal_output()` 查看进度、工具调用、思考过程
- **双向交互**：`wopal_reply()` 回答 Fae 的问题、要求她继续完善
- **并行任务**：多个任务可同时运行

**API**：

```typescript
// 委派（无需指定 timeout/staleTimeout，由系统管理）
wopal_task({ description: "3-5词", prompt: "<任务>", agent: "fae" })

// 监控
wopal_output({ task_id })                          // 概要
wopal_output({ task_id, section: "tools" })         // 工具调用
wopal_output({ task_id, section: "text" })          // 文本输出
wopal_output({ task_id, section: "reasoning" })     // 思考过程

// 交互（支持所有非终态任务，不限于 waiting）
wopal_reply({ task_id, message: "继续完善测试覆盖" })

// 取消（支持 running/waiting/pending/completed/error）
wopal_cancel({ task_id })
```

### CLI 沙箱模式 — 隔离模式

Fae 在沙箱中运行，只看 `/project/` 单项目。核心价值是**环境隔离**，适合单项目多版本并行开发——多个 worktree 各自一个沙箱，互不干扰。

**适用场景**：多 worktree 并行开发同一项目、需要严格的文件系统隔离

**API**：

```bash
wopal fae sandbox start <project>
wopal fae session create --sandbox <project> --json
wopal fae task start <session-id> "<message>" --sandbox <project> --json
wopal fae stream <session-id> "<message>" --sandbox <project>  # 中途交互
```

### 选择标准

| 优先级 | 条件 | 模式 | 理由 |
|--------|------|------|------|
| 1 | 单项目多版本并行（多 worktree） | CLI | 沙箱隔离，各版本独立环境 |
| 2 | 默认 | 异步协作 | 全视野、可交互、不阻塞 |

---

## 一、委派

### 1.1 异步协作模式（主力）

```typescript
wopal_task({
  description: "3-5词",
  prompt: "<任务消息>",
  agent: "fae"
})
// 记录 task_id
```

**斜杠命令**：prompt 必须以 `/xxx` 开头才能触发
```typescript
prompt: "/commit\n\n创建 commit。"  // ✅ 正确
prompt: "执行 /commit 命令..."      // ❌ 不会触发
```

### 1.2 CLI 沙箱模式

**视野限制**：Fae 只能看到 `/project/`

| Space 视角 | Fae 视角 |
|------------|----------|
| `projects/<project>/` | `/project/` |
| `.agents/skills/` | 不可见 |

```bash
wopal fae sandbox start <project>
wopal fae session create --sandbox <project> --json
wopal fae task start <session-id> "<message>" --sandbox <project> --json
# 记录 task_id
```

### 1.3 任务消息格式

**有 Plan 文件时**（dev-flow 驱动的任务），prompt 只给 Plan 路径和完成标准，细节让 fae 从 Plan 读取：

```markdown
## Plan
读取 Plan 文件，按 Implementation 执行：<plan 文件路径>

## 特别注意
- <仅在 Plan 之外需要额外强调的事项，无则省略此节>

## 完成标准
- <简要列出关键验证点>

## Task Report
完成时输出：Goal/Accomplished/Files/Status
```

**无 Plan 文件时**（一次性任务），用完整格式：

```markdown
## 目标
<一句话>

## 文件
- /project/path/to/file.ts

## 步骤
1. 读取 /project/AGENTS.md
2. 修改文件
3. 运行：pnpm test

## 完成标准
- 功能验证通过

## Task Report
完成时输出：Goal/Accomplished/Files/Status
```

**原则**：有 Plan 时，Plan 是单一信息源，prompt 不重复 Plan 内容。这样做的好处：
- prompt 精简，减少 token 浪费
- 信息源统一，避免 prompt 与 Plan 不一致
- fae 从文件读取获取完整上下文（含 Technical Context、Code References 等）

---

## 二、通知驱动机制

### 核心原则

任务生命周期由**通知**驱动，Wopal 全程掌控。系统不会硬杀任何任务——所有异常状态先通知 Wopal，由 Wopal 决定 cancel、reply 还是继续等待。IDLE 通知将判断权交给 Wopal：无论 fae 以什么方式结束（完成、提问、卡住），程序只负责通知，Wopal 负责判断。

### 通知类型

| 通知标记 | 触发条件 | 含义 | Wopal 行动 |
|---------|---------|------|-----------|
| `[WOPAL TASK IDLE]` | Fae session idle | 任务已完成或等待，需判断 | `wopal_output` 检查，然后 `wopal_cancel` 或 `wopal_reply` |
| `[WOPAL TASK ERROR]` | Fae 异常 | 任务出错 | 检查日志，可 reply 引导修复 |
| `[WOPAL TASK WAITING]` | Fae 使用 question tool | 子代理等待回复 | `wopal_reply` 回答 |
| `[WOPAL TASK PERMISSION]` | 权限请求 | 自动授权通知 | 无需行动 |
| `[WOPAL TASK QUESTION]` | 子代理提问 | 事件中继 | `wopal_reply` 回答 |
| `[WOPAL TASK PROGRESS]` | 定期心跳 | 仍在执行 | 了解进度 |
| `[WOPAL TASK STUCK]` | ticker 异常检测 | no_activity 或 loop_detected | 检查 reasoning 后决定 |

### 全状态对话

`wopal_reply` 支持所有非终态（非 cancelled/interrupt）任务：

| 任务状态 | reply 行为 |
|---------|-----------|
| `waiting` | 发送消息，恢复执行 |
| `running` + idleNotified | 清除 idle 标记，发送消息，恢复执行 |
| `completed` | 回退到 running，发新消息，重新获取并发槽 + timer |
| `error` | 回退到 running，发新消息，重新获取并发槽 + timer |
| `running`（活跃） | 发送消息，排队处理 |

**关键场景**：
- **返工**：任务 completed 但产出不达标 → `wopal_reply` 让 Fae 继续完善
- **引导修复**：任务 error → `wopal_reply` 提供修复方向让 Fae 继续
- **追加指令**：任务 running 中追加新要求

---

## 三、检查

### CLI
```bash
wopal fae task status <task-id> --json
```

### 异步协作
```typescript
wopal_output({ task_id: "wopal-task-xxx" })
// 返回 summary：status, messages, last activity, tool calls

// 按分类获取（控制上下文占用）：
wopal_output({ task_id, section: "tools" })       // 工具调用和结果
wopal_output({ task_id, section: "reasoning" })    // 思考过程
wopal_output({ task_id, section: "text" })         // 文本输出
wopal_output({ task_id, section: "reasoning", last_n: 3 })  // 只看最近 3 条
```

### 状态含义

| 状态 | 含义 | 下一步 |
|------|------|--------|
| pending | 排队中 | 等待 |
| running | 执行中 | 等待或监控 |
| waiting | 等待回复 | wopal_reply |
| completed | 已完成 | 验证产出，可 reply 返工 |
| error | 出错 | 检查日志，可 reply 引导修复 |
| cancelled | 已取消 | 确认 |

**进度判断**：消息数增长 → 执行中；长时间无新消息 → 可能卡住

---

## 四、监控

### CLI

```bash
wopal fae task wait <task-id> --timeout 300

# 中途交互
wopal fae stream <session-id> "<message>" --sandbox <project>

# 检查 OpenCode 状态
curl -s "http://localhost:<port>/session/status?directory=/project"
# busy=执行中, idle=完成
```

### 异步协作

**等待通知**，不要轮询：
```typescript
wopal_task({ ... })
// 记录 task_id，做其他事...
// 收到通知后
wopal_output({ task_id })  // 获取结果
```

### 通知处理流程

收到 `[IDLE]` 通知时：
1. 用 `wopal_output({ task_id, section: "text" })` 查看 fae 最后的输出
2. 判断 fae 状态：
   - **已完成** → `wopal_cancel({ task_id })` 关闭任务
   - **在提问** → `wopal_reply({ task_id, message: "..." })` 回答
   - **不确定** → 可继续等待或用 `wopal_output({ task_id, section: "reasoning" })` 深入检查

收到 `[STUCK]` 通知时：
1. 用 `wopal_output({ task_id, section: "reasoning" })` 检查思考过程
2. 判断是否值得继续等待
3. 继续 → 无需操作（TTL 作为绝对兜底）；终止 → `wopal_cancel({ task_id })`

> 异常检测统一由 ticker 30s 健康检查负责，包括 stuck（120s 无活动）和 loop（工具连续调用/快速循环）两种 reason。

---

## 五、异常处理

### 任务卡住

收到 `[WOPAL TASK STUCK]` 通知时：
1. 用 `wopal_output({ task_id, section: "reasoning" })` 检查思考过程
2. 判断是否 reasoning 死循环或异常内容
3. 卡死 → `wopal_cancel({ task_id })`；正常推理 → 继续等待

### 取消

```bash
# CLI
wopal fae task cancel <task-id>

# 异步协作（支持 running/waiting/pending/completed/error）
wopal_cancel({ task_id: "wopal-task-xxx" })
```

### 重试

| 原因 | 处理 |
|------|------|
| stuck | 取消重试，简化任务 |
| prompt 不明确 | 优化后重试 |

---

## 六、验证

验证边界已整合到「最佳实践 → 验证边界」中，请参考该章节。

---

## 七、收尾

### 汇报

向用户汇报：完成情况、修改文件、问题、后续建议

### 清理

```bash
wopal fae sandbox stop <project>
```

---

## 最佳实践

### 委派策略

**异步协作优先**：`wopal_task` 是主力委派方式。Wopal 委派后继续其他工作，Fae 完成后通过通知回调，Wopal 再验证产出。好处：上下文隔离、可并行、Wopal 保留空间用于验证。

**产出不达标时**：用 `wopal_reply` 让 Fae 继续完善，不需要重新委派。

**任务分组并行**：将无依赖关系的任务分组，并行异步委托。有依赖的串行，但组内尽量并行。

**委派 ROI**：委派成本 = prompt 描述 + fae 上下文 + 验证读取。评估是否值得委派：
- 简单编辑（<5 处修改）、已读文件的修改 → Wopal 自己做
- 涉及自身行为的技能内容优化 → Wopal 自己做（需要深刻上下文理解）
- 通用技能开发、文件操作、代码编写 → 委派给 fae

### 任务消息规范

| 参数 | 规范 |
|------|------|
| description | 3-5 词 |
| prompt | 有 Plan 给路径，无 Plan 给详细步骤 |

**记录 task_id**：用于检查、监控、取消

### 验证边界

| 验证类型 | 执行者 | 原因 |
|----------|--------|------|
| 单元测试、集成测试（代码级） | fae | 自动化、确定性、可重复 |
| E2E 测试、功能验证 | **Wopal** | 需要观察运行时环境 |
| 技能安装验证 | **Wopal** | 需要确认技能在 Agent 上下文中正确加载 |
| 插件加载/事件流观测 | **Wopal** | 子会话无法观测父会话运行时 |

`completed` ≠ 成功，Wopal 必须读取文件、运行命令验证 fae 的产出。失败时用 `wopal_reply` 反馈，让 fae 继续完善。

---

## 禁止与限制

| 禁止 | 原因 |
|------|------|
| 嵌套 wopal_task | 子代理已禁用 |
| 同一 session 多任务 | 会混乱 |
| 监工模式 | fae 完成后 idle |
| 频繁轮询 | 浪费上下文，等待通知即可 |

| 限制 | 应对 |
|------|------|
| 并发最大 3 | 超出自动排队 |
| CLI 只见 /project/ | 路径翻译 |
| TTL 30min 兜底 | 通知后未处理则自动清理 |

---

## 故障排查

详见 `references/troubleshooting.md`
