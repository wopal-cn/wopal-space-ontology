---
name: dev-flow
description: Issue/Plan-driven development workflow CLI — state-machine commands, plan validation, worktree isolation, and delegation orchestration
---

# Agent Development Rules

## 1. Canonical References

- Parent Rules: `.wopal/AGENTS.md`
- Commands: `references/commands.md`
- Plan Guide: `references/plan-guide.md`
- Issue Guide: `references/issue-guide.md`
- Troubleshooting: `references/troubleshooting.md`

## 2. Architecture and Directories

| Directory | Responsibility |
|---|---|
| `scripts/flow.sh` | CLI entry point, routes to Python |
| `scripts/flow.py` | argparse main program, subcommand dispatch |
| `scripts/commands/` | Subcommand implementations (submit, approve, complete, verify, plan, issue, sync, archive, roadmap, decompose, reset) |
| `scripts/lib/` | Shared libraries (git, github, project, workspace, worktree, logging) |
| `templates/` | Plan and Issue templates |
| `references/` | Command reference, plan guide, troubleshooting |
| `tests/python/` | unit/ + integration/ tests |

## 3. Development Commands

| Scenario | Command |
|---|---|
| Run tests | `python -m pytest tests/python/ -v` |
| CLI help | `bash scripts/flow.sh <cmd> --help` |
| Plan validation | `bash scripts/flow.sh plan <issue> --check` |

Working directory: `.wopal/skills/dev-flow/`

Runtime dependencies: bash 3.x+, `gh` CLI, `jq`, Python 3

## 4. Implementation Rules

### Command Routing

`flow.sh` matches known commands and routes to `flow.py` (argparse). Unknown commands print an error list and exit 1. New commands must register in both the `PYTHON_COMMANDS` regex and `flow.py`.

### State Machine

`planning → reviewing → executing → verifying → done`

Each command requires a prerequisite state; invalid transitions error out. New commands must declare their prerequisite and resulting states.

`plan check` validates that a Plan's declared Status belongs to this state machine. When a User Validation section is present, the checker requires at least one scenario and a final confirmation checkbox; `verify` confirms that the user has checked it.

### Plan Directory Rules

- `--project` is a required parameter for the `plan` command
- All projects: `.wopal-space/plans/<project>/`
- Plan files must be created or located via `flow.sh plan ...`; manual file creation is forbidden

### Script Conventions

- Modules in `scripts/lib/` can be imported directly by subcommands
- Logging goes through `scripts/lib/logging.py`
- GitHub API operations use `scripts/lib/github.py`; do not call `gh` directly
- Git operations use `scripts/lib/git.py`; do not call `git` directly

## 5. Testing

- Test framework: pytest
- Test directories: `tests/python/unit/` (unit), `tests/python/integration/` (integration)
- Test fixtures: `tests/fixtures/`
- Test support utilities: `tests/python/support/bootstrap.py`
- **TDD requirement**: new commands or `scripts/lib/` module features must have a failing test written first, then implementation to make it pass
- After modifying subcommand logic, run the corresponding unit tests to confirm no regression

### Test Isolation and Quality Rules

**No module-level mocking**: Never inject mocks via `sys.modules[name] = MagicMock()` at the top of a test file. This pollutes the global module cache, causing subsequent test files to receive fake modules instead of real code. Instead, import real modules directly and use `@patch` at the function level for side-effecting functions (git, network, logging).

**Function-level mock principle**: Only mock functions with side effects (git operations, network requests, log output). Python module import = loading function definitions, no side effects execute. Tests that operate on the filesystem must use `tempfile.mkdtemp()` for isolation and clean up in `tearDown`.

**Test behavior, not implementation**:
- Do not enumerate dictionary lookup tables with N `assertEqual(func("key"), "value")` tests — use `subTest` parametrization
- Do not assert exact output format strings (e.g., `">> planning <<"`) — assert return codes and key substrings
- Do not search source code as strings (e.g., `assert "--merge" not in source`) — this is an implementation detail that breaks on refactor

## 6. User-Supplied Rules

(None)
