---
name: ontology-evolution
description: >
  必须使用本技能处理任何可能改变或维护 WopalSpace 可复用能力的工作：用户纠正、重复摩擦、工具/环境失败、可复用经验、进化提案、能力资产、空间/本体同步、装配变更或上游贡献。即使用户没说“本体”或“进化”，只要要判断一条会话经验是否应沉淀为能力，或要修改本体能力资产，也必须加载。`projects/` 下代码开发使用 `dev-flow`。
---

# ontology-evolution — 本体进化

把真实工作中的摩擦变成可靠信号，把成熟信号沉淀为持久能力，并让改进安全落地。

主流程：**观察 → 诊断 → 路由 → 汇总 → 提案 → 落地**。主文件只保留决策规则和主流程；具体落地、命令和维护细节按需读取 references。

## 核心契约

- 先找已有能力 owner，优先修正已有能力；只有没有自然 owner 时才新增能力。
- 提案本身不是实施授权。任何提案都必须等待用户批准后才能落地。
- 用户掌握三道终局门：**批准、验证、交付**。
- Wopal 负责主控与记录；Fae 负责实施；Rook 负责实施评审；Maka 负责观察、分析和提案。

## 角色分工

| 角色 | 负责 | 不负责 |
|------|------|--------|
| **Maka** | 观察信号、积累证据、汇总成熟问题、按需写提案 | 观察期写提案；修改能力资产；落地 |
| **Wopal** | 识别信号、保持主任务推进、触发汇总；用户批准后主控落地 | 因 Maka 中间分析打断主任务；代替 Fae 实施 |
| **Fae** | 在指定工作区修改能力资产并完成验证 | 提交；编辑提案；推进阶段 |
| **Rook** | 在用户验证前做实施评审 | 修复问题 |
| **用户** | 批准提案、选择并完成验证、决定集成与交付 | — |

---

# 会话内持续进化

## 什么值得观察

只有当一个事件可能说明“**以后再遇到类似情况，某项能力应该表现得不同**”时，才把它当作进化信号。典型来源：

- 用户纠正了 Agent 的判断、行为、流程或表达。
- 同类绕路、误判或重复劳动再次发生。
- 工具 / 环境失败暴露了稳定的错误假设。
- 已知经验仍没有稳定的能力 owner。
- 新做法明显优于现有方式，值得复用。

普通项目 bug、一次性网络故障、单个任务的业务事实，不因“出错”自动成为进化信号。

## Wopal 与 Maka 如何协作

运行环境支持子 Agent 时：

1. **按需启动并复用。** 一个逻辑会话优先复用同一个 Maka 子线程。
2. **只传必要证据。** 给问题、用户纠正、关键上下文、失败结果或有效模式，不默认复制整段父会话。
3. **主任务不停。** Wopal 发送信号后继续当前工作，不等待 Maka，也不把中间分析带回用户对话。
4. **收尾再汇总。** 主任务完成、会话准备结束，或用户明确要求进化总结时，Wopal 才要求 Maka `synthesize`。

没有可用子 Agent 协作时，Wopal 可在收尾时自己做一次同等汇总；不要为了模拟后台 Maka 增加持久化机制。

## Maka 的观察期与汇总期

### 观察期

Maka 只诊断、归类、积累证据，不创建提案：

| 状态 | 含义 |
|------|------|
| `discard` | 偶发、已被现有能力正确覆盖，或没有复用价值 |
| `local` | 有价值，但只属于当前项目 / 空间 |
| `candidate` | 可能需要能力变化，但证据或 owner 尚未稳定 |
| `mature` | 证据已足够，可在汇总期考虑形成能力变化 |

`mature` 不等于立即写提案。观察期的目标是降噪、合并重复、补齐证据。

### 汇总期

只有 Wopal 明确要求 `synthesize` 时，Maka 才：

1. 合并同源 / 重复信号，淘汰弱证据和已被现有能力覆盖的问题。
2. 泛化成熟信号并检查局部或敏感信息污染。
3. 先确定能力 owner，再判断修正已有能力还是新增能力。
4. 判断该变化适合直接维护还是需要正式提案，并把建议交给用户；**未经用户明确确认，不创建提案**。零提案是有效结果。

## 能力路由

| 问题本质 | 优先 owner |
|----------|------------|
| Agent 的角色、职责、决策原则或长期默认行为不对 | Agent prompt |
| 只在某类场景触发的行为约束 | Rule |
| 一项工作“怎么做”、步骤、验证或工具使用方式不稳定 | Skill |
| 人类发给 Agent 的固定工作入口 / 指令契约需要变化 | Command |
| 缺少真实工具、运行时状态、自动化或系统集成能力 | Plugin / runtime owner |
| 能力本身没问题，但某类空间该不该装配它 | Assembly / archetype |
| 只属于当前项目或空间的事实、偏好、经验 | 项目 `AGENTS.md` / 空间 memory |

owner 交叉、边界不清或准备写正式提案时，读取 [`references/capability-routing.zh-CN.md`](references/capability-routing.zh-CN.md)。只有问题触及能力模型、加载生命周期或架构归属时，才回查相关 DESIGN。

---

# 编写进化提案

提案的目的不是记录发生了什么，而是让同类情况下一次处理得更好。

## 先决定是否需要提案

正式提案用于需要独立设计、实施、评审或验证边界的进化，不是所有本体修改的默认入口。创建提案前必须先向提出问题的人确认是否需要 proposal；不得因为“这是 reusable capability”就自动创建。

默认直接维护的典型情形：

- 能力 owner 明确；新增能力时，能力类型、用途和完整资产边界也明确，不需要重新划分 owner；
- 预计修改少于 10 个文件；
- 不需要专门的自动化测试、人工验证或多阶段验证流程；
- 不涉及跨能力契约、装配模型、加载生命周期或高风险迁移。

这类修改直接在注册的 `space/<name>` 分支上完成，并用 instant mode 按名提交；不创建 proposal、working branch 或额外 worktree。

**新增完整 Skill / Rule / Command 本身不是 Proposal 触发条件。** 只要 owner、用途、范围和装配意图都清楚，并满足上述低风险条件，就直接维护。只有变化本身需要独立设计边界，例如改变跨能力契约、装配模型、加载生命周期，涉及高风险迁移，或需要专门测试/多阶段验证时，才向用户建议创建正式提案；只有用户确认后才运行 `wopal space evo new`。

边界不清时，问用户“是否要建 proposal”，不要自行选择更重的流程。

## 先去具体化

- 去掉绝对路径、项目 / 产品 / 客户名、会话 id、时间戳、提交哈希等局部细节。
- 保留真正决定能力行为的证据和约束。
- 检验标准：没见过当前空间的人也能理解并应用这条变化。

## 分开决定“内容归属”和“装配范围”

先决定内容本身放在哪里：

- 只属于当前项目 / 空间的事实、偏好、经验 → 项目 `AGENTS.md` 或空间 memory。
- 需要长期保留和复用的正式 Agent / Skill / Rule / Command / Plugin → 进入本体能力池。

未跟踪的能力文件只是临时 working-tree 状态。完整能力一旦决定保留，就安全扩宽 sparse range 并提交到注册 Space 分支。

再独立决定正式能力如何装配：

- **类型默认装配**：写入 `assembly/archetypes/<type>.yaml`，同类型空间默认拥有。
- **空间本地装配**：类型默认没有，但当前空间需要 → `space-meta.include`。
- **空间本地排除**：类型默认有，但当前空间不要 → `space-meta.exclude`。

能力进入能力池，不自动意味着它必须进入某个类型装配单；装配范围是独立决定。

## 写提案

只有用户已经明确确认需要 proposal，才执行本节。

用 `wopal space evo new "<title>"` 从 `templates/proposal.md` 创建 `docs/evolutions/<name>.md`，然后完整填写模板。

- 文档用用户偏好语言；模板标题和字段标签保持原样。
- 名称保留主要目标能力的 canonical name；优先用 2–3 段 `<capability>-<topic>` slug，短但可识别。
- 每个主要主张都要有证据锚点；未验证内容明确标注未验证。
- 一份提案只承载一个内聚变化；少而强优于多而弱。

提案落盘后等待用户阅读。只有用户批准，才进入落地。

---

# 落地已批准的提案

状态机固定为：

```text
draft → accepted → implementing → validating → archived
```

阶段词汇与 `dev-flow` 刻意不同，不要混用或“统一”。评审不是独立阶段，而是 `implementing` 内、邀请用户验证之前的强制门。

## 主流程

1. **用户批准**提案。
2. **Wopal** `accept`，随后进入 `implementing`。
3. **Fae** 实施；不提交、不编辑提案。
4. **Wopal** 每个 task 验证通过后回填记录，并让该 task 的资产变更与记录一起形成一次提交。
5. **Rook** 做实施评审；问题在 `implementing` 内返工并复审。
6. 评审通过后，**Wopal** 进入 `validating`，让用户选择验证方式；优先推荐 branch switch，integrate-first 只在用户明确选择时使用。
7. **用户**完成验证并确认结果；只有明确放行后才集成。
8. **Wopal** 归档；`space sync`、上游 PR 发布和删除仍由用户另行决定。

开始落地前读取 [`references/landing.zh-CN.md`](references/landing.zh-CN.md)。需要具体命令参数、拒绝条件或稀疏工作树机制时，再读取 [`references/commands.md`](references/commands.md)。

## 缺陷修复与进化的边界

- **缺陷**：已经约定的行为实现错了 → 直接走 `wopal space evo commit` 的 instant mode，不创建提案。
- **直接能力维护**：owner 清晰、范围受控、无需专门测试/验证的修改可直接维护；即使是新增一个完整 Skill / Rule / Command，也不因此自动升级为 Proposal。
- **正式进化**：跨能力契约、装配模型、加载生命周期、高风险迁移，或需要专门测试 / 多阶段验证的变化 → 建议走提案生命周期，但创建前仍需用户明确确认。
- 判断不清时，先问用户是否要建 proposal；不要擅自升级成正式提案，也不要擅自绕过用户要求的正式流程。

---

# 维护本体与空间能力

本技能也负责本体 / 空间的维护入口，包括状态检查、同步、能力装配和上游贡献。

- 做 `space status/sync`、`ontology status/sync`、能力 add/remove 或处理未跟踪路径保护时，读取 [`references/maintenance.zh-CN.md`](references/maintenance.zh-CN.md)。
- 创建、修改、重试或收尾上游 PR 时，再读取 [`references/contribution.zh-CN.md`](references/contribution.zh-CN.md)。
- 同步授权不等于 PR 发布、合并或删除授权；这些都是用户的独立决定。
- 已合并的贡献如果仍保留 contribution worktree 或分支，就还没有完成收尾：Agent 必须在同一次交互中主动报告残留并取得用户的清理决定后再结束。当前指令已经明确授权清理该 PR 时直接执行，不重复确认；普通同步仍然绝不隐含删除授权。

---

# 边界

- **Maka 只写提案。** 它的写入范围是 `docs/evolutions/`，不能修改能力资产。
- **Wopal 主控，Fae 实施，Rook 把关。** 不自动上传或发布。
- `/wopal:evolve` 与 `/wopal:distill` 属于记忆进化循环；如果记忆沉淀要求改变本体能力，仍走本技能。
- `wopal/ontology-maintain` 只是本技能的薄触发入口，不另建一套协议。
- 能力实现在装配后的 `.wopal` 或其派生隔离工作树中；上游发布使用独立 contribution worktree。

# References

- 能力 owner 与路由边界：`references/capability-routing.zh-CN.md`
- 提案落地主流程：`references/landing.zh-CN.md`
- `wopal space evo` 命令契约：`references/commands.md`
- 本体 / 空间维护：`references/maintenance.zh-CN.md`
- 上游 PR 创建、修订与收尾：`references/contribution.zh-CN.md`
- 提案模板：`templates/proposal.md`
- 状态机设计：`docs/DESIGN-evolution.md`
- 装配 / 稀疏隔离背景：`docs/DESIGN-distribution.md`
