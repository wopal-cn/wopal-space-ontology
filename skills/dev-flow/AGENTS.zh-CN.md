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
| `scripts/flow.sh` | CLI 入口，路由到 Python |
| `scripts/flow.py` | argparse 主程序、子命令分发 |
| `scripts/commands/` | 子命令实现 (submit, approve, complete, verify, plan, issue, sync, archive, roadmap, decompose, reset) |
| `scripts/lib/` | 共享库 (git, github, project, workspace, worktree, logging) |
| `templates/` | Plan 和 Issue 模板 |
| `references/` | 命令参考、Plan 校验规则、TDD 指南、故障处理 |
| `tests/python/` | unit/ + integration/ 测试 |

## 3. Development Commands

| Scenario | Command |
|---|---|
| 运行测试 | `python -m pytest tests/python/ -v` |
| CLI 帮助 | `bash scripts/flow.sh <cmd> --help` |
| Plan 校验 | `bash scripts/flow.sh plan <issue> --check` |

运行目录：`.wopal/skills/dev-flow/`

运行依赖：bash 3.x+, `gh` CLI, `jq`, Python 3

## 4. Implementation Rules

### Command Routing

`flow.sh` 匹配已知命令路由到 `flow.py`（argparse），未知命令输出错误列表并 exit 1。新增命令必须同时在 `PYTHON_COMMANDS` 正则和 `flow.py` 中注册。

### State Machine

`planning → reviewing → executing → verifying → done`

每个命令有前置状态要求，非法转换报错。新增命令必须声明前置/后置状态。

### Plan Directory Rules

- `--project` 是 `plan` 命令必填参数
- 标准项目：`projects/<project>/docs/plans/`
- ontology-worktree：`.wopal/docs/plans/`
- `docs/projects/<project>/plans/` 已废弃，禁止新写入
- Plan 文件必须通过 `flow.sh plan ...` 生成或定位，禁止手写创建

### Script Conventions

- `scripts/lib/` 中的模块可被子命令直接 import
- 日志通过 `scripts/lib/logging.py` 统一处理
- GitHub API 操作通过 `scripts/lib/github.py`，不直接调用 `gh`
- Git 操作通过 `scripts/lib/git.py`，不直接调用 `git`

## 5. Testing

- 测试框架：pytest
- 测试目录：`tests/python/unit/`（单元测试）、`tests/python/integration/`（集成测试）
- 测试 fixture：`tests/fixtures/`
- 测试支持工具：`tests/python/support/bootstrap.py`
- **TDD 要求**：新命令或 `scripts/lib/` 模块功能必须先写失败测试，再实现功能使测试通过
- 修改子命令逻辑后必须运行对应单元测试确认无回归

## 6. User-Supplied Rules

(None)
