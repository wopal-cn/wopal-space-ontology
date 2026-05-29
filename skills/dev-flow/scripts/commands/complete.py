#!/usr/bin/env python3
# complete.py - Complete command for dev-flow
#
# Ported from scripts/cmd/complete.sh
#
# Command:
#   complete <issue> [--pr] - Mark implementation complete, transition to verifying
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "executing"
#   3. Check Agent Verification Acceptance Criteria (hard gate)
#   4. Validate state transition (executing -> verifying)
#   5. [--pr] Create Pull Request
#   6. Update Plan status to "verifying"
#   7. Sync Issue (status label + body)

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from lib.logging import log_info, log_success, log_error, log_warn
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
from plan import commit_project_changes, commit_ontology_worktree
from lib.git import has_uncommitted_changes, commit_paths
from plan import resolve_project_path
from lib.project import resolve_plan_location
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


def _build_complete_message(
    plan_type: str,
    issue_number: int | None,
    plan_name: str,
    repo: str | None,
) -> str:
    """Build commit message for same-repo merge commit (code + Plan status).

    Uses plan.py's build_commit_message for Issue-aware messages.
    """
    from plan import build_commit_message
    return build_commit_message(plan_name, plan_type, issue_number, repo)


# ============================================
# complete command
# ============================================

def cmd_complete(args: argparse.Namespace) -> int:
    """Mark implementation complete and transition to verifying."""
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

    # 2. Check current Plan status
    current_status = parse_plan_status(plan_path)

    if not current_status:
        log_error("Cannot parse Plan status")
        return 1

    # 3. Validate state is "executing"
    if not guard_status(current_status, "executing", input_ref):
        return 1

    # 4. Check Done/Step checkboxes in Implementation (hard gate)
    try:
        check_step_completion(plan_path)
    except ValidationError as e:
        log_error("")
        log_error(f"Cannot complete: {e}")
        log_error("")
        log_error("Please check the completed steps and update the Plan file:")
        log_error(f"  {plan_path}")
        log_error("")
        log_error(f"After completing, run: flow.sh complete {input_ref}")
        return 1

    # 5. Check Agent Verification Acceptance Criteria (hard gate)
    try:
        check_acceptance_criteria(plan_path)
    except ValidationError as e:
        log_error("")
        log_error(f"Cannot complete: {e}")
        log_error("")
        log_error(f"Please complete the remaining items and update the Plan file:")
        log_error(f"  {plan_path}")
        log_error("")
        log_error(f"After completing, run: flow.sh complete {input_ref}")
        return 1

    # 6. Resolve repo lazily for Issue sync
    repo = resolve_space_repo(plan_issue, workspace_root)

    # Extract Target Project from Plan
    project = get_plan_project(plan_path)

    # 6. Resolve Plan location and determine same-repo condition
    project_type_str = get_plan_field(plan_path, "Project Type")
    plan_type = get_plan_type(plan_path) or "chore"

    plan_location = resolve_plan_location(Path(plan_path), workspace_root)
    plan_repo_root = str(plan_location.repo_root)

    # Determine code repo root (where code changes will be committed)
    code_repo_root = None
    if project_type_str == "ontology-worktree":
        code_repo_root = str((workspace_root / ".wopal").resolve())
    elif project:
        project_path_obj = resolve_project_path(plan_path, project, workspace_root)
        if project_path_obj:
            wt = get_plan_worktree(plan_path)
            wt_path = wt.get('path') if wt else None
            if wt_path and Path(wt_path).exists():
                code_repo_root = str(Path(wt_path).resolve())
            else:
                code_repo_root = str(project_path_obj.resolve())

    # Same repo = Plan file and code share the same working directory root.
    # This is the condition for merge commit (D-03, D-07).
    # Worktree paths are different working dirs even if same underlying git repo,
    # so they won't match here — which is correct (separate commits on separate branches).
    same_repo = (
        code_repo_root is not None
        and Path(plan_repo_root).resolve() == Path(code_repo_root).resolve()
    )

    if not same_repo:
        # Different repos or worktree: commit code now, Plan status later.
        # This preserves the existing behavior for separate-repo scenarios.
        if project_type_str == "ontology-worktree":
            if not commit_ontology_worktree(workspace_root, plan_type, plan_issue, plan_name, repo):
                log_error("Failed to commit ontology changes")
                return 1
        elif project:
            project_path_obj = resolve_project_path(plan_path, project, workspace_root)
            if project_path_obj:
                wt = get_plan_worktree(plan_path)
                wt_path = wt.get('path') if wt else None
                if wt_path and Path(wt_path).exists():
                    # Worktree: commit on worktree branch
                    wt_path = wt['path']
                    if has_uncommitted_changes(wt_path):
                        if not commit_project_changes(wt_path, plan_type, plan_issue, plan_name, repo):
                            log_error("Failed to commit worktree changes")
                            return 1
                else:
                    # No worktree: commit directly in project dir
                    if has_uncommitted_changes(str(project_path_obj)):
                        if not commit_project_changes(str(project_path_obj), plan_type, plan_issue, plan_name, repo):
                            log_error("Failed to commit project changes")
                            return 1
    # else: same_repo — defer commit until after Plan status update (merge commit)

    # 6. Validate state transition
    target_status = "verifying"

    if not is_valid_transition(current_status, target_status):
        log_error(f"Invalid state transition: {current_status} -> {target_status}")
        return 1

    # 7. Two paths: with PR or without PR
    if create_pr:
        if not project:
            log_error("Cannot create PR: no Target Project in plan")
            return 1

        # Resolve project path for dynamic repo/branch detection
        project_path = resolve_project_path(plan_path, project, workspace_root)
        if not project_path:
            log_error(f"Cannot resolve project path for: {project}")
            return 1

        pr_url = ""
        effective_issue = plan_issue

        if effective_issue:
            # With Issue: create PR referencing Issue
            pr_url = _create_pr(effective_issue, project_path)
            if not pr_url:
                return 1

            log_success(f"PR created: {pr_url}")

            # State transition
            if update_plan_status(plan_path, target_status):
                log_success(f"Plan status updated: {target_status}")
            else:
                log_error("Failed to update Plan status")
                return 1

            # Persist PR URL in Plan metadata
            set_plan_field(plan_path, "PR", pr_url)

            # Sync Issue status label to verifying
            if repo:
                status_label = plan_status_to_issue_label(target_status)
                if status_label:
                    sync_status_label(effective_issue, target_status, repo)

                # Sync Agent Verification AC to Issue body
                sync_plan_to_issue_body(effective_issue, plan_path, repo, str(workspace_root))
        else:
            # No Issue: create PR without Issue reference
            pr_url = _create_pr_for_plan(plan_name, project_path)
            if not pr_url:
                return 1

            log_success(f"PR created: {pr_url}")

            # State transition
            if update_plan_status(plan_path, target_status):
                log_success(f"Plan status updated: {target_status}")
            else:
                log_error("Failed to update Plan status")
                return 1

            # Persist PR URL in Plan metadata
            set_plan_field(plan_path, "PR", pr_url)

        effective_issue = plan_issue

        if effective_issue:
            next_ref = str(effective_issue)
        else:
            next_ref = plan_name

        print("")
        print("Status: verifying (PR opened)")
        print("")
        print("Waiting for PR merge. After user confirms, run:")
        print(f"  flow.sh verify {next_ref} --confirm")

    else:
        # Without PR path: state transition + sync
        if update_plan_status(plan_path, target_status):
            log_success(f"Plan status updated: {target_status}")
        else:
            log_error("Failed to update Plan status")
            return 1

        effective_issue = plan_issue

        # Sync Issue if exists
        if effective_issue and repo:
            status_label = plan_status_to_issue_label(target_status)
            if status_label:
                sync_status_label(effective_issue, target_status, repo)

            # Sync Agent Verification AC to Issue body
            sync_plan_to_issue_body(effective_issue, plan_path, repo, str(workspace_root))

        print("")
        print("Status: verifying")
        print("")
        print("Implementation complete. Waiting for user verification.")
        print("")
        print("After user confirms, run:")
        next_ref = plan_issue or plan_name
        print(f"  flow.sh verify {next_ref} --confirm")
        if effective_issue:
            print("")
            print(f"Issue: #{effective_issue}")

    # 8. Final commit: same-repo merge commit or Plan-only commit
    if same_repo:
        # D-03 / D-07: code changes + Plan status=verifying in one commit
        if has_uncommitted_changes(plan_repo_root):
            commit_msg = _build_complete_message(plan_type, plan_issue, plan_name, repo)
            from lib.git import commit_all as _commit_all
            if not _commit_all(plan_repo_root, commit_msg):
                log_error("Failed to commit combined code + Plan changes")
                return 1
            log_success(f"Same-repo merge commit: {commit_msg}")
    else:
        # Different repos: commit Plan status change in Plan's repo
        plan_rel = plan_location.repo_relative_path
        if plan_issue:
            plan_commit_msg = f"docs(plan): complete plan #{plan_issue}"
        else:
            plan_commit_msg = f"docs(plan): complete plan {plan_name}"
            max_total = 72
            if len(plan_commit_msg) > max_total:
                prefix = "docs(plan): complete plan "
                plan_commit_msg = prefix + plan_name[:max_total - len(prefix)]
        if not commit_paths(plan_repo_root, [plan_rel], plan_commit_msg):
            log_warn("Failed to commit Plan status change in Plan's repo")

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
