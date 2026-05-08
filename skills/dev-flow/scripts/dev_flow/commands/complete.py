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

from dev_flow.domain.plan.find import find_plan, find_plan_by_issue, _find_workspace_root
from dev_flow.domain.plan.metadata import (
    get_plan_field,
    get_plan_issue,
    get_plan_project,
    set_plan_field,
)
from dev_flow.domain.validation.check_doc import (
    ValidationError,
    check_acceptance_criteria,
    check_step_completion,
)
from dev_flow.domain.workflow import (
    parse_plan_status,
    is_valid_transition,
)
from dev_flow.domain.issue.sync import (
    sync_status_label,
    sync_plan_to_issue_body,
    plan_status_to_issue_label,
)


# ============================================
# Logging
# ============================================

def log_info(msg: str) -> None:
    print(f"\033[0;34m[INFO]\033[0m {msg}")


def log_success(msg: str) -> None:
    print(f"\033[0;32m[OK]\033[0m {msg}")


def log_error(msg: str, file=None) -> None:
    print(f"\033[0;31m[ERROR]\033[0m {msg}", file=file or sys.stderr)


def log_warn(msg: str) -> None:
    print(f"\033[0;33m[WARN]\033[0m {msg}")


# ============================================
# Helpers
# ============================================

def _resolve_repo(repo: str = None) -> str:
    """Resolve repository name (owner/repo format)."""
    if repo:
        return repo
    try:
        result = subprocess.run(
            ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def _update_plan_status(plan_path: str, new_status: str) -> bool:
    """
    Update Plan status field in metadata section.
    """
    import re
    path = Path(plan_path)
    if not path.exists():
        return False

    content = path.read_text()
    pattern = r'^\- \*\*Status\*\*:\s*\w+'
    new_line = f'- **Status**: {new_status}'
    new_content = re.sub(pattern, new_line, content, count=1, flags=re.MULTILINE)

    if new_content == content:
        log_warn("Status field not found or unchanged")
        return False

    path.write_text(new_content)
    return True


def _create_pr(issue_number: int, project: str, base: str = "main") -> str:
    """
    Create a Pull Request for the issue in the target project repo.

    Returns:
        PR URL string
    """
    import re

    # Determine target repo from project name
    # Map project name to GitHub repo
    project_repo_map = {
        "ontology": "wopal-cn/ontology",
        "wopal-cli": "wopal-cn/wopal-cli",
        "space-flow": "wopal-cn/wopal-space-flow",
        "ellamaka": "sampx/ellamaka",
    }
    target_repo = project_repo_map.get(project)

    if not target_repo:
        # Try to determine from gh CLI
        log_error(f"Cannot determine repo for project: {project}")
        return ""

    # Get current branch name
    result = subprocess.run(
        ['git', 'branch', '--show-current'],
        capture_output=True, text=True
    )
    branch = result.stdout.strip()

    if not branch:
        log_error("Cannot determine current branch")
        return ""

    # Create PR
    title = f"#{issue_number}"
    body = f"Closes #{issue_number}"

    result = subprocess.run(
        [
            'gh', 'pr', 'create',
            '--repo', target_repo,
            '--base', base,
            '--head', branch,
            '--title', title,
            '--body', body,
        ],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        log_error(f"Failed to create PR: {result.stderr}")
        return ""

    # gh pr create outputs the PR URL as the last line
    output_lines = result.stdout.strip().split('\n')
    pr_url = output_lines[-1].strip()

    return pr_url


def _create_pr_for_plan(plan_name: str, project: str, base: str = "main") -> str:
    """
    Create a Pull Request for a plan (no-issue mode).

    Returns:
        PR URL string
    """
    project_repo_map = {
        "ontology": "wopal-cn/ontology",
        "wopal-cli": "wopal-cn/wopal-cli",
        "space-flow": "wopal-cn/wopal-space-flow",
        "ellamaka": "sampx/ellamaka",
    }
    target_repo = project_repo_map.get(project)

    if not target_repo:
        log_error(f"Cannot determine repo for project: {project}")
        return ""

    result = subprocess.run(
        ['git', 'branch', '--show-current'],
        capture_output=True, text=True
    )
    branch = result.stdout.strip()

    if not branch:
        log_error("Cannot determine current branch")
        return ""

    title = plan_name
    body = f"Plan: {plan_name}"

    result = subprocess.run(
        [
            'gh', 'pr', 'create',
            '--repo', target_repo,
            '--base', base,
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


def _get_plan_name(plan_path: str) -> str:
    """Get plan name from file path (stem without extension)."""
    return Path(plan_path).stem


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

    workspace_root = _find_workspace_root()

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
    if current_status != "executing":
        log_error(f"Plan must be in executing state to complete (current: {current_status})")
        log_error("")

        suggestion_map = {
            "planning": f"Run: flow.sh approve {input_ref} --confirm",
            "verifying": f"Run: flow.sh verify {input_ref} --confirm",
            "done": f"Run: flow.sh archive {input_ref}",
        }

        suggestion = suggestion_map.get(current_status, "Check plan status")
        log_error(suggestion)

        return 1

    # 4. Check step checkboxes in Implementation and Test Plan (hard gate)
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

    # 6. Resolve repo for Issue sync
    repo = _resolve_repo()

    # Extract Target Project from Plan
    project = get_plan_project(plan_path)

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

        pr_url = ""
        effective_issue = plan_issue

        if effective_issue:
            # With Issue: create PR referencing Issue
            pr_url = _create_pr(effective_issue, project)
            if not pr_url:
                return 1

            log_success(f"PR created: {pr_url}")

            # State transition
            if _update_plan_status(plan_path, target_status):
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
            pr_url = _create_pr_for_plan(plan_name, project)
            if not pr_url:
                return 1

            log_success(f"PR created: {pr_url}")

            # State transition
            if _update_plan_status(plan_path, target_status):
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
        if _update_plan_status(plan_path, target_status):
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
