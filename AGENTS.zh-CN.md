---
name: WopalSpace Ontology AGENT RULES
description: WopalSpace soul, regulations, and capability gene toolkit — agents, rules, skills, commands, plugins, templates, and scripts
---

# Agent 开发规范

## 1. 规范文档引用

- DESIGN: `.wopal/docs/DESIGN.md`
- Business Rules: `.wopal/rules/business-rules.md`
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
| `templates/` | space init 模板与文档模板 |
| `prompts/` | Agent prompt 模板 |
| `scripts/` | ontology 维护、git hooks 与辅助自动化脚本 |
| `config/` | 空间级 ellamaka 配置层 |

## 3. 开发命令

| 场景 | 命令 | 时机 |
|---|---|---|
| 插件构建与测试 | 参见 `.wopal/plugins/wopal-plugin/AGENTS.md` | 插件代码变更后 |
| 内容变更验证 | 提醒用户重启 ellamaka | 涉及加载链路的任何变更 |

## 4. 实现规则

### 多语言

适用范围：`agents/`、`rules/`、`commands/`、`templates/`、`prompts/`、`skills/` 的语义内容。

- 英文正式版是运行时加载源，路径为 `.wopal/` 对应目录。
- 若用户偏好语言不是英文，必须先生成或更新用户偏好语言审核版，审核通过后再同步正式英文版。
- `<locale>` 采用 IETF BCP 47 / RFC 5646 语言标记，不要写死某个具体 locale。
- 审核版标题和正文使用目标语言，禁止中英文标题混杂。
- 本地化模板审核版必须保留正式模板的英文章节标题，只翻译正文、占位说明和表格内容。
- 审核版确认后再更新 `.wopal/` 下对应英文运行源；两个版本语义必须保持一致。
- 对于 `agents/`、`rules/`、`commands/`、`templates/`、`prompts/`，审核版放在 `.wopal/docs/LANG/<locale>/<type>/` 下。
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
- 统一按 `.wopal/templates/command.md` 编写。
- frontmatter：`description` 必填（≤50 字符）；子任务命令加 `subtask: true`。
- 参数使用 `$ARGUMENTS` 或 `$1...$N`；最大 `$N` 吃掉剩余参数（rest 语义）。

### 规则: `rules/`

- 共享规则放 `rules/*.md`；Agent 专属规则放 `rules/<agent>/`。
- frontmatter 必须有 `trigger`、`description`、`keywords`。
- `trigger` 声明匹配方式（如 `model_decision`）；`keywords` 声明触发关键词。
- 正文只写 Agent 可执行的约束，不写产品意图或实现细节。

### 流程: `wsf/`

- 工作流定义放 `wsf/workflows/*.md`；工作流模板放 `wsf/templates/`。
- `wsf/` 供 WSF 技能族内部消费。
- 本模块由 space-flow 项目产出，完整流程资产参见 `wsf-file-manifest.json`。
- 本模块在用户明确要求时可直接修改，否则应通过 space-flow 项目修改后部署。

### 插件

- 插件内部架构、日志、类型安全、错误处理、开发与测试细则，**遵循** `.wopal/plugins/wopal-plugin/AGENTS.md`。

## 5. 测试

- 插件代码遵循 TDD：先写失败测试，再实现代码使测试通过。
- 本项目声明式内容变更后，提醒用户重启 ellamaka 验证加载结果；验证通过前不要频繁提交。

## 6. 用户补充规则

- 禁止把审核版路径写死为 `zh-CN`。
- 禁止在技能或灵魂提示词中写死与本空间或某些具体的任务高度相关路径或信息,影响通用性.
