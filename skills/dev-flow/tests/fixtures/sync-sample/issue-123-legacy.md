## Goal

让 WSF 能根据用户语言偏好动态生成文档正文，而非模板写死语言。标题和结构保持英文，正文描述根据偏好输出。
## Background

当前 WSF 模板中的说明文字是英文，生成文档时完全依赖模板内容。用户希望中文正文，但模板不能写死中文。需要研究：1) 如何在 config 中存储语言偏好；2) 如何在 agent 生成文档时读取偏好；3) 哪些文档需要支持语言偏好（PROJECT.md、ROADMAP.md、REQUIREMENTS.md 等）。
## In Scope

- 研究语言偏好的存储方式、传递机制、生成流程改造方案。输出设计方案，不实施。
## Out of Scope

- 实际修改 WSF 模板、翻译现有文档、修改部署层。
## Acceptance Criteria

待 plan 阶段细化
## Related Resources

| Resource | Link |
|----------|------|
| Research | WSF config: projects/space-flow/wsf/templates/、agents/ 目录下各 agent 定义。已生成文档示例：projects/gesp/.planning/ |
| Plan | _待关联_ |
