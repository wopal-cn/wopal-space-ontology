# <项目名称>

> **状态**: Active  
> **更新时间**: YYYY-MM-DD  
> **上级架构**: `<parent-design-path 或 N/A>`  
> **上级产品**: `<parent-product-prd-path 或 N/A>`

## 0. Change Log

| 日期 | 类型 | 摘要 |
|------|------|------|
| YYYY-MM-DD | 创建 / 更新 | 一行摘要 |

## 1. Project Role

说明项目在父产品中的定位、承担的职责和明确边界。一句话核心职责 + 技术定位。无关联产品时，说明本项目自身的定位和存在价值。

## 2. Capability Scope

列出项目拥有的目标态能力组。只描述边界：拥有的目标能力、明确排除的领域和委派边界。不含阶段时间、实现状态或交付进度。无关联产品时，直接列出本项目的目标能力边界，不从外部 PRD 推导。

## 3. Design Principles

列出指导本项目技术选择的原则，需具体到能解决设计取舍。

## 4. Module Architecture

用设计态语言描述内部模块及责任。避免"当前位置"等实施态标签。列：模块、职责、载体。

## 5. Technical Stack Choices

技术选型与集成选择：运行时、框架、构建 / 包管理、文件系统 / 状态处理、外部二进制、安全扫描器、协议 / 客户端、输出模式、配置格式。每项说明选择理由和边界。

## 6. Interfaces and Contracts

对外暴露面：CLI 命令、API、事件、文件格式、schema、协议、集成契约。规格级描述。

## 7. Data and State Model

项目拥有的状态、持久化、配置、缓存、生成文件、迁移和幂等规则。

## 8. Evolution Roadmap

以设计决策为单位描述项目在各产品阶段的成熟过程。每阶段一个 Goal 加一组 D-NN 决策：

```markdown
### Phase N: 标题

> Phase doc: [phases/<project>-pN-<slug>.md]

- **Goal**: 本项目在本阶段的分工目标（一句话，≥20 字符。有父产品时，对齐父产品 phase doc 对本项目的期望；无关联产品时，直接描述本项目在本阶段的目标）

- [x] D-01: <设计决策，已完成>
- [ ] D-02: <设计决策，待实现>
```

**编写要求**：
- 每 phase 必须有 **Goal** 行和 ≥1 条 D-NN 决策
- 有父产品时，Goal 从父产品 phase doc 的 Involved Projects 推导本项目的分工目标；无关联产品时，直接描述本项目的阶段目标
- D-NN 编号每 phase 独立，`[x]` 表示已落地，`[ ]` 表示待实现
- 全部 `[x]` 的 phase 即为已完成
- 本节是 `/cupdate-roadmap` 项目模式的输入源

## 9. Related Documents

只链接长期有效的产品 / 设计参考：上级 PRD / DESIGN、业务规则、架构参考、项目规范。
