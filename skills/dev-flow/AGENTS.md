---
name: dev-flow
description: Issue/Plan-driven development workflow CLI — state-machine commands, plan validation, worktree isolation, and delegation orchestration
---

# Agent Development Rules

## 1. Canonical References

- Parent Rules: `.wopal/AGENTS.md`
- Commands: `references/commands.md`
- Plan Authoring & Delegation: `references/plan-authoring.md`
- Plan Validation: `references/plan-validation.md`
- TDD Guide: `references/tdd-guide.md`
- Issue Format & Naming: `references/issue-format.md`
- Troubleshooting: `references/troubleshooting.md`

## 2. Architecture and Directories

| Directory | Responsibility |
|---|---|
| `scripts/flow.sh` | CLI entry point, routes to Python |
| `scripts/flow.py` | argparse main program, subcommand dispatch |
| `scripts/commands/` | Subcommand implementations (submit, approve, complete, verify, plan, issue, sync, archive, roadmap, decompose, reset) |
| `scripts/lib/` | Shared libraries (git, github, project, workspace, worktree, logging) |
| `templates/` | Plan and Issue templates |
| `references/` | Command reference, plan validation rules, TDD guide, troubleshooting |
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

### Plan Directory Rules

- `--project` is a required parameter for the `plan` command
- Standard projects: `projects/<project>/docs/plans/`
- ontology-worktree: `.wopal/docs/plans/`
- `docs/projects/<project>/plans/` is deprecated; writing new plans there is forbidden
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

## 6. User-Supplied Rules

(None)
