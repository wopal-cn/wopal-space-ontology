---
name: WopalSpace Ontology AGENT RULES
description: WopalSpace soul, regulations, and capability gene toolkit — agents, rules, skills, commands, plugins, templates, and scripts
---

# Agent 开发规范

## 规范文档引用

- DESIGN: `.wopal/docs/DESIGN.md`
- Parent Rules: `.wopal-space/REGULATIONS.md`
- Plugin Rules: `.wopal/plugins/wopal-plugin/AGENTS.md`

## 架构与目录

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

## 开发命令

| 场景 | 命令 | 时机 |
|---|---|---|
| 插件构建与测试 | 参见 `.wopal/plugins/wopal-plugin/AGENTS.md` | 插件代码变更后 |
| 内容变更验证 | 提醒用户重启 ellamaka | 涉及加载链路的任何变更 |

## 实现规则

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

### 插件

- 插件内部架构、日志、类型安全、错误处理、开发与测试细则，**遵循** `.wopal/plugins/wopal-plugin/AGENTS.md`。

## 测试

- 插件代码遵循 TDD：先写失败测试，再实现代码使测试通过。
- 本项目声明式内容变更后，提醒用户重启 ellamaka 验证加载结果；验证通过前不要频繁提交。

## Code Review Rules

此标题保持英文原样，Codex 代码审查按它定位本段。

通用审查方法见 `df-implement-review`（代码改动）和 `df-proposal-review`（Plan、设计与进化提案）。
本节只补本项目特有的检查点，不替代 CI、测试或产品意图。

只有当本次 diff 引入了该缺陷，且能给出具体触发条件、受影响行为、改动代码中的证据时，
才报问题。不要报既有问题、个人口味，或 CI 已经负责的内容。

### 能力引用必须可解析

- 适用的 `assembly/archetypes/*.yaml`、agent 的 `permission:` 块、技能中引用的
  每个技能、agent、规则、命令和模板，都必须在同一棵树中存在。
- 新增或删除一项能力时，必须更新消费它的 archetype，以及真正枚举了它的 README 条目。
- 安全路径：旧条目保留到所有消费者迁移完成，或将改名与全部消费者更新放在同一次改动中。
  仅属于单个空间或单一类型的能力，可以只改本类型的装配单或登记 `include`
  （`docs/DESIGN-assembly.md`）。
- 影响：引用无法解析会让空间装配 fail fast（`docs/DESIGN-assembly.md`），
  一个过期名字就能卡住所有 coding 空间。

### 声明式内容必须直接读文件审

`agents/`、`rules/`、`skills/`、`commands/`、`assembly/templates/` 没有自动测试兜底：

- frontmatter 字段齐全，触发条件写在 `description` 里；
- 引用的文件、技能、命令真实存在；
- 英文正式版与用户偏好语言审核版语义一致，审核路径不写死具体语言标签。

### 委派契约必须一致

被委派 agent 加载的技能，不得与控制工作流在“谁提交、谁勾选 Plan 进度、谁回写 AC 命令”
上相互矛盾。安全路径：在技能里明确写出归属方，并把规则限定到真正拥有该状态的工作流。

### 灵魂提示词保持窄范围

`agents/` 里出现工作流步骤、技能路由、工具 API 或委派时机，算问题；
这些内容属于技能、命令或规则（见 §4）。

### 通用性

技能和灵魂提示词里不得出现只属于某个空间的具体路径、项目名或客户名。
安全路径：用空间类型或参数表达不变量。

### 插件代码

`plugins/wopal-plugin/` 按该目录自己的 `AGENTS.md` 审（运行时路径
`.wopal/plugins/wopal-plugin/AGENTS.md`），包括其中的 TDD 规则。

### 不该提的意见

- 编译、格式、lint 等 CI 已负责的内容；
- 个人口味；
- 产品意图和业务规则，归用户决定。

## 用户补充规则

- 禁止把审核版路径写死为 `zh-CN`。
- 禁止在技能或灵魂提示词中写死与本空间或某些具体的任务高度相关路径或信息,影响通用性.

