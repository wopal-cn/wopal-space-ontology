# Plan 编写指南

Plan 有两类读者：**评审的人**（要能看懂你要什么）和**实施的 agent**（要能照着做出来）。

所以 Plan 的职责是写清三件事：**要什么（行为）、什么算做成（验收）、什么不能碰（契约与边界）**。至于改哪个文件、内部怎么组织代码——那是实施时在真实代码上才能做好的决定，写在 Plan 里只会变成束缚和猜测。

一句话：**把契约面钉死，把实现面放开。**

## 契约怎么定：Key Interfaces

`Technical Context > Key Interfaces` 是对外契约章。**入册即红线**。

**什么能进**：跨模块、跨项目、对外的接口——CLI 命令、API 端点、事件、schema、导出的类型。**什么不能进**：模块内部的私有函数、内部辅助类型。放进来它就成了新的逐文件清单，又死板回去了。

**写到什么程度**：签名 + 错误码 + 关键语义（幂等、版本、失败行为）。用项目自己的语言写——TS interface、Python type、JSON Schema 都行，直接代码块。

**一条判据**：下游的人只凭这一节，能写出消费方代码和兼容测试，就算定准了。写不出来，就是还没定完。

**约束力**：实施 agent 要改这里的签名或错误码，必须先回报、修订 Plan，禁止静默改。没有对外契约时写 N/A。

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

写好第一拍的标准只有一条：**这条 AC 能不能抓住坏实现？** 问自己：如果 agent 偷工减料或者做错了，这条判据会不会失败？怎么写都能过的 AC（「功能正常」「代码构建通过」）是装饰品，通不过 submit 之外还有 df-proposal-review 盯着。

**第二拍（实施 RED 阶段）**：实施 agent 把每条 AC 落成真实命令，**原地回填** Plan（变成 `python -m pytest tests/runner/ -v` 全绿 这种样子）。

**complete 硬门**：脚本强制——已勾选的 AC 必须带真实命令，判据式 AC 勾了也过不了 complete。定义权在 Plan（行为清单可评审），执行权在测试（全绿才算数），中间没有缝隙。

**示例演进**：

```markdown
第一拍（写 Plan 时）：
1. [ ] Runner 一致性测试全绿，后台无交互死等
2. [ ] 同一执行 ID 重复 begin 返回相同结果，不重复执行

第二拍（RED 阶段回填后）：
1. [x] `python -m pytest tests/runner/consistency/ -v` 全绿（后台无交互死等由 test_no_stdin_hang 覆盖）
2. [x] `python -m pytest tests/runner/test_idempotent_begin.py -v` 全绿
```

## Task 怎么拆：行为组，不是文件

**一个 Task = 一组高内聚 Behavior + 完整的 RED→GREEN→REFACTOR + 独立可跑的 Verify。**

拆分粒度三问：

1. 这组 Behavior 共享同一批测试吗？（共享 → 同一个 Task）
2. 一次委派，一个 fae 的上下文装得下吗？（装不下 → 拆）
3. Verify 能独立执行吗？（不能 → 边界画错了，重新分）

行为组是**需求侧**概念，Plan 阶段想得清楚；文件是**实施侧**概念，Plan 阶段想不清楚。这正是旧格式死板的根源——用拆分维度换掉它，死板自然消失。

Task 不再设 Files 字段。从哪下手 → Pre-read（指向真实存在的文件）；步骤节奏 → Changes；实际触碰 → Done 回填（唯一事实源）；粗粒度范围 → Plan 级 Affected Files 表。改动面可枚举的小任务（bug 修复、单点调整）也无需提前铺文件清单——Affected Files 表写实际路径即可。

## TDD 怎么写

### Behavior 是规格，不是描述

Behavior（TDD=true 时必填）是可测试的行为规格，写法自由：输入→输出映射、Given/When/Then 都行。判据：**实施 agent 能不猜地把每条 Behavior 直接写成一个失败测试。** 写不出测试的 Behavior = 没写清楚，改 Behavior，不是放宽标准。

```markdown
**Behavior**:
- valid_email("user@example.com") → true
- valid_email("") → false
- valid_email("no-at-sign") → false
```

### Changes 第一条固定是 RED

编号列表格式不变（禁止 checkbox），但第 1 条有了固定语义——把全部 Behavior 落成失败测试：

```markdown
**Changes**:
1. RED：将上述 Behavior 全部落成失败测试并确认失败
2. GREEN：实现 email 验证函数至测试全绿
3. REFACTOR：提取正则常量（如需）
```

### TDD Task 完整示例

```markdown
**Verification Intent**: AC#1, AC#2

**Behavior**:
- valid_email("user@example.com") → true
- valid_email("") → false
- valid_email("no-at-sign") → false

**Pre-read**: `src/validators/pattern.py`

**Design**:
新增 email 验证器，复用 pattern.py 的正则风格。
错误返回 false 而非抛异常（调用方做展示，不适合异常流）。

**TDD**: true

**Changes**:
1. RED：将上述 Behavior 全部落成失败测试并确认失败
2. GREEN：实现 valid_email() 至测试全绿
3. REFACTOR：提取 EMAIL_REGEX 常量（如需）

**Verify**: `python -m pytest tests/ -v` 全部通过

**Done**:
任务产出：email 验证函数 + 3 个测试用例
实际触碰文件：（实施后回填）
- [ ] 实施 Agent 已完成上述功能开发和验证的所有步骤.
```

### 何时用 TDD

**核心启发式**：能在编写 `fn` 之前用 `expect(fn(input)).toBe(output)` 描述行为吗？能 → TDD；不能 → 标准 Task，事后按需加测试。

- **适合**：有明确输入/输出的业务逻辑、API 端点、数据转换、验证规则、算法、状态机
- **不适合**：UI 布局/样式、配置更改、胶水代码、探索性原型、无业务逻辑的简单 CRUD

### TDD 阶段纪律

| 阶段 | 问题 | 处理 |
|------|------|------|
| RED | 测试没有失败 | 功能可能已存在或测试有误，调查后再继续 |
| GREEN | 测试没有通过 | 调试实现，迭代到通过，不要跳到重构 |
| REFACTOR | 测试失败 | 撤销重构，用更小的步骤重试 |

**RED 不失败是最常见的陷阱**：说明测试没真正覆盖预期行为，必须修好再继续。

### TDD 提交建议

按阶段提交（每阶段一个提交，代码在 feature 分支）：

```
test(scope): add failing test for email validation
feat(scope): implement email validation
refactor(scope): extract regex to constant
```

每完成一个 Task 勾选 Plan 中对应 Done checkbox（Plan 文件在空间仓库，独立提交）。

## Task 字段速查

| 字段 | 要求 | 说明 |
|------|------|------|
| **Verification Intent** | 必填 | AC#N；这组行为为哪几条验收负责 |
| **Behavior** | TDD=true 必填 | 可测试规格，能直接落成失败测试 |
| **Pre-read** | 必填 | 实施前该读的文件；无必要写 N/A |
| **Design** | 必填 | 技术方案、关键思路、约束——设计意图写清，不规定到每文件 |
| **TDD** | 必填 | true/false；false 需说明理由 |
| **Changes** | 必填 | 编号列表；第 1 条固定为 RED |
| **Verify** | 必填 | 可执行命令，exit 0 才能勾 Done |
| **Done** | 必填 | 产出说明 + 实际触碰文件 + checkbox |

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

- **Plan 归属阶段**：`Phase` 元数据字段（从 Issue body 继承）。一个阶段按 scope area 拆出多个 Plan，阶段的 `Related Plans` 表是聚合视图。
- **阶段表登记**：仅关联了阶段（元数据携带 `Product` + `Phase`）的 Plan 才在归档时触发阶段文档同步——`archive` 依据槽位行标签末尾的 ` · <plan-name>` 定位行并自动写入 `done`。格式规范见 dev-doc-master 技能 `references/phase.md`。
- **未关联阶段的 Plan** 归档时不做任何阶段文档处理（直接跳过，不警告不报错）。普通功能/修复/重构 Plan 不需要也不应该补写 `Product`/`Phase`，更不允许在阶段表凭空建行。
- **Gap**：唯一真相源是项目 `GAPS.md`。Plan 在 Goal 或 Context 中引用要关闭的 Gap 标识（如 `CLI-G3`），不复制描述。Plan 达到 `done` 且 Exit 判据满足时，从 `GAPS.md` 删除对应条目（编号退役，不复用）。

## 委派 prompt 格式

**Plan 驱动任务**（推荐）：

    ## Plan
    读取 Plan 文件，按 Task <N> 执行：
    <Plan 文档绝对路径>

    ## 上下文
    - 实施工作路径: 项目目录绝对路径 (worktree 绝对路径)
    - 实施基线: Plan Metadata 中 Base Commit（集成分支 HEAD，approve 时记录）
    - 实施自由度: Behavior、Key Interfaces 契约和边界是硬约束；文件组织、内部 API、测试组织由你在最新代码上决定
    - AC 回填: RED 阶段把每条 AC 落成真实命令后，原地更新 Plan 的 Agent Verification
    - 每完成一个 task 的实施和验证, commit git
    - 遵循项目和模块开发规范 (AGENTS.md)
    - <仅在 Plan 之外需要额外强调的事项，无则省略>

    ## 完成标准
    - <简要列出关键验证点>

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**无 Plan 的临时任务**：

    ## 目标
    <一句话>

    ## 上下文
    - 项目路径: /path/to/file

    ## 步骤
    1. 读取相关文件
    2. 修改文件
    3. 运行验证

    ## 完成标准
    - 功能验证通过

    ## Task Report
    完成时输出：Goal/Accomplished/Files/Status

**原则**：有 Plan 时 Plan 是单一信息源，prompt 不重复 Plan 内容。

### 委派 prompt 必含项

每次委派 fae 执行 Plan Task 时，prompt 末尾必须附加：

    完成后在 Plan 文件中编辑对应 Task 的 Done checkbox（- [ ] → - [x]），并在 Done 内回填「实际触碰文件」清单，Plan 文件路径：<空间仓库绝对路径>
    禁止修改 Plan Status 元数据（Status/Worktree/Base Commit 等由 flow.sh 脚本管理）

缺少此指令 = fae 不会主动更新 Plan，导致 Done 全部遗漏。

## 常见错误 TOP 5

| Error | 原因 | Fix |
|-------|------|-----|
| `missing Design` | 跳过了 Design 字段 | 补 `**Design**:` + 实施设计 |
| `TDD=true requires Behavior` | 有 TDD 标记但没写 Behavior | 补可测试的行为规格 |
| `Changes must not use checkbox` | Changes 用了 `- [ ] Step N:` | 改为编号列表 `1. 2. 3.`，第 1 条固定 RED |
| `AC checked but carries no executable command` | 判据式 AC 勾选后直接 complete | RED 阶段把真实命令回填进 AC 条目再勾选 |
| `placeholder: 'TBD'` | 残留占位符 | 替换为实际内容或删除该行 |

## 验证与推进

- `submit` / `approve` 自动运行 `plan check` 校验，无需手动执行
- `approve` 不是第一次检查，而是进入「等待用户评审方案」的节点
- `approve` 被校验拦下 → 修好 Plan 后重新执行 `approve`

## Plan 命名规范

Plan name 是权威标识，用于派生 feature 分支。命名必须精简——Issue title 可自由书写，Plan name 和分支名必须短。

### 命名结构

```
<issue_number>-<type>-<slug>     # Issue 驱动
<type>-<slug>                    # 无 Issue
```

- `type` 使用标准值（feature/fix/enhance/refactor/docs/test/chore/perf），保持全拼
- 不设 `scope` 段——scope 已体现在 `--project` 和 slug 中

### slug 精简规则

- slug = **1-2 个核心名词**，kebab-case，**≤ 20 chars**
- 去掉动词短语和冠词，只留名词核心
- 超长必须截断或改写，禁止照搬 issue title

| 啰嗦（禁止） | 精简（目标） |
|--------------|--------------|
| `implement-multi-space-chat-projector-sync` | `chat-projector-sync` |
| `add-skills-remove-command` | `skills-remove` |
| `support-handling-expired-tokens` | `token-expiry` |

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
| `approve --confirm` | 集成分支 → 创建 feature 分支 | `executing` | 先在集成分支提交 executing + Worktree 元数据，再创建 worktree |
| 实施（executing） | feature 分支 | `executing` | 实施在 feature 分支的 worktree 中进行 |
| `complete` | feature 分支 | `verifying` | Plan-only 提交活动 Plan（脏实施树报错退出） |
| 用户验证 | feature 分支 | `verifying` | 用户在 feature 分支上验证实施结果 |
| `verify --confirm` | 集成分支 | `done` | Plan-only 提交到集成分支 |
| `archive` | 集成分支 | 归档 | 移至 done/，清理 worktree |

**Plan-only commit 原则**：生命周期脚本只提交 Plan 状态变更，不提交实施代码。代码提交由实施 agent（fae）负责。脚本遇到脏实施树时报错退出，而非代为提交代码。