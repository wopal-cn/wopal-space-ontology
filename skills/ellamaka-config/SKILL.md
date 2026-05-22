---
name: ellamaka-config
description: |
  Configure ellamaka (the WopalSpace fork of OpenCode). MUST use whenever the task is about ellamaka / wopal-space configuration, agent frontmatter, permission rules, model/provider setup, formatter settings, config loading order, or debugging why config changes do not take effect.

  Trigger on requests like: “改权限配置”, “限制子代理”, “优化 agent 权限”, “改 rook/fae 提示词 frontmatter”, “settings.jsonc 怎么配”, “.wopal/agents/*.md 怎么写”, “为什么配置没生效”, “为什么读不到配置”, “切换模型/provider”, “禁用某个工具”, “自定义工具权限”, “wopal_task_* 权限”, “formatter 配置”, or any task involving `.wopal/config/settings.jsonc`, `.wopal/agents/*.md`, `~/.wopal/ellamaka/config/`, `~/.wopal/bin/ellamaka`, or `projects/ellamaka/`.

  Trigger even if the user says “opencode” when the actual runtime, config path, or behavior is really ellamaka. Prefer this skill whenever the question depends on the difference between ellamaka and upstream opencode.
---

# ellamaka-config — Configure ellamaka

Use this skill to edit or reason about ellamaka configuration, especially in WopalSpace mode.

## First judgment: ellamaka or upstream opencode?

Check this first, because the validation path changes everything.

- If the task mentions WopalSpace, `.wopal/*`, plugin tools, custom subagents, or `.wopal/config/settings.jsonc`, treat it as **ellamaka**
- Do **not** validate ellamaka behavior with upstream `opencode`
- When in doubt, inspect `projects/ellamaka/` source or use the `ellamaka` CLI directly

Why: ellamaka is a fork with wopal-space-specific config loading and plugin tools.

## Config locations

| Type | Global | Space-local |
|------|--------|-------------|
| Main config | `~/.wopal/ellamaka/config/opencode.jsonc` | `.wopal/config/settings.jsonc` → `ellamaka` |
| Agent files | `~/.wopal/agents/{name}.md` | `.wopal/agents/{name}.md` |

## Wopal-space loading order

Priority low → high:

1. built-in defaults
2. `~/.wopal/ellamaka/config/opencode.jsonc`
3. `.wopal/config/settings.jsonc` → `ellamaka`
4. `.wopal/agents/{name}.md` frontmatter

Important:

- wopal-space mode **skips** project `opencode.jsonc`
- wopal-space mode **skips** `~/.config/opencode/`
- agent frontmatter is the highest-precedence place for per-agent permission tuning

## Permission model

Use `permission`, not legacy `tools`, for new config.

### Basic form

```jsonc
{
  "permission": {
    "edit": "allow",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "rm *": "deny"
    }
  }
}
```

### Agent-local permission override

Prefer agent frontmatter for subagent boundaries:

```yaml
---
permission:
  wopal_*: deny
  skill:
    "*": deny
    df-implement-review: allow
  todowrite: allow
---
```

### Custom/plugin tools

ellamaka permission rules support custom tool names, not only built-in tools.

That means these are valid:

```yaml
permission:
  wopal_task: deny
  wopal_task_output: deny
  wopal_*: deny
```

Use wildcard rules when you want one boundary for a whole plugin tool family.

## Common changes

### 1. Change model or provider

- Global default → `~/.wopal/ellamaka/config/opencode.jsonc`
- Space-local default → `.wopal/config/settings.jsonc` under `ellamaka`
- Per-agent model override → `.wopal/config/settings.jsonc` under `ellamaka.agent.<name>`

Example:

```jsonc
{
  "ellamaka": {
    "agent": {
      "rook": {
        "model": "github-copilot/gpt-5.4"
      }
    }
  }
}
```

### 2. Restrict a subagent

Use agent frontmatter when the rule belongs to one agent's role.

Typical cases:

- block nested delegation
- block plugin tool families
- allow `todowrite` explicitly
- tighten `skill` visibility

### 3. Fix config not loading

Check in this order:

1. Are you editing ellamaka files or upstream opencode files?
2. Are you in wopal-space mode?
3. Did a higher-precedence agent frontmatter override the global or space config?
4. Are you validating with `ellamaka`, not `opencode`?

## Validation

After config edits, validate with ellamaka itself.

### Config sanity

```bash
ellamaka run "test"
```

### Resolved agent permissions

```bash
ellamaka agent list
```

Use `ellamaka agent list` after permission edits to confirm the resolved rules actually include your new entries.

## Troubleshooting

| Problem | Check |
|---|---|
| Config not taking effect | You may be editing the wrong layer; check frontmatter > settings.jsonc > global |
| Works in opencode but not ellamaka | Wrong runtime; validate with `ellamaka` or `projects/ellamaka/` source |
| Permission change seems ignored | Confirm with `ellamaka agent list` |
| Custom tool rule not matching | Use exact tool name or wildcard like `wopal_*` |
| Legacy config found | Migrate `tools` → `permission`, `maxSteps` → `steps` |

## Editing guidance

- Keep the smallest possible override at the highest appropriate layer
- Put agent-specific restrictions in agent frontmatter
- Put shared defaults in global or space config
- Do not add duplicate rules across multiple layers unless you want explicit override behavior

## References

- `references/config-schema.md` — schema reference
- `projects/ellamaka/packages/opencode/src/config/permission.ts` — config permission shape
- `projects/ellamaka/packages/opencode/src/permission/index.ts` — rule expansion and matching
- `projects/ellamaka/packages/opencode/src/permission/evaluate.ts` — wildcard evaluation
