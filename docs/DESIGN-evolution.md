# DESIGN — Evolution Loop

> **Status**: Active
> **Updated**: 2026-10-31
> **Parent**: `./DESIGN.md`（ontology overall design: Module Architecture section）
> **Parent Architecture**: `../../docs/products/wopal-space/DESIGN.md`
> **Parent Product**: `../../docs/products/wopal-space/PRD.md`

---

## Ontology Collaboration Model

Ontology 以「中央能力池 + 空间装配 worktree」模型承载能力演化。一个空间是能力池的一次**可写装配视图**：能力组合由装配单决定，能力内容在空间内可写可进化，进化通过 `space sync` 汇入用户级能力池。

### Layered Structure

两级仓库，职责单一：

- **本地中央仓库（`~/.wopal/ontologies/<source>/`，`local main` 分支）**：用户级稳定能力池；所有公共 `agents/`、`skills/`、`rules/`、`commands/`、`plugins/` 与类型装配单的唯一真相源。跟踪 upstream/main。
- **空间装配 worktree（`<space>/.wopal/`，`space/<name>` 分支）**：按空间装配单 sparse-checkout 物化的**真实可写文件**视图。Agent 在此正常修改与提交，无需空间外写权限。

类型语义由装配单承载，不设 `type/*` 分支层级。

### Core Rules

1. **local main 是能力唯一真相源**：共享能力不维护长期空间分叉版本；空间的独有提交是待贡献的进化，不是第二套能力池。
2. **`space sync` 定序：先上行、后下行**：先汇入空间独有进化，再 fast-forward 到 local main 最新，最终两分支指向同一提交。
3. **正常推进一律 fast-forward**：空间分支必须可对齐时才能推进；有待贡献提交时先贡献，有未提交修改时先处理工作区。
4. **冲突在隔离临时 worktree（`$WOPAL_HOME/.worktrees/`）中处理**：整合成功才推进 live space 与 local main 引用；失败双方保持原状。
5. **更新/移除/贡献前检查工作区状态**：CLI 以工作区事实为准，不单信 Git 命令退出码。
6. **机制安全，不设审批门控**：CLI 默认 dry-run 预览，`--confirm` 才落盘；agent 按用户意图直接执行 `--confirm`，不引入额外审批门控。安全保障由机制承担——隔离整合、ff-only、冲突即停、工作区检查——最坏结果是未发生变更，而非破坏工作区。`--dry-run` 是诊断工具，不是执行前门控。
7. **共享内容与空间选择正交**：共享资产的 Git 新增、修改、删除随提交上行；空间装配选择以完整能力或 `path:` 身份记录在空间根仓库，只决定当前空间物化范围。共享资产可只在一个空间挂载，其选择不阻止内容上行。
8. **显式选择**：装配命令和新增整项资产的进化集成能更改空间挂载选择；已装配资产的内部文件编辑保持 Git 内容语义。同步范围由当前装配单、能力/`path:` 级选择及临时游离文件保护重算；未跟踪内容只是 working-tree 事实，内部文件删除不触发本地卸载。
9. **提案按复杂度触发**：新增一个完整 Skill / Rule / Command 本身不构成提案理由。普通能力新增、修改与修复可以直接在注册空间分支维护；只有需要独立设计、跨能力契约、复杂迁移、专门评审或多阶段验证时才进入正式提案流程。

## Self-Evolution Loop

进化观察、提案撰写与落地分离：Wopal 在正常工作中识别可能具有复用价值的纠正、摩擦、失败和有效模式，按需复用同一个 Maka 子线程持续分析；Maka 在观察期只诊断、归类和积累证据，不立即产出提案。主任务完成或用户准备结束会话时，Wopal 才触发汇总；空间运行中产生的经验遵循防污染与隔离纪律：

```
会话运行事实 / 用户纠偏 / 重复摩擦 / 工具与环境失败 / 有效模式
  │
  ▼
[Wopal：识别信号，按需启动/复用 Maka；主任务继续]
  │
  ▼
[Maka Observation：诊断、归类、积累证据]
  │  • discard：无复用价值 / 已正确覆盖
  │  • local：只属于当前项目或空间
  │  • candidate：值得继续观察
  │  • mature：证据足够，等待收尾汇总
  │
  ▼ 主任务完成 / 用户准备结束 / 显式要求进化总结
[Maka Synthesis：去重、去弱证据、泛化、能力路由]
  │  • 先找已有能力 owner，优先修正而非新增
  │  • 作用范围判定：项目/空间局部知识 / 类型装配 / 公共能力
  │  • 组件路由：Agent / Rule / Skill / Command / Plugin / Assembly / local knowledge
  │  • 零提案是有效结果
  ▼
进化提案落盘 docs/evolutions/，呈交用户审查                 Stage: draft
  │
  ▼ 用户批准
space evo accept <name>                                   Stage: accepted
  │  解析实施模式：isolated（派生隔离 worktree，默认）/ quick（无隔离）
  ▼
space evo advance <name> --to implementing                Stage: implementing
  │  [Wopal 主控] ──委派──> [Fae 规范实施]（不提交）
  │  主控逐任务验证、回填记录，按任务一次提交（代码 + 记录）：
  │    • isolated：提交逐次落隔离分支（空间分支不动）
  │    • quick：直落空间分支
  ▼
[Rook 实施评审]（强制门，先于邀请用户验证；交付质量与反污染底线）
  │  评审通过
  ▼
space evo advance <name> --to validating                  Stage: validating
  │  用户验证：主控先询问验证方式，优先分支切换——
  │    space evo switch <name> 进出隔离视图（.wopal 检出隔离分支、worktree 让位；验证后切回）
  │    （或用户显式选择「先集成后验证」：先行 integrate --confirm，在空间分支上验证；集成已完成，跳过下方 integrate 节点）
  ▼ 用户确认验证通过
space evo integrate <name> --confirm（仅 isolated；「先集成后验证」已在验证前完成，跳过本条）
  │    squash 隔离分支进空间分支（直连分支，无需 worktree；quick 无此步）
  ▼
space evo advance <name> --to archived                    Stage: archived
  ▼
space evo archive <name>（事务化归档 + 隔离清理）
  ▼
交付终端：space sync 汇入 local main / git + gh PR 回流上游
  —— 由用户逐次拍板，不在实施路径内
```

核心进化规则：

1. **观察与提案分离**：单次批评或失败先进入 Maka 的观察池，不立即形成提案；Wopal 不等待或向用户暴露 Maka 的中间分析。只有收尾汇总后仍成立的成熟信号才进入提案阶段，零提案是正常结果。
2. **提案与落地分离，且提案须经用户批准**：Maka 只出提案、不动刀（`edit` 仅放开 `docs/evolutions/`；Wopal 也可以撰写提案）；具体改动经用户批准后，由 Wopal 主控、委派 Fae 规范实施，提交由主控按任务落盘，Rook 审查把关。
3. **能力路由先于资产修改**：Maka 先判断问题应由哪个能力组件承载，优先修正已有 owner；只有现有组件都无法自然承载时才新增能力。产品 DESIGN 只在 owner 边界、加载机制或架构职责本身不清时按需读取。
4. **进化先落在空间侧，再经 `space sync` 汇入**：空间内正常写改、提交（Agent 仅需 workspace 写权限）——isolated 的逐任务提交先落隔离分支、经 `integrate` squash 进空间分支，quick 直落空间分支；`space sync` 时申请受控提权，将空间独有提交隔离整合进 local main。
5. **项目经验物理隔离**：属于当前项目特有的架构规范写入空间记忆或项目 `AGENTS.md`。空间选择可以只挂载当前空间所需的共享资产；尚未提交的新能力只是临时 working-tree 内容，决定保留后进入空间分支 Git。

进化粒度遵循严格的防污染纪律：项目/空间局部经验留在对应局部载体，类型经验作用于类型装配，只有高度抽象且经受反污染审查的通用资产才允许回流中央。

## Capability Evolution Workflow

本体能力进化的执行机制由 `ontology-evolution` 技能承载。该技能是四个核心角色在所有空间类型下的常驻能力：任意空间都能维护与补充自己的本体能力，无需装配代码开发工作流。代码项目开发流程由 `dev-flow` 拥有（见 `./DESIGN-capabilities.md`）；本体能力进化流程由 `ontology-evolution` 拥有。两条流程的对象不同——前者面向 `projects/` 下的代码仓库，后者面向空间自身的本体能力资产。技能同时承载本体维护操作的执行协议（`ontology sync` / `space sync` / 原生 Git/GitHub PR / 能力装配增删）——进化的机制操作与日常维护共用同一套命令面与安全纪律，规范单点维护在技能内。

技能覆盖这项工作的三个环节，职责不重叠：

| 环节 | 承担者 | 产出 |
|------|--------|------|
| 会话观察与汇总 | Wopal 识别信号并复用 Maka；Maka 观察、诊断、归类，收尾时汇总成熟信号 | discard / local / candidate / mature 信号，以及经过汇总的成熟问题 |
| 提案撰写 | Maka（仅在 Wopal 明确触发 synthesis 后）；Wopal 也可以撰写 | `docs/evolutions/` 下的进化提案，允许零提案 |
| 提案落地 | Wopal 主控编排、Fae 实施、Rook 审查；批准、验证与交付由用户掌握 | 经隔离实施、验证并归档的能力变更 |

进化提案是落地环节的工作对象，不是代码任务。

### Evolution Workflow States

本体进化提案的状态机与代码开发流程使用互不重合的词汇，使两个流程在同一空间内不会被混淆：

```text
draft → accepted → implementing → validating → archived
```

| 状态 | 含义 |
|------|------|
| `draft` | 提案落盘于本体仓库 `docs/evolutions/`，等待用户审阅 |
| `accepted` | 用户接受提案，进入实施 |
| `implementing` | 实施进行中：隔离 worktree 内的实施提交（或 quick 模式直提空间分支） |
| `validating` | 验证期先行：用户可经验证视图（`switch`）在集成前观察确认；`integrate` 以用户 `--confirm` 为门、在用户确认后执行（亦支持用户显式选择「先集成后验证」） |
| `archived` | 用户确认通过，提案归档 |

提案默认不创建 Issue 载体，Issue 仅在用户明确要求时引入；实施评审是落地流程内的强制门、不可跳过。

推进状态记在提案的 `Stage` 字段。与代码开发流程相比，字段名与词表都不重叠；与设计文档的 `Status` 字段（Draft / Proposed / Active）相比，词表出现一个同形词 `draft`，靠字段名区分。三者同处 `docs/` 之下，字段名是主要的区分依据。状态推进由机制命令承担，Agent 不手改 `Stage` 字段；机制命令的唯一操作面是 CLI `space evo` 命令族（契约见 `../../projects/wopal-cli/docs/DESIGN-evolution.md`）。

### Evolution Documents

进化提案文档位于本体仓库的 `docs/evolutions/`。提案描述的是本体自身的变更，因此与它所改变的能力资产同处一条版本控制谱系：随装配分发到每个空间，并随 `space sync` 与 原生 Git/GitHub PR 汇入能力池与上游。任何空间都能读到完整的进化历史。

| 位置 | 内容 |
|------|------|
| `docs/evolutions/<name>.md` | 活跃提案，等待审阅或正在实施 |
| `docs/evolutions/archived/` | 已完成提案 |
| `docs/evolutions/backlogs/` | 暂缓提案 |

### Isolation Discipline

本体能力的改动先在空间侧落地，再经 `space sync` 汇入 local main，最后由用户决定是否经 原生 Git/GitHub PR 回流上游。默认实施模式是**从 `.wopal` 派生稀疏 worktree**：派生的 worktree 继承空间的稀疏装配范围，实施边界因此天然等于空间确权的能力范围，宿主中央仓库无需切换分支。

快速模式在 `.wopal` 空间分支内直接小步提交，适用于 typo、bug-fix、普通能力新增以及用户明确指定的小范围文件改动；判定不清或涉及独立设计/高风险验证时才进入隔离提案模式。

稀疏装配带来三条硬约束：

1. **范围外文件由 Git 原生拒绝暂存**。需要新增能力目录时，提交前先扩宽实施侧稀疏范围以使内容可写，再按名暂存；验证期由 `switch`（或集成）扩宽 `.wopal` 稀疏范围并重新物化，验证者即可看到新能力。
2. **skip-worktree 位是装配范围的派生状态，禁止批量清除**。调整可见范围一律通过扩展装配完成；配置缺失且位被批量清除时，全量暂存会把范围外文件记为删除。
3. **合并与对象层不受稀疏影响**。分支推进、squash 合并与树比较都在对象层完成，稀疏只决定哪些文件落到磁盘。

### Delivery Terminal

进化的交付终点由用户拍板：实施产物停留在空间分支，`space sync`（汇入 local main）与原生 Git/GitHub PR（回流上游）均由用户逐次决定，技能不内置自动上行。

贡献流程的操作规范由 `ontology-evolution` 技能单点拥有：分支 `contribute/<slug>`，slug 为 2–4 个英文词、最多 24 个字符；worktree 固定在 `<space-root>/.worktrees/ontology-contribute-<slug>/`，从创建保留到 PR 处理及授权清理结束。Agent 用 `git` 与 `gh` 创建、修复和收尾，正文说明原因、改动、文件与增删统计、范围依据及验证结果。

`ontology status` 合并本地/远端贡献分支与 worktree，按需查询对应 PR，区分未找到、查询失败、open、merged、closed 与身份歧义；不保存贡献记账文件。“已合并，待收尾”只是提示。`ontology sync` 只同步 main；Agent 取得用户删除授权后，核对合并回流、干净现场与分支 head 无额外提交，再精确清理对应资源。失败与不明状态保留现场。具体服务边界见 `../../projects/ellamaka/docs/DESIGN-wopalspace.md`。

加载链路相关改动以用户重启 ellamaka 后的加载结果作为验证标准。

## Maintenance and Distribution Command Surface

空间侧与 ontology 侧命令职责分离，语义稳定：

| 命令 | 方向 | 职责 |
|------|------|------|
| `space status` | — | 只读：refs 双向差异、稀疏健康、当前有效装配、本地选择（include / exclude）与未登记未跟踪文件 |
| `space sync` | 双向 | 先整合空间分支提交、再 fast-forward 下行；按当前装配事实重算范围，并在触及未跟踪路径前拒绝碰撞；CLI 默认 dry-run 预览，`--confirm` 落盘 |
| `space capability add/remove` | — | 无旗标：调整类型默认装配；`--local`：调整本空间装配。`add` 遇到当前 worktree 新建但尚未入池的完整能力时，先安全纳入空间分支共享内容，再完成对应装配 |
| `space evo <family>` | — | 提案落地：提案状态机、隔离实施、稀疏安全落盘、集成与验证切换；CLI `space evo` 命令族为唯一操作面 |
| `ontology capability list` | — | 只读：列出本体拥有的全部能力，供空间装配挑选 |
| `ontology sync` | 三角 | `upstream ⇄ origin ⇄ local main` 三步双向对齐（fork：origin/main merge 进 local → upstream/main merge 进同一 local 结果 → local push origin；clone 仅 origin/main → local），`ontology update` 为兼容别名 |
| `git` + `gh`（技能指导） | 上行 | 选取已验证的主题改动 → upstream PR（fork 模式）；一个 PR 复用一个分支/worktree |

**内容与挂载分界**：文件是否共享由是否进入本体 Git 决定，能力是否被某个空间使用由类型装配单和空间本地覆盖决定。`space capability` 无旗标调整类型默认装配，`--local` 调整当前空间的 `include` / `exclude`；新能力若已经在当前 worktree 创建，`add` 同时负责把完整资产安全纳入空间分支。显式卸载完整资产与共享删除其内容是不同操作。多空间目录删除与重命名以全部适用装配单的候选树引用完整性为门禁，详见 `./DESIGN-assembly.md`。

**未跟踪内容保护**：`space sync`、装配重算和 Evolution 写入在第一个文件变更前计算会触及的精确路径集，并检查这些路径上的未跟踪内容。发生碰撞时拒绝执行并列出路径；未跟踪文件不会被自动暂存、删除或覆盖。决定保留的新能力先扩宽 sparse range并提交到空间分支，再参与正常同步。

`space sync` 由 CLI 默认 dry-run 预览、`--confirm` 落盘，agent 按用户意图直接执行，不设审批门控；`--dry-run` 保留为诊断用途，展示将贡献、将更新与将纳入范围保护的清单。向上游贡献使用 fork 分支上的原生 Git/GitHub PR，clone 模式 `ontology sync` 塌缩为单向下行拉取。

`ontology capability list` 揭示本体拥有的全部共享能力。对已有共享能力，`space capability add/remove` 调整类型默认组合，`--local` 调整本空间挂载；对刚在当前 worktree 创建的新能力，`space capability add` 可以直接完成共享纳管与装配。若只想把能力放入共享池而不改变任何装配，使用普通本体提交即可。

空间内普通能力维护直接在注册空间分支完成并提交，再经 `space sync` 汇入 local main。需要独立设计、跨能力契约或多阶段验证的复杂演进才进入提案流程。空间装配出的能力组合若具备类型通用性，可沉淀为类型装配单，供同类空间复用。

## Distribution Boundary

ontology 的分发走 Git source + worktree 模型。`wopal space init` 与 Web Onboarding 都消费同一 WopalSpace ontology/space application services，将 clone/fork/worktree 与 space runtime 初始化串联；`wopal setup` 只负责打开该 Onboarding。

稳定边界：

1. 默认使用 clone-based canonical source flow。
2. `--fork` 是显式选择的替代模式。
3. `space/<space-name>` 分支承载 space-specific 演化。
4. `<space>/.wopal/` 是 ontology worktree，由 CLI materialize，由 ellamaka 运行时加载。

详细 source 输入、materialization、template handoff 和 runtime loading handoff 见 `./DESIGN-distribution.md`。

## Base Capabilities and Space Overlay

Ontology 通过两层模型为 WopalSpace 提供可覆盖的能力分发：

**User-level capabilities**：用户级能力目录由 setup 创建，不向它们写入 ontology 内容；本体能力通过空间装配进入各自 worktree。DSH profile 的声明模板物理复制到 SDK 返回的当前环境，再由目标产品 init 准备依赖；用户覆盖与固定路径版本数据保持。

**Space overlay**：`<space>/.wopal/skills`、`<space>/.wopal/agents`、`<space>/.wopal/commands`、`<space>/.wopal/rules`、`<space>/.wopal/plugins` 承载当前 space 的定制能力。同名能力由 space overlay 覆盖 base，ellamaka 按优先级顺序加载：

```text
~/.agents/skills
-> ~/.wopal/skills           # base
-> <space>/.wopal/skills     # overlay，优先级最高
```

覆盖机制：ellamaka 先并发解析所有 `SKILL.md`，再按目录优先级顺序串行合并；后出现的同名 skill 稳定覆盖前者。Agents / commands / rules / plugins 的加载机制同理。

本模型将 ontology main repo 的基础能力与各 space 的定制能力解耦：通用能力由 ontology main 统一维护，setup 只负责物化 base capabilities；space 内自由定制增量覆盖。

## System Prompt Self-Evolution

提示词是核心资产。Maka 提炼并提出提案，经用户批准后，由 Wopal 主控、Fae 更新中央仓库的提示词文件，实现跨空间协同进化。

## Design Knowledge Layering

WopalSpace 的设计知识按三层分工，避免细节错位和维护混乱：

| 文档 | 定位 | 内容 |
|---|---|---|
| 产品 DESIGN | 跨项目的稳定架构契约 | 系统分层、子系统职责边界、"谁负责什么"。详细契约和 schema 以项目 DESIGN 为准 |
| 项目 DESIGN | 单个项目的稳定设计真相 | 命令契约、JSON schema、模块架构、数据模型、关键决策。阶段范围和验收以 Phase 文档为准 |
| Phase 文档 | 某阶段的范围与验收条件 | Phase scope、involved projects、exit criteria、风险。架构细节以项目 DESIGN 为准 |

关系：

- 产品 DESIGN 回答"系统如何组成"；项目 DESIGN 回答"单个项目如何实现"；Phase 文档回答"这一阶段要交付什么"。
- 稳定契约只进项目 DESIGN，不进 Phase 文档——Phase 最终归档后不应成为查找架构细节的入口。
- 产品 DESIGN 引用但不复制项目 DESIGN 细节；Phase 文档引用但不复制 DESIGN 契约。
- Phase 讨论中形成的设计决策，在讨论完毕后沉淀到对应项目 DESIGN；Phase 文档只保留范围和验收。
