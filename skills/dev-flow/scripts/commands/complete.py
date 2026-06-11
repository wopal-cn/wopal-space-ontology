#!/usr/bin/env python3
# complete.py - Complete command for dev-flow
#
# Plan-only complete: transitions active Plan to verifying.
# Never commits implementation code — dirty working tree blocks the command.
# Only the active Plan file is committed via commit_paths.
#
# Command:
#   complete <issue> [--pr] - Mark implementation complete, transition to verifying

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.workspace import find_workspace_root
from workflow import update_plan_status
from workflow import guard_status, resolve_space_repo
from plan import find_plan, find_plan_by_issue
from plan import (
    get_plan_issue,
    get_plan_project,
    get_plan_status,
    get_plan_type,
    get_plan_worktree,
    set_plan_worktree,
    set_plan_field,
    get_plan_field,
)
from lib.git import is_repo_dirty, commit_paths, get_dirty_lines
from plan import resolve_project_path
from lib.worktree import resolve_active_plan, parse_worktree_context, ResolveActivePlanError
from validation import (
    ValidationError,
    check_acceptance_criteria,
    check_step_completion,
)
from workflow import (
    parse_plan_status,
    is_valid_transition,
)
from issue import (
    sync_status_label,
    sync_plan_to_issue_body,
    plan_status_to_issue_label,
)


# ============================================
# Helpers
# ============================================


def _create_pr_common(project_path: Path, title: str, body: str) -> str:
    """Create a Pull Request with dynamically resolved repo and base branch.

    Returns:
        PR URL string, or empty string on failure.
    """
    from plan import resolve_project_repo

    target_repo, base_branch = resolve_project_repo(project_path)

    if not target_repo:
        log_error(f"Cannot determine repo for project path: {project_path}")
        return ""

    # Get current branch name (in worktree context, this is the feature branch)
    result = subprocess.run(
        ['git', 'branch', '--show-current'],
        capture_output=True, text=True
    )
    branch = result.stdout.strip()

    if not branch:
        log_error("Cannot determine current branch")
        return ""

    result = subprocess.run(
        [
            'gh', 'pr', 'create',
            '--repo', target_repo,
            '--base', base_branch,
            '--head', branch,
            '--title', title,
            '--body', body,
        ],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        log_error(f"Failed to create PR: {result.stderr}")
        return ""

    output_lines = result.stdout.strip().split('\n')
    pr_url = output_lines[-1].strip()
    return pr_url


def _create_pr(issue_number: int, project_path: Path) -> str:
    """Create a Pull Request for the issue."""
    return _create_pr_common(project_path, f"#{issue_number}", f"Closes #{issue_number}")


def _create_pr_for_plan(plan_name: str, project_path: Path) -> str:
    """Create a Pull Request for a plan (no-issue mode)."""
    return _create_pr_common(project_path, plan_name, f"Plan: {plan_name}")


def _get_plan_name(plan_path: str) -> str:
    """Get plan name from file path (stem without extension)."""
    return Path(plan_path).stem


def _build_plan_only_commit_msg(plan_issue: int | None, plan_name: str) -> str:
    """Build Plan-only commit message for complete."""
    if plan_issue:
        return f"docs(plan): complete plan #{plan_issue}"
    msg = f"docs(plan): complete plan {plan_name}"
    max_total = 72
    if len(msg) > max_total:
        prefix = "docs(plan): complete plan "
        msg = prefix + plan_name[:max_total - len(prefix)]
    return msg


# ============================================
# Verification guidance helpers
# ============================================


def _get_git_porcelain(cwd: str) -> list[str]:
    """Run git status --porcelain and return non-empty lines."""
    return get_dirty_lines(cwd)


def _print_standard_verification_guidance(wt_ctx, issue, workspace_root) -> None:
    """Print verification options for standard projects.

    Shows both worktree-verify and branch-switch options with canonical path status.
    """
    from lib.worktree import WorktreeContext

    assert isinstance(wt_ctx, WorktreeContext)

    repo_root = str(wt_ctx.repo_root)
    worktree_path = str(workspace_root / wt_ctx.path) if not Path(wt_ctx.path).is_absolute() else str(wt_ctx.path)

    # Check canonical path dirty status
    dirty_lines = _get_git_porcelain(repo_root)

    print("")
    log_step("Canonical path check")
    if dirty_lines:
        log_warn(f"Canonical path ({repo_root}) has {len(dirty_lines)} uncommitted files")
    else:
        log_info(f"Canonical path ({repo_root}) is clean")

    print("")
    print("### Verification Options")
    print("")
    print(f"  A) Verify in worktree: {worktree_path}")
    print("     After verification, manually merge feature branch to integration.")
    print("")
    print(f"  B) Switch branch: flow.sh verify-switch {issue}")
    print("     Run verify-switch to checkout feature branch at canonical path, then verify.")


def _print_ontology_verification_guidance(wt_ctx, issue, workspace_root) -> None:
    """Print verification options for ontology-worktree projects.

    Only branch-switch is available; ellamaka loads runtime from .wopal/.
    """
    from lib.worktree import WorktreeContext

    assert isinstance(wt_ctx, WorktreeContext)

    wopal_path = str(workspace_root / ".wopal")

    # Check .wopal/ dirty status
    dirty_lines = _get_git_porcelain(wopal_path)

    print("")
    log_step("Ontology path check")
    if dirty_lines:
        log_warn(f".wopal/ has {len(dirty_lines)} uncommitted files")
    else:
        log_info(f".wopal/ is clean")

    print("")
    print("### Verification Option")
    print("")
    print(f"  flow.sh verify-switch {issue}")
    print("  After verify-switch, restart ellamaka to verify ontology changes.")


# ============================================
# complete command
# ============================================

def cmd_complete(args: argparse.Namespace) -> int:
    """Mark implementation complete and transition to verifying.

    Plan-only commit: only the active Plan file is committed.
    Dirty implementation tree blocks the command with an error.
    """
    input_ref = args.target
    create_pr = getattr(args, 'pr', False)

    if not input_ref:
        log_error("Missing issue number or plan name")
        log_error("Usage: flow.sh complete <issue-or-plan> [--pr]")
        return 1

    workspace_root = find_workspace_root()

    # 1. Find Plan file (smart lookup: Issue number or plan name)
    try:
        plan_path = find_plan(input_ref, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1

    log_info(f"Found plan: {plan_path}")

    plan_name = _get_plan_name(plan_path)

    # Extract Issue number from Plan metadata
    plan_issue = get_plan_issue(plan_path)

    # 2. Resolve active Plan path early — validation gates must use the
    #    worktree Plan (where Done checkboxes are actually ticked),
    #    not the main branch Plan.
    try:
        active = resolve_active_plan(plan_path, "complete", workspace_root)
    except ResolveActivePlanError as e:
        log_error(str(e))
        return 1

    active_plan_path = str(active.active_plan_path)

    # 4. Validate state is "executing" — check active Plan
    current_status = parse_plan_status(active_plan_path)
    if not guard_status(current_status, "executing", input_ref):
        return 1

    # 5. Check Done/Step checkboxes in Implementation (hard gate) — active Plan
    try:
        check_step_completion(active_plan_path)
    except ValidationError as e:
        log_error("")
        log_error(f"Cannot complete: {e}")
        log_error("")
        log_error("Please check the completed steps and update the Plan file:")
        log_error(f"  {active_plan_path}")
        log_error("")
        log_error(f"After completing, run: flow.sh complete {input_ref}")
        return 1

    # 6. Check Agent Verification Acceptance Criteria (hard gate) — active Plan
    try:
        check_acceptance_criteria(active_plan_path)
    except ValidationError as e:
        log_error("")
        log_error(f"Cannot complete: {e}")
        log_error("")
        log_error(f"Please complete the remaining items and update the Plan file:")
        log_error(f"  {active_plan_path}")
        log_error("")
        log_error(f"After completing, run: flow.sh complete {input_ref}")
        return 1

    # 7. Dirty working tree check — block if uncommitted implementation code exists.
    # Plan file dirty is allowed here: AC checkbox marks are Plan-only changes
    # that complete will commit together with the status transition.
    if is_repo_dirty(str(active.commit_repo_root), ignore_paths=[str(active.active_plan_path)]):
        log_error("实施工作树有未提交的变更 — complete 不提交实施代码")
        log_error("")
        log_error("请先提交或储藏未提交的变更:")
        log_error(f"  cd {active.commit_repo_root} && git status")
        log_error("")
        log_error("实施代码提交是实施 agent (fae) 的职责，complete 只提交 Plan 状态变更")
        return 1

    # 8. Resolve repo lazily for Issue sync
    repo = resolve_space_repo(plan_issue, workspace_root)

    # 9. Validate state transition
    target_status = "verifying"

    if not is_valid_transition(current_status, target_status):
        log_error(f"Invalid state transition: {current_status} -> {target_status}")
        return 1

    # 10. Two paths: with PR or without PR
    if create_pr:
        project = get_plan_project(plan_path)
        if not project:
            log_error("Cannot create PR: no Target Project in plan")
            return 1

        # Resolve project path for dynamic repo/branch detection
        project_path = resolve_project_path(plan_path, project, workspace_root)
        if not project_path:
            log_error(f"Cannot resolve project path for: {project}")
            return 1

        pr_url = ""

        if plan_issue:
            pr_url = _create_pr(plan_issue, project_path)
        else:
            pr_url = _create_pr_for_plan(plan_name, project_path)

        if not pr_url:
            return 1

        log_success(f"PR created: {pr_url}")

        # State transition on active Plan
        if not update_plan_status(str(active.active_plan_path), target_status):
            log_error("Failed to update Plan status")
            return 1
        log_success(f"Plan status updated: {target_status}")

        # Persist PR URL in Plan metadata
        set_plan_field(str(active.active_plan_path), "PR", pr_url)

        # Plan-only commit
        commit_msg = _build_plan_only_commit_msg(plan_issue, plan_name)
        if not commit_paths(str(active.commit_repo_root), [active.repo_relative_plan_path], commit_msg):
            log_warn("Failed to commit Plan status change")

        # Sync Issue
        if plan_issue and repo:
            sync_status_label(plan_issue, target_status, repo)
            sync_plan_to_issue_body(plan_issue, plan_path, repo, str(workspace_root))

        next_ref = str(plan_issue) if plan_issue else plan_name
        print("")
        print("Status: verifying (PR opened)")
        print("")
        print("Waiting for PR merge. After user confirms, run:")
        print(f"  flow.sh verify {next_ref} --confirm")

    else:
        # Without PR path: state transition + Plan-only commit + sync

        # State transition on active Plan
        if not update_plan_status(str(active.active_plan_path), target_status):
            log_error("Failed to update Plan status")
            return 1
        log_success(f"Plan status updated: {target_status}")

        # Plan-only commit
        commit_msg = _build_plan_only_commit_msg(plan_issue, plan_name)
        if not commit_paths(str(active.commit_repo_root), [active.repo_relative_plan_path], commit_msg):
            log_warn("Failed to commit Plan status change")

        # Sync Issue if exists
        if plan_issue and repo:
            sync_status_label(plan_issue, target_status, repo)
            sync_plan_to_issue_body(plan_issue, plan_path, repo, str(workspace_root))

        next_ref = str(plan_issue) if plan_issue else plan_name
        print("")
        print("Status: verifying")
        print("")
        print("Implementation complete. Waiting for user verification.")
        print("")
        print("After user confirms, run:")
        print(f"  flow.sh verify {next_ref} --confirm")
        if plan_issue:
            print("")
            print(f"Issue: #{plan_issue}")

        # Verification guidance — print canonical path status and options
        try:
            wt_ctx = parse_worktree_context(plan_path)
            if wt_ctx and wt_ctx.project_type == "ontology-worktree":
                _print_ontology_verification_guidance(wt_ctx, next_ref, workspace_root)
            elif wt_ctx:
                _print_standard_verification_guidance(wt_ctx, next_ref, workspace_root)
        except Exception as e:
            log_warn(f"Failed to generate verification guidance: {e}")

    return 0


# ============================================
# argparse registration
# ============================================

def register_complete_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register complete subcommand."""
    complete_parser = subparsers.add_parser(
        "complete",
        help="Mark implementation complete, transition to verifying"
    )
    complete_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name"
    )
    complete_parser.add_argument(
        "--pr",
        action="store_true",
        default=False,
        help="Create a Pull Request when completing"
    )
