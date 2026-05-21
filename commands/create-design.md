---
description: 为产品创建架构设计文档（DESIGN），基于已有 PRD
---

# 创建 DESIGN

## 使用方式

```bash
/create-design                          # 从上下文推断产品
/create-design project product-name     # 指定项目和产品名称
```

## 产出物

`docs/products/{project}/DESIGN-{product-name}.md`

## 前置条件

**必须已存在 PRD**：`docs/products/{project}/PRD-{product-name}.md`

如果 PRD 不存在，提示用户先执行 `/create-prd`。

## 流程

### 1. 确定目标产品

从参数获取，或从上下文推断。验证 PRD 存在。

### 2. 收集上下文

**必读：**
- 本产品的 PRD — 产品范围与当前状态
- `docs/products/wopal-space/DESIGN-wopalspace.md` — 空间架构（用于对齐定位）


### 3. 生成 DESIGN

**核心原则**：
- DESIGN 回答**"系统怎么设计的、为什么这样设计"**
- 可包含目标态设计（尚未实现但已确定的方向）
- 不包含产品级内容（愿景、用户、演进路线 → PRD）
- 不包含施工级内容（编码规范、开发命令 → AGENTS.md）

---

## DESIGN 模板

### 1. 概述 [必选]

一段话说明本文档定义什么。指向 PRD（产品范围）和项目 AGENTS.md（开发规范）。

### 2. 系统架构 [必选]

- **架构总览**：ASCII 架构图
- **数据流**：输入 → 处理 → 输出
- **核心组件关系**：表格列出组件、职责、消费者

### 3. 接口契约 [必选]

外部接口的规格定义：

- HTTP API / CLI 接口 / 事件协议
- 数据格式与 schema
- 存储结构

### 4. 关键技术决策 [必选]

| 决策 | 理由 |
|------|------|

### 5. 目标态设计 [可选]

尚未实现但已确定的设计目标。与 PRD "产品演进"互补：PRD 说"要做什么"，DESIGN 说"打算怎么做"。

### 6. 研究基础 [可选]

相关研究文档与核心发现。

---

## 简化规则

小型项目聚焦：**2, 4**

## 质量检查

- [ ] 架构图与组件关系完整
- [ ] 接口契约覆盖所有外部接口
- [ ] 技术决策每条都有理由
- [ ] 目标态设计与 PRD 演进路线对应
- [ ] 不含产品级内容（愿景、用户、成功标准）
- [ ] 不含施工级内容（编码规范、开发命令、代码模板）

## 输出确认

1. 确认文件路径：`docs/products/{project}/DESIGN-{product-name}.md`
2. 简要总结 DESIGN 内容
3. 提示后续步骤：当项目有实际代码后，使用 `/cupdate-project-spec` 创建项目规范
