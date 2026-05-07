---
name: wsf-help
description: "Show available WSF commands and usage guide"
argument-hint: "[--lang <code>]"
tools:
  read: true
---

<objective>
Display the complete WSF command reference.

Output ONLY the reference content below. Do NOT add:
- Project-specific analysis
- Git status or file context
- Next-step suggestions
- Any commentary beyond the reference
</objective>

<context>
Language preference is determined by:
1. If `--lang <code>` is provided → use specified language (e.g., `--lang zh`)
2. If not provided → infer from context (check USER.md "沟通语言" field, user's conversation language in current session)
3. Default → English if no preference detected

Technical terms, command names, file paths, and code identifiers always remain in English regardless of output language.
</context>

<execution_context>
@/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/workflows/help.md
</execution_context>

<process>
Parse `--lang <code>` from `$ARGUMENTS`. If present, output the complete WSF command reference translated to that language. Otherwise, output the English reference as-is.

Regardless of language, ALL of these MUST remain in English:
- Command names (e.g., `/wsf-new-project`)
- File paths (e.g., `.planning/STATE.md`)
- Code identifiers and technical terms
- CLI flags (e.g., `--wave`, `--prd`)

Output ONLY the reference content — no additions or modifications.
</process>
