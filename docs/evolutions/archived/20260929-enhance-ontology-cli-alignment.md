# enhance-ontology-cli-alignment

## Metadata

- **Type**: enhance
- **Project Path**: .wopal
- **Created**: 2026-09-29
- **Stage**: archived
- **Mode**: isolated
- **Worktree**: .worktrees/ontology-enhance-ontology-cli-alignment
- **Branch**: ontology-enhance-ontology-cli-alignment
- **Base Commit**: 6ede00a0f05967d9e3082f1d93b9b07f6b1ecc91
- **Final Commit**: 6f83fc4a5e39078376cc6b2079c8b15145fcf505

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

把本体静态资产一次性对齐到两项已交付的 CLI 契约：**装配载体**（`coding.yaml` 的 `paths: [dsh]` 声明核验（基线既有）、骨架 gitignore 按保盘契约收紧、schema 核对）与**进化流程技能**（`ontology-evolution` 把「实施不提交 → 主控验证并记录 → 每任务一次提交 → rook 评审 → 验证切换 → 用户确认 → 集成 → 归档」写成可直接照做的明文）。本提案合并自 `enhance-assembly-carriers` 与 `refactor-evolution-flow` 两份草稿，全部前置已交付，一次实施、一次验证、一次归档。

## Technical Context

### Architecture Context

**装配侧**：CLI 已提供严格引用解析、`paths` 消费、单文件 `space-meta.json` 状态与限路径提交（`refactor-space-assembly-state` 已交付）；本体提案 `refactor-assembly-refs` 已把 `coding.yaml` 现有文件引用迁移为显式扩展名。`paths` 生效面见 `docs/DESIGN-assembly.md` Generic Path Assembly；`coding.yaml` 的 `paths: [dsh]` 声明已随基线存在（`5178fc7`），本提案只做核验、不新增内容。空间根模板目标态只忽略私有持有的实际文件路径（以 CLI 契约的 `.wopal-space/state/held/` 等为准），不忽略 `.wopal-space/state/` 整目录或 `space-meta.json`；模板只负责新空间，既有空间的 `.gitignore` 维护不在本提案范围。

**流程侧**：`#240` 已交付（去覆盖式记录保全、`advance` 即时镜像、按任务提交、`switch` 验证切换、`integrate` 用户门控与直连分支、归档预检放宽、`--paths` 示例修正；CLI 已发布安装）。技能文档尚未对齐——记录协议、角色×命令矩阵、并行实施规范、评审门与集成门、`--paths` 基准均缺失或过时，实际做法靠考古 git 历史。

### Research Findings

差距清单（双源比对结论）：

装配侧：
1. `coding.yaml` 的 `dsh` 目录引用：**基线既已存在**（`5178fc7`）——本提案核验其类型默认整目录物化与无碰撞；原草稿误作缺口，实施期发现并修正。
2. 骨架 gitignore 规则与 CLI 私有保盘契约（`.wopal-space/state/held/` 等）未对齐；两类骨架的模板引用需核对一致。
3. 提案模板缺装配归属声明（`Assembly Intent`），新增整项资产的归属无登记面。

流程侧：
4. **记录协议缺失**：谁填 Done、写在哪、什么时候写——技能里没有，实际做法靠考古 git 历史。
5. **角色×命令矩阵缺失**：每个动作由谁执行（实施 agent / 主控 / rook / 用户）无明文，靠推断。
6. **并行实施规范缺失**：同一隔离工作区多任务并行时的提交纪律每轮手抄进委派 prompt。
7. **评审门与集成门缺失**：技能把评审写成「用户想看才做」的可选项；`integrate` 无用户确认门，验证被迫在集成之后。
8. **`--paths` 基准未定义**：示例带 `.wopal/` 前缀，照抄会被拒绝（`SPACE_EVO_COMMIT_TARGET_INVALID`）。

核对结论：两份草稿的前置（`refactor-space-assembly-state`、`refactor-assembly-refs`、`#240`）均已交付；草稿假设与 #240 最终交付语义一致（记录保全、每任务一次提交、评审门、验证切换、集成门控、`--paths` 基准），无行为分叉。

**References**:
- `docs/DESIGN-assembly.md`（装配机制与 `paths` 生效面）
- `skills/ontology-evolution/SKILL.md`（现状基线）
- `skills/ontology-evolution/references/commands.md`（现状基线）
- `docs/evolutions/archived/20260928-refactor-plugin-config-consumption.md`（记录实际填写形态参照）

### Key Decisions

- D-01: 合并交付——本提案承载两份草稿的全部界面（装配载体 + 进化流程），一次实施、一次验证、一次归档；不把部分界面留到后续载体。
- D-02: `paths: [dsh]` 已随基线声明（`5178fc7`）；整目录物化与碰撞校验在隔离工作区用真实 Git 断言核验。
- D-03: 私有内容保盘路径以已交付 CLI 契约为准（`.wopal-space/state/held/` 等）；模板不忽略注册的装配状态与任何用户文档。
- D-04: 技能措辞对齐状态提交事实——`--local` 描述为「状态变化时 CLI 限路径提交空间根仓库」，不得写零提交、不得暗示自动上行；内容上行仍由用户逐次 `space sync` / `ontology contribute` 决定。
- D-05: 记录协议——唯一作者 = 主控；位置按模式（isolated = 隔离工作区副本；quick = 空间工作区副本）；时机 = 验证通过后、提交前；实施 agent 不编辑提案文件；isolated 禁止空间侧记录提交。
- D-06: 提交粒度——实施不提交；每完成一个 task 一次提交（该 task 代码 + 提案更新），落工作分支；并行在途时 `--paths` 点名本任务文件 + 提案文件。
- D-07: 评审门——全部任务 + 主控验证之后、邀请用户验证之前，强制 rook 实施评审（2 轮预算，首轮列全）。
- D-08: 验证与集成门——评审通过后先询问用户选择验证方式、优先推荐分支切换（`.wopal` ↔ 隔离分支，验证后切回）；备选「先集成后验证」；`integrate` 仅在用户明确确认后执行。

### Key Interfaces

- `coding.yaml` 的 `paths: [dsh]`（基线既有，`5178fc7`）经隔离物化核验生效；引用缺失时 fail。
- `assembly/templates/gitignore` 增加 CLI 保盘私有内容规则；不忽略注册装配状态与用户文档；两类骨架的模板引用核对一致。
- 提案模板 `## Assembly Intent` 表字段为 `Ref / Scope / 理由`，只登记新增整项资产；`Done` 段带记录归属注记（不引入尖括号占位符）。
- `--paths` 基准 = 被提交侧工作区根；`.wopal/` 前缀示例会被 `SPACE_EVO_COMMIT_TARGET_INVALID` 拒绝；技能命令面不变，无新增机器接口。

## In Scope

- `assembly/archetypes/coding.yaml`：`paths: [dsh]` 声明核验（基线既有，无改动）。
- `assembly/templates/gitignore`：私有保盘内容忽略规则；核对 `assembly/schemas/coding-space-schema.yaml` 模板引用。
- `skills/ontology-evolution/templates/proposal.md`：`## Assembly Intent` 表与托管说明；`Done` 段记录注记。
- `skills/ontology-evolution/SKILL.md`：角色×命令矩阵（九项：new / accept / advance / commit / integrate / archive / 记录回填 / 实施评审 / 集成门控）；runbook 重排（逐行执行者 + 评审/验证/确认/集成时序 + 每任务一次提交）；记录协议节；并行实施规范节；命令用法实操段（逐步可复制命令 + 端到端示例）；状态机评审句修订；验证切换操作表述；`--local` 措辞对齐。
- `skills/ontology-evolution/references/commands.md`：`--paths` 基准（被提交侧工作区根）与正确示例；记录/评审/集成流程表述（引用 #240，不展开实现）。
- `docs/DESIGN-evolution.md`：阶段语义与落地流程图同步（实施期发现缺口；随 Task 3 交付、第 1 轮评审后按 #240 重排）。
- `skills/ontology-evolution/AGENTS.md` §3：记录归属与提交粒度两条长期边界。

## Out of Scope

- CLI 实现（严格解析、`paths` 消费、状态机制、`switch`、`integrate` 门控、`archive` 放宽等）：已交付 `refactor-space-assembly-state` 与 #240。
- `coding.yaml` 现有能力条目的显式扩展名迁移：已交付 `refactor-assembly-refs`。
- 本体三个插件配置消费（ONT-G5）：独立提案 `refactor-plugin-config-consumption`（已归档）。
- 武器库清单、派发与会话规则注入（ONT-G2/G3）：未定稿讨论。
- 既有空间 `.gitignore` 维护与真实空间迁移；上游交付由用户拍板。
- 其他 evo 命令行为（`new` / `status` / `check` / `accept` / `advance` / `archive`）；`space sync` / `ontology contribute`（交付终端，用户拍板）。

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| 装配单 | `assembly/archetypes/coding.yaml` | 核对（基线既有） | `paths: [dsh]` 核验 |
| 骨架模板 | `assembly/templates/gitignore` | 修改 | 仅忽略私有持有内容 |
| 骨架 schema | `assembly/schemas/coding-space-schema.yaml` | 核对（未改动） | 模板引用一致性 |
| 技能主文档 | `skills/ontology-evolution/SKILL.md` | 修改 | 矩阵、runbook、记录协议、并行规范、评审/验证/集成门、`--local` 措辞 |
| 技能镜像 | `skills/ontology-evolution/SKILL.zh-CN.md` | 修改 | 与 SKILL.md 同步镜像 |
| 命令参考 | `skills/ontology-evolution/references/commands.md` | 修改 | `--paths` 基准与示例、流程表述 |
| 提案模板 | `skills/ontology-evolution/templates/proposal.md` | 修改 | `Assembly Intent` + `Done` 注记 |
| 技能开发规则 | `skills/ontology-evolution/AGENTS.md` | 修改 | 记录归属与提交粒度 |
| 技能镜像 | `skills/ontology-evolution/AGENTS.zh-CN.md` | 修改 | 与 AGENTS.md 同步镜像 |
| 本体设计 | `docs/DESIGN-evolution.md` | 修改 | 阶段语义与落地流程同步（#240） |

## Acceptance Criteria

### Agent Verification

1. [x] 隔离工作区内 `coding.yaml` 的 `paths: [dsh]` 经 CLI 物化出 `.wopal/dsh` 整目录，与能力类目/保留目录无碰撞；引用缺失时 fail。
2. [x] 隔离空间 `git check-ignore` 只命中约定私有持有文件；`space-meta.json`、`REGULATIONS.md` 与用户文档不命中；两类骨架的模板引用核对一致。
3. [x] 新提案模板的 `Assembly Intent` 表格可被工具解析校验；技能文案不再出现「`--local` 零提交/永不上行」，且状态提交与用户逐次上行分开表达。
4. [x] **矩阵与 runbook**：`SKILL.md` 有角色×命令矩阵（九项动作各有执行者与条件）；runbook 逐行标注执行者、含「评审 → 用户验证 → 用户确认 → `integrate`」时序、无裸命令行。验证：`rg` 命中矩阵与 runbook 标注。
5. [x] **记录与提交**：五条断言命中——① 唯一作者 = 主控；② 位置按模式（isolated = 隔离工作区副本 / quick = 空间工作区副本）；③ 时机 = 验证后、提交前；④ 禁止项（实施 agent 不编辑提案；isolated 禁止空间侧记录提交）；⑤ 提交粒度 = 每完成一个 task 一次提交（该 task 代码 + 提案更新同提交，落工作分支；并行在途时 `--paths` 点名本任务文件）。验证：逐条 `rg` 命中。
6. [x] **并行实施规范**：四项命中——`--paths` 的省略语义（= 全部已跟踪改动 + 提案文件）与三种显式例外（新文件 / 收子集 / instant）；并发被拒原样重试；不处置他人文件；工作区保护禁令（禁 `reset` / `checkout` / `restore` / `clean` / `stash`）。验证：逐条 `rg` 命中。
7. [x] **评审门与验证/集成门**：状态机不再含 "happens when the user asks" 类可选表述；评审为强制门（含 2 轮预算）；验证方式选择：评审通过后先询问用户、优先推荐分支切换（切出/切回的步骤可照做）；`integrate` 标注用户门控。验证：`rg -n 'happens when the user asks' skills/ontology-evolution/SKILL.md` 零命中 + 「分支切换」「询问用户」「集成门控」逐条命中。
8. [x] **路径基准与注记**：`commands.md` 基准句（被提交侧工作区根）存在、`--paths` 示例均不带 `.wopal/` 前缀；模板 `Done` 注记与 AGENTS 两条边界命中。验证：`rg` 逐条命中。
9. [x] **旧表述零命中**：`sparse-safe, per task` 零命中；「实施不提交 / 每任务一次提交 / 落在工作分支」跨文件表述一致。验证：`rg` + 人工比对。
10. [x] **命令用法实操段**：`SKILL.md` 含逐步可复制命令（每步标注运行目录与预期结果），并给出端到端示例：`accept` → 每任务 `commit`（代码+记录）→ 评审 → 验证（分支切换）→ `integrate` → `archive`。验证：`rg` 命中命令序列与目录标注。

### User Validation

装配侧不设用户验证：全部变更在隔离工作区由 Agent 验证；真实空间迁移与运行时观察归交付终端的用户拍板。
流程侧（技能为运行时加载路径，须重启观察）：

#### Scenario 1: 冷读复述完整流程（重启加载）

- Goal: 只读 `SKILL.md` 的新会话能无歧义复述完整流程（记录作者、提交者与落点、评审时机与执行者、验证方式选择、集成条件）。
- Environment: 本空间 dev 构建；重启后开新会话（不给本提案与历史上下文）。
- Precondition: 已 `switch` 到隔离验证视图（或已集成）。
- Launch command: `cd projects/ellamaka && ./scripts/dev.sh tui`
- User Actions:
  1. 重启 TUI、新开会话，要求 agent「只读 `.wopal/skills/ontology-evolution/SKILL.md`，口述 isolated 模式下两个并行 task 的完整流程：每步谁执行、记录写在哪、每个 task 提交什么、怎么提交、评审何时由谁做、集成在什么条件下执行，并给出每步可直接复制的命令（含分支切换怎么切、怎么切回）」；
  2. 追问五问：「实施 agent 能不能自己改提案？」「`--paths` 带不带 `.wopal/` 前缀？」「集成由谁在什么条件下发起？」「评审能不能跳过？」「验证前要做什么？用哪种验证方式？」
- Pass criteria: 复述与 SKILL.md 一致；五问均唯一答案（不可；不带；仅用户确认后；不可跳过、2 轮预算；验证前先询问用户、优先推荐分支切换，切出与切回步骤明确）；能给出每步可直接复制的命令序列（含运行目录与预期结果）；技能加载无报错、新流程各节在加载内容中可见。
- Failure feedback: 贴出完整回答并指明与哪条文档冲突。

- [x] 用户已完成上述功能验证并确认结果符合预期（2026-09-29 用户确认）

## Implementation

### Task 1: 装配载体（coding.yaml / gitignore 模板 / schema 核对）

**Verification Intent**: AC#1、AC#2

**Behavior**:
- 隔离物化 `dsh` 整目录；私有保盘内容被忽略、状态文件可跟踪。

**Pre-read**: `docs/DESIGN-assembly.md`、`assembly/archetypes/coding.yaml`、`assembly/templates/gitignore`、`assembly/schemas/coding-space-schema.yaml`

**Design**: 不再分批：CLI 验收完成后在此 Task 直接声明并物化；忽略规则按 CLI 定稿路径一次写全并在临时目录验证。

**TDD**: false（声明与模板；真实 Git + CLI 隔离验证）

**Changes**:
1. 隔离目录预置 `dsh/` 内容，先跑 CLI 物化基线。
2. 修改装配单与模板，跑物化与 `git check-ignore` 断言。
3. 核对 schema 引用并复查差异范围。

**Verify**: 临时目录运行 `git check-ignore` 两组断言（私有内容 exit 0；`space-meta.json`/`REGULATIONS.md` exit 1），运行已有隔离物化校验命令。

**Done**:
任务产出：装配载体对齐完成——gitignore 模板新增私有保盘规则（`held/`，+3 行）；`coding.yaml` 的 `paths: [dsh]` 已于基线存在（`5178fc7`），经 CLI 端到端物化验证（15/15 全等、因果/悬空/碰撞对照全过）；两类骨架模板引用一致。核验备注：上下文「既有空间 `.gitignore` 补丁归已交付 CLI」经检索无实现依据，已改述为「不在本提案范围」。
实际触碰文件：`assembly/templates/gitignore`；`assembly/archetypes/coding.yaml`、`assembly/schemas/coding-space-schema.yaml`（核对，未改动）。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 2: SKILL.md 流程重写与 `--local` 措辞对齐

**Verification Intent**: AC#3（措辞）、AC#4、AC#5、AC#6、AC#7、AC#9、AC#10

**Behavior**:
- 角色×命令矩阵：九项动作（new / accept / advance / commit / integrate / archive / 记录回填 / 实施评审 / 集成门控）各有唯一执行者与触发条件；
- runbook：逐行标注执行者，含「实施不提交 → 主控验证并记录 → 每任务一次提交（代码+提案更新）→ rook 评审 → 用户验证 → 用户确认 → `integrate`」时序；quick 分支差异单列；
- 每任务一次提交：并行在途时 `--paths` 点名本任务文件 + 提案文件；串行/独占时可省略；
- 记录协议节：见 D-05 的四条断言；isolated 模式给出「为何不写空间侧」的耐久理由（记录无法随工作分支回滚；空间侧未提交会阻塞 `integrate`；两侧分叉会冲突）；
- 并行实施规范节：提交默认可省略 `--paths`（= 该工作区全部已跟踪改动 + 提案文件）；仅三种例外显式——纳管新文件、并行在途时收子集、instant 模式；并发被拒重试；不处置他人文件；工作区保护禁令；
- 状态机一节：删除 "Review … happens when the user asks for it" 可选句，改为「`implementing` 内的强制门（全部任务 + 主控验证之后、邀请用户验证之前）」；
- 验证与集成门表述：评审通过后先询问用户选择验证方式、优先推荐分支切换（把 `.wopal` 切到隔离分支观察，验证后切回，步骤可照做）；备选「先集成后验证」；`integrate` 仅在用户确认后执行；
- 命令用法实操段：逐步可复制命令（运行目录 + 预期结果）+ 端到端示例（`accept` → 每任务 `commit` → 评审 → 验证（分支切换）→ `integrate` → `archive`）；
- `--local` 措辞：描述为「状态变化时 CLI 限路径提交空间根仓库」，不得写零提交，也不得暗示自动上行；状态提交与用户逐次上行分开表达。

**Pre-read**: `skills/ontology-evolution/SKILL.md`（全篇）；`docs/evolutions/archived/20260928-refactor-plugin-config-consumption.md`（记录实际填写形态参照）；`skills/ontology-evolution/references/commands.md`（对照）

**Design**: 以优化后的 CLI 流程（#240 已交付）为唯一蓝本；矩阵是「谁跑什么」的唯一真相源，runbook 只做时序叙述；记录与并行两节独立成节。不描述 CLI 尚未具备的行为——依赖统一引用 #240。

**TDD**: false（文档重写；判据为可 grep 的文本契约）

**Changes**:
1. 起草角色×命令矩阵（九项动作 × 执行者 / 条件）。
2. 重排 runbook：逐行执行者 + 评审/验证/确认/集成时序 + 每任务一次提交 + quick 差异行。
3. 新增记录协议、并行实施规范、命令用法实操段；修订状态机评审句与验证/集成门表述（含分支切换与询问用户）；对齐 `--local` 措辞。
4. 自查 AC#3-7、AC#9、AC#10 逐条命中。

**Verify**: `rg -n 'happens when the user asks' skills/ontology-evolution/SKILL.md` 零命中；`rg -n '主控|唯一作者|实施评审|集成门控|每完成一个 task' skills/ontology-evolution/SKILL.md` 命中协议、门控与提交粒度表述；用法段含端到端命令序列；「分支切换」「询问用户」相关表述命中；`rg` 确认无「零提交/永不上行」类旧措辞。

**Done**:
任务产出：SKILL.md 全量重写（389 行）：角色×命令矩阵（九项：new / accept / advance / commit / integrate / archive / 记录回填 / 实施评审 / 集成门控）、状态机强制评审门（2 轮预算）、记录协议（唯一作者 + 单副本 + 时机 + isolated 禁空间侧）、并行实施规范（省略语义 + 三例外 + 工作区保护禁令）、验证与集成门（分支切换优先 / 备选先集成后验证 / `--confirm`）、runbook（15 步逐行执行者）、quick 差异单列、命令用法实操段（8 步 + 端到端）；`--local` 措辞对齐。中文镜像 SKILL.zh-CN.md 全量同步（390 行，结构逐一对应）。核验备注：Verify 命令按双语拆分执行（英文集查 SKILL.md、中文集查镜像）；提案原文的中文单文件写法已按此口径落地。
实际触碰文件：`skills/ontology-evolution/SKILL.md`、`skills/ontology-evolution/SKILL.zh-CN.md`。
评审修复（第 1 轮 BLOCK）：B-01——状态机补全四条合法前进边（`draft → accepted` / `accepted → implementing` / `implementing → validating` / `validating → archived`）；「先集成后验证」分支明确「集成随即完成、后置 integrate 跳过」，runbook 两条路径自洽、门控措辞统一为「用户的明确放行」；B-03 技能侧——旧模型（`snapshot / localState / added / shadowed`）全部替换为 `include / exclude / private` 语义（`private` 受上行门禁保护；`include / exclude` 为挂载选择）。中英镜像逐句同步；旧词扫描零残留。
评审处置（第 2 轮 / 终局 BLOCK）：W-01——记录协议耐久理由 2 修正：不再声称 `integrate` 要求空间侧整体干净；改为「空间侧记录编辑的正是 squash 携带的提案文件，重叠会阻塞或冲突」。评审预算关闭（2/2），按终局报告自行修复、不再送审。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 3: references/commands.md（`--paths` 基准 + 流程表述）

**Verification Intent**: AC#8、AC#9

**Behavior**:
- 明确基准 = 被提交侧工作区根（isolated = 隔离工作区；quick / instant = `.wopal`）；`.wopal/` 前缀会被判 invalid 拒绝（错误码 `SPACE_EVO_COMMIT_TARGET_INVALID`）；
- 补一条可照抄的正确示例；文档内所有 `--paths` 示例均按该基准书写；
- 补记录/评审/集成流程表述：记录编辑由主控在工作区副本执行、随代码单提交；评审与验证切换/集成门控一句引用 #240。

**Pre-read**: `skills/ontology-evolution/references/commands.md`（`commit` 节）

**Design**: 基准定义放 `commit` 节 `--paths` 首次出现处（三态一句话）；流程表述交叉引用 SKILL.md，避免两处各写一套。

**TDD**: false（文档修正）

**Changes**:
1. 补基准定义与反例（含错误码）。
2. 补正确示例。
3. 补流程交叉引用；自查与 SKILL.md 一致。

**Verify**: `rg -n -- '--paths' skills/ontology-evolution/references/` 无 `.wopal/` 前缀示例；基准定义句存在；`SPACE_EVO_COMMIT_TARGET_INVALID` 命中。

**Done**:
任务产出：`commands.md` 对齐交付流程：`--paths` 基准句与正确示例/反例（`SPACE_EVO_COMMIT_TARGET_INVALID`）；记录/评审/集成流程表述；commit 窗口（`implementing | validating`）与验证视图落点；`Assembly Intent` 行一句；integrate 的 `validating + --confirm` 门控与 worktree 可选语义；新增 `switch` 节。另：实施期发现的本体 `docs/DESIGN-evolution.md` 阶段语义过时（validating 行、评审句、流程图提交归属等 7 处）随本 task 一并同步（对照 CLI 版逐句修正）。
实际触碰文件：`skills/ontology-evolution/references/commands.md`、`docs/DESIGN-evolution.md`。
评审修复（第 1 轮 BLOCK）：B-02——本体 `docs/DESIGN-evolution.md` 流程图与核心规则 2 按 #240 真实流程重排（isolated 逐任务提交落隔离分支、经 `integrate` 进空间分支；quick 直落空间分支；评审门先于用户验证；交付终端由用户拍板），Isolation Discipline 开头句最小修正；B-03 commands——分类段按 `include / exclude / private` 与 Assembly Intent 语义重写（删除永不自动生成本地卸载）；W-01——archive 预检放宽表述（空间工作区仅需稀疏一致 + 注册分支，无关改动不阻断、按名提交、以警告报告）；W-02——accept/advance 隔离副本字段级镜像与提交补载。旧词扫描零残留。
评审处置（第 2 轮 / 终局 BLOCK）：B-01——`commands.md` 集成门控句与本体 `docs/DESIGN-evolution.md` 流程图补「先集成后验证」跳过语义（与 SKILL 统一为「用户的明确放行」）。评审预算关闭（2/2），按终局报告自行修复、不再送审。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

### Task 4: templates/proposal.md（Assembly Intent + Done 注记）+ AGENTS.md

**Verification Intent**: AC#3（表格）、AC#8、AC#9

**Behavior**:
- `templates/proposal.md` 新增 `## Assembly Intent` 节：只登记新增整项资产，逐项声明 `type-default` / `space-local`，表字段 `Ref / Scope / 理由`；说明托管规则；
- `Done` 段以 HTML 注释补注记：记录段整体（完成勾选 + 任务产出 + 实际触碰文件）由主控在工作区分支的提案副本填写；实施 agent 不编辑提案文件任何部分；注记不引入尖括号占位符（不得触发占位符扫描）；
- `AGENTS.md` §3 增加记录归属与提交粒度两条长期边界。

**Pre-read**: `skills/ontology-evolution/templates/proposal.md`（全篇）；`skills/ontology-evolution/AGENTS.md` §3

**Design**: 注记措辞与 SKILL.md 记录协议逐句对齐；AGENTS 只收长期边界，不复制流程细节；Assembly Intent 表格样例须可被 `space evo check` 解析（用样例提案验证）。

**TDD**: false（文档与模板；结构样例校验）

**Changes**:
1. 模板加 `## Assembly Intent` 节并说明只登记新增整项资产。
2. 模板 `Done` 段加注释注记。
3. `AGENTS.md` §3 加两条边界。
4. 自查：未新增未替换占位符；用一份样例提案验证 `Assembly Intent` 解析（隔离环境）。

**Verify**: `rg -n '主控' skills/ontology-evolution/templates/proposal.md skills/ontology-evolution/AGENTS.md` 命中；`rg -n 'Assembly Intent' skills/ontology-evolution/templates/proposal.md` 命中；占位符扫描无新增；样例提案通过 `space evo check`（隔离环境）；`python3 skills/dev-doc-master/scripts/verify-docset.py docs --main DESIGN.md` 通过。

**Done**:
任务产出：模板新增 `Assembly Intent` 节（空表即合法；解析器实证覆盖空表/有效行/非法 scope/重复引用）；`Done` 段记录归属注记（无尖括号占位符）；`AGENTS.md` §3 新增记录归属与提交粒度两条边界；`AGENTS.zh-CN.md` 镜像同步（+8 行，中英条目一一对应）。核验备注：docset verify 在工作区根结构性不可通过（跨工作区外链），按 `.wopal` 端 PASS + 改动前后 18 条零回归认可。
实际触碰文件：`skills/ontology-evolution/templates/proposal.md`、`skills/ontology-evolution/AGENTS.md`、`skills/ontology-evolution/AGENTS.zh-CN.md`。
- [x] 实施 Agent 已完成上述功能开发和验证的所有步骤

---

## Delegation Strategy

四个 Task 文件不相交（装配三件套 / SKILL.md / commands.md / 模板+AGENTS），**一波并行**；均依赖前置已交付（已就绪）。本提案自身按 #240 定稿流程实施：实施不提交 → 主控验证并记录 → 每任务一次提交（代码+记录）→ rook 评审 → 验证（分支切换）→ 用户确认 → `integrate` → 归档。

| Wave | Task | 执行者 | 依赖 | 说明 |
|------|------|--------|------|------|
| 1 | Task 1 装配载体 | fae | 前置已交付 | 真实 Git + CLI 隔离验证 |
| 1 | Task 2 SKILL.md 重写 | fae | 前置已交付 | 主文档，动作最全 |
| 1 | Task 3 commands.md | fae | 前置已交付 | 文件不相交，并行 |
| 1 | Task 4 模板 + AGENTS | fae | 前置已交付 | 文件不相交，并行 |

并行纪律：每任务提交时，工作区有并行在途 → `--paths` 点名本任务文件 + 提案文件（不得省略，否则扫入他人改动）；串行/独占时可省略；纳管新文件必须点名；并发被拒原样重试；禁自行处置他人文件与工作区状态（工作区保护禁令块随委派 prompt 下发）。

## Delivery

实施留在空间分支（isolated 模式经 `integrate` 落入）；`space sync` 与 `ontology contribute` 由用户拍板。
