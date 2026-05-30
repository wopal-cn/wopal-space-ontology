---
description: 创建或更新项目 AGENTS.md
---

# 创建或更新 Agent 规则

创建或更新项目级或目录级 `AGENTS.md`。

**用户输入参数**: `$1` `$2`

**参数说明**: `[路径|项目名] [额外规则上下文]`。路径或项目名必填；仅给项目名时，结合 `.wopal-space/STRUCTURE.md` 和 `projects/` 推断候选，无法唯一确定则确认。

---

## 核心原则

- `AGENTS.md` 是 coding agent 的开发规范，只回答：项目是什么、代码结构在哪里、开发 / 测试 / 验证必须遵守哪些项目技术规则。
- 项目级和模块级 `AGENTS.md` 是 agent 的必读上下文，必须高度精简、准确、无噪音；每条内容都应直接影响开发、测试或验证行为。
- 它不是 README、DESIGN、PRD 或业务规则文档；产品意图、设计细节、业务行为只引用权威文档。
- 项目级文档只写项目边界和跨模块规则；目录级文档只写该目录直接负责的规则。已有子目录 `AGENTS.md` 时，引用它，不复制细节。
- 使用 `.wopal/templates/agent-rules.md`。正式版 `AGENTS.md` 必须保留模板 frontmatter `name` 和 `description`；frontmatter 已有的信息不得在正文重复。
- `name` 写当前项目或目录模块名称；`description` 单行、稳定、无 Markdown，描述当前项目或目录模块职责，并作为 `wopal space scan` 的受控描述来源。
- `description` 不写 roadmap、临时状态、完成进度、营销口号或模糊愿景；无法可靠确定时在方案中标记“需确认”。
- 正文只写项目特定技术实施规则；只写当前实现事实，不写路线猜测。
- 只列有信息量的权威引用；不存在的 PRD / `BUSINESS_RULES.md` 不写 `N/A` 占位。目录级 `AGENTS.md` 必须列出与其范围直接相关的 DESIGN 或 PRD 文档，不可仅依赖父级间接引用。
- 正文不得复述 DESIGN、frontmatter 或空间全局法规；只写本项目特有、可执行、会改变开发行为的规则。
- 从 PRD 只提炼影响实现的范围约束；若 PRD 已合并入 DESIGN，则只引用 DESIGN。从 DESIGN 提炼执行链、目录职责、技术选择、接口 / 状态 / 配置 / 输出 / 错误处理契约。
- `BUSINESS_RULES.md` 仅在存在时作为权威文档链接引用，禁止读取并抽取规则写入正文。
- 从代码 / 配置只提炼 build、test、typecheck、lint、format 命令，基本开发命令，既有框架 / 库约束和本地实现约定；不要做源码百科。
- `rules-context` 中的项目技术规则直接并入对应章节；若内容属于 PRD、业务规则或临时计划，不写入正文，并在完成后说明。
- 越短越好：优先控制在 80–150 行；300 行是上限，不是目标。超出时压缩、改引用，或拆到更近的子目录 `AGENTS.md`。
- 保留基本开发 / 测试命令和适用验证要求；测试节必须包含 TDD 要求。
- 使用直接、可执行的祈使句；明确本范围负责什么、不应改什么。
- 描述用正向事实说明“是什么 / 负责什么”；少写防御性解释和低信息否定句。
- 用户偏好语言版本遵循 AGENTS 模板标题；模板规定的英文章节标题不得翻译。
- 架构说明只保留一条执行链和必要目录表；禁止 README 式介绍、低信息适用范围句、PRD 愿景 / 用户叙事 / roadmap、业务规则复述、大段 DESIGN 原文、架构大图、目录百科、API / 命令 catalog、临时计划或命令记录链接（除非用户明确要求）。
- **更新既有 `AGENTS.md` 时，所有未过时的原始规则必须保留。** 符合模板 1–5 节的规则归入对应节；不符合的规则逐条原样移入第 6 节（User-Supplied Rules）。删除原规则需在方案中逐条说明理由。代码示例、行内注释和操作说明是规则的有机部分，同样必须保留。
- `User-Supplied Rules` 是用户手工维护区；生成或更新时不得新增、修改、删除、重排本节内容（从原规范移入的规则除外，且只允许追加）。

## Step 1: 定位目标

1. 若 `$1` 是明确路径，直接使用。
2. 若 `$1` 是项目名，按 `.wopal-space/STRUCTURE.md` 和 `projects/` 定位候选。
3. 若命中唯一项目，先向用户确认推断路径；若存在多个同名 / 近名候选，列出候选并让用户选择。
4. 确定目标文件：项目级为 `<project>/AGENTS.md`，目录级为 `<target-directory>/AGENTS.md`。

**Output**: 目标目录、目标 `AGENTS.md` 路径、是否需要用户确认的路径假设。

## Step 2: 收集上下文

优先读取：

- 目标 `AGENTS.md` 与最近的上级 `AGENTS.md`
- `.wopal-space/STRUCTURE.md`
- 相关 DESIGN；PRD 仅在存在且未合并入 DESIGN 时读取；`BUSINESS_RULES.md` 仅在存在时列为引用
- 项目 package / build / test / typecheck / lint 配置
- 目标范围关键源码文件（只提炼命令和强约束，不做源码百科）
- `rules-context`（如有）

WopalSpace 常见文档位置：

```text
docs/products/<name>/docs/PRD*.md
docs/products/<name>/docs/DESIGN*.md
projects/<name>/docs/DESIGN.md
<project repo>/AGENTS.md
```

**Output**: 权威文档清单、现有规则摘要、实现事实摘要、缺失或需确认的信息。

## Step 3: 生成确认方案

写入前必须展示完整方案并获得用户明确确认。方案至少包含：

1. 目标文件路径
2. 将引用的权威文档
3. 拟写入或保留的 frontmatter `name` 和 `description`
4. 拟保留 / 新增 / 删除 / 压缩的规则摘要
4.5 拟移入第 6 节的原始规则（不符合 1–5 节的规则），以及拟删除规则及其逐条理由
5. 架构 / 目录说明方案
6. 开发、测试、验证要求
7. `rules-context` 的并入位置
8. 若可能超过 300 行，对应的压缩或拆分方案
9. `User-Supplied Rules` 保留不变的确认说明
10. 将删除或避免写入的低信息内容：不存在文档的 `N/A` 占位、重复 DESIGN / frontmatter / 全局法规的正文、过长目录 / API / 命令 catalog

更新既有 `AGENTS.md` 时，规则与规范初次创建后不可直接修改；任何增删改都只能先作为建议进入方案，获得用户明确确认后才能执行。

**Output**: 等待用户确认的变更方案。

## Step 4: 确认后写入

1. 若用户偏好语言不是英文，先在同目录更新 `AGENTS.<locale>.md`；`<locale>` 必须使用 IETF BCP 47 / RFC 5646 标记。
2. 用户确认审阅版后，再翻译并更新正式英文版 `AGENTS.md`；英文正式版必须与确认版本语义一致。
3. 若用户偏好语言为英文，直接创建或更新 `AGENTS.md`，不生成 `AGENTS.en-US.md` 等英文变体。
4. 未确认前，不得写入、覆盖或重排正式英文版 `AGENTS.md`。

**Output**: 已更新的审阅版和 / 或正式版路径。

## 质量检查

- [ ] 目标路径明确或可安全推断
- [ ] frontmatter `name` 和 `description` 存在，且正文未重复 frontmatter 信息
- [ ] frontmatter `description` 单行、稳定，并适合 `wopal space scan` 提取
- [ ] 已参考目标和上级 `AGENTS.md`（如存在）
- [ ] 已引用 PRD、DESIGN、`BUSINESS_RULES.md`（如存在）
- [ ] 不存在的权威文档没有写 `N/A` 占位
- [ ] 正文未重复 DESIGN、frontmatter 或空间全局法规
- [ ] 架构部分没有架构图、API catalog、命令 catalog 或目录百科
- [ ] 根级文档引用子目录 `AGENTS.md`，而不是复制细节
- [ ] 文档目标行数优先 80–150 行；`AGENTS.md` 不超过 300 行
- [ ] 保留基本开发 / 测试命令说明
- [ ] 规则聚焦技术实施、测试、验证
- [ ] 若用户偏好语言非英文，已先生成用户偏好语言版本
- [ ] 引用权威文档，而不是复制长文
- [ ] 未从 BUSINESS_RULES.md 提取任何规则写入正文
- [ ] 测试节包含 TDD 要求
- [ ] 用户偏好语言版本遵循 AGENTS 模板标题，未翻译模板规定的英文章节标题
- [ ] `User-Supplied Rules` 保留不变，未新增、修改、删除或重排（原规范移入项除外）
- [ ] 所有未过时的原始规则均已保留：符合 1–5 节的归入；其余原样移入第 6 节；删除项在方案中有逐条理由
- [ ] 写入前已展示完整优化方案并获得用户确认
- [ ] 用户确认后已同步更新正式英文版（如适用）

## 完成后响应

用用户语言回复：

1. 更新的文件路径
2. 覆盖范围
3. 关键新增 / 修改规则
4. 缺失的权威文档引用或假设
