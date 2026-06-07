---
description: 引导产品阶段讨论，生成阶段定义与跟踪文档
---

# 创建或更新 Roadmap

以产品 DESIGN §5 Evolution Roadmap 为起点，引导用户逐 phase 讨论目标、现状分析、scope、targets and gaps（含设计方案更新），并通过整体审查发现和消除遗留风险。

**Input**: `$1` `$2`

**Parameter Notes**: `<名称> [phase-id]`。未输入时从 `docs/products/` 匹配推断产品名，有疑问向用户确认。`phase-id` 可选，不提供时默认讨论当前 Active phase。

---

## Core Principles

- 核心职责是帮助用户明确阶段目标、分析现状、定义 scope、分析 gap 及其设计方案，并通过审查发现和消除遗留风险。
- 讨论以产品 DESIGN §5 的 Evolution Roadmap 为骨架，产品 PRD 为愿景基准。
- Phase 文档在讨论过程中持续写入——每步讨论的内容直接写入活文档。
- Phase 文档使用 `.wopal/templates/phase.md` 模板。
- Phase 文档为下一步拆分 Plan 提供可靠输入。
- 目标和设计方案讨论过程中，经用户确认的决策必须及时更新到对应的 PRD 文档已经产品或项目 DESIGN 文档 ，遵循产品 DESIGN 与项目 DESIGN 模板和 `/cupdate-design` 规范。
- 所有写入操作前展示方案并获取用户明确确认。

## Step 1: 识别当前 Phase

读产品 DESIGN §5 和产品 PRD，列出所有 Phase 及其当前状态（Active / Completed / Planned）。

引导用户选择要讨论的 phase。默认选择当前 Active phase；用户可指定已完成 phase 做回顾调整，或提前讨论 Planned phase。

**Output**: 选定的 phase ID、标题、产品 DESIGN 中已有 Goal 描述

## Step 2: 讨论阶段目标

结合产品 PRD 的产品愿景和产品 DESIGN 的架构契约，与用户讨论本阶段的产品能力目标。

- 展示产品 DESIGN 中已有的 Goal 描述，询问是否沿用或调整。
- 目标必须是可验证的产品能力陈述，≥20 字符。
- 允许在讨论中修正目标，直到达成共识。

**Output**: 确认的阶段 Goal——写入 Phase 文档 §0, 按需更新对应的产品 PRD 和 DESIGN 文档.

## Step 3: 分析现状

对每个与本阶段目标相关的项目或子系统，做深入的现状分析。用清晰扼要的叙述性文字描述现状与阶段目标的差距。既说明已有能力，也说明缺失什么.

**Output**: 各项目现状叙述——写入 Phase 文档 §1

## Step 4: 讨论阶段范围

明确本阶段的产品能力边界：

- **Scope**：本阶段要交付的产品能力概要清单。每个 scope 区域一行带 Owner，让人类和 agent 可一眼把握全貌。
- **Out of Scope**：明确排除在本阶段之外的能力或项目。

**Output**: Scope 概要清单 + Out of Scope 清单——写入 Phase 文档 §2 和 §3

## Step 5 : 讨论 Targets, Gaps, and Design (非常重要)

对 Step 4 的每个 scope 区域，做详细 gap 分析。每个 gap 必须有设计方案。讨论过程中：

1. 描述该能力的 Current 状态。
2. 定义 Target 状态——gap 关闭后成功是什么样。
3. 研究分析讨论并与用户确认 Design 方案。
4. 定义 Exit criteria——独立可验证的交付事实，每条 `- [ ]` checkbox 格式。

文档方案更新纪律：

- 经用户确认的设计决策必须及时更新到对应的项目 DESIGN 文档, 按需更新产品 PRD 和 DESIGN 文档。
- 设计文档更新遵循产品 DESIGN 和项目 DESIGN 模板（`cupdate-design` 规范）。
- PRD 文档更新遵循 prd 模板 (`cupdate-prd` 规范)。
- 阶段文档感谢遵循 phase 模板 (本命令规范), 

Gap 格式规则：

- 每个 scope 区域为 `###` 标题，标明 Owner。
- 区域内 gap 以 `#### Gaps` 分组，每个 gap 为 `#####` 标题。
- 没有设计方案的 gap 不放此处——属于遗留风险，由 Step 6 处理。
- Exit criteria 描述交付事实，不写实施步骤。

**Output**: §4 Targets and Gaps——每讨论一个 gap 即持续写入；关联设计文档同步更新

## Step 6: 整体审查与遗留风险

对阶段目标、scope、各 gap 及其设计方案做整体审查：

1. 是否所有 scope 区域都有对应的 gap 分析？有无遗漏？
2. 每个 gap 是否都有完整的设计方案？还有哪些未闭合？
3. 是否存在当前设计方案无法覆盖的跨项目协调问题、外部依赖或架构不确定性？

将遗留风险写入 §6 Risks，并明确解释每条风险为什么缺乏设计方案。

引导用户对每条遗留风险讨论解决方案。迭代至：
- 所有遗留风险已解决（找到设计方案，移回 §4），或
- 用户明确接受剩余风险为本阶段内不可解决。

**Output**: §6 Risks——已解决的移回 §4 并更新设计方案

---

## Quality Gate

文档更新之前, 检查此质量清单, 全部通过才算合格。

### Phase 文档质量检查

- [ ] 使用 `.wopal/templates/phase.md` 模板结构
- [ ] 文件存放于产品 DESIGN 同级 `phases/` 目录
- [ ] 文件命名：`{product}-{phase-id}-{slug}.md`——slug 由标题生成：小写→去除非字母数字→空格换 `-`→正则 `[-—].*$` 去尾部状态标记→去首尾连字符→截断 ≤40 字符
- [ ] §1 Current State 用叙述性文字呈现与阶段目标的差距
- [ ] §2 Scope 为一眼全貌的概要清单
- [ ] §4 每个 scope 区域 ≥1 个 gap；每个 gap 有 `Current / Target / Design / Exit`
- [ ] 每个 gap 有设计方案和设计文档引用
- [ ] §6 Risks 仅含真正缺乏设计方案的问题；每条有"为什么没有设计方案"的解释
- [ ] §7 References 不重复 Phase 文档头部已引用的文档
- [ ] 关联设计文档已按 cupdate-design 规范更新

## 引导拆分 Plan

Phase 文档就绪后，引导用户为每个 scope 区域创建 Plan， 遵循 dev-flow 技能规范推进后续流程。

---

## Completion Standard

以下条件全部满足时，本命令引导讨论结束：

1. 阶段目标已明确，达成目标所需的设计决策已共识
2. 现状分析清晰呈现了与阶段目标的差距
3. Scope 已定义为概要清单，每个区域标明 Owner
4. 每个 scope 区域有详细的 gap 分析，含 Current/Target/Design/Exit
5. 每个 gap 有设计方案；无设计方案的遗留风险记录在 §6 Risks，且用户已明确接受或有解决方案路径
6. 关联设计文档已按 cupdate-design 规范更新
7. Quality gate 已通过

本阶段产出和更新的文档（Phase 文档、产品 DESIGN、项目 DESIGN）在一次提交中固化成果。

---

## Response After Completion

使用用户偏好语言回复：

1. Phase 文档路径
2. 关键摘要：Goal、Scope 区域数、Gap 数量、遗留风险数量
3. 本会话中更新的设计文档列表
4. Quality gate 结果：全部通过
5. 建议下一步：为每个 scope 区域的 gap 创建 Plan
