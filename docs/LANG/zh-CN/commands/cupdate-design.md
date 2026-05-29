---
description: 创建或更新产品或项目 DESIGN 文档
---

# 创建或更新 DESIGN

产品 DESIGN 是总体设计，从 PRD 派生，描述跨项目系统组成与契约。项目 DESIGN 是分系统设计，从上级产品 PRD/DESIGN 派生，描述单项目内部架构。

**Input**: `$1` `$2`
**Parameter Notes**: `<名称> [product|project]`。未输入时从 `docs/products/` 和 `projects/*/docs/` 匹配推断，有疑问向用户确认。

## Core Principles

### 职责边界

| | 产品 DESIGN | 项目 DESIGN |
|---|---|---|
| 回答 | 系统如何组织、模块如何交互、关键选择为何成立 | 本项目内部架构、技术栈、接口、能力范围、演进路线 |
| 不重复 | PRD 的愿景、用户、产品路线 | 上级 PRD/DESIGN 的完整愿景和架构 |
| 不写成 | 实施清单、编码规范、命令记录 | 同左 |

### Evolution Roadmap 格式

产品 DESIGN §5 和项目 DESIGN §8 统一使用：

```markdown
### Phase N: 标题

> Phase doc: [phases/<name>-pN-<slug>.md]

- **Goal**: 本阶段目标（一句话，≥20 字符）

- [x] D-01: <设计决策，已完成>
- [ ] D-02: <设计决策，待实现>
```

- D-NN 编号每 phase 独立，`[x]` = done，`[ ]` = pending
- 产品 DESIGN Goal：产品能力目标
- 项目 DESIGN Goal：从父产品 phase doc Involved Projects 推导分工目标
- 独立项目模式（Header `上级产品: N/A`）：Goal 直接描述项目阶段目标

### 写作规则

- 设计语言，非过程语言：结构、边界、契约、ownership、技术选择、运行行为
- 不写模板说明文字、架构套话、装饰图；不以"当前位置"等实现态字段为主结构
- 保留准确既有内容；有证据时修订/删除过时内容；未确认事项标"待确认"
- 项目 DESIGN 的 §2 Capability Scope 承接上级 PRD 的产品定义；独立模式时自主定义

### 独立项目模式

项目无关联产品（Header `上级产品: N/A`）时：
- §1 Project Role：说明项目自身定位
- §2 Capability Scope：自主定义能力边界
- §8 Goal：直接描述阶段目标，不引用外部 phase doc

## Step 1: 收集上下文

**新建**：
- 产品 DESIGN：读取产品 PRD
- 项目 DESIGN：读取上级产品 PRD + 上级产品 DESIGN。无上级产品时进入独立项目模式

**更新**：
- 读取既有 DESIGN、当前对话中的用户决策、实现事实（代码/文档）
- 项目 DESIGN 额外读取关联 phase doc，根据 Plan 完成情况更新 §8 D-NN 状态

**输出**：已读取的上下文清单 + 待确认项。

## Step 2: 编写 / 更新

**新建**：按模板逐节编写（产品用 `design-product.md`，项目用 `design-project.md`）。

**更新**：
1. 保留既有路径和标题（除非明显错误）
2. 更新 `Updated` 日期
3. 对齐用户决策、实现事实、PRD/DESIGN；更新 §8 D-NN 状态
4. 补齐缺失章节
5. 移除/修订过时架构、边界、接口或状态声明
6. 追加 Change Log（只记设计意图/架构/边界/契约变化，不记格式调整）
7. 未解决事项标"待确认"

**Header 要求**：产品 DESIGN 含 `产品意图`，项目 DESIGN 含 `上级架构` + `上级产品`（或 `N/A`）。

**输出**：完整 DESIGN 内容（写入前向用户确认）。

## Step 3: 质量检查

- [ ] 选择了正确模板（产品/项目）
- [ ] Evolution Roadmap 使用 `### Phase N:` heading + `[x]`/`[ ]` D-NN 格式
- [ ] 项目 DESIGN：§2 Capability Scope 承接了产品能力定义（或独立模式自主定义）
- [ ] 项目 DESIGN：§8 Goal 对齐父产品 phase doc（或独立模式为直接目标）
- [ ] 设计语言（结构/边界/契约/ownership），无模板说明/实施清单/架构套话
- [ ] 技术栈选型含理由和 ownership 边界
- [ ] 准确既有内容已保留，过时内容已修订/删除
- [ ] Change Log 已更新，相关文档已链接

## 完成后响应

1. 文件路径
2. 创建 / 更新摘要
3. 新增、修订、移除/废弃、待确认项
4. 建议下一步：`/cupdate-roadmap`。若为项目且已完成初始化，可运行 `/cupdate-agent-rules`。