---
name: ontology-evolution
description: |
  本体能力进化流程。覆盖这项工作的两半：把运行中获得的经验——会话错误、用户纠正、记忆中沉淀的经验教训与解决方案——写成进化提案；以及把已批准的提案安全落地（隔离实施、验证、归档）。提案通常由 Maka 起草，这是它的核心使命；Wopal 也可以撰写，并主控落地过程。Fae 负责落地变更，Rook 负责审查；批准、验证与交付由用户掌握。

  必须加载的场景：
  - 把会话中的经验教训、错误或用户纠正沉淀为持久能力
  - 判断一条知识该住在哪里（空间记忆 / 类型装配 / 中央池）
  - 产出供用户批准的进化提案
  - 在候选能力进入能力池之前，审查它是否夹带项目私有污染
  - 推进进化提案的阶段，或查看某项进化的状态
  - 实施对本体自身能力（skills、rules、agents、commands、plugins、assembly）的变更
  - 在空间内创建、更新、分发或贡献本体能力资产
  - 任何「进化提案 / evolution proposal / evolution stage / 能力进化」类请求

  Object test：本体能力资产（本空间自己的 skills、rules、agents、commands、plugins、assembly、docs/evolutions）→ 本技能。`projects/` 下的代码仓库 → dev-flow，不用本技能。
---

# ontology-evolution — 本体进化

把运行中获得的经验，沉淀为本体的持久能力——并让这项改进安全落地。

一切汇聚于同一件产物：**进化提案**——`docs/evolutions/` 下的一个文件，写明要改什么、为什么、如何验证。撰写与落地是同一流程的两个环节；落地永远等待用户的明确批准。

## 角色与分工

| 角色 | 做什么 | 绝不做什么 |
|------|--------|------------|
| **Maka** | 核心使命：分析会话中的错误、用户纠正、以及记忆中沉淀的经验教训与解决方案；撰写并打磨 `docs/evolutions/` 下的进化提案 | 触碰本体能力资产、运行落地流程 |
| **Wopal（主控）** | 也可以撰写提案。主控落地全过程：在用户批准后受理提案、编排并委派实施、验证每个 task 并回填记录、逐 task 提交、推进阶段与用户门控，直至归档 | 不亲自改动资产（落地由 Fae 执行） |
| **Fae** | 落地变更——在隔离工作树内修改能力资产 | 提交；编辑提案；移动提案阶段 |
| **Rook** | 实施评审——在邀请用户验证之前审查交付物 | 修任何东西 |
| **用户** | 在落地开始前批准提案；选择验证方式并验证；把守集成门控；决定交付 | — |

提案本身从不构成实施授权：无论由谁撰写，每份提案都要等待用户批准后才能落地。跨过这道门之后，安全靠机制保证——隔离、按名暂存、可见性校验——而不是靠信任。

---

# 编写进化提案

目的不是记录发生了什么，而是改变能力，让同样的情况下次处理得更好。

## 值得观察的来源

| 信号 | 表现 | 通常意味着 |
|------|------|------------|
| 会话错误 | 一次失败暴露了错误假设 | 缺一道护栏 |
| 用户反复纠正 | 用户就同一行为纠正了不止一次 | 某条规则缺失或不清楚 |
| 记忆中的教训 | 记忆里沉淀着还没有任何能力承载的教训、临时绕法或修复 | 它应该住进某个资产 |
| 重复劳动 | 同一个辅助方法或路子被反复重建 | 应该抽成一项能力 |
| 有效模式 | 某个做法效果特别好 | 值得固化，让它可以复现 |

例行完成不是经验。要找的是「行为本应不同」的那个时刻。

## 先剥离具体情况

- 绝对路径、项目 / 产品 / 客户名、只在此处成立的业务词 → 换成通用措辞或直接去掉
- 会话 id、时间戳、提交哈希 → 去掉

检验标准：一个从未见过这个空间的读者，也能理解并运用这条经验。

## 判断归属

| 层级 | 去向 | 适用情形 |
|------|------|----------|
| **空间私有** | `.wopal-space/memory/` 或项目的 `AGENTS.md` | 只在本空间 / 本项目成立 |
| **类型级** | `config/types/<type>.yaml` 装配，或类型范围内的资产 | 对一切同类型空间成立，对其他类型不成立 |
| **公共池** | 中央池（`agents/`、`skills/`、`rules/`） | 对任何类型的任何空间都成立 |

依次自问：换一个空间成立吗？换一个同类型的项目成立吗？对任何空间都成立吗？「也许」不算「是」——拿不准就往低层放。局部的经验日后可以提升；被污染的池子很难清洗。

## 落笔

`wopal space evo new "<title>"` 会从 `templates/proposal.md` 生成 `docs/evolutions/<name>.md`，初始 `Stage: draft`。模板是提案形态的唯一来源——每一节都要填写；残留占位符会在 `accept` 时被拒绝。

- 进化提案文档使用用户偏好语言编写；模板的标题与字段标签保持原样。
- 每条主张都要有证据锚点：会话事实、错误、用户纠正、代码位置（`file:line`）。未验证的话必须标注为未验证。
- 少而扎实胜过多而单薄。一次分析可能产出多条候选——一条候选一份提案。

## 交接

落盘的提案就在等待用户阅读；只要它还是提案，作者可以继续打磨。用户批准之后进入落地阶段，由 Wopal 主控。

---

# 落地已批准的提案

落地纪律由 wopal-cli 保证——先检查、后写入、按名暂存、隔离与可见性校验。本节记录的是命令管不了的部分：角色分工、用户决策点与验证哲学。落地操作全部通过 `wopal space evo` 命令族完成。

## 状态机

```
draft → accepted → implementing → validating → archived
```

| 阶段 | 含义 |
|------|------|
| `draft` | 提案在 `docs/evolutions/` 落盘，等待用户阅读 |
| `accepted` | 用户已批准；模式已记录（isolated 派生工作树；quick 什么都不创建） |
| `implementing` | 变更正在落地：工作分支上每完成一个 task 一次提交，强制实施评审也发生在这里 |
| `validating` | 用户观察期：变更在验证视图中观察（或用户在显式选择后走先集成路径）；返工落在工作分支上 |
| `archived` | 用户已确认；提案归档 |

状态机一次推进一条边；合法的前进边是 `draft → accepted`、`accepted → implementing`、`implementing → validating` 与 `validating → archived`。评审不占据阶段：它是 `implementing` 内的强制评审门——在每个 task 都落成逐任务提交、且通过 Wopal 的验证之后运行，在邀请用户验证之前。不可跳过；预算 2 轮，首轮必须一次列全所有发现。没有回退边——已落地的变更要返工，是发新提交，不是回退阶段。

**阶段词汇与 dev-flow 刻意完全不同**（`planning / reviewing / approved / executing / verifying / done`）。混用两套词汇会让 agent 把两个流程弄混——永远不要「统一」它们。

## 角色×命令矩阵

矩阵是「谁执行什么」的唯一真相源；下面的落地时序只做顺序叙述。

| 动作 | 执行者 | 触发 / 条件 |
|------|--------|-------------|
| `new`——创建提案骨架 | 提案作者（Maka；Wopal 代写时即作者本人） | 一条沉淀出的经验要求变更；此时什么都还没实施 |
| `accept`——过门禁、记录模式、派生工作树 | Wopal（主控） | 用户已阅读并批准提案 |
| `advance`——推进一条阶段边 | Wopal | 该边到期：`accepted → implementing` 在受理后；`implementing → validating` 在评审通过后；`validating → archived` 在用户确认且集成完成后 |
| `commit`——将一个 task 的成果落盘 | Wopal | 该 task 通过 Wopal 的验证且记录已回填（每完成一个 task 一次提交） |
| `integrate`——把隔离工作 squash 进空间分支 | Wopal | 用户明确确认验证通过，或明确选择先集成后验证 |
| `archive`——归档提案并清理隔离 | Wopal | 用户已确认；阶段为 `archived` |
| 记录回填 | Wopal（唯一作者） | 每个 task 验证之后、该 task 提交之前 |
| 实施评审 | Rook | 全部 task 实施完毕且通过 Wopal 验证、尚未邀请用户验证之前；强制评审门，2 轮预算 |
| 集成门控 | 用户 | 在验证完成后（或作为显式的先集成选择）为 `integrate` 放行 |

## 记录协议

记录是提案自己的台账：task 的完成勾选、任务产出、以及实际触碰的文件。它位于提案的 `Done` 段，四条规则保证它可被信任：

- **唯一作者：主控（Wopal）。** 每条记录都由 Wopal 填写。实施 agent 绝不编辑提案文件——不碰记录，也不碰它的任何其他部分。实施只编辑能力资产；提案是 Wopal 的台账。
- **只有一份副本，位置由模式决定。** isolated：隔离工作树内的提案副本（处于验证视图时，是 `.wopal` 检出中的同一份分支副本）。quick：空间工作树（`.wopal`）中的提案副本。每个模式只有一份记录副本在场——绝不在别处再留一份。
- **时机：验证之后、提交之前。** 一个 task 的实施通过 Wopal 的验证后，Wopal 回填该 task 的记录，记录随该 task 的提交一起入库。
- **isolated 模式下，绝不在空间侧记录。** 不要针对空间分支副本编辑记录，更不要在其上提交记录。三条耐久理由：
  1. 空间侧记录无法随工作分支回滚：隔离工作一旦被丢弃或重做，记录会留在原地，声称一个从未落地的完成。
  2. 未提交的空间侧记录编辑的正是提案文件本身——squash 要携带的那条路径——而集成不会覆盖此处的并发编辑：这种重叠会阻塞集成或产生冲突。
  3. 同一文件两侧都在编辑，同一批行就会分叉；`integrate` 的 squash 恰好会在记录所在的那些行上冲突。

### 每完成一个 task 一次提交

- 实施不提交。
- Wopal 对每个已完成且通过验证的 task 恰好提交一次——该 task 的代码加上提案更新（记录），同为一个逐任务提交。落在工作分支上：isolated 模式为特性分支，quick 模式为空间分支。
- 命令从空间根运行：`wopal space evo commit <name> -m "<message>"`。
- 并行在途时，`--paths` 点名本 task 的文件加提案文件；串行或独占时可以省略（见「并行实施规范」）。

## 并行实施规范

同一隔离工作树可能同时承载多个 task（一波实施者），因此提交规则更严格：

- **`--paths` 的默认集合。** 省略 `--paths` 会收集该工作树的全部已跟踪改动，加上提案文件自身；回执会列出每一个被提交的路径。串行或独占的工作可以依赖这个默认。
- **三种情况必须显式给 `--paths`：**
  1. **纳管新文件。** 未跟踪的新文件不在默认集合里——必须点名，否则不会随提交入库。
  2. **并行在途时收子集。** 同一工作树里有其他 task 的在途改动时，省略 `--paths` 会把它们一并扫入；点名本 task 的文件加提案文件。
  3. **instant 模式。** 它没有默认：`-m` 与 `--paths <p>...` / `--all` 二选一，都是必须的。
- **并发被拒原样重试。** 提交因并发操作被拒（索引繁忙、竞态）时，原样重跑同一条命令；不要围着它去「修」状态。
- **绝不处置他人的文件。** 他人的文件与工作区状态一律原样留下。
- **工作区保护。** 共享工作树里，绝不运行 `git reset`、`git checkout`、`git restore`、`git clean` 或 `git stash`——其中任何一条都可能悄悄扔掉邻近 task 的未提交工作。遇到任何异常——冲突、看不懂的脏状态、别人的编辑——停下并上报。

## 验证与集成门控

评审通过——现在由用户决定怎么验证。先询问用户，并优先推荐分支切换：它不需要在决策前做任何集成，运行时直接加载特性分支。

**首选——分支切换。** 从空间根运行：

```bash
wopal space evo switch <name>    # enter——.wopal 检出特性分支
# 重启 ellamaka 并观察
wopal space evo switch <name>    # back——.wopal 回到空间分支
```

进入会把 `.wopal` 的检出移到记录的特性分支上——隔离工作树让位（它的提交始终留在分支上），稀疏范围按分支变更扩宽——于是下一次 ellamaka 启动加载的正是分支内容。同一条命令即切回（`direction=back`）；它从不重建工作树。观察中发现的修复就地提交——视图内 `wopal space evo commit <name>` 落在 `.wopal`，仍在特性分支、仍无登记——然后重复观察。

**备选——先集成后验证。** 仅当用户显式选择这个顺序时：评审通过、进入 `validating` 之后，Wopal 提前运行 `integrate --confirm`——集成随即完成。用户在空间分支上观察；返工是空间分支上的新提交——instant 模式，绝不二次 squash——且落地时序中后置的 integrate 一步被跳过。

**门控。** `wopal space evo integrate <name> --confirm` 编码的是用户的明确放行——在用户确认验证通过之后，或用户在此之前显式选择先集成后验证。没有 `--confirm`，CLI 零副作用拒绝，确认本身不移动阶段。squash 之后是 `advance --to archived`，然后是 `archive`。

## 命令清单

从空间根目录运行：`wopal space evo <command> [args]`。

| 命令 | 作用 |
|------|------|
| `wopal space evo new "<title>"` | 从 `templates/proposal.md` 生成 `docs/evolutions/<name>.md`，`Stage: draft`；标题受模板中的命名契约约束 |
| `wopal space evo status [name]` | 列出活跃提案；或显示某份提案的阶段与已记录元数据 |
| `wopal space evo check <name\|path>` | 诊断提案（元数据、占位符、结构）与空间工作树的稀疏形态 |
| `wopal space evo advance <name> --to <state>` | 推进状态机；非法跃迁会被拒绝，并把 `Stage` 字段镜像进隔离副本 |
| `wopal space evo accept <name> [--no-worktree]` | 对提案过门禁（占位符 + 结构），然后以事务方式派生或重挂隔离工作树 |
| `wopal space evo commit [<name>]` | 提交一个 task 的成果——先扩稀疏范围、再按名暂存。合法窗口：`implementing`（逐任务提交）与 `validating`（返工）；在验证视图中提交落在 `.wopal` 自身。不带名字即 instant 模式——缺陷修复路径 |
| `wopal space evo switch <name>` | 进出验证视图——把 `.wopal` 的检出在空间分支与记录的特性分支之间移动；仅限 `validating`；一条命令双向；从不重建工作树 |
| `wopal space evo integrate [name] --confirm` | 把隔离工作 squash 进空间分支——仅在 `validating`、且仅在带 `--confirm` 时（集成门控：用户的明确放行——验证通过之后，或显式选择先集成后验证）；拒绝任何会「落地即隐身」的内容 |
| `wopal space evo archive <name> [--keep-worktree]` | 把 `archived` 提案移入 `docs/evolutions/archived/YYYYMMDD-<name>.md`，清理隔离产物 |

命令族的保证（由 CLI 强制，而非靠自觉）：

- **Stage 只由命令写入。** 永远不要手改 `- **Stage**:`；字段找不到的提案无法推进。
- **拒绝先于写入。** 被拒绝的命令不会留下任何改动。
- **绝不整包暂存。** 一律按名暂存，且先扩稀疏范围；没有任何命令会跑 `git add -A`。
- **重复执行是安全的。** 重复 advance 是无操作；重复 accept 会收养或重挂，而不是和既有状态打架。

命令级细节——包括 `commit`/`integrate` 共享的预检——在 `references/commands.md`。

## 隔离实施纪律

默认实施模式：**从 `.wopal` 派生工作树**。派生工作树继承空间的稀疏装配模式，因此它的可见边界等于空间有权拥有的能力集——宿主仓库永不切换分支。

七条约束：

1. **默认隔离。** 工作树从 `.wopal` 派生；`accept` 校验该派生是空间的忠实稀疏副本。
2. **宿主仓库永不切换分支。** `.wopal` 背后的中央仓库承载其他空间依赖的基础能力，始终停留在 `main`；只有 `.wopal` 检出会移动，且只在空间分支与一条记录的特性分支之间移动（用于验证，由 `switch` 执行）。
3. **在空间分支上合并。** squash 在 `.wopal` 内、空间分支上进行，每份提案一次，且只在用户确认（或用户显式选择先集成后验证）之后。
4. **先装配再暂存。** 新能力目录先加入空间范围（先扩范围再暂存）；`integrate` 拒绝任何会「落地即隐身」的路径——已提交但运行时看不见的文件（可见性校验；CLI 契约里叫 "corpus assertion"）。
5. **不要批量清除 skip-worktree 位。** 它们是装配范围的派生态；调整可见范围只能通过扩大装配，让预检去验证范围，而不是靠自觉。
6. **验证 = 重启并观察。** 任何触及加载路径的变更，都以用户重启 ellamaka 后看到的行为为准；测试全绿不能代替观察。
7. **交付是用户的最终决定。** `space sync` 与 `ontology contribute` 一次一个、只在用户发话时执行。本技能不含任何自动上行路径——这是设计，不是遗漏。

### 快速模式

拼写修复、既有资产里的小缺陷修复、以及用户明确圈定的小改动，可以直接落在 `.wopal` 空间分支上——空间分支本身就是对 `local main` 的隔离边界。该模式相对默认流程的具体差异，集中在「落地时序」下（快速模式差异）一次列出。判断不清楚时，走隔离模式。扩大范围是用户的决定，不是 agent 的方便。

### 缺陷立即修复

**缺陷**——既有、已商定的行为出了错——立即修复，不走提案。提案要提供的那道评审，对已经商定的行为早已完成；真正重要的记录是那次提交。

路径是 `wopal space evo commit` 的 **instant 模式**——不带提案名，配 `-m <message>`，且 `--paths <p>...` / `--all` 二选一：

- 直接提交在空间分支上——和快速模式一样，分支即对 `local main` 的隔离边界。
- 安全契约照旧：稀疏状态不健康就拒绝、先扩范围、按名暂存。快路径跳过的是流程，永远不是安全。
- 不产生提案产物，也不移动任何阶段。

没有独立的 `fix` 命令——这是设计，不是缺口；不要新增它、别名或壳。本地卸载（`exclude`）的登记职责属于 `capability remove --local`。

缺陷是**修复**已商定的行为；任何**改变**行为的改动——新能力、契约变更、流程步骤要换种行为——都是进化，走提案流程。分不清时先问。给一个本应评审的改动选择了快路径，比给一个修复选了慢路径更糟。

## 落地时序（Runbook）

按顺序的时序。默认流程：实施不提交 → Wopal 验证并回填记录 → 每完成一个 task 一次提交（代码 + 提案更新）→ Rook 实施评审 → 用户验证 → 用户确认 → `integrate` → 归档。（选择先集成后验证时，第 9 步会让 `integrate` 先于验证执行。）每一步都标注执行者。

1. **提案作者**——撰写提案：`wopal space evo new "<title>"` 生成骨架；填满每一节。
2. **用户**——阅读提案并批准；在这之前什么都不落地。
3. **Wopal**——受理：`wopal space evo accept <name>`（先过门禁；isolated 模式派生工作树并记录模式）。
4. **Wopal**——打开实施阶段：`wopal space evo advance <name> --to implementing`。
5. **Fae**——在隔离工作树内实施各个 task。不提交，不编辑提案。
6. **Wopal**——每个 task：验证实施、回填记录，然后提交一次——该 task 的代码加上提案更新，同为一个逐任务提交：`wopal space evo commit <name> -m "<message>"`（并行在途时显式给 `--paths`）。重复直到全部 task 到位。
7. **Rook**——实施评审：强制评审门，预算 2 轮，首轮一次列全所有发现；不可跳过。发现的问题在阶段仍为 `implementing` 时以返工提交修复，然后复评。
8. **Wopal**——评审通过：`wopal space evo advance <name> --to validating`。
9. **Wopal**——询问用户怎么验证，优先推荐分支切换，然后准备所选方式：
   - 分支切换：`wopal space evo switch <name>` 进入视图（`direction=enter`）；继续第 10、11、13 步。
   - 先集成后验证（仅限用户显式选择）：现在运行 `wopal space evo integrate <name> --confirm`——集成随即完成；用户在空间分支上观察，第 11、13 步跳过（从第 12 步继续）。
10. **用户**——重启 ellamaka 并观察。发现问题时：Wopal 在观察所在的工作分支上提交修复（视图内，或提前集成后的空间分支），然后重复观察；通过则继续。
11. **Wopal**——仅分支切换方式：离开视图——`wopal space evo switch <name>` 切回（`.wopal` 回到空间分支）。
12. **用户**——确认验证通过。
13. **Wopal**——仅分支切换方式（先集成后验证已在第 9 步完成集成）：集成门控放行——`wopal space evo integrate <name> --confirm`。
14. **Wopal**——`wopal space evo advance <name> --to archived`，然后 `wopal space evo archive <name>`（带日期命名 + 清理隔离）。
15. **用户**——交付决定（`space sync` / `ontology contribute`），一次一个，只在用户发话时。

### 快速模式差异

- 受理换成 `wopal space evo accept <name> --no-worktree`——只记录模式，什么都不创建。
- 没有隔离工作树、没有特性分支：每个逐任务提交直接落在空间分支上（`wopal space evo commit <name>`），提交即原子登记。
- 没有 `switch`：不存在要进入的视图；验证就在空间分支上进行（重启 ellamaka 并观察）。
- 没有 `integrate`：跳过——工作已经在空间分支上了。
- 其余一切——记录、每完成一个 task 一次提交、评审门、用户确认、归档——都不变。

## 命令用法

运行目录：以下每条命令都从**空间根**运行——即持有 `.wopal/` 的那个目录；空间会从工作目录解析，也可以用 `--space <name>` 指定。`--paths` 的条目以被提交侧的工作树根为基准（isolated：隔离工作树；quick / instant：`.wopal`）——永远不要加 `.wopal/` 前缀。

### 逐步命令

1. **受理**（空间根）：
   ```bash
   wopal space evo accept enhance-example
   ```
   预期：门禁通过；模式、工作树与分支写进提案，`Stage: accepted`。
2. **打开实施阶段**（空间根）：
   ```bash
   wopal space evo advance enhance-example --to implementing
   ```
   预期：`Stage` 为 `implementing`；记录副本出现在隔离工作树中。
3. **逐任务提交**（空间根；每个已完成且验证通过的 task 重复一次）：
   ```bash
   wopal space evo commit enhance-example -m "feat: land task 1" --paths skills/example/SKILL.md docs/evolutions/enhance-example.md
   ```
   预期：特性分支上出现一个提交，携带该 task 的文件加提案更新；回执列出每个被提交的路径。
4. **实施评审**——没有命令；Rook 阅读已提交的交付物。
5. **进入验证视图**（空间根；评审通过且用户选了分支切换之后）：
   ```bash
   wopal space evo advance enhance-example --to validating
   wopal space evo switch enhance-example
   ```
   预期：`direction=enter`；`.wopal` 现在承载特性分支；重启 ellamaka 观察。
6. **离开视图**（空间根）：
   ```bash
   wopal space evo switch enhance-example
   ```
   预期：`direction=back`；`.wopal` 回到空间分支；不重建任何工作树。
7. **集成**（空间根；只在用户的明确放行下——验证通过之后，或显式选择先集成后验证）：
   ```bash
   wopal space evo integrate enhance-example --confirm
   ```
   预期：特性分支 squash 进空间分支；`Final Commit` 被记录；分支对齐到 squash。
8. **归档**（空间根）：
   ```bash
   wopal space evo advance enhance-example --to archived
   wopal space evo archive enhance-example
   ```
   预期：提案移入 `docs/evolutions/archived/YYYYMMDD-enhance-example.md`；隔离工作树与分支被清理。

### 端到端示例

```bash
# 全部从空间根运行
wopal space evo accept enhance-example
wopal space evo advance enhance-example --to implementing
# -- task 1 完成并验证；记录已回填 --
wopal space evo commit enhance-example -m "feat: land task 1"
# -- task 2 完成并验证；记录已回填 --
wopal space evo commit enhance-example -m "feat: land task 2"
# -- Rook 实施评审通过；用户选择了分支切换 --
wopal space evo advance enhance-example --to validating
wopal space evo switch enhance-example     # enter；重启 ellamaka 并观察
wopal space evo switch enhance-example     # back，用户反馈之后
# -- 用户确认验证通过 --
wopal space evo integrate enhance-example --confirm
wopal space evo advance enhance-example --to archived
wopal space evo archive enhance-example
```

---

# 维护协议

除进化生命周期之外，本技能还负责本体的维护面：实例更新、空间对齐、能力装配。

## 命令面

| 命令 | 方向 | 职责 |
|------|------|------|
| `wopal space status` | — | 只读：空间分支相对 `local main`（可贡献 / 落后）、远端差异、装配状态与稀疏一致性、本地选择（include / exclude / private）以及未注册的未跟踪文件 |
| `wopal space sync [--confirm]` | 双向 | 与 `local main` 对齐：先把空间独有的进化向上整合（隔离工作树、冲突即停），再快进向下 |
| `wopal space capability add/remove <kind>:<name> [--local]` | manifest / local | 共享通道：编辑原型 manifest 并重新物化；只接受能力池已有的能力（池中不存在的名字在触碰 manifest 之前就被拒绝），且**不产生 Git 提交**——提交 manifest 是单独的显式步骤。`--local`：把完整资产挂载或卸载为本空间的本地选择（include / exclude / private）；状态变化时，CLI 限路径提交空间根仓库——这是状态记录，不是内容。内容上行始终只经用户自己的 `space sync` / `ontology contribute` 决定，与该状态提交分开 |
| `wopal ontology capability list` | — | 只读：能力池拥有什么——`space capability add` 的选择清单 |
| `wopal ontology update [--confirm]` | 向下 | `upstream/main` → `local main` |
| `wopal ontology contribute --message <msg> [--include/--exclude <glob>] [--confirm]` | 向上 | `local main` → 上游 PR（fork 模式；在隔离工作树中 squash 合并；冲突时 `--resume` / `--abort`） |

## 读状态

`wopal ontology status` 报告双向流：**向下**（`upstream → origin → local main`）与**向上**（`local main → origin → upstream`），后者以待办文件集呈现。

`wopal space status` 报告空间链接：**可贡献** 还是 **落后 local main**、装配状态、以及**本地选择**——`include`（额外挂载：仅本空间挂载的共享内容）/ `exclude`（本地停用的类型默认）/ `private`（私有持有的未跟踪内容）——外加未注册的未跟踪文件。private 内容受保护：下方上行门禁会拒绝任何触碰已登记为 private 的能力根的同步提交。

## 双通道与上行门禁

`space capability` 有两条通道。不带 `--local` 时，改动编辑装配 manifest 并重新物化——但自身不产生提交，且只接受能力池已有的能力，所以提交 manifest 是单独的步骤。带 `--local` 时，只写空间的本地选择（`include` / `exclude` / `private`）并调整稀疏范围；状态变化时，CLI 限路径提交空间根仓库——状态记录，不是内容。上行另作决定：只有用户自己的 `space sync` / `ontology contribute` 步骤才会把东西送上去。对本地停用（`exclude`）的能力执行 `add --local` 也是恢复出口。

向上整合之前，`space sync` 会检查**上行门禁**：任何空间独有提交都不得触碰已登记为 `private` 的能力根（`include` / `exclude` 是挂载选择，从不阻断共享内容）。命中即拒绝同步并给出补救：撤回该提交，或注销登记。门禁为手动 `git add`/`commit` 私有内容兜底：本地隔离不依赖操作者记得规则。

## 执行立场

CLI 默认 dry-run 预览；`--confirm` 落地执行。既定立场：agent 直接依用户意图行事并传 `--confirm`——不额外叠加审批门；`--dry-run` 是诊断，不是前置条件。安全来自机制：隔离集成、仅快进、冲突即停、工作树校验——最坏情况是「变更没发生」，而不是「工作树被搞坏」。唯一例外是 `ontology contribute`：每次贡献都是用户的决定，一次一个。

## 贡献范围与主题 PR

范围与用户一起、基于证据确定：

1. 先枚举全部待处理路径（`git diff --name-status <base>...<target>`），按目录 / 功能域分组，逐组标注「共享」或「类型专属」——先展示完整清单，再问任何问题。
2. 按结构归类，不凭感觉：共享 = 对每种空间类型都有意义；类型专属 = 只对一种类型有意义。不确定时，查能力池（`ontology capability list`）与本体设计，而不是猜。
3. 用户圈定范围：哪些组上行、哪些排除、哪些留在空间内。
4. 空间独有的资产永不出现在任何贡献里。

一个主题一个 PR：`--include` / `--exclude` 从待处理集里划出一份连贯的贡献，`--message` 写清这项变更交付了什么（结果态），而不是机械动作。不相关的工作要拆分，绝不捆在一起。

---

# 边界

- **提案等待用户。** 无论谁写的，只有用户批准后才落地——作者绝不悄悄实施自己的提案。
- **Maka 只写不做。** Maka 的编辑范围是 `docs/evolutions/`；触碰能力资产 = 严重失职。把猜测当作事实呈报，比没有提案更糟。
- **落地：Wopal 主控、Fae 执行、Rook 把关。** 本流程永不自行上行。
- **`/wopal:evolve` 与 `/wopal:distill`** 属于记忆进化回路（日记 → 长期记忆文件 / 记忆库），不是本流程的入口；从这里沉淀出的本体变更，仍走本技能的提案流程。
- **`wopal/ontology-maintain`** 是薄触发器：它以 focus 参数加载本技能，自身不携带协议——上面「维护协议」就是协议。
- **技能只负责规范，执行交给 wopal-cli。** 本技能只有文档和模板，没有脚本；维护与落地的每一步都通过 wopal-cli 命令完成——命令明细见上文「维护协议」与「落地已批准的提案」。
- **装配叠加**：资产经由叠加机制按空间装配（`docs/DESIGN-distribution.md`）；技能操作的是装配后的工作树（`.wopal`），永远不直接操作中央池。

---

# 参考

- 状态机与交付终端：`docs/DESIGN-evolution.md`（Capability Evolution Workflow）
- 命令契约与阶段语义：`references/commands.md`
- 提案骨架：`templates/proposal.md`
- 稀疏隔离背景：`docs/DESIGN-distribution.md`
- 本技能的开发规约：`AGENTS.md`
