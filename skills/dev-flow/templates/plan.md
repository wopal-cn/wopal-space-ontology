# {plan_name}

## Metadata

{issue_line}
{type_line}
{project_line}
{project_path_line}
{project_type_line}
- **Created**: {date}
- **Status**: planning

## Scope Assessment

- **Complexity**: Low|Medium|High
- **Confidence**: High|Medium|Low

## Goal

一句话描述本计划要达成的目标。

## Technical Context

<!--
  ⚠️ Technical Context 由以下 4 个子节组成（均为可选，至少填写一个）。
  根据任务复杂度选择填写的子节：简单任务只填 Architecture Context 即可。
-->

### Architecture Context

<!--
  当前架构现状、涉及模块、为什么需要变更。
  描述系统边界和变更影响范围。
-->
<当前架构描述，涉及模块，为什么需要变更>

### Research Findings

<!--
  ⚠️ 前期研究结论摘要。
  **必须附带参考资料列表**——研究来源的文件路径（如 projects/space-flow/agents/wsf-planner.md）或 URL 链接。
  确保后续审阅者可追溯到原始研究材料。
-->
<研究结论摘要>

**参考资料**：
- `<参考资料文件路径或 URL>`

### Key Decisions

<!--
  已确定的技术决策，使用 D-NN 编号格式。
  每条决策说明决策内容及其理由。
-->
- D-01: <决策内容及理由>

### Key Interfaces

<!--
  关键类型/接口定义、模块间契约。
  代码块示例或类型签名。
-->
<关键接口定义>

## In Scope

列出本次要完成的具体内容：

- 功能点 1
- 功能点 2

## Out of Scope

列出本次不做的内容：

- <本次不做的内容及原因>

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| <component> | `file1`, `file2` | 修改/创建/删除 | <在此变更中的作用> |

## Acceptance Criteria

<!--
  ⚠️ Acceptance Criteria 位于 Implementation 之前。
  审阅者在掌握全部上下文后、进入实现细节前，先看到成功标准。
  这是 readability 设计，不是 TDD 执行机制——TDD 约束在 Task 级别生效。
-->

<!-- agent-verify-guard -->

### Agent Verification

<!--
  ⚠️ Agent 可自动验证的项。每条必须写具体命令和预期输出。

  **格式要求**："命令 → 预期输出"
  - ✅ `rg -c 'pattern' file` ≥ 1（字段存在）
  - ✅ `python -m pytest tests/ -v` 全部 pass
  - ❌ "代码构建通过"（纯描述，不可执行）
  - ❌ "单元测试通过"（纯描述，不可执行）

  **承载范围**：同时承载单 Task 内验证和跨 Task 集成验证。
  原 Test Plan 中可自动化的验证项统一归入此处。

  flow.sh complete 会校验此子章节的 checkbox 是否全部勾选。
-->
- [ ] <可执行命令 1：如 `rg -c '### Architecture Context' templates/plan.md` ≥ 1>
- [ ] <可执行命令 2：如 `python -m pytest tests/ -v` 全部 pass>

### User Validation

<!--
  ⚠️ 用户人工感知验证项。

  **必须遵守以下结构**（每个场景）：
  - Scenario 标题（#### Scenario N: <简短描述>）
  - Goal: 本次变更后用户能感知到什么行为差异
  - Precondition: 验证前的前置状态
  - User Actions: 用户操作步骤
  - Expected Result: 用户可观察到的结果

  **排除规则**：禁止放入 Agent 可自动验证的项：
  - ❌ 编译 / 构建（npm build, cargo build, tsc ...）
  - ❌ 单元测试 / 集成测试（npm test, pytest, bun test ...）
  - ❌ Lint / 格式化（eslint, prettier, ruff ...）
  - ❌ CLI 自测（任何 Agent 可在终端执行的命令）

  此节只含人工感知验证：UI / UX、交互体验、业务流程、视觉确认。

  **最终确认 checkbox**：
  - 下方唯一的 checkbox 是 verify --confirm 的硬 gate
  - 只有用户本人在实际完成场景验证后才能勾选
  - Agent 禁止代为勾选（违反 = 严重失职）
-->

#### Scenario 1: <本次变更影响的可感知行为>
- Goal: <确认什么行为差异>
- Precondition: <验证前的前置状态>
- User Actions:
  1. <用户操作步骤>
  2. <观察结果>
- Expected Result: <用户可观察到的预期结果>

- [ ] 用户已完成上述功能验证并确认结果符合预期

## Implementation

<!--
  ⚠️ 每个 Task 按以下字段顺序排列（TDD 驱动）：
  Verification Intent → Behavior → Files → Pre-read → Design → TDD → Changes → Verify → Done

  关键约束：
  - **Behavior** 在 **Design** 之前：先定义"什么是对的"，再写实现设计
  - **Changes** 使用编号列表（1. 2. 3.），禁止使用 checkbox 格式
  - **Done** 是每个 Task 中唯一的 checkbox，Agent 运行 Verify 命令通过后才可打勾
  - **每 Task 仅 1 次 Plan 编辑**：Done 打勾。无其他 checkbox。
-->

### Task 1: Task Title

**Verification Intent**: <引用的 Agent Verification 条目编号，如 AC#1, AC#3>

**Behavior**: <预期行为描述。TDD 驱动：在 Design 之前定义"什么是对的"。非代码 Task 描述预期状态变化>

**Files**: `path/to/file`

**Pre-read**: <实施前需阅读的文件路径，无必要可写 N/A>

**Design**:
<!--
  ⚠️ 完整实施设计（必填）。
  包含技术方案、关键实现思路、需要注意的约束。
  必须在 Behavior 之后。
-->
<完整实施设计>

**TDD**: false

<!--
  TDD 标记说明：
  - false（默认）：非 TDD Task，Changes 按常规顺序组织
  - true：TDD Task，Changes 按 RED → GREEN → REFACTOR 组织，Behavior 必填
-->

**Changes**:
<!--
  ⚠️ 使用编号列表格式（1. 2. 3.），无 checkbox。
  禁止使用 `- [ ] Step N:` 格式。
-->
1. <具体改动点 1>
2. <具体改动点 2>

**Verify**:
<!--
  ⚠️ 必填。Agent 可自动执行的验证命令。
  格式：shell 命令（如 `rg -c 'pattern' file`）或 `Manual — 理由`（纯人工验证场景）。
  Agent 必须运行 Verify 命令看到 exit 0 后才能勾选 Done checkbox。
-->
<验证命令，如 `rg -c 'pattern' file` ≥ 1>

**Done**:
<!--
  ⚠️ 任务产出说明（一句话描述）+ 唯一 checkbox。
  Agent 运行 Verify 命令通过后才可打勾。
  这是每个 Task 中唯一的 checkbox。
-->
任务产出：<一句话描述本 Task 产出>
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

<!--
  ⚠️ 委派策略规范：

  **何时必须填写**：
  - Plan 有 2+ Task 或 Complexity = High 时必须填写
  - 单一 Task + Complexity ≠ High 时可写 N/A

  **Wave 分配规则**（与 WSF 对齐）：
  - 用 wave 代替批次编号，同 wave 内 Task 并行执行（files 不交集）
  - 高 wave 依赖低 wave 的产出

  **默认委派规则**：
  - 实施类 Task 默认委派 fae，Wopal 只做切片和验证
  - 极简单任务（≤3 步，无外部依赖）可由 Wopal 直接执行

  **Autonomous 标记**：
  - 每个 Task 需说明是否含 checkpoint
  - 含 checkpoint 则标记 autonomous: false 并在 fae prompt 中明确停止点

  **强依赖处理**：
  - 多个 Task 存在强逻辑依赖时整组委派给单个 fae（不拆分）
  - 在 prompt 中明确执行顺序

  **步骤上限**：单个委派任务 ≤30 步

  **上下文评估**：预估 Task 读改测总步数 ≥ 自己执行成本时才委派

  **Wave 间门控**：
  - 每 wave 完成后 Wopal 运行 Verify 命令验证产出
  - 通过后才释放下一 wave
-->

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | <委派理由> |
| _ | _ | _ | _ | _ |

<!-- 或简单填写：N/A — 单一任务，无需并行委派 -->
