# P1 Canonical Ontology Base Layer

## Metadata

- **Type**: feature
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Project Type**: ontology-worktree
- **Product**: wopal-space
- **Phase**: P1 — One-click Distribution
- **Created**: 2026-06-01
- **Status**: done
- **P1 Plan ID**: P1-01
- **Depends On**: None — P1 ontology source contract foundation
- **Unblocks**:
  - P1-06 `feat(cli): materialize spaces from ontology schema` — `projects/wopal-cli/docs/plans/feature-cli-materialize-spaces-from-ontology-schema.md`
  - P1-07 `feat(cli): orchestrate first-run space setup` — `projects/wopal-cli/docs/plans/feature-cli-orchestrate-first-run-space-setup.md`

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High
- **Execution Note**: 本 Plan 保持为单一 ontology source contract，但实施任务合并为 4 个原子交付单元，避免模板、base source 和 `/init` 边界被拆成过细的上下文碎片。

## Goal

在 ontology 侧完成 P1 所需的 canonical identity、schema/templates 和 base capability source 三项基础层交付，使 wopal-cli 的 `wopal setup` 和 `wopal space init` 拥有完整的确定性初始化输入。

## Technical Context

### Architecture Context

ontology 在 P1 中承担三类职责：

1. **Canonical identity source** — `wopal-space-ontology` 作为 P1 的统一 repo identity，用于 setup clone source、local ontology directory、release carrier 和初始化后的 `STRUCTURE.md` 记录。当前 `STRUCTURE.md` 模板已使用 `${ONTOLOGY_REPO}@space/{space-name}` 占位符，但 `DISTRIBUTION.md` §2 和 Phase 文档对 canonical identity 的表述需要确认一致性。

2. **Schema 和模板合约** — `wopalspace-schema.yaml` 声明确定性初始化结构，`templates/` 下的各模板为 CLI 提供渲染输入。当前 schema 和模板已存在，但需要与 P1 Phase 文档的设计需求逐项对齐，确保 CLI 消费时无歧义。

3. **Base capability source** — `$WOPAL_HOME/ontologies/wopal-space-ontology/{agents,skills,commands}` 是 setup 物化 base capabilities 的 source。当前 `agents/`、`skills/`、`commands/` 目录已包含完整内容，需要确认目录结构满足 setup 的 symlink/copy 物化需求。

### Research Findings

Phase 文档将 ontology 侧需求分为三条 Gap：

1. **Base capabilities materialization**（Phase §191-199）：setup 从 ontology 物化 `{agents,skills,commands}` 到 `$WOPAL_HOME/{agents,skills,commands}`。macOS/Linux 使用 symlinks，Windows 使用 managed copies。Exit 要求 ellamaka 可在任何 space overlay 前加载 base skills。

2. **`wopal space init` 模板渲染**（Phase §207-218）：`space init` 消费 `wopalspace-schema.yaml` 渲染 `AGENTS.md`、`.gitignore`、`.wopal-space/STRUCTURE.md`、`REGULATIONS.md`、`memory/USER.md`、`memory/MEMORY.md`。rerun 时保留已有用户文件。

3. **Canonical ontology source identity**（Phase §219-229）：P1 统一使用 `wopal-space-ontology` 作为 canonical repo identity，覆盖 CLI default source、local directory name、release URLs 和 `STRUCTURE.md` 记录。

**参考资料**：
- `docs/products/wopal-space/phases/wopal-space-p1-one-click-distribution.md`

### Key Decisions

- D-01: P1 canonical ontology identity 统一为 `wopal-space-ontology`，涵盖 repo name、local directory name 和 release carrier。理由：Phase §219-229 明确要求消除当前 CLI 代码中 `wopal-cn/ontology` 的 mismatch。
- D-02: 不在本 Plan 中修改任何 CLI 代码。ontology 侧只负责提供正确的 source/template/identity 输入；CLI 侧的 consumer 变更由 wopal-cli Plan 承担。
- D-03: 现有 `agents/`、`skills/`、`commands/` 目录已满足 base capability source 的物化需求，无需结构调整。只需确认顶层目录结构与设计文档一致。
- D-04: `/init` 命令边界已在 `DESIGN.md` §6.3 和 `commands/init.md` 中定义，P1 不扩展 `/init` 职责，只确认现有定义与 Phase 需求对齐。
- D-05: 若实施中需要修改 `templates/` 或 `commands/` 下的语义内容，遵循 `.wopal/AGENTS.md` 的 i18n review workflow：先准备用户偏好语言 review 版本，再同步正式英文 runtime source。纯结构确认或无语义变更不新增 review artifact。

### Key Interfaces

```yaml
# wopalspace-schema.yaml — CLI 确定性初始化的输入合约
version: 1
runtime:
  path: .wopal-space
  files: [{template, target}]
  dirs: [{path, keep?}]
space:
  files: [{template, target}]
  dirs: [{path, keep?}]
```

```yaml
# STRUCTURE.md frontmatter — canonical identity 记录
ontology-worktree: {path: .wopal, repo: ${ONTOLOGY_REPO}@space/{space-name}}
```

```text
# Base capability source layout
$WOPAL_HOME/ontologies/wopal-space-ontology/
  agents/*.md        → symlink/copy → $WOPAL_HOME/agents/*.md
  skills/*/SKILL.md  → symlink/copy → $WOPAL_HOME/skills/*/
  commands/*.md      → symlink/copy → $WOPAL_HOME/commands/*.md
```

## In Scope

- 确认 `wopalspace-schema.yaml` 与 P1 DESIGN §6.4 目标结构完全对齐
- 审查并完善初始化模板集：`STRUCTURE.md`、`REGULATIONS.md`、`root-AGENTS.md`、`gitignore`、`memory/USER.md`、`memory/MEMORY.md`
- 确认 `{agents,skills,commands}` 目录结构满足 base capability source 物化需求
- 确认 `STRUCTURE.md` 模板的 `${ONTOLOGY_REPO}` 占位符与 canonical identity 一致
- 确认 `/init` 命令定义（`commands/init.md`）与 Phase §207-218 的 CLI 消费边界对齐
- 在 `DISTRIBUTION.md` 中补充 base capability source 物化的 source 侧契约说明

## Out of Scope

- CLI 代码变更（`wopal setup`、`wopal space init`、`wopal space scan`）— 由 wopal-cli Plan 承担
- ellamaka 代码变更 — 由 ellamaka Plan 承担
- wopal-site 变更 — 由 wopal-site Plan 承担
- `/init` 命令实现变更 — `/init` 由 ellamaka 运行时执行，本 Plan 只确认其定义边界
- wopal-plugin 代码变更 — 插件内部变更不在本 Plan 范围

## Business Rules Impact

N/A — 无业务规则变更。`BUSINESS_RULES.md` 不存在于 ontology 项目中。本 Plan 的变更限于模板和文档，不引入新业务约束。

### 同步确认
- [x] 已确认 ontology 项目无 `BUSINESS_RULES.md`，无需同步

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| templates | `templates/wopalspace-schema.yaml` | 审查/微调 | CLI 确定性初始化的输入 schema |
| templates | `templates/STRUCTURE.md` | 审查/微调 | 空间结构模板，含 canonical identity 占位符 |
| templates | `templates/REGULATIONS.md` | 审查/微调 | 空间守则模板 |
| templates | `templates/root-AGENTS.md` | 审查/微调 | 空间启动入口模板 |
| templates | `templates/gitignore` | 审查/微调 | 空间 gitignore 模板 |
| templates | `templates/memory/USER.md` | 审查/微调 | 用户档案模板 |
| templates | `templates/memory/MEMORY.md` | 审查/微调 | 文件型长期记忆模板 |
| docs | `docs/DISTRIBUTION.md` | 修改 | 补充 base capability source 物化 source 侧契约 |
| commands | `commands/init.md` | 审查 | 确认 `/init` 边界与 P1 对齐 |

## Acceptance Criteria

### Agent Verification

1. [x] `rg 'version: 1' .wopal/templates/wopalspace-schema.yaml && rg 'runtime:' .wopal/templates/wopalspace-schema.yaml && rg 'space:' .wopal/templates/wopalspace-schema.yaml` 均有匹配（schema 存在且声明 runtime/space）
2. [x] `rg 'ONTOLOGY_REPO' .wopal/templates/STRUCTURE.md && rg 'MANAGED:START|USER:START' .wopal/templates/STRUCTURE.md` 均有匹配（STRUCTURE 模板包含 canonical identity 与 managed/user block）
3. [x] `rg 'space-master|agents-collab|dev-flow' .wopal/templates/REGULATIONS.md` ≥ 1（REGULATIONS 模板覆盖核心技能入口）
4. [x] `rg 'wopal space scan|STRUCTURE|user confirm' .wopal/commands/init.md` ≥ 1（`/init` 明确消费 scan facts、维护 STRUCTURE、等待用户确认）
5. [x] `rg 'wopalspace-schema.yaml|base.capabilit' .wopal/docs/DISTRIBUTION.md` ≥ 1（schema 和 base capability source 契约已记录在分发文档中）
6. [x] `ls .wopal/agents/*.md | wc -l` ≥ 3（base agents 目录包含至少 3 个 agent）
7. [x] `ls .wopal/skills/ | wc -l` ≥ 10（base skills 目录包含至少 10 个技能）
8. [x] `ls .wopal/commands/*.md .wopal/commands/wopal/*.md 2>/dev/null | wc -l` ≥ 5（base commands 目录包含至少 5 个命令）
9. [x] `rg 'agents.*commands|commands/wopal|skill units|base.*overlay|symlink|managed copy' .wopal/docs/DISTRIBUTION.md` ≥ 1（base materialization traversal 与 overlay contract 可被 CLI 消费）

### User Validation

#### Scenario 1: 模板内容审查
- Goal: 确认所有初始化模板内容完整、与 P1 设计对齐，CLI 可直接消费
- Precondition: ontology worktree 当前分支上的模板和文档
- User Actions:
  1. 查阅 `templates/wopalspace-schema.yaml` 确认结构与 DESIGN §6.4 一致
  2. 查阅 `templates/STRUCTURE.md` 确认 `${ONTOLOGY_REPO}` 占位符存在
  3. 查阅 `templates/REGULATIONS.md` 确认通用守则覆盖 P1 要求的安全红线、Git 规则、委派规则和核心技能入口
  4. 查阅 `docs/DISTRIBUTION.md` 确认 base capability source 物化契约完整
- Expected Result: 所有模板可被 CLI 直接消费，无歧义字段，无缺失条目

- [x] 用户已完成上述功能验证并确认结果符合预期

## Implementation

### Task 1: 审查并完善 wopalspace-schema.yaml 与 DESIGN 对齐

**Verification Intent**: AC#1

**Behavior**: schema 文件声明 `runtime` 和 `space` 两个顶层 key，`runtime` 描述 `.wopal-space/` 目录结构与文件模板映射，`space` 描述 space root 目录结构与文件模板映射。所有 template 引用指向 `templates/` 下实际存在的文件。

**Files**: `templates/wopalspace-schema.yaml`

**Pre-read**: `.wopal/docs/DESIGN.md` §6.4 `wopalspace-schema.yaml` 设计章节

**Design**:

对照 DESIGN §6.4 的目标 schema 语义逐项验证：

- `version: 1` 存在
- `runtime.path` 指向 `.wopal-space`
- `runtime.files` 包含 `STRUCTURE.md`、`REGULATIONS.md`、`memory/USER.md`、`memory/MEMORY.md` 四个文件映射
- `runtime.dirs` 包含 `memory/diary`、`logs`、`.tmp`、`INBOX`、`backup` 五个目录
- `space.files` 包含 `root-AGENTS.md → AGENTS.md`、`gitignore → .gitignore` 两个文件映射
- `space.dirs` 包含 `projects`、`contents`、`docs` 三个核心工作容器
- `keep` 字段用于空目录保留
- 所有 template name 与 `templates/` 目录下实际文件名一致

如发现与设计不一致的字段，修正为与 DESIGN §6.4 目标语义对齐。如完全一致则仅做确认记录。

**TDD**: false — 纯 YAML schema 审查与微调，非代码 Task

**Changes**:

1. 逐字段比对 schema 与 DESIGN §6.4 目标语义
2. 修正不一致字段（如有）
3. 确认所有 template 引用指向 `templates/` 下实际存在的文件

**Verify**: `rg 'version: 1' .wopal/templates/wopalspace-schema.yaml` ≥ 1 && `rg 'runtime:' .wopal/templates/wopalspace-schema.yaml` ≥ 1 && `rg 'space:' .wopal/templates/wopalspace-schema.yaml` ≥ 1

**Done**:

任务产出：确认 `wopalspace-schema.yaml` 与 DESIGN §6.4 完全对齐，修正不一致字段
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

### Task 2: 审查并完善初始化模板集

**Verification Intent**: AC#2, AC#3

**Behavior**: 初始化模板集提供 CLI 可直接消费的 runtime skeleton 输入。`STRUCTURE.md` 使用 `${ONTOLOGY_REPO}@space/{space-name}` 表达 canonical identity，并保留 managed/user block。`REGULATIONS.md` 覆盖安全红线、Git 基本法、委派规则和核心技能入口。`root-AGENTS.md`、`gitignore`、`memory/USER.md`、`memory/MEMORY.md` 提供新空间启动入口、忽略规则和记忆结构。

**Files**: `templates/STRUCTURE.md`, `templates/REGULATIONS.md`, `templates/root-AGENTS.md`, `templates/gitignore`, `templates/memory/USER.md`, `templates/memory/MEMORY.md`

**Pre-read**: `.wopal/docs/DESIGN.md` §6.4 各模板设计章节、`.wopal/docs/DISTRIBUTION.md` §2

**Design**:

对照 DESIGN §6.4 逐项验证模板集：

**STRUCTURE.md**：
- frontmatter 包含 `version`、`space`、`space-component-type`、`ontology-worktree`、`space-runtime`、`repos` 字段
- `ontology-worktree.repo` 使用 `${ONTOLOGY_REPO}@space/{space-name}` 占位符
- `space-runtime` 保留目录/文件用途描述
- `repos` 默认为 `{}`（空对象，由实例填充）
- Markdown table 分为 `MANAGED:START` / `MANAGED:END` 和 `USER:START` / `USER:END` 两个 block
- managed block 列出 `.wopal` 固定关键模块
- table schema 字段为 `path`、`type`、`level`、`description`

**REGULATIONS.md**：
- 安全红线：误删防护、工作边界、目录保护、敏感信息保护
- Git 基本法：实施前检查、提交前检查、提交格式、历史不可变原则
- 子代理委托：委派前检查、路径确认、目标项目上下文
- 核心技能入口：`space-master`、`agents-collab`、`dev-flow`

**root-AGENTS.md / gitignore / memory templates**：
- `root-AGENTS.md` 包含启动协议和 `## User Rules` 写入区域
- `gitignore` 覆盖 `.env`、`__pycache__/`、`node_modules/`、IDE、OS 和 `.wopal-space/.tmp/` / logs
- `memory/USER.md` 和 `memory/MEMORY.md` 提供可填写的结构化 section

确认模板与设计对齐。如发现语义内容需要修改，先按 D-05 准备 review 版本，再同步正式 runtime source。

**TDD**: false — Markdown 模板审查，非代码 Task

**Changes**:

1. 逐字段比对 `STRUCTURE.md` frontmatter 与 DESIGN §6.4 schema
2. 确认 `${ONTOLOGY_REPO}` 占位符和 managed/user block 语义清晰
3. 确认 `REGULATIONS.md` 覆盖核心规则族和核心技能入口
4. 确认 `root-AGENTS.md`、`gitignore`、memory templates 与 P1 初始化结构对齐
5. 补充必要的模板内注释或 review artifact（如有）

**Verify**: `rg 'ONTOLOGY_REPO' .wopal/templates/STRUCTURE.md` ≥ 1 && `rg 'MANAGED:START|USER:START' .wopal/templates/STRUCTURE.md` ≥ 1 && `rg 'space-master|agents-collab|dev-flow' .wopal/templates/REGULATIONS.md` ≥ 1 && `rg 'CRITICAL_RULE' .wopal/templates/root-AGENTS.md` ≥ 1 && `rg '.wopal-space/.tmp/' .wopal/templates/gitignore` ≥ 1

**Done**:

任务产出：确认初始化模板集与 canonical identity、规则入口和 P1 runtime skeleton 对齐
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

### Task 3: 确认 base capability source 目录结构并更新 DISTRIBUTION.md

**Verification Intent**: AC#5, AC#6, AC#7, AC#8, AC#9

**Behavior**: `{agents,skills,commands}` 三个目录的顶层结构满足 setup 物化需求。`DISTRIBUTION.md` 包含 base capability source 的 source 侧契约说明，明确物化 source 路径、物化方式（symlink/copy）和物化目标。

**Files**: `docs/DISTRIBUTION.md`, `agents/`, `skills/`, `commands/`

**Pre-read**: `.wopal/docs/DESIGN.md` §6.7、`.wopal/docs/DISTRIBUTION.md`

**Design**:

分两步完成：

**Step 1 — 确认目录结构**：
- `agents/` 包含 Wopal、Fae、Rook 核心 agent 和 WSF 子代理的 `.md` 灵魂文件
- `skills/` 包含 80+ 技能目录，每个目录有 `SKILL.md`
- `commands/` 包含 `init.md`、`commit.md`、`review.md` 等命令和 `wopal/` 子目录
- 三个目录无多余的非 `.md` 文件干扰物化（scripts 等在技能子目录内，不影响顶层遍历）
- 明确 setup 遍历 contract：`agents/` 顶层 `*.md`、`commands/` 顶层 `*.md` + `commands/wopal/*.md`、`skills/` 顶层目录作为 skill units；非匹配文件不参与 base materialization

**Step 2 — 更新 DISTRIBUTION.md**：

在 `DISTRIBUTION.md` 的适当位置（§5 Runtime Loading Handoff 之前或之后）新增一节，描述 base capability source 契约：

- Source 路径：`$WOPAL_HOME/ontologies/wopal-space-ontology/{agents,skills,commands}`
- 物化目标：`$WOPAL_HOME/{agents,skills,commands}`
- macOS/Linux 使用 symlink（`ln -s`）
- Windows 使用 managed copy（定期刷新）
- space overlay 机制：`<space>/.wopal/{agents,skills,commands}` 同名覆盖 base
- 此契约是 wopal-cli `wopal setup` 的消费接口
- setup 只遍历上述声明的 source entry，避免将 nested scripts、临时文件或非 runtime markdown 误物化到 base layer

**TDD**: false — 文档审查与文档更新，非代码 Task

**Changes**:

1. 确认 `agents/`、`skills/`、`commands/` 顶层结构满足物化遍历需求
2. 在 `DISTRIBUTION.md` 中新增 base capability source 契约说明
3. 明确 source 侧的路径、物化方式和 overlay 机制

**Verify**: `rg 'base.capabilit' .wopal/docs/DISTRIBUTION.md` ≥ 1 && `rg 'agents.*commands\|commands/wopal\|skill units\|symlink\|overlay' .wopal/docs/DISTRIBUTION.md` ≥ 1 && `ls .wopal/agents/*.md | wc -l` ≥ 3 && `ls .wopal/skills/ | wc -l` ≥ 10 && `ls .wopal/commands/*.md .wopal/commands/wopal/*.md 2>/dev/null | wc -l` ≥ 5

**Done**:

任务产出：确认 base capability source 目录完整，DISTRIBUTION.md 包含物化契约说明
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

### Task 4: 确认 /init 命令边界定义与 P1 对齐

**Verification Intent**: AC#4

**Behavior**: `commands/init.md` 的职责定义与 Phase §207-218 的 CLI 消费边界对齐：`/init` 消费 `wopal space scan` JSON、维护 compact `STRUCTURE.md`、检查 runtime 结构、展示模板差异、等待用户确认后写入。

**Files**: `commands/init.md`

**Pre-read**: `.wopal/docs/DESIGN.md` §6.3, `.wopal/docs/DISTRIBUTION.md` §4

**Design**:

审查 `commands/init.md` 确认：

- 职责定义为"消费 scan JSON、维护 STRUCTURE.md、runtime 检查、模板差异提示、用户确认后写入"
- 不承担首次确定性 materialization（那是 CLI 的 `space init` 职责）
- 不读写 `REGULATIONS.md` 实例（那是用户 + `/wopal:evolve` 的职责）
- 消费 `wopal space scan` 的输出格式（`wopal.space.scan.v1` JSON）
- 与 Task 2 确认的 `STRUCTURE.md` managed/user block 语义一致：`/init` 只提出 `STRUCTURE.md` 更新方案，并在用户确认后写入

如定义与 P1 Phase §207-218 和 DESIGN §6.3 一致，仅做确认记录。如发现偏差，在命令文件中修正。

**TDD**: false — 命令定义文档审查，非代码 Task

**Changes**:

1. 逐项比对 `/init` 命令定义与 DESIGN §6.3 和 Phase §207-218 的边界
2. 确认 `/init` 不承担首次 materialization
3. 确认 `/init` 消费 scan JSON 的设计边界
4. 修正偏差（如有）

**Verify**: `rg 'wopal space scan\|scan' .wopal/commands/init.md` ≥ 1 && `rg 'STRUCTURE' .wopal/commands/init.md` ≥ 1 && `rg 'confirm\|确认\|user' .wopal/commands/init.md` ≥ 1

**Done**:

任务产出：确认 /init 命令边界与 P1 设计对齐，与 CLI space init 职责无重叠
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤执行, 并确认结果符合预期（必须由实施 Agent 勾选）

---

## Delegation Strategy

| Wave | Task | 执行者 | 依赖 | 委派理由 |
|------|------|--------|------|---------|
| 1 | Task 1 | fae | 无 | schema 审查微调，需精确比对 schema 与设计文档 |
| 1 | Task 2 | fae | 无 | 初始化模板集审查合并为一个执行单元，降低上下文切换；文件不同但目标同属模板契约校准 |
| 2 | Task 3 | fae | Task 1-2 完成 | 需要前序审查结论确认 source 结构正确，同时修改 DISTRIBUTION.md |
| 2 | Task 4 | Wopal 或同一 fae | Task 2 完成 | `/init` 边界与 STRUCTURE managed/user block 语义相关，是轻量 dependency check |

**Wave 1 门控**：Task 1 与 Task 2 模板契约校准完成后运行 AC#1-AC#4 验证，通过后释放 Wave 2。

**Wave 2 门控**：Task 3-4 完成后运行 AC#5-AC#9 验证。

**强依赖处理**：Task 3 依赖 Task 1-2 的审查结论确认 source 结构无问题。Task 4 依赖 Task 2 的 STRUCTURE.md managed/user block 语义确认。

**Autonomous**：所有 Task 均 autonomous: true，无 checkpoint。
