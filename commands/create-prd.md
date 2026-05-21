---
description: 为新产品创建产品级 PRD（Product Requirement Document）
---

# 创建 PRD

## 使用方式

```bash
/create-prd                          # 交互式输入产品名称
/create-prd project product-name     # 指定项目和产品名称
```

## 产出物

`docs/products/{project}/PRD-{product-name}.md`

## 流程

### 1. 确定项目名称和产品名称

从参数获取，或从上下文推断（无参数则询问用户）。

### 2. 收集上下文

**必读：**
- `.workspace.md` — 工作空间结构
- `docs/products/wopal-space/PRD-wopalspace.md` — 空间产品愿景与演进阶段
- `docs/products/wopal-space/DESIGN-wopalspace.md` — 空间目标态设计（用于对齐定位）

**可选：**
- 对话中的需求讨论历史
- 项目已有的 `AGENTS.md`（了解实现状态）

### 3. 生成 PRD

**核心原则**：
- PRD 回答**"做什么、为谁做、做到什么程度"**，不回答"怎么做"
- 用户场景表达"用户想达成什么目标"，不写实现细节
- 实现阶段面向未来，已完成部分压缩到附录

---

## PRD 模板

### 1. 执行摘要 (Executive Summary) [必选]

2-3 段：产品是什么、解决什么问题、当前阶段状态。

### 2. 使命 (Mission) [必选]

**使命声明**: 一句话描述产品使命

**核心原则**: 3-5 条（指导设计决策的价值观，非技术细节）

### 3. 在 WopalSpace 中的定位 [必选]

产品对应四层架构中的哪一层。表格列出承担的职责域与当前实现状态。

### 4. 目标用户 (Target Users) [必选]

| 用户类型 | 技术水平 | 核心需求 | 痛点 |
|---------|---------|---------|------|

### 5. 产品范围 (Product Scope) [必选]

**已落地能力**: `[x]` checkbox，按能力域分组，不列命令清单

**当前边界外**: `[ ]` checkbox，标注近期 vs 远期

### 6. 用户场景 (Key Scenarios) [必选]

3-5 个**场景级叙事**，2-3 句描述目标与产品支撑。不写命令细节。可包含目标态场景。

### 7. 技术栈 (Technology Stack) [必选]

精简核心技术表格。

### 8. 成功标准 (Success Criteria) [必选]

1. **对齐 WopalSpace 成功衡量**（`PRD-wopalspace.md` §8）
2. **产品质量指标**（可量化表格）

### 9. 产品演进路线 (Product Evolution) [必选]

对齐 `PRD-wopalspace.md` §9 四阶段演进，定义本产品在每个阶段的角色。

### 10. 实现阶段 (Implementation Phases) [必选]

**只包含未完成的阶段**。每个 Phase 将被分解为 Issue。

```markdown
### Phase N: <名称> (版本号) 🚧

**目标**: <一句话>

**Scope**:
- [ ] <功能点>
```

### 11. 风险与缓解 (Risks & Mitigations) [可选]

产品级风险，非技术实现细节。

### 12. 相关文档 [必选]

必须包含：空间 PRD、空间 DESIGN、本产品 DESIGN（如有）、项目 AGENTS.md

### 附录: 已完成阶段 [如有]

| Phase | 版本 | 内容 | 状态 |
|-------|-----|------|------|

---

## 简化规则

小型项目聚焦：**1, 2, 4, 5, 6, 10**

## 质量检查

- [ ] 所有必选章节已填写
- [ ] 产品范围清晰区分已完成与未完成
- [ ] 实现阶段只包含未完成的工作
- [ ] 无 DESIGN 级内容（架构图、命令规格、工作流、技术决策）
- [ ] 产品演进对齐 WopalSpace 阶段

## 输出确认

1. 确认文件路径：`docs/products/{project}/PRD-{product-name}.md`
2. 简要总结 PRD 内容
3. 提示后续步骤：`/create-design` 创建配套设计文档