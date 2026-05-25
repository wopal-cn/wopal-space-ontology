---
description: 从项目代码/文档中提炼业务规则，生成 BUSINESS_RULES.md
---

# /wopal:extract-br

输入: `$ARGUMENTS`（产品名，如 `gesp`、`wopal-cli`）

## 执行

1. **确认参数**：`$ARGUMENTS` 为空或多个候选时，列出可选产品名，让用户确认。禁止推断。
2. **加载规范**：强制读取并遵循: @.wopal/rules/business-rules.md
3. **按规范提取规则**，输出到 `docs/products/{product}/BUSINESS_RULES.md`
