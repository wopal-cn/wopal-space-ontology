---
name: WopalSpace Ontology AGENT RULES
description: WopalSpace soul, regulations, and capability gene toolkit — agents, rules, skills, commands, plugins, templates, and scripts
---

# Agent 开发规范

## 1. 规范文档引用

- DESIGN: `.wopal/docs/DESIGN.md`
- Parent Rules: `.wopal-space/REGULATIONS.md`
- Plugin Rules: `.wopal/plugins/wopal-plugin/AGENTS.md`

## 2. 架构与目录

执行链：修改 ontology 源 → 如涉及加载链路，由用户重启 ellamaka → 在 ellamaka 运行时验证。

本地化审核目录使用 `.wopal/docs/LANG/<locale>/...`；`<locale>` 采用 IETF BCP 47 / RFC 5646 语言标记，例如 `zh-CN`、`en-US`，不要写死 `zh-CN`。

| 目录 | 职责 |
|---|---|
| `agents/` | Agent 灵魂与 permission 配置 |
| `rules/` | 规则定义；共享规则与 Agent 专属规则 |
| `skills/` | 技能定义；脚本放在各 skill 的 `scripts/` 中 |
| `commands/` | 命令定义；`commands/wopal/` 存放 Wopal 专属命令 |
| `plugins/wopal-plugin/` | ellamaka 插件；内部架构和代码规则看子模块 AGENTS |
| `assembly/` | 装配定义：类型装配单、空间骨架、渲染模板 |
| `scripts/` | ontology 维护、git hooks 与辅助自动化脚本 |
| `config/` | 空间级 ellamaka 配置层 |

## 3. 开发命令

| 场景 | 命令 | 时机 |
|---|---|---|
| 插件构建与测试 | 参见 `.wopal/plugins/wopal-plugin/AGENTS.md` | 插件代码变更后 |
| 内容变更验证 | 提醒用户重启 ellamaka | 涉及加载链路的任何变更 |

## 4. 实现规则

### 多语言

适用范围：`agents/`、`rules/`、`commands/`、`assembly/templates/`、`skills/` 的语义内容。

- 英文正式版是运行时加载源，路径为 `.wopal/` 对应目录。
- 若用户偏好语言不是英文，必须先生成或更新用户偏好语言审核版，审核通过后再同步正式英文版。
- `<locale>` 采用 IETF BCP 47 / RFC 5646 语言标记，不要写死某个具体 locale。
- 审核版标题和正文使用目标语言，禁止中英文标题混杂。
- 本地化模板审核版必须保留正式模板的英文章节标题，只翻译正文、占位说明和表格内容。
- 审核版确认后再更新 `.wopal/` 下对应英文运行源；两个版本语义必须保持一致。
- 对于 `agents/`、`rules/`、`commands/`、`assembly/templates/`，审核版放在 `.wopal/docs/LANG/<locale>/<type>/` 下。
- 对于 `skills/`，审核版放在 skill 同目录，命名为 `SKILL.<locale>.md`；审核通过后同步到 `SKILL.md`。
- 若用户偏好语言为英文，直接更新正式英文文件，不生成英文 locale 变体。

### 技能

- 新建或修改 skill：先加载 `skill-creator` 技能。
- 若用户偏好语言不是英文，先在同一 skill 目录生成或更新 `SKILL.<locale>.md`，审核通过后再翻译同步到 `SKILL.md`。
- frontmatter 必须有 `name`、`description`。
- `description` 负责触发：写清做什么、何时触发；触发条件放 frontmatter，不放正文。
- 正文只写流程、输出、注意事项；长内容下沉 `references/`。
- `scripts/` 只放确定性、可复用逻辑。

### 灵魂提示词: `agents/`

- 灵魂提示词只写：角色定位、决策原则、输出风格、permission。
- 工作流、技能路由、工具 API、委派时机、命令步骤不写进灵魂提示词；这些分别放 skill、command、rule。
- permission 放 frontmatter，配置方法研究 ellamaka 源码和参考，固化到 `ellamaka-config` 技能。

### 命令: `commands/`

- 共享命令放 `commands/*.md`；Wopal 专属命令放 `commands/wopal/*.md`。
- 统一按 `.wopal/assembly/templates/command.md` 编写。
- frontmatter：`description` 必填（≤50 字符）；子任务命令加 `subtask: true`。
- 参数使用 `$ARGUMENTS` 或 `$1...$N`；最大 `$N` 吃掉剩余参数（rest 语义）。

### 规则: `rules/`

- 共享规则放 `rules/*.md`；Agent 专属规则放 `rules/<agent>/`。
- frontmatter 必须有 `trigger`、`description`、`keywords`。
- `trigger` 声明匹配方式（如 `model_decision`）；`keywords` 声明触发关键词。
- 正文只写 Agent 可执行的约束，不写产品意图或实现细节。

### dev-flow Worktree 生命周期

dev-flow 技能的 worktree Plan 生命周期遵循 **Plan 分支归属** 契约：

- `planning` 和已批准的 `executing` 基线位于集成分支（main 或 space/<name>）
- `approve --confirm` 先在集成分支提交 `executing` + Worktree 元数据，再创建 worktree
- `complete` 在 feature 分支上提交 Plan-only commit（`verifying`），脏实施树报错退出
- 用户验证在 feature 分支上进行
- `verify-switch --merge` 在用户明确确认后将 feature 分支集成到 main
- `verify --confirm` 在集成分支上提交 Plan-only commit（`done`）
- `archive` 在集成分支上将已接受 Plan 移至 `done/`，清理 worktree

**Plan-only commit 原则**：生命周期脚本只提交 Plan 状态变更，不提交实施代码。被委派的实施 agent 不提交；主控者检查实施结果并确认 Task Verify 通过后，才创建该 Task 的实施提交。

**Plan 路径与进度所有权**：Plan 文件位于空间仓库 `.wopal-space/plans/<项目>/`，worktree 中不存在 Plan 副本。子代理 prompt 必须使用空间仓库的 Plan 绝对路径，但实施 agent 只读 Plan，不编辑 Plan、不勾选进度。AC 命令、Done、实际触碰文件等进度证据由主控者验收通过后回填。

权威细节见 `skills/dev-flow/SKILL.md` 的「Executing：实施、验收、评审、Agent Verification」与「分支与 worktree 边界」，以及 `references/plan-guide.zh-CN.md` 的「实施交接」。

### 插件

- 插件内部架构、日志、类型安全、错误处理、开发与测试细则，**遵循** `.wopal/plugins/wopal-plugin/AGENTS.md`。

### 代码审查

通用审查方法见 `df-implement-review`（代码改动）和 `df-proposal-review`（方案、进化提案）；本节只写本项目特有的检查点。

- **声明式内容**（`agents/`、`rules/`、`skills/`、`commands/`、`assembly/templates/`）没有自动测试兜底，审查必须直接读文件：
  - frontmatter 字段齐全，触发条件写在 `description` 里。
  - 引用的文件、技能、命令真实存在。
  - 英文正式版与用户偏好语言审核版意思一致；审核版路径没有写死某个具体语言。
- **灵魂提示词**（`agents/`）里出现工作流、技能路由、工具 API、委派时机，算问题。
- **通用性**：技能和灵魂提示词里出现本空间的具体路径、项目名、客户名，算问题。
- **装配单**（`assembly/archetypes/*.yaml`）里列出的每一项能力，必须真实存在于本仓库的能力池中；列了但池里没有，算问题。
- **插件代码**（`plugins/wopal-plugin/`）按该目录的 `AGENTS.md` 审。
- **不该提的意见**：编译、格式、lint 这类 CI 已管的事；个人口味；产品意图（业务规则归用户）。

### dsh-adapter 不变量

- **事件日志折叠 LAST-wins**：每条消息的 sandbox 覆写必须无条件追加 `sandbox/mode`，包括与空间默认值相等的取值——「恢复默认」需要显式事件；跳过与默认值相同的追加会让先前的覆写继续生效。只有缺失 `extra.sandboxMode` 才表示「保持当前折叠」（见 poc DESIGN-dsh-poc §4.5）。
- **权限 frontmatter 不带通配符**：agent 的 `permission:` 块不得声明 `"*": allow` 形式的条目（引擎默认值已提供）。求值是对深合并的多副本 frontmatter 按 LAST-wins 进行，因此通配符可能因键顺序不同而静默覆盖显式的 `ask`（见 poc DESIGN-dsh-poc §6.8）。任何权限改动后，在活实例上通过 `GET /agent` 验证合并后的规则顺序。
- **投影给模型的工具 schema 必须忠实于容器声明**：JSON Schema→zod 转换必须保留 `oneOf`/`anyOf`（null 分支折为 nullable）、`enum`、`const` 以及每个属性的 `description`，只有真正不支持的节点才降级为 `z.unknown()`。dsh 会用自己的 schema 重新校验每次调用，模型看不见的约束正是模型会猜错、dsh 会随后拒收的约束（`insert_line` 被投影成 `any` → 模型发字符串 → `oneOf branch (matched 0)`）。保真度属于转换器，不属于逐工具补丁——provider 每次请求重读容器活 schema，一次转换器修复即覆盖所有已投影工具与未来所有参数。验证必须对照已安装 dsh 运行时的全部投影工具 schema（schema 检查 + 与 `validateJsonSchemaValue` 的接受/拒绝一致性），绝不对手写样例验证。

## 5. 测试

- 插件代码遵循 TDD：先写失败测试，再实现代码使测试通过。
- 本项目声明式内容变更后，提醒用户重启 ellamaka 验证加载结果；验证通过前不要频繁提交。

## 6. 用户补充规则

- 禁止把审核版路径写死为 `zh-CN`。
- 禁止在技能或灵魂提示词中写死与本空间或某些具体的任务高度相关路径或信息,影响通用性.
