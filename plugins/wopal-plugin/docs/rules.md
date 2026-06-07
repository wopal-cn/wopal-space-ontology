# Wopal Rules

This document explains how to use Wopal Rules to inject custom instructions into agent messages. Rules are automatically discovered and injected via messages.transform hook, enabling keyword-based rule filtering with agent scope support.

## Rule Files

Rules are defined in Markdown files (`.md` or `.mdc`). These files can be located in two places:

- **Global Rules:** `~/.wopal/rules/` (primary) or `$XDG_CONFIG_HOME/wopal/rules/` (fallback)
- **Project Rules:** `.wopal/rules/` in the root of your project

Both directories are scanned **recursively**, so you can organize your rules into subdirectories. Rule discovery happens once when the plugin initializes.

### Agent Scope (Subdirectory Organization)

Rules can be scoped to specific agents by placing them in subdirectories:

```
~/.wopal/rules/
├── typescript.md       # Root-level rule (applies to all agents)
├── python.md           # Root-level rule (applies to all agents)
├── fae/                # Fae-specific rules
│   ├── execution.md    # Only applies when agentName = "fae"
│   └── refactoring.md  # Only applies when agentName = "fae"
└── wopal/              # Wopal-specific rules
    ├── planning.md     # Only applies when agentName = "wopal"
    └── workflow.md     # Only applies when agentName = "wopal"
```

- **Root-level rules** (`*.md` in rules directory): Apply to all agents
- **Agent-scoped rules** (`<agent-name>/<rule>.md`): Only apply when `agentName` matches the subdirectory name

### Exclusions

Hidden files and directories (starting with `.`) are automatically excluded from discovery.

## Keyword-Based Matching

Rules use keyword matching to determine when to inject. Keywords are defined in YAML frontmatter:

```markdown
---
keywords:
  - 'typescript'
  - 'ts'
  - '.ts'
---

TypeScript coding standards...
```

### Keyword Matching Behavior

- **Case-insensitive**: Keywords match regardless of case
- **Word boundary for English**: "test" matches "testing" but NOT "contest"
- **Substring for Chinese/CJK**: "开发技能" matches "帮我开发技能吧"
- **Wildcard support**: Use `*` for flexible matching

| Pattern | Type | Example Match |
|---------|------|---------------|
| `test` | English | "testing code" ✓, "contest" ✗ |
| `开发技能` | Chinese | "帮我开发技能吧" ✓ |
| `开发*技能` | Wildcard | "开发一个新技能" ✓ |
| `*test*` | Wildcard | "contest", "testing" ✓ |

### No Keywords = No Injection

Rules without keywords are **skipped**. There is no "unconditional" injection. Every rule must have keywords to be eligible for injection.

## How Rules are Loaded and Injected

1. **Discovery**: Plugin scans `~/.wopal/rules/` and `.wopal/rules/` recursively at initialization
2. **Agent Filtering**: Agent-scoped rules are filtered based on current agent name
3. **Keyword Matching**: Only rules whose keywords match the user prompt are selected
4. **Injection**: Matching rules are formatted and injected as synthetic parts into user messages via `messages.transform` hook

## Rule Matching Examples

### Scenario 1: Root-level Rule

- User prompt: "help me with typescript types"
- Rule: `typescript.md` with `keywords: ['typescript', 'ts']`
- Result: Rule injected (keyword "typescript" matches)

### Scenario 2: Agent-scoped Rule

- Agent: "fae"
- User prompt: "refactor this code"
- Rules:
  - `fae/refactoring.md` with `keywords: ['refactor']`
  - `wopal/planning.md` with `keywords: ['plan']`
- Result: Only `fae/refactoring.md` injected (agent scope + keyword match)

### Scenario 3: Multiple Agents

- Agent: undefined (generic)
- Rules:
  - `typescript.md` (root-level)
  - `fae/execution.md` (agent-scoped)
- Result: Only `typescript.md` injected (root-level rules apply to all agents)

### Scenario 4: No Match

- User prompt: "create a database schema"
- Rule: `typescript.md` with `keywords: ['typescript']`
- Result: No rule injected (keyword doesn't match)

## Frontmatter Format

```yaml
---
keywords:
  - keyword1
  - keyword2
  - keyword_with_wildcard*
---

Rule content here...
```

- Keywords array is required for rule to be considered
- Multiple keywords use OR logic (any match triggers injection)
- Wildcard `*` provides flexible matching