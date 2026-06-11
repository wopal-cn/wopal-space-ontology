---
name: ellamaka-config
description: |
  Configure ellamaka, a fork of OpenCode with wopal-space mode. MUST use for any task about ellamaka config, agent frontmatter, permission rules, model/provider selection, formatter settings, config loading order, or why config changes are ignored.

  Trigger on requests about ellamaka or opencode config files, agent permission overrides, restricting subagents, custom/plugin tool permissions (e.g. wopal_task_*), disabling tools, configuring providers or models, formatter setup, config precedence or layering, or debugging settings that do not take effect.

  Use this skill even when the user says "opencode" if the actual runtime, config path, or behavior is ellamaka. Prefer this skill whenever the answer depends on the difference between ellamaka and upstream opencode, including wopal-space config loading, plugin tool permissions, or agent frontmatter precedence.
---

# ellamaka-config

Configure and troubleshoot ellamaka, a fork of OpenCode with wopal-space mode and plugin tool support.

## First judgment: ellamaka or upstream opencode?

Check this first, because the validation path changes everything.

- If the task mentions wopal-space, plugin tools, custom subagents, or space-local config files, treat it as **ellamaka**
- Do **not** validate ellamaka behavior with upstream `opencode`
- When in doubt, validate with the `ellamaka` CLI directly

Why: ellamaka is a fork with wopal-space-specific config loading and plugin tools.

## Config layers

### Generic ellamaka config locations

| Type | Path |
|------|------|
| Global config | `~/.wopal/ellamaka/config/opencode.jsonc` |
| Project config | `opencode.jsonc` in project root |
| Global agents | `~/.wopal/agents/{name}.md` |

### WopalSpace mode (additional layer)

When running inside a WopalSpace, an extra space-local config layer is inserted:

| Type | Path |
|------|------|
| Space config | `<space-root>/.wopal/config/settings.jsonc` under `ellamaka` key |
| Space agents | `<space-root>/.wopal/agents/{name}.md` |

### Loading order (low → high precedence)

1. Built-in defaults
2. `~/.wopal/ellamaka/config/opencode.jsonc` (global)
3. **WopalSpace only**: `.wopal/config/settings.jsonc` → `ellamaka` key
4. **WopalSpace only**: `.wopal/agents/{name}.md` frontmatter
5. Project `opencode.jsonc` (generic mode only)

Important wopal-space differences:

- wopal-space mode **skips** project `opencode.jsonc`
- wopal-space mode **skips** `~/.config/opencode/`
- agent frontmatter is the highest-precedence place for per-agent permission tuning

### WopalSpace capability override

Directories load in order: `~/.wopal/` (user-level) → `.wopal/` (space-level). Later layers override earlier ones.

| Capability | Same-name override |
|---|---|
| Agents | **Field-level merge** — space only overrides fields it defines; user-only fields survive. Cannot delete user fields. |
| Commands | **Field-level merge** — same as agents. |
| Skills | **Full replacement** — space skill entirely replaces user skill with the same name. |
| Plugins | **Full replacement** — same-identity space plugin replaces user plugin. |

Config guidance:

- To **tune** a user-level agent, set only the fields you want to change in the space definition
- To **fully replace** an agent, explicitly set all fields in the space definition
- Skills and plugins are simpler — same name/identity = complete replacement

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

ellamaka permission rules support custom tool names, not only built-in tools:

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
- WopalSpace default → `.wopal/config/settings.jsonc` under `ellamaka`
- Per-agent override → config under `ellamaka.agent.<name>` (WopalSpace) or `agent.<name>` (generic)

Example (WopalSpace):

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

- Block nested delegation
- Block plugin tool families
- Allow specific tools explicitly
- Tighten `skill` visibility

### 3. Fix config not loading

Check in this order:

1. Are you editing ellamaka files or upstream opencode files?
2. Are you in wopal-space mode? (This changes which layers are active)
3. Did a higher-precedence agent frontmatter override the global or space config?
4. Are you validating with `ellamaka`, not `opencode`?

## Validation

After config edits, validate with ellamaka itself.

```bash
ellamaka run "test"
```

Check resolved agent permissions:

```bash
ellamaka agent list
```

Use `ellamaka agent list` after permission edits to confirm the resolved rules actually include your new entries.

## References
- `references/config-schema.md` — schema reference (in this skill directory)

## Troubleshooting

| Problem | Check |
|---|---|
| Config not taking effect | You may be editing the wrong layer; check frontmatter > space config > global |
| Works in opencode but not ellamaka | Wrong runtime; validate with `ellamaka` directly |
| Permission change seems ignored | Confirm with `ellamaka agent list` |
| Custom tool rule not matching | Use exact tool name or wildcard like `wopal_*` |
| Legacy config found | Migrate `tools` → `permission`, `maxSteps` → `steps` |

## Editing guidance

- Keep the smallest possible override at the highest appropriate layer
- Put agent-specific restrictions in agent frontmatter
- Put shared defaults in global or space config
- Do not add duplicate rules across multiple layers unless you want explicit override behavior
