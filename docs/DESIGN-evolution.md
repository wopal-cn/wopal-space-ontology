# DESIGN — Evolution Loop

> **Status**: Active
> **Updated**: 2026-09-27
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

1. **local main 是能力唯一真相源**：共享能力不维护空间私有版本；空间的独有提交是待贡献的进化，不是长期分叉。
2. **`space sync` 定序：先上行、后下行**：先汇入空间独有进化，再 fast-forward 到 local main 最新，最终两分支指向同一提交。
3. **正常推进一律 fast-forward**：空间分支必须可对齐时才能推进；有待贡献提交时先贡献，有未提交修改时先处理工作区。
4. **冲突在隔离临时 worktree（`$WOPAL_HOME/.worktrees/`）中处理**：整合成功才推进 live space 与 local main 引用；失败双方保持原状。
5. **更新/移除/贡献前检查工作区状态**：CLI 以工作区事实为准，不单信 Git 命令退出码。
6. **机制安全，不设审批门控**：CLI 默认 dry-run 预览，`--confirm` 才落盘；agent 按用户意图直接执行 `--confirm`，不引入额外审批门控。安全保障由机制承担——隔离整合、ff-only、冲突即停、工作区检查——最坏结果是未发生变更，而非破坏工作区。`--dry-run` 是诊断工具，不是执行前门控。
7. **共享内容与空间选择正交**：共享资产的 Git 新增、修改、删除随提交上行；空间装配选择以完整能力或 `path:` 身份记录在空间根仓库，只决定当前空间物化范围。共享资产可只在一个空间挂载，其选择不阻止内容上行。
8. **显式选择**：装配命令和新增整项资产的进化集成能更改空间挂载选择；已装配资产的内部文件编辑保持 Git 内容语义。同步范围由当前装配单、能力/`path:` 级选择及临时游离文件保护重算；未提交私有内容不得进入本体 Git，内部文件删除不触发本地卸载。

## Self-Evolution Loop

提案撰写与落地分离：Maka 负责分析会话错误、用户纠偏与记忆中的经验教训，产出进化提案（Wopal 也可以撰写）；空间运行中产生的经验遵循防污染与隔离纪律：

```
会话运行事实 / 报错日志 / 用户纠偏
  │
  ▼
[Maka：分析经验、撰写进化提案]（Wopal 也可以撰写）
  │  • 去具体化：抹除绝对路径与仅在本处成立的业务词
  │  • 泛化判断：是否具备跨空间通用性
  │  • 归属判定：空间私有 / 类型级 / 公共池
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
交付终端：space sync 汇入 local main / ontology contribute 回流上游
  —— 由用户逐次拍板，不在实施路径内
```

核心进化规则：

1. **提案与落地分离，且提案须经用户批准**：Maka 只出提案、不动刀（`edit` 仅放开 `docs/evolutions/`；Wopal 也可以撰写提案）；具体改动经用户批准后，由 Wopal 主控、委派 Fae 规范实施，提交由主控按任务落盘，Rook 审查把关。
2. **进化先落在空间侧，再经 `space sync` 汇入**：空间内正常写改、提交（Agent 仅需 workspace 写权限）——isolated 的逐任务提交先落隔离分支、经 `integrate` squash 进空间分支，quick 直落空间分支；`space sync` 时申请受控提权，将空间独有提交隔离整合进 local main。
3. **项目经验物理隔离**：属于当前项目特有的架构规范写入空间记忆或项目 `AGENTS.md`。空间选择可以只挂载当前空间所需的共享资产；尚未提交的私有资产由显式 `private` 身份和独立内容备份管理，不把共享池内容误称私有内容。

进化粒度遵循严格的防污染纪律：空间私有经验锁死在本地，类型经验作用于类型装配，只有高度抽象且经受反污染审查的通用资产才允许回流中央。

## Capability Evolution Workflow

本体能力进化的执行机制由 `ontology-evolution` 技能承载。该技能是四个核心角色在所有空间类型下的常驻能力：任意空间都能维护与补充自己的本体能力，无需装配代码开发工作流。代码项目开发流程由 `dev-flow` 拥有（见 `./DESIGN-capabilities.md`）；本体能力进化流程由 `ontology-evolution` 拥有。两条流程的对象不同——前者面向 `projects/` 下的代码仓库，后者面向空间自身的本体能力资产。技能同时承载本体维护操作的执行协议（`ontology update` / `space sync` / `ontology contribute` / 能力装配增删）——进化的机制操作与日常维护共用同一套命令面与安全纪律，规范单点维护在技能内。

技能覆盖这项工作的两个环节，职责不重叠：

| 环节 | 承担者 | 产出 |
|------|--------|------|
| 提案撰写 | Maka（分析会话错误、用户纠偏与记忆中的经验教训）；Wopal 也可以撰写 | `docs/evolutions/` 下的进化提案 |
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

进化提案文档位于本体仓库的 `docs/evolutions/`。提案描述的是本体自身的变更，因此与它所改变的能力资产同处一条版本控制谱系：随装配分发到每个空间，并随 `space sync` 与 `ontology contribute` 汇入能力池与上游。任何空间都能读到完整的进化历史。

| 位置 | 内容 |
|------|------|
| `docs/evolutions/<name>.md` | 活跃提案，等待审阅或正在实施 |
| `docs/evolutions/archived/` | 已完成提案 |
| `docs/evolutions/backlogs/` | 暂缓提案 |

### Isolation Discipline

本体能力的改动先在空间侧落地，再经 `space sync` 汇入 local main，最后由用户决定是否经 `ontology contribute` 回流上游。默认实施模式是**从 `.wopal` 派生稀疏 worktree**：派生的 worktree 继承空间的稀疏装配范围，实施边界因此天然等于空间确权的能力范围，宿主中央仓库无需切换分支。

快速模式在 `.wopal` 空间分支内直接小步提交，适用于 typo、bug-fix 与用户明确指定的小范围文件改动；判定不清时默认走隔离模式。

稀疏装配带来三条硬约束：

1. **范围外文件由 Git 原生拒绝暂存**。需要新增能力目录时，提交前先扩宽实施侧稀疏范围以使内容可写，再按名暂存；验证期由 `switch`（或集成）扩宽 `.wopal` 稀疏范围并重新物化，验证者即可看到新能力。
2. **skip-worktree 位是装配范围的派生状态，禁止批量清除**。调整可见范围一律通过扩展装配完成；配置缺失且位被批量清除时，全量暂存会把范围外文件记为删除。
3. **合并与对象层不受稀疏影响**。分支推进、squash 合并与树比较都在对象层完成，稀疏只决定哪些文件落到磁盘。

### Delivery Terminal

进化的交付终点由用户拍板：实施产物停留在空间分支，`space sync`（汇入 local main）与 `ontology contribute`（回流上游）均由用户逐次决定，技能不内置自动上行。

加载链路相关改动以用户重启 ellamaka 后的加载结果作为验证标准。

## Maintenance and Distribution Command Surface

空间侧与 ontology 侧命令职责分离，语义稳定：

| 命令 | 方向 | 职责 |
|------|------|------|
| `space status` | — | 只读：refs 双向差异、稀疏健康、当前有效装配与本地选择（include / exclude / private / 未登记未跟踪文件） |
| `space sync` | 双向 | 先整合空间共享内容、再 fast-forward 下行；上行前阻止已登记的私有内容泄漏，按当前装配事实重算范围；CLI 默认 dry-run 预览，`--confirm` 落盘 |
| `space capability add/remove` | — | 无旗标：调整类型装配单，变更按正常本体 Git 提交上行；`--local`：以能力或 `path:<ref>` 完整身份调整本空间选择，CLI 提交空间根仓库状态，不生成本体内容提交 |
| `space evo <family>` | — | 提案落地：提案状态机、隔离实施、稀疏安全落盘、集成与验证切换；CLI `space evo` 命令族为唯一操作面 |
| `ontology capability list` | — | 只读：列出本体拥有的全部能力，供空间装配挑选 |
| `ontology update` | 下行 | upstream/main → local main，本地中央仓库整合 |
| `ontology contribute` | 上行 | local main → upstream PR（fork 模式；clone 模式不支持） |

**内容与挂载分界**：文件是否共享由是否进入本体 Git 决定，能力或通用路径是否在本空间挂载由装配单和空间选择决定。`space capability` 无旗标调整类型装配单，变更按正常提交上行；`--local` 调整空间根仓库 `space-meta.json` 中的 `include` / `exclude` / `private`，由 CLI 限定路径提交。显式卸载完整资产与共享删除其内部文件是不同操作。新建共享资产可只由当前空间挂载；进化提交/集成根据明确的整项资产归属一次登记，无需对每个内部文件手动 add/remove。多空间目录删除与重命名以全部适用装配单的候选树引用完整性为门禁，详见 `./DESIGN-assembly.md`。

**上行不泄漏私有内容（上行闸）**：`space sync` 上行前校验空间独有提交的变更路径（`git diff --no-renames --name-only main...space/<name>`）是否落在已登记的 `private` 能力根下；命中即拒绝并给出可执行的解除私有登记或撤出提交路径。`include` / `exclude` 只记录挂载选择，不进入内容泄漏判定。写入命令在提交前执行相同私有检查；sync 闸为手动 Git 提交兜底。

`space sync` 由 CLI 默认 dry-run 预览、`--confirm` 落盘，agent 按用户意图直接执行，不设审批门控；`--dry-run` 保留为诊断用途，展示将贡献、将更新与将纳入范围保护的清单。`ontology contribute` 仅在 fork 模式下可用，clone 模式只支持 `ontology update`。

`ontology capability list` 揭示本体拥有的全部共享能力。对已有共享能力，`space capability add/remove` 调整类型默认组合，`--local` 调整本空间挂载；对新建能力，内容先按共享提交或显式私有登记选定归属，再按能力身份确定本空间是否挂载。

空间内日常能力进化由 Maka 提炼为提案、经用户批准后，由 Wopal 主控、委派 Fae 规范实施，提交由主控按任务落盘，再经 `space sync` 汇入 local main，最终经 `ontology contribute` 回流 upstream。空间装配出的能力组合若具备类型通用性，可沉淀为类型装配单，供同类空间复用。

## Distribution Boundary

ontology 的分发走 Git source + worktree 模型。wopal-cli 通过 `wopal space init` / `wopal setup` 封装 clone/fork/worktree 过程，将其与 space runtime 初始化串联。

稳定边界：

1. 默认使用 clone-based canonical source flow。
2. `--fork` 是显式选择的替代模式。
3. `space/<space-name>` 分支承载 space-specific 演化。
4. `<space>/.wopal/` 是 ontology worktree，由 CLI materialize，由 ellamaka 运行时加载。

详细 source 输入、materialization、template handoff 和 runtime loading handoff 见 `./DESIGN-distribution.md`。

## Base Capabilities and Space Overlay

Ontology 通过两层模型为 WopalSpace 提供可覆盖的能力分发：

**User-level base capabilities**：`~/.wopal/skills`、`~/.wopal/agents`、`~/.wopal/commands`、`~/.wopal/rules`、`~/.wopal/plugins` 以及 `~/.wopal/dsh/agents-presets` 是面向所有 space 的基础能力入口。setup 从 `~/.wopal/ontologies/wopal-space-ontology/{agents,skills,commands,rules,plugins,dsh/agents-presets}` 物化它们：macOS / Linux 使用 symlink，Windows 使用 managed copy。DSH Profile（`web` / `ellamaka-tools`）的 `package.json` 与 `cordis.patch.yml` 声明模板则通过确定性物理复制（Copy）物化至 `$WOPAL_HOME/dsh/home/profiles/`，再由 `ellamaka dsh init` 驱动闭包与依赖补齐。

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
