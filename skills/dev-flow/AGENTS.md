---
name: dev-flow
description: Issue/Plan-driven development workflow CLI — state-machine commands, plan validation, worktree isolation, and delegation orchestration
---

# Agent Development Rules

## 1. Canonical References

- Parent Rules: `.wopal/AGENTS.md`
- Commands: `references/commands.md`
- Plan Guide: `references/plan-guide.md`
- Active Plan Graph: `references/active-plan-graph.md`
- Issue Guide: `references/issue-guide.md`
- Troubleshooting: `references/troubleshooting.md`

## 2. Architecture and Directories

| Directory | Responsibility |
|---|---|
| `scripts/flow.sh` | CLI entry point, routes to Python |
| `scripts/flow.py` | argparse main program, subcommand dispatch |
| `scripts/commands/` | Subcommand implementations (submit, approve, complete, verify, plan, issue, sync, archive, reset) |
| `scripts/lib/` | Shared libraries (git, github, project, workspace, worktree, logging) |
| `templates/` | Plan and Issue templates |
| `references/` | Command reference, plan guide, troubleshooting |
| `tests/python/` | unit/ + integration/ tests |

## 3. Development Commands

| Scenario | Command |
|---|---|
| Run tests | `python -m pytest tests/python/ -v` |
| CLI help | `bash scripts/flow.sh <cmd> --help` |
| Plan validation | `bash scripts/flow.sh plan check <name-or-path>` |

Working directory: `.wopal/skills/dev-flow/`

Runtime dependencies: bash 3.x+, `gh` CLI, `jq`, Python 3.10+

## 4. Implementation Rules

### Command Routing

`flow.sh` matches known commands and routes to `flow.py` (argparse). Unknown commands print an error list and exit 1. New commands must register in both the `PYTHON_COMMANDS` regex and `flow.py`.

### State Machine

`planning → reviewing → executing → verifying → done`

Each command requires a prerequisite state; invalid transitions error out. New commands must declare their prerequisite and resulting states.

`plan check` checks only mechanical metadata the lifecycle truly depends on: Status, Product/Phase pairing, and Project Path when needed. Plan content quality belongs to authoring/review; `complete` / `verify` only gate completion-state checkboxes.

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
- Test support utilities: `tests/python/support/bootstrap.py` (scripts path injection), `git_fixtures.py` (real git repo fixtures), `plan_fixtures.py` (Plan files named per the naming contract)
- **TDD requirement**: new commands or `scripts/lib/` module features must have a failing test written first, then implementation to make it pass
- After modifying subcommand logic, run the corresponding unit tests to confirm no regression

### Six Hard Rules (R1–R6)

These rules prevent test bloat and decoration tests (tests that pass while the logic is wrong). Every new or modified test must satisfy all six.

**R1 Behavior assertions only.** Every test asserts a given input → output mapping (return value, exception, file result). Asserting call sequences, which mock branch was taken, intermediate state, exact output format strings (e.g. `">> planning <<"`), or searching source code as strings (e.g. `assert "--merge" not in source`) is forbidden — assert return codes and key substrings instead. Validity check: if the implementation were rewritten in an equivalent way, the test must still pass unchanged. If it cannot, the test is coupled to implementation and invalid.

**R2 Mock data must be traceable.** Any mock output must come from real samples recorded under `tests/fixtures/`. Hand-written fake data (e.g. `"tree-main\n"` or ad-hoc porcelain fragments) is forbidden. Each fixture documents the scenario it was recorded from.

**R3 One case per behavior.** One test case per input → output mapping. "Different code path, same behavior" is duplication and forbidden. Do not enumerate dictionary lookup tables with N `assertEqual(func("key"), "value")` calls; same-shaped cases must be `parametrize`d into a table — one line per case, no copy-paste variants.

**R4 Boilerplate threshold: 3 strikes.** The same mock/construction boilerplate appearing 3 times must be extracted into a shared helper. When a test file exceeds 3× the line count of the implementation file it covers, stop adding tests and slim down first.

**R5 Meaningful red-green.** For new, fixed, or intentionally changed behavior, a new regression test should fail against the old implementation (RED) before the implementation turns it green. Do not manufacture fake RED cycles for behavior-preserving refactors, deletion of obsolete behavior, characterization tests, or similar work. When behavior is deleted, remove tests whose only purpose was to assert that deleted behavior; when fixing a bug, also remove redundant old tests that cover the same decision instead of stacking them.

**R6 Never freeze implementation coincidence.** Behaviors that merely happen to hold in the current implementation (e.g. "worktree dir name == branch name") must not be asserted unless a contract document supports them. Such tests harden bugs into specifications.

### Mock Isolation Rules

**No module-level mocking**: Never inject mocks via `sys.modules[name] = MagicMock()` at the top of a test file. This pollutes the global module cache, causing subsequent test files to receive fake modules instead of real code. Instead, import real modules directly and use `@patch` at the function level for side-effecting functions (git, network, logging).

**Function-level mock principle**: Only mock functions with side effects (git operations, network requests, log output). Python module import = loading function definitions, no side effects execute. Tests that operate on the filesystem must use `tempfile.mkdtemp()` for isolation and clean up in `tearDown`.

## 6. User-Supplied Rules

(None)
