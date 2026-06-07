# <阶段名称>

> **产品**: `<product>`
> **Phase ID**: `<phase-id>`
> **状态**: Planned | Active | Completed
> **更新日期**: YYYY-MM-DD
> **产品 PRD**: `<prd-path>`
> **产品 DESIGN**: `<design-path>`

---

## 0. Goal

一句话描述本阶段要交付的产品能力（跨项目视角）。

## 1. Current State

按项目或子系统，用清晰扼要的叙述性文字描述当前状态。既说明已有能力，也说明缺失什么——完整呈现现状与阶段目标的差距。

## 2. Scope

本阶段要交付的产品能力概要清单，让人类和 agent 可以一目了然地把握全貌。每个 scope 范围一行，带 Owner。例如：

- **CLI 分发** — Node SEA release packaging → 公开 release carrier → installer 一键安装。Owner: wopal-cli
- **ellamaka 分发** — artifact branding + 4 平台矩阵 + GitHub Release。Owner: ellamaka

## 3. Out of Scope

- 明确排除在本产品阶段之外的能力或项目

## 4. Targets and Gaps

§2 的每个 scope 区域在此处做详细 gap 分析。按 `###` scope 区域，以 `#### Gaps` 分组，`#####` 逐个 gap。

Gap 结构：

- **Current**: 当前状态（缺少什么）
- **Target**: gap 关闭后的目标状态
- **Design**: 解决方案记录在哪个设计文档（项目 DESIGN 或 DISTRIBUTION 路径）
- **Exit**: checkbox 格式的退出条件——单条一行，多条逐行 `- [ ]`。每个 gap 至少一个 exit criterion。Exit criteria 的 checkbox 合集即本阶段的完成标准。

```
### <scope 区域>
Owner: <project>

#### Gaps

##### <Gap 标题>
- **Current**: ...
- **Target**: ...
- **Design**: ...
- **Exit**:
  - [ ] 退出条件
  - [ ] 退出条件
```

Gap 编写规则：

- 没有设计方案的 gap 不属于这里——放入 §6 Risks。
- Exit criteria 描述交付事实，不写实施步骤。
- 每个 scope 区域应有 ≥1 个 gap。
- 每个 gap 应可通过其 exit criteria 独立验证。

## 5. Related Plans

<!-- 各项目的 Plan 关联后自动或手动维护 -->

| 项目 | 计划 | 状态 |
|------|------|------|

## 6. Risks

只有没有设计方案的问题才列入此处。已有设计方案的 gap 在 §4 中管理。

| 风险 / 依赖 | 影响 | 为什么没有设计方案 |
|-------------|------|-------------------|

## 7. References

不重复列出阶段文档头部已引用的文档。列出项目 DESIGN 和其他相关引用。

- 项目 DESIGN: `<project-design-path>`
