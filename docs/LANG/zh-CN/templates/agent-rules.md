---
name: <项目或模块目录> AGENT RULES
description: <一句话稳定描述当前项目或目录模块职责>
---

# Agent Development Rules

## 1. Canonical References

权威引用：

<!-- 只列真实存在且与当前范围直接相关的文档；不要写 N/A 占位。 -->
- PRD: `<path-when-relevant>`
- DESIGN: `<path-when-relevant>`
- Business Rules: `<path-when-relevant>`
- Referral Rules: `<path-when-relevant>`

## 2. Architecture and Directories

<当前架构简要描述，可包含运行链路说明；只写当前事实>

| 目录 | 职责 |
|---|---|

<!-- 目录表只列当前真实存在的路径；长期有效的目标结构约束写入 Implementation Rules，不写成当前目录事实。 -->

## 3. Development Commands (build format test)

| 场景 | 命令 | 何时 |
|---|---|---|

## 4. Implementation Rules

- <项目特定技术规则和约束>
- <项目特定 UI/UX 或输出规则（如适用）>

## 5. Testing

- <对可测试纯逻辑遵循 TDD：先写失败测试，再实现代码使其通过>
- <写明本项目哪些逻辑必须自动测试，哪些宿主 API、外部系统或真实运行环境边界只要求手工验证>

## 6. User-Supplied Rules

- <用户手工补充的规则；命令生成或更新时不得修改本节>
- <更新时：不符合 1–5 节的原始规则应逐条原样保留于此>
