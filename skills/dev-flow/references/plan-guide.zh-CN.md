# Plan 编写指南

Plan 有两类读者：**评审的人**（要能看懂你要什么）和**实施的 agent**（要能照着做出来）。

所以 Plan 的职责是写清三件事：**要什么（行为）、什么算做成（验收）、什么不能碰（契约与边界）**。至于改哪个文件、内部怎么组织代码——那是实施时在真实代码上才能做好的决定，写在 Plan 里只会变成束缚和猜测。

一句话：**把契约面钉死，把实现面放开。**

## Plan 与多 Plan 组织

- **一个 Plan = 一份实施**：Issue 为 0..1 个，Target Project 必须且只能有一个。若从 Issue 创建且 Issue 恰好只有一个 `project/*`，可以自动采用；Issue 没有项目标签或有多个项目标签时，必须显式 `--project <name>`。
- **多个 Issue 但只有一份实施**：先 `issue merge --into`，再写一个 Plan；禁止多 Issue Plan。
- **一个已确认的总体目标需要多份独立实施**：分别创建多份 Plan，按 `submit` 进度在 `.wopal-space/plans/active-graph.json` 的 `groups` 中组织；不要仅凭同项目、同 Phase 或时间相近自动建组。Plan 间实施先后只写 Graph `edges`。
- Graph group 不是 Plan，不拥有 Issue、状态机、Acceptance Criteria、worktree 或 Delivery。它只记录整体目标、当前已提交成员及各成员职责；一个 Plan 最多属于一个 group，group 不能嵌套。组织方案已获用户确认后，Agent 机械维护成员即可；具体规则见 `active-plan-graph.zh-CN.md`。
- Plan 之间的当前实施关系不写进 Plan 本身；当前节点、硬依赖和分组统一由 Active Plan Graph 持有。

创建示例：

```bash
flow.sh plan new 42 --project api --type feature --slug endpoint
flow.sh plan new --project api --type feature --slug local-task
```

## 写作风格

Plan 内容使用用户偏好语言，模板的结构性 heading 和字段名保持不变。正文优先用清楚、直接的大白话，让不了解实现细节的人也能评审；能用普通话说明的，不堆技术黑话、缩写和抽象术语。

只有需要精确表达时才使用技术词，尤其是 `Design Source`、`Interface`、`Constraints`、命令、标识符、类型和协议名。不可避免的陌生术语第一次出现时顺手说明它实际意味着什么。同一件事不要在多个字段重复写。

## Plan 必须来自正式设计

项目/阶段 Plan 只以 `Status: Active` 的 DESIGN/子 DESIGN 为设计事实，再拆 Task。每个 Task 用 **Design Source** 指向它实现的具体章节、决策或契约；跨多个设计面就列多个 source。只有没有项目、也没有设计依据的简单 Plan 才可写 `N/A`。

`Draft` / `Proposed` 设计只能放在 Research Findings / References 中作为前瞻参考，并明确其未定案；不能写入 Design Source，也不能据此确定 Behavior、Key Interfaces、AC 或实施目标。

Plan 批准前，发现 Plan 与 Active DESIGN 不一致就修正 Plan；找不到 Active 设计依据，Plan 还不能提交。如果 Active DESIGN 本身与用户目标冲突，不要自行改设计，先让用户决定设计目标。Plan 批准后，实质修改 Plan 或设计都需要用户确认。

## 契约怎么定：Key Interfaces

`Technical Context > Key Interfaces` 是对外契约章。**入册即红线**。

**什么能进**：跨模块、跨项目、对外的接口——CLI 命令、API 端点、事件、schema、导出的类型。**什么不能进**：模块内部的私有函数、内部辅助类型。放进来它就成了新的逐文件清单，又死板回去了。

**写到什么程度**：签名 + 错误码 + 关键语义（幂等、版本、失败行为）。用项目自己的语言写——TS interface、Python type、JSON Schema 都行，直接代码块。

**一条判据**：下游的人只凭这一节，能写出消费方代码和兼容测试，就算定准了。写不出来，就是还没定完。

**约束力**：实施发现签名、错误码或关键语义必须改变时，先停下交回主控流程。能在现有 DESIGN + 已批准 Plan 内解决就继续；需要改 Plan 或设计时，由主控者先向用户确认。没有共享/跨 Task 契约时写 N/A。

顶层 `Key Interfaces` 只放多个 Task 共用或跨模块/跨项目的重要契约。只属于某个 Task 的局部契约写在该 Task 的 `Interface`；Task 使用顶层接口时只引用，不复制一遍。

**示例**：

```typescript
/** 注册 Plan 执行。同一执行 ID 重复调用返回相同结果，不重复执行。 */
interface BeginExecution {
  request:  { executionId: string; planId: string }
  response: { status: 'started' | 'already-running'; revision: string }
  errors:
    | 'APPROVAL_EXPIRED'   // 审批已失效，需重新评审
    | 'DEPENDENCY_PENDING' // 上游未交付
}
```

## 结果怎么盯死：AC 两拍制

Plan 阶段写不出未来的测试命令（测试文件还不存在），这不是缺陷，是现实。两拍制用「定义权」和「执行权」分离来盯死结果：

**第一拍（写 Plan 时）**：每条 AC = 行为判据 + 通过标准。写「系统表现出什么可观察行为、看到什么算过」，允许判据式写法，不用猜未来的文件名。

写好第一拍的标准只有一条：**这条 AC 能不能抓住坏实现？** 问自己：如果 agent 偷工减料或者做错了，这条判据会不会失败？怎么写都能过的 AC（「功能正常」「代码构建通过」）是装饰品，编写和评审阶段必须拒绝。

**第二拍（实施与主控验收阶段）**：实施者在实际实施/Verify 过程中确定每条 AC 对应的真实验证命令，并把命令与结果报告给主控者；主控者验收该 Task 通过后再**原地回填** Plan。实施者不直接编辑 Plan。

`complete` 脚本只检查 Agent Verification 的 checkbox 是否真的完成；命令和证据是否有意义，由主控者真实执行和评审负责，不让正则替人做语义判断。Plan 定义要验证什么，主控者负责真正跑验证并确认结果。

**示例演进**：

```markdown
第一拍（写 Plan 时）：
1. [ ] Runner 一致性测试全绿，后台无交互死等
2. [ ] 同一执行 ID 重复 begin 返回相同结果，不重复执行

第二拍（主控验收 Task 后回填）：
1. [ ] `python -m pytest tests/runner/consistency/ -v` 全绿（后台无交互死等由 test_no_stdin_hang 覆盖）
2. [ ] `python -m pytest tests/runner/test_idempotent_begin.py -v` 全绿

最终 Agent Verification 时，主控者重新运行这些命令并确认通过后再勾选。
```

## Task 怎么拆

一个 Task 应该是一组高内聚的结果/行为，并且有可以独立运行的 `Verify`。不要把所有 Task 强行套进 TDD；是否 TDD 由改动性质决定。

拆分时看三件事：

1. 这是一个完整结果，而不是文件清单吗？
2. 一次实施上下文装得下吗？
3. 结果能独立验证吗？

`Pre-read` 用来传递 Plan 作者已经做过的调查：告诉实施者先读哪些关键文件/文档。它不是预计修改文件表。Plan 顶层 `Affected Files` 只给粗粒度影响范围；真正改了什么由主控验收后回填 `Done`。

### Task 级 Interface 与 Constraints

- `Interface` 可选。只有当前 Task 新增、修改、删除或必须保持某个契约时才写，例如 API/CLI、事件/schema、导出类型或重要模块边界。多个 Task 共用的契约放顶层 `Key Interfaces`，Task 只引用，不重复定义。
- `Constraints` 可选。只写 `Design Source`、`Behavior`、`Interface` 没有覆盖，但实施必须遵守的硬限制。
- 不再设置一个泛化的 `Design` 字段去重复上位设计或 Behavior。

## TDD 判定原则

TDD 是用测试先定义行为的工具，不是“只要改代码就必须交一次 RED 税”。只有同时满足下面三点才写 `TDD: true`：

1. Task 新增、修复或有意改变了可观察行为；
2. 这个行为能在实现前写成自动化断言；
3. 这个测试完成后仍有长期回归价值。

典型 `TDD: true`：业务规则、校验/解析/数据转换、状态机、API/CLI 行为、可稳定复现的 bug 修复。

以下通常写 `TDD: false`：纯行为保持重构、删除废弃内部代码/模块、移动/重命名/import 清理、配置/构建/CI/metadata/依赖调整、UI 布局样式、探索性工作，以及更适合用集成/smoke 验证的胶水接线。

`TDD: false` 绝不等于“不测试”。按风险选择真实验证：已有回归测试、characterization test、build/typecheck/静态检查、集成测试、smoke test 或必要的用户验证。

**删除规则**：删除废弃行为/代码时，同时删除那些只为了证明已删除行为存在的旧测试；仍然保护存续契约的测试要保留或更新。如果删除产生了新的外部行为（例如旧命令现在必须被拒绝），可以只针对这个新行为做 TDD，而不是测试“源码被删了”。

**重构规则**：纯重构应保持现有行为和测试全绿。如果旧代码缺少安全网，先补 characterization/regression tests 锁住当前行为，再重构；不要为了形式制造一个假的 RED。

不要为了覆盖率或流程形式制造琐碎、绑定实现细节、没有长期保护价值的测试；这种测试本身就是维护债务。

### Task 示例

```markdown
**Verification Intent**: AC#1, AC#2

**Design Source**: `projects/example/docs/DESIGN.md#validation-contract`

**Behavior**:
- 合法邮箱可以通过校验。
- 空值或格式错误返回 false，不抛异常。

**Pre-read**: `src/validators/pattern.py`

**Interface**: `valid_email(value: str) -> bool`

**Constraints**: 复用现有校验风格，不改变调用方的错误处理方式。

**TDD**: true

**Verify**: `python -m pytest tests/ -v`

**Done**:
实际触碰文件：（主控验收后回填）
- [ ] 主控者运行 Verify 并验收通过
```

## Task 字段速查

| 字段 | 要求 | 说明 |
|------|------|------|
| **Verification Intent** | 必填 | 本 Task 负责哪些 Agent Verification 条目 |
| **Design Source** | 项目/阶段 Plan | 权威 Active DESIGN 的 `path#heading`；简单无设计任务可 N/A |
| **Behavior** | 必填 | 用大白话写可观察结果；确需精确时再用技术词 |
| **Pre-read** | 必填 | Plan 作者已经确认值得实施者先读的文件/文档；无则 N/A |
| **Interface** | 可选 | 当前 Task 自己新增/修改/删除/保持的局部契约 |
| **Constraints** | 可选 | 其他字段未覆盖的硬实施限制 |
| **TDD** | 必填 | 只有符合上面的 TDD 原则才 true；false 写一句简短理由 |
| **Verify** | 必填 | 可以真实验证本 Task 的命令 |
| **Done** | 必填 | 主控验收 checkbox + 实际触碰文件 |

## Agent Verification 与 User Validation 的边界

### Agent Verification（可自动化的一切）

所有能自动验证的都放这里：测试、lint、typecheck、静态检查、可脚本断言的行为。两拍制见上文。跨 Task 的验证放列表末尾，标注「（跨 Task）」。

禁止纯描述条目：❌「代码构建通过」「功能正常」「无报错」——判据必须能抓住坏实现。

### User Validation（只有用户能验的）

只承载**必须由用户手动执行并观察**的项：UI/UX、交互体验、业务流程、视觉确认。

**写入 UV 前强制二连问**：

1. Agent 能否自动验证此项？→ 能，**禁止列入 UV**，放 Agent Verification
2. 是否必须用户手动执行并观察？→ 否，**禁止列入 UV**

**每个场景必备四要素**：

| 要素 | 要求 | 反例（不合格） |
|---|---|---|
| 验证环境 | 引用项目规范中的验证机制章节或脚本入口 | 只写「启动应用」 |
| 启动命令 | 一条用户可直接复制执行的真实命令 | 「运行命令观察输出」 |
| 通过判据 | 用户可观察到的具体可断言结果 | 「确认行为正确」 |
| 失败反馈 | 失败时用户提供什么（日志路径、diff 输出） | 缺失 |

验证依赖的环境/机制若项目 AGENTS.md 还没记录，必须先补入项目规范再引用，禁止在 Plan 里只出现一次后遗失。

**正确场景示例**：

```markdown
#### Scenario 1: 引导流程无回归
- Goal: 确认引导向导各步骤行为与改动前一致
- 验证环境: 项目 AGENTS.md「验证机制」章节（ELLAMAKA_TEST_ONBOARDING 沙箱模式）
- Precondition: 沙箱模式（WOPAL_HOME=/tmp/wopal-onboarding-sandbox），无需构建
- 启动命令: `ELLAMAKA_TEST_ONBOARDING=1 ./scripts/dev.sh desktop`
- User Actions:
  1. 走一遍引导流程：系统检查 → 安装 CLI → 配置 AI provider
  2. 观察各步骤提示与状态
- 通过判据: 各步骤正常推进、无新增报错、界面无 `[object Object]` 文本
- 失败反馈: 附 `logs/dev/<scope>/ellamaka-dev-desktop.log` 与 `git diff -w` 输出

- [ ] 用户已完成上述功能验证并确认结果符合预期
```

## Metadata 填写规则

`Project Path`、`Project Type`、`Target Project` 从空间 `STRUCTURE.md` 查询：

1. 根据 Plan 涉及的代码路径判断属于哪个域（projects / contents / ...）
2. 在 `STRUCTURE.md` frontmatter 或表格中匹配对应的 path/type/repo
3. 填写映射：

| STRUCTURE.md type | Project Type | Project Path 示例 |
|---|---|---|
| `projects` | projects | `projects/<name>/` |
| `contents` | contents | `contents/<name>/` |

常见错误：把子目录（如 `projects/<name>/packages/app/`）当项目根——应取仓库根目录。

## Plan 与阶段、Gap 的关系

Plan 不新增 Gap 关联元数据字段。阶段与 Gap 的关系由产品阶段文档天然承载，Plan 只需在 Goal 或 Context 中写明所属阶段。

- **Plan 归属阶段**：`Phase` 元数据字段（从 Issue body 或创建参数取得）。一个阶段按 scope area 拆出多个 Plan，阶段的 `Related Plans` 只做范围/Gap/项目 traceability，不复制 Plan 状态。
- **Plan 执行关系**：Plan 级先后、阻塞和当前实施顺序只写入 Active Plan Graph。Phase 只在确有需要时描述 capability-level 顺序，不维护 Plan DAG。
- **归档边界**：`archive` 不再回写 Phase 状态。Plan 在第一次成功 `submit` 后进入 Active Graph，并一直保留到 `archive` 成功；`done` 只是实施生命周期状态，不触发 Graph 退出。Phase 文档不参与这项生命周期同步。
- **未关联阶段的 Plan** 不需要也不应该补写 `Product`/`Phase`，更不允许仅为了显示状态或编排而在 Phase 表中凭空建行。
- **Gap**：唯一真相源是项目 `GAPS.md`。Plan 在 Goal 或 Context 中引用要关闭的 Gap 标识（如 `CLI-G3`），不复制描述。Plan 达到 `done` 且 Exit 判据满足时，从 `GAPS.md` 删除对应条目（编号退役，不复用）。

## Delegation Strategy

根据当前可用 Agent 的能力、Task 依赖和并行关系分配任务；Agent 列只写具体 Agent 名称。

## 实施交接

主控者可以自行实施，也可以委派。无论谁实施，都应加载 `df-implement`；不要在交接 prompt 里复制一遍实施技能。

委派 Plan Task 时只传完成任务所需的上下文：

    ## Plan
    读取 Plan 文件，执行 Task <N>：
    <Plan 文档绝对路径>

    ## Context
    - Working path: <项目/worktree 绝对路径>
    - Baseline: <Plan Metadata 的 Delivery Base Commit>
    - Follow project/module AGENTS.md

    ## Report
    完成时返回：Goal / Accomplished / Files / Verified / AC Commands / Status

Task 本身已经承载 `Design Source`、Behavior、Pre-read、需要时的 Interface/Constraints 和 Verify。被委派的实施者只提交实施结果报告：实际触碰文件、Verify 命令与结果、以及相关 AC 对应的真实命令；**不要提交代码，不要编辑 Plan，不要勾选 Done/AC**。主控者收到报告后检查实际 diff 并独立运行 Task Verify；失败就直接退回修复，成功后才由主控者更新 Plan 证据并创建该 Task 的实施提交。

如果实施者同时就是主控者，仍按“实施 → 主控检查 → 更新 Plan/提交”的顺序；遇到冲突则切回 dev-flow 的冲突处理。被委派实施时，冲突交回 delegator。实施技能负责 STOP/报告格式，dev-flow 负责验收与是否需要升级用户。

## 验证与推进

`plan check` 刻意保持机械：只检查流程真正依赖的结构——`Status` 合法、Product/Phase 成对、Issue 为 0..1、Target Project 与 Project Path 可用，以及 HTML comment / 已知模板占位文本等作者残留。它不判断 Design Source 是否写得好、TDD 是否选对、Behavior 文案、Interface/Constraints 或 User Validation 场景质量；这些属于 Plan 编写和评审。

`complete` / `verify` 只检查完成状态：存在的 Task Done、Agent Verification、User Validation checkbox 必须完成。

- `submit` / `approve` 自动运行 `plan check`，无需手动重复检查。
- `submit` 把 Plan 推进到 `reviewing`，之后才请用户评审。
- `approve --confirm` 只在用户明确批准当前 Plan 后执行；若被校验拦下，修好 Plan 后再执行。

## Plan 命名规范

Plan name 是权威标识，用于派生 feature 分支。命名必须精简——Issue title 可自由书写，Plan name 和分支名必须短。

### 命名结构

```
<issue_number>-<type>-<slug>     # Issue 驱动
<type>-<slug>                    # 无 Issue
```

- `type` 使用标准值（feature/fix/enhance/refactor/docs/test/chore/perf），保持全拼
- 不设 `scope` 段——scope 已体现在 `--project` 和 slug 中

### 按 Issue 找回 Plan

生命周期命令收 `plan-id` 的地方都可以直接给 Issue 编号，解析顺序固定：

1. **文件名前缀**——`<issue_number>-*.md` 命中即用。
2. **元数据回查**——文件名没有编号时（先建 Plan、后挂 Issue），读取唯一的 `- **Issue**: #N` 字段。多 Issue 元数据属于非法 Plan，不再作为兼容回查路径。
3. **活跃优先**——同一编号命中多个 Plan 时，忽略 `done/` 下的归档 Plan，只在活跃 Plan 里选。

仍有两个活跃 Plan 命中同一编号时，命令**直接报错并列出候选路径**，不做猜测。此时用 Plan 名字重新执行，不要改名、也不要再建一个 Plan：

```bash
flow.sh plan status <plan-name>
```

> Plan 名字派生了 feature 分支，事后改名会让 worktree 和分支变成孤儿；重复建 Plan 则会让同一个 Issue 对应两份进度。

### slug 精简规则

- slug = **1-2 个核心名词**，kebab-case，**≤ 20 chars**
- 去掉动词短语和冠词，只留名词核心
- 超长必须截断或改写，禁止照搬 issue title

| 啰嗦（禁止） | 精简（目标） |
|--------------|--------------|
| `implement-multi-space-chat-projector-sync` | `chat-projector-sync` |
| `add-skills-remove-command` | `skills-remove` |
| `support-handling-expired-tokens` | `token-expiry` |

### 命名必须能看懂

合法不等于合格——读者要能光看名字就明白这项工作是干什么的。「精简」和「可理解」是两道独立的检查：

- 名字要说明**对目标对象做了什么**，而不是抽象口号。用具体名词，不用空泛名词：`platform-sdk-release` 能看懂，`platform-delivery` 看不懂；`host-env-fix` 能看懂，`foundation-work` 看不懂。
- 禁用不携带信息的词（`misc`、`foundation`、`delivery`、`support`）。如果这个名字放到一份完全不同的 Plan 上也成立，说明它太模糊。
- 看不懂的名字要在**首次 submit 前**改掉；submit 之后名字已派生分支、被冻结，改用 group `title` 或 Plan 描述来解释。

### 哪些是强制的

命名不是「靠自觉遵守」的约定——它要派生 feature 分支，所以由 CLI 校验：

| 位置 | 校验内容 | 作用对象 |
|---|---|---|
| `plan new` | 完整契约：ASCII kebab-case、type 属标准集、slug ≤ 20 | 每一个新名字 |
| `plan check` | 同上，但不查 slug 长度 | 指向的任何 Plan |
| `submit` / `approve` | 经由 `plan check` | 每个过生命周期的 Plan |

slug 一律由 `--slug` 显式给出，从不从标题派生——标题是自由文本，通常很长，还常常不是英文。这就是 `--type` 和 `--slug` 在两种模式下都必填的原因。

`fix-dsh-pr-102` 是合法名字——`dsh-pr-102` 就是 slug。没有 scope 槽位，所以里面不存在「多余」的段。

### 存量 Plan：不追溯改名

契约生效前创建的 Plan 带有近似 scope 的段、slug 也超过 20 字符。它们**既不改名，也不被拒绝**：

- `plan check` 与生命周期命令对它们只校验字符集，不校验 slug 长度。
- 它们的 feature 分支已经按当前名字派生出来了；中途改名会让 worktree 和分支变成孤儿。
- `done/` 里的历史 Plan 属于历史记录，完全不动。

只有创建是严格的。这样契约才诚实——对「将来创建什么」只有一套规则——同时不把一次命名迁移变成正在进行的工作的阻塞项。

### Plan 目录规则

- 新 Plan 必须先通过 `flow.sh plan ...` 生成或定位，禁止手写创建文件
- `--project` 是必填参数
- 所有项目统一存放在 `.wopal-space/plans/<项目名>/`

## 分支命名规范

feature 分支从 Plan name 派生，必须有界——禁止无长度上限的拼接：

```
<project>-<issue>-<type>-<slug截断>
```

总长超过 55 chars 时截断 slug 并追加 4-char 哈希：

```
<project>-<issue>-<type>-<slug-head>-<hash4>
```

Worktree 目录 = branch。分支名承载「唯一且可映射回 Plan」的职责，不是 Plan name 的全文复刻。

## 分支归属

| 阶段 | 归属分支 | Plan 状态 | 说明 |
|------|---------|----------|------|
| `planning` | 集成分支（main 或 space/<name>） | `planning` | Plan 基线在集成分支上提交 |
| `approve --confirm` | 集成分支 → 创建开发分支 | `executing` | 冻结 Delivery 元数据，先提交 executing + Worktree 元数据，再创建 worktree |
| 实施（executing） | feature 分支 | `executing` | 实施在 feature 分支的 worktree 中进行 |
| `complete` | feature 分支 | `verifying` | Plan-only 提交活动 Plan（脏实施树报错退出） |
| 用户验证 | feature 分支 | `verifying` | 用户在 feature 分支上验证实施结果 |
| `integrate --confirm` | 开发分支 → 集成分支 | `verifying` | 默认 squash 为一条正式提交，标题逐字使用冻结的 `Commit Subject`；记录 Verification/Integration Commit |
| `verify --confirm` | 集成分支 | `done` | 校验已记录的本次 Delivery 提交后，再做 Plan-only done 提交 |
| `archive` | 集成分支 | 归档 | 移至 done/，清理 worktree |

**Plan-only commit 原则**：生命周期脚本只提交 Plan 状态变更，不提交实施代码。Task 的实施提交由主控者在验收通过后创建；被委派的实施者不提交。脚本遇到脏实施树时报错退出，而非代为提交代码。
