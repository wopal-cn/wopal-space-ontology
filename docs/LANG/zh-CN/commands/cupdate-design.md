---
description: 创建或更新产品 DESIGN 或项目 DESIGN
---

# 创建或更新 DESIGN

引导用户讨论并明确产品系统架构（产品 DESIGN）或项目内部设计（项目 DESIGN）。核心职责是帮助用户厘清设计边界、达成设计决策，直到具备开展下一阶段工作的条件。

简单项目可跳过产品 DESIGN，直接走项目 DESIGN（自主定义产品级设计）→ Plan 的简化流程。

**Input**: `$1` `$2`

**Parameter Notes**: `<名称> [product|project]`。未输入时从 `docs/products/` 和 `projects/*/docs/` 匹配推断，有疑问向用户确认。

---

## Core Principles

### 两种设计流程

| 流程 | 适用场景 | 链路 |
|---|---|---|
| 标准流程 | 多项目产品，需要跨项目架构协调 | PRD → 产品 DESIGN → Roadmap → 项目 DESIGN → Plan |
| 简化流程 | 独立项目，无关联产品 | 项目 DESIGN（含产品级设计）→ Plan |

标准流程中，产品 DESIGN 用于阶段拆分和架构契约定义，项目 DESIGN 聚焦单项目内部架构。简化流程中，项目 DESIGN 同时承担产品级设计职责（Header `上级产品: N/A`）。

### 讨论规则

- 命令的核心是引导用户讨论和澄清设计决策。产品 DESIGN 使用 `design-product.md` 模板，项目 DESIGN 使用 `design-project.md` 模板。
- 产品 DESIGN 讨论重点：系统分层与子系统边界、运行时模型、端到端流程、阶段拆分（至少明确当前阶段总体目标，细节由 `/cupdate-roadmap` 承接）。
- 项目 DESIGN 讨论重点：项目角色与边界、能力范围、模块架构、技术选型、接口契约、数据模型。
- DESIGN 只保留架构、边界、契约、运行时模型和演进骨架，不保留实施状态、交付进度、验收结果或任务清单。
- 产品 DESIGN 的 Evolution Roadmap 是阶段骨架：每个 Phase 只保留标题、Goal 和 Phase 文档链接；已完成/已落地/剩余工作属于 Phase、Plan、UAT 或 Verification 文档。
- 保留准确既有内容。过时信息在证据充分时修订或移除。未确认事项标为待确认。
- 所有写入操作前展示完整内容并获取用户明确确认。

## Step 1: 收集上下文

**标准流程**：
- 产品 DESIGN：读取产品 PRD
- 项目 DESIGN：读取上级产品 PRD + 上级产品 DESIGN

**简化流程**（Header `上级产品: N/A`）：
- 读取项目自身代码和文档中的既有设计决策

**更新**：
- 读取既有 DESIGN、当前对话中的用户决策、代码和文档中的实现事实

**Output**: 上下文清单、待确认项

## Step 2: 引导设计讨论

按模板章节顺序，逐节引导用户讨论。

**产品 DESIGN 讨论要点**：
1. 系统分层与架构总览
2. 核心子系统的角色、边界和交互契约
3. 运行时模型（状态位置、配置分层、生命周期）
4. 关键端到端流程
5. 阶段拆分：将产品愿景分解为可交付的阶段骨架，只保留 Phase 标题、Goal 和 Phase 文档链接

**项目 DESIGN 讨论要点**：
1. 项目在父产品中的定位和职责边界（简化流程：自身定位和存在价值）
2. 目标能力范围和明确排除的领域
3. 关键架构决策及选择理由
4. 内部模块划分和责任归属
5. 技术栈选型及选择理由
6. 对外接口和集成契约。若项目含前端 UI：技术栈选型、设计令牌、组件规范、页面结构
7. 数据与状态模型

**Output**: 各节讨论结论

## Step 3: 编写 DESIGN

按模板将讨论结论编写为 DESIGN 文档。更新已有文档时：

1. 保留既有路径和标题
2. 更新 `Updated` 日期
3. 将讨论结论与既有内容对齐
4. 补齐缺失章节
5. 修订或移除过时内容，删除 DESIGN 中的实施状态和交付进度
6. 追加 Change Log（记录设计意图、架构、边界、契约变化）
7. 未解决事项标为待确认

展示完整内容，等待用户确认后写入。

**Output**: 完整 DESIGN 内容，等待确认

## Step 4: 验证

写入后执行质量检查门。只有质量检查通过，命令才真正完成；不通过则回到 Step 2 或 Step 3 修订。

### 通用质量检查

- [ ] 选择了正确模板：产品 DESIGN 或项目 DESIGN
- [ ] 文档语言符合用户偏好
- [ ] Header 包含当前 `Updated` 日期
- [ ] Change Log 已追加有意义的创建/更新记录
- [ ] 相关长期文档已链接，未链接 backlog、临时计划或命令日志
- [ ] 保留准确既有内容，明确修订或移除过时内容
- [ ] 未确认事项明确标记为待确认
- [ ] 正文使用设计语言，不含模板注释、流程说明、任务清单或命令转录
- [ ] DESIGN 不包含实施状态、交付进度、验收结果、复选框式任务或“已完成/待完成”模块状态

### 产品 DESIGN 质量检查

- [ ] 基于目标 PRD 编写或更新
- [ ] 说明跨项目系统组成、架构层次、项目职责和交互契约
- [ ] Runtime Model 明确状态位置、数据归属、配置分层、生命周期和持久化边界
- [ ] End-to-End Flows 覆盖关键跨项目路径，聚焦系统行为而非实现步骤
- [ ] Evolution Roadmap 只保留阶段骨架：`### Phase N: Title`、`Goal`、`Phase doc`
- [ ] 不重复 PRD 的愿景、目标用户、产品叙事或完整路线图

### 项目 DESIGN 质量检查

- [ ] 标准流程下基于上级产品 PRD 与产品 DESIGN；简化流程下 Header 明确 `上级产品: N/A`
- [ ] Project Role 简洁说明项目定位、职责边界和不负责内容
- [ ] Capability Scope 只描述目标态能力边界，不含阶段时间、实施状态或交付进度
- [ ] Module Architecture 使用设计态语言说明模块责任和载体，不以临时实现位置作为主结构
- [ ] Technical Stack Choices 包含选择理由和明确边界
- [ ] Interfaces and Contracts 说明对外表面、消费者、输入输出约定、文件格式、配置或模板契约
- [ ] Data and State Model 明确项目拥有的状态、位置、Owner 和规则

---

## Discussion Completion Standard

以下条件满足时，研究讨论可以结束，并进入 Step 3 编写与 Step 4 验证：

- 产品 DESIGN：系统架构边界已明确，当前阶段总体目标已确定，可交给 `/cupdate-roadmap` 做阶段细化
- 项目 DESIGN（标准流程）：内部架构决策已明确，可进入 `/cupdate-agent-rules` 或准备 Plan
- 项目 DESIGN（简化流程）：设计决策已充分明确，可直接进入 Plan
- 仍未确认的关键问题已显式列出，并且不阻塞当前 DESIGN 的架构表达

---

## Response After Completion

使用用户偏好语言回复：

1. 文件路径
2. 创建/更新摘要（新增、修订、移除/废弃项、待确认项）
3. 建议下一步：产品 DESIGN → `/cupdate-roadmap`；标准项目 DESIGN → `/cupdate-agent-rules`；简化流程项目 DESIGN → 创建 Plan
4. 验证结果：Step 4 质量检查通过；若有未通过项，先修订，不输出完成响应
