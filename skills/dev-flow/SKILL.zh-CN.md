---
name: dev-flow
description: >
  驱动开发 Plan 的全生命周期管理工作流。触发场景包括：创建或推进开发 Plan、组织代码实现与评审、执行 approve/complete/verify/archive 状态推进、协调用户验证，或将 PRD 与 Issue 拆解为开发任务。
---

# dev-flow — Issue / Plan 驱动开发流程

## 主控职责

主控者负责推进 Plan 生命周期、组织实施与评审、执行流程门禁，并处理需要用户确认的决策。

主控者可以自行实施或评审，也可以委派：

- 实施工作遵循 `df-implement`。
- 实施评审遵循 `df-implement-review`。
- 是否委派不改变 dev-flow 的门禁和主控责任。

## 脚本执行

所有命令从本技能根目录执行：

- workdir: `.wopal/skills/dev-flow/`
- 格式: `bash scripts/flow.sh <command> [args]`

不要 `source` 脚本，不要绕过 `flow.sh` 直接操作它负责的生命周期状态。完整命令参数和 Git mutation 细节见 `references/commands.md`。

受限环境中，如果命令需要写 Git metadata，使用当前 Harness 自带的授权机制取得能力；不要修改权限配置绕过限制。命令失败时保留原始错误并停止，不手工伪造成功状态。

## DESIGN、Plan 与实现

**层级固定为：DESIGN → 已批准 Plan → 实现。**

- DESIGN 定义目标状态。
- Plan 定义这一次交付哪些目标、边界和验收。
- 实现负责在这些约束内落地。

### Plan 批准前

主控者负责让 Plan 对齐正式 DESIGN。项目/阶段 Plan 的设计事实只能来自 `Status: Active` 的 DESIGN/子 DESIGN；每个 Task 用 `Design Source` 指向其具体章节、决策或契约。

`Draft` / `Proposed` 设计尚未定案，只能作为前瞻参考，不能写入 `Design Source`，也不能据此确定实施目标、契约或验收。如果只是 Plan 写错或漏写，直接修正 Plan；如果 Active DESIGN 本身与用户目标冲突，停止替用户选择，先让用户决定是否修改设计。

只有没有项目、也没有设计依据的简单 Plan 才可使用 `Design Source: N/A`。

### Plan 批准后

已批准 Plan 的实质内容和 DESIGN 都不再是主控者的自主编辑面。

状态、checkbox、AC 验证命令、Done 证据等**流程记录**可以按既有规则更新；Task、范围、边界、行为、方案、验收目标等**实质内容**不能自行改变。

实施或验证发现问题时：

1. 如果能在现有 DESIGN + 已批准 Plan 内解决，主控者可以调查、判断并决定如何继续。
2. 如果必须修改已批准 Plan 或 DESIGN，向用户说明冲突和影响，让用户决定改哪一边；确认前两者都不改。

## 生命周期

标准链路：

`plan new → submit → approve --confirm → implementation/review → complete → user validation → verify --confirm → archive`

状态机：

`planning → reviewing → executing → verifying → done → archived`

| 阶段 | 主控动作 | 用户门 |
|---|---|---|
| planning | 写 Plan、对齐 DESIGN、运行 `submit` | 无 |
| reviewing | 根据评审意见修 Plan | 用户批准 Plan |
| executing | 组织实施、实施评审、Agent Verification | 无新的范围/设计授权 |
| verifying | 组织用户验证、必要返工 | 用户确认验证结果；必要时确认 Plan/设计变更 |
| done | 执行收尾 | 按命令要求确认 |
| archived | Plan 已归档 | — |

非法状态不要强行推进；回到正确步骤处理。

## Planning 与 Reviewing

创建或定位 Plan 必须使用 `flow.sh plan ...`，不要手写新 Plan 文件，也不要用 grep/glob 在空间里盲找已有 Plan。已知名称用 `plan status`，需要浏览时用 `plan list`。

Plan 的实际内容使用用户偏好语言；模板规定的结构性 heading/字段名保持不变。正文优先用人能直接看懂的大白话，只有 Interface、Constraints、命令、类型/协议等确需精确时使用技术词。Plan 固定行为、验收、契约与边界；内部实现细节留给实施阶段。Task 格式、TDD 判定、AC、Metadata、命名规范等见 `references/plan-guide.zh-CN.md`。

`Delegation Strategy` 必须根据当前可用 Agent 的能力和 Task 关系分配任务；Agent 列只写具体 Agent 名称。

Plan 内容改变后运行 `flow.sh sync <plan> --body-only` 同步 Issue 中的 Goal / Scope / Acceptance Criteria 与 Plan 链接。

写完 Plan 后，主控者必须先运行 `flow.sh submit <plan>` 进入 `reviewing`，再请用户评审。`submit` 自动运行 `plan check`，无需先手动 check。

在 `reviewing` 阶段，Plan 尚未批准。主控者可以根据用户意见直接修订并重新 sync，不需要 reset，也不需要再次 submit。用户批准的是当前版本的 Plan。

用户明确批准后执行：

```bash
flow.sh approve <plan> --confirm [mode-flags]
```

### 实施模式

| 模式 | 适用情况 | 命令 |
|---|---|---|
| 标准隔离（默认） | 正常开发 | `approve --confirm` |
| 主干直实施 | 用户明确要求不建 worktree | `approve --confirm --no-worktree` |
| 既有分支继续演进 | 用户要求复用已有 worktree/feature 分支 | `approve --confirm --existing-worktree <path>` |

`--no-worktree` 与 `--existing-worktree` 语义不同，不能互相替代。演进模式收尾使用 `--keep-worktree`。详细行为见 `references/commands.md`。

## Executing：实施、验收、评审、Agent Verification

进入 `executing` 后，主控者决定每个 Task 是自己实施还是委派。实施工作遵循 `df-implement`，但 **Task 的验收、提交和 Plan 进度始终由主控者负责**。

委派实施时：

1. 实施者按 Task 的 `Design Source`、Behavior、Pre-read、Interface、Constraints 和 Verify 完成工作，不扩大范围。
2. 实施者运行 Verify，并把完成内容、实际触碰文件、验证命令与结果、AC 对应的真实命令作为报告交回主控者；**不提交代码，不编辑 Plan，不勾选任何进度 checkbox**。
3. 主控者检查实际 diff，并独立运行 Task Verify。检查失败时，不提交、不更新 Plan，直接把问题和证据退回实施者修复。
4. 只有检查通过后，主控者才回填 AC 命令、Done 证据与实际触碰文件，勾选 Task Done，并为该 Task 创建一次实施提交。

主控者自行实施时也遵循同一顺序：先实现，再以主控身份检查；检查通过后才记录进度并提交。一次失败的实施尝试不形成提交，也不形成 Plan 完成记录。

Plan 进度、AC 命令和 Done 证据是主控者的验收记录，不是实施者的写入面。

### 实施评审

所有 Task 完成后，必须执行一次实施评审。主控者可以自己加载 `df-implement-review` 评审，也可以委派评审者；**评审技能而不是 Agent 名字定义评审规则**。

#### 评审轮次治理

主控者把控评审循环，严格设定**最多 3 轮**硬上限，兼顾质量并防止无限循环：

1. **第 1 轮（初审）**：全量扫描 4 个维度，一次性穷尽报告已知缺陷。
2. **第 2 轮（复审）**：针对性核验修复项及其直接影响面。若 Blocker 全部解决仅剩 Warning，主控者可授予**有条件通过（Pass with Debt）**，将剩余 Warning 记为后续技术债。
3. **第 3 轮（Blocker 歼灭战）**：专门针对顽固 Blocker 的最后修复验证。
4. **升级熔断机制**：若第 3 轮结束后仍有 Blocker，禁止继续自动循环。立即停机向用户升级汇报，给出 3 轮总结和两个明确选择：
   - **重构方案/计划**：在用户指导下回滚或调整方案。
   - **人工接管**：按用户明确的修复指令推进或由用户确认放行。

评审 PASS（或有条件 PASS）后，再执行最终 Agent Verification，避免沿用修复前的旧验证证据。

### Agent Verification

主控者逐项运行 Agent Verification 中的真实命令、检查输出，确认通过后再勾选。任何评审修复都会使受影响的旧验证结果失效，必须重新运行。

完成 `complete` 前必须同时满足：

- 所有 Task Done 已完成；
- 实施代码已提交；
- 实施评审 PASS；
- Agent Verification 全部真实通过并已勾选。

随后立即执行：

```bash
flow.sh complete <plan>
```

`complete` 把 Plan 从 `executing` 推进到 `verifying`。**未到 `verifying` 之前，不要邀请用户做最终验证。**

## 冲突与返工

实施或验证中出现 Plan、DESIGN 与代码现实不一致时，主控者先判断问题属于哪一类：

- **实现问题**：现有 DESIGN + 已批准 Plan 已经给出答案 → 在原边界内修代码并重新验证。
- **Plan 问题**：要继续必须改变已批准 Plan 的实质内容 → 向用户说明原因与影响，用户确认后再修 Plan 并 sync。
- **设计问题**：要继续必须改变 DESIGN → 让用户确认设计目标后进入相应设计维护流程，再让 Plan 重新对齐设计。

不要用 `reset` 代替这个判断。`reset` 是破坏性操作，只在用户明确要求时使用。

## 三层验证责任

| 层 | 谁负责 | 规则 |
|---|---|---|
| Task Done | 主控者 | 检查实施 diff、独立运行 Task Verify；通过后才回填证据、勾选并提交 |
| Agent Verification | 主控者 | 真实运行命令并确认结果；不能凭记忆勾选 |
| User Validation | 用户 | 只验证必须由用户手动观察的内容；Agent 不代勾 |

可自动化的测试、lint、typecheck、静态检查或脚本断言不要推给用户，放在 Agent Verification。User Validation 的具体写法见 `references/plan-guide.zh-CN.md`。

## Verifying 与用户验证

`complete` 后，把脚本输出的验证位置与可选方式完整告诉用户，由用户选择。主控者不能自行跳过用户验证或代替用户确认。

常见验证方式：

| 场景 | 流程 |
|---|---|
| worktree 可直接运行 | 用户在 worktree 验证 → 合并 → `verify --confirm` |
| 必须在规范路径运行 | `verify-switch` → 用户验证 → 合并 → `verify --confirm` |
| 用户明确选择先合并再验证 | 合并 → 用户在集成分支验证 → `verify --confirm` |
| `--no-worktree` | 用户直接在集成分支验证 → `verify --confirm` |
| `--existing-worktree` 演进模式 | 用户在保留 worktree 验证 → `verify --confirm --keep-worktree` |

默认先验证再合并；“先合并再验证”必须由用户明确选择。

验证期间需要返工时仍遵守上一节的冲突规则：能在现有 DESIGN + Plan 内解决，由主控者决定返工；需要改 Plan 或设计，先让用户确认。

用户明确确认验证通过并授权相应收尾后，按所选模式完成合并并执行：

```bash
flow.sh verify <plan> --confirm [--keep-worktree]
flow.sh archive <plan> [--keep-worktree]
```

## 分支与 worktree 边界

分支和 worktree 的创建/删除由 dev-flow 脚本管理：

- `approve` 创建或绑定；
- `verify-switch` / `archive` 负责移除；
- 主控者不要手动创建、删除 feature 分支或 worktree；
- 标准模式下，主控者唯一需要手工做的分支动作是用户授权后的 feature → integration 合并；默认优先 squash，用户明确要求保留历史时再使用 `--no-ff`。

不要加载其他 worktree 管理技能去接管 dev-flow 已经管理的 worktree。

## 用户授权门

| 动作 | 需要的用户信号 |
|---|---|
| `approve --confirm` | 明确批准当前 Plan |
| 修改已批准 Plan 实质内容 | 明确确认具体 Plan 修订 |
| 修改 DESIGN | 明确确认设计目标/设计修订 |
| 用户验证结果 | 用户明确确认验证通过或指出失败 |
| merge / `verify --confirm` | 按当前验证方案取得明确授权 |
| `reset` | 用户明确要求重置 |

不要把“提交吧”之类单一指令扩展解释成整个收尾流程的授权。

## 必须守住的边界

- 带设计面的工作不要绕过 dev-flow 直接实施。
- 本体 Issue 不是 dev-flow 的工作。Issue 的项目是本体组件——即改动落在本体 worktree 的技能、规则、agent、命令、插件、装配里，而不是 `projects/` 下的仓库——就交给 `ontology-evolution`，不要在这里出 Plan。Issue 仍是需求记录，提案才是实施授权。`--project` 怎么决定这一点见 `references/issue-guide.md`。
- Plan 未进入 `reviewing` 前，不要请用户审批；Plan 未批准前，不要开始其实施。
- 已批准 Plan 或 DESIGN 需要改变时，不要自行修改后继续。
- 实施评审未 PASS、Agent Verification 未完成时，不要 `complete`。
- 未执行 `complete` 进入 `verifying` 前，不要邀请用户最终验证。
- 不代替用户勾选 User Validation。
- 不让 checkbox 与代码状态脱节；代码回退后，相应完成证据也必须重新成立。
- Issue 的创建、查询、编辑、关闭使用 `flow.sh issue ...`，不要直接调用 `gh issue ...` 绕过空间仓库定位。
- Plan 定位使用 `flow.sh plan status/list`，不要用 grep/glob 猜文件。
- 不手动创建/删除 dev-flow 管理的 branch/worktree。
- `reset` 只响应用户明确要求，不用于绕过返工或重新审批。

## 参考

按需要加载，不把细节重复塞进主流程：

| 文件 | 何时读 |
|---|---|
| `references/plan-guide.zh-CN.md` | 写/修 Plan、Task、AC、User Validation、命名与交接时 |
| `references/commands.md` | 查命令参数、实施模式、Git mutation 与 verify/archive 行为时 |
| `references/issue-guide.md` | 创建或同步 Issue 时 |
| `references/troubleshooting.md` | 命令失败、状态异常或边缘场景时 |
