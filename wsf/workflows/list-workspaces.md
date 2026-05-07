<purpose>
List all WSF workspaces found in ~/wsf-workspaces/ with their status.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 1. Setup

```bash
INIT=$(node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" init list-workspaces)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `workspace_base`, `workspaces`, `workspace_count`.

## 2. Display

**If `workspace_count` is 0:**

```
No workspaces found in ~/wsf-workspaces/

Create one with:
  /wsf-new-workspace --name my-workspace --repos repo1,repo2
```

Done.

**If workspaces exist:**

Display a table:

```
WSF Workspaces (~/wsf-workspaces/)

| Name | Repos | Strategy | WSF Project |
|------|-------|----------|-------------|
| feature-a | 3 | worktree | Yes |
| feature-b | 2 | clone | No |

Manage:
  cd ~/wsf-workspaces/<name>     # Enter a workspace
  /wsf-remove-workspace <name>   # Remove a workspace
```

For each workspace, show:
- **Name** — directory name
- **Repos** — count from init data
- **Strategy** — from WORKSPACE.md
- **WSF Project** — whether `.planning/PROJECT.md` exists (Yes/No)

</process>
