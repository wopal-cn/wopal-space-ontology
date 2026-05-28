#!/usr/bin/env python3
# verify.py - Verify command for dev-flow
#
# Ported from scripts/cmd/verify.sh
#
# Command:
#   verify <issue> [--confirm] - Verify and confirm completion, transition to done
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "verifying"
#   3. [--pr path] Check PR merge status
#   4. [--confirm] Gate: must have explicit user authorization
#   5. [Hard gate] Check User Validation final checkbox
#   6. Update Plan status to "done"
#   7. Sync Issue (status label + body + close)

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from lib.logging import log_info, log_success, log_error, log_warn
from lib.workspace import find_workspace_root
from workflow import update_plan_status
from workflow import guard_status, resolve_space_repo
from plan import find_plan, find_plan_by_issue
from plan import (
    get_plan_field,
    get_plan_issue,
)
from validation import (
    ValidationError,
    check_user_validation,
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

def _is_pr_merged(pr_url: str) -> bool:
    """
    Check if a PR is merged by querying the gh CLI.

    Args:
        pr_url: Full PR URL (e.g., https://github.com/owner/repo/pull/123)

    Returns:
        True if PR is merged, False otherwise
    """
    # Extract repo and PR number from URL
    # Format: https://github.com/owner/repo/pull/123
    match = re.match(r'https?://github\.com/([^/]+/[^/]+)/pull/(\d+)', pr_url)
    if not match:
        return False

    repo = match.group(1)
    pr_number = match.group(2)

    try:
        result = subprocess.run(
            ['gh', 'pr', 'view', pr_number, '--repo', repo,
             '--json', 'state,merged', '--jq', '.state,.merged'],
            capture_output=True, text=True, check=True
        )
        lines = result.stdout.strip().split('\n')
        state = lines[0].strip().strip('"')
        merged = lines[1].strip().strip('"') if len(lines) > 1 else "false"

        return state == "MERGED" or merged == "true"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def _search_merged_pr_for_issue(issue_number: int, repo: str) -> bool:
    """
    Search for a merged PR referencing the issue.

    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format

    Returns:
        True if a merged PR is found, False otherwise
    """
    try:
        result = subprocess.run(
            ['gh', 'pr', 'list', '--repo', repo,
             '--state', 'merged', '--search', f'Closes #{issue_number}',
             '--json', 'number,url'],
            capture_output=True, text=True
        )

        if result.returncode != 0:
            return False

        output = result.stdout.strip()
        if not output or output == "[]":
            return False

        # Parse JSON array
        prs = json.loads(output)
        return len(prs) > 0
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        return False


def _get_pr_url_from_issue(issue_number: int, repo: str) -> str:
    """
    Extract PR URL from Issue body.

    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format

    Returns:
        PR URL string, or empty string if not found
    """
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo,
             '--json', 'body', '--jq', '.body'],
            capture_output=True, text=True, check=True
        )

        body = result.stdout.strip()

        # Look for PR URL in table or text
        pr_match = re.search(r'\| PR \| (https://github\.com/[^/]+/[^/]+/pull/\d+) \|', body)
        if pr_match:
            return pr_match.group(1)

        # Also try plain URL
        pr_match = re.search(r'(https://github\.com/[^/]+/[^/]+/pull/\d+)', body)
        if pr_match:
            return pr_match.group(1)

        return ""
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def _get_plan_name(plan_path: str) -> str:
    """Get plan name from file path (stem without extension)."""
    return Path(plan_path).stem


# ============================================
# verify command
# ============================================

def cmd_verify(args: argparse.Namespace) -> int:
    """Verify and confirm completion, transition to done."""
    input_ref = args.target
    confirm = getattr(args, 'confirm', False)

    if not input_ref:
        log_error("Missing issue number or plan name")
        log_error("Usage: flow.sh verify <issue-or-plan> [--confirm]")
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

    # 2. Check current Plan status
    current_status = parse_plan_status(plan_path)

    if not current_status:
        log_error("Cannot parse Plan status")
        return 1

    # 3. Validate state is "verifying"
    if not guard_status(current_status, "verifying", input_ref):
        return 1

    # 4. Extract Issue number from Plan metadata
    plan_issue = get_plan_issue(plan_path)
    effective_issue = plan_issue

    # Resolve repo lazily for Issue sync / PR lookup
    repo = resolve_space_repo(effective_issue, workspace_root)

    # 5. Check PR merge status (PR path detection)
    is_pr_path = False
    pr_merged = False
    plan_pr_url = get_plan_field(plan_path, "PR")

    if plan_pr_url:
        # PR URL stored in Plan metadata
        is_pr_path = True

        if _is_pr_merged(plan_pr_url):
            pr_merged = True
            log_success(f"PR merged: {plan_pr_url}")
        else:
            log_error("PR not merged yet")
            log_error(f"PR URL: {plan_pr_url}")
            log_error("")
            log_error("Wait for PR to be merged before verifying.")
            return 1

    elif effective_issue and repo:
        # Check if Issue has pr/opened label or PR URL in body
        pr_url = _get_pr_url_from_issue(effective_issue, repo)

        if pr_url:
            is_pr_path = True

            if _is_pr_merged(pr_url):
                pr_merged = True
                log_success(f"PR merged: {pr_url}")
            else:
                log_error("PR not merged yet")
                log_error(f"PR URL: {pr_url}")
                log_error("")
                log_error("Wait for PR to be merged before verifying.")
                return 1
        else:
            # Try to find merged PR via search
            log_info("No PR URL in Issue body, searching for merged PR...")
            if _search_merged_pr_for_issue(effective_issue, repo):
                is_pr_path = True
                pr_merged = True
                log_success(f"Found merged PR referencing #{effective_issue}")
            # If no PR found, it's not a PR path — proceed without PR check

    # 6. --confirm gate: user authorization
    if not confirm:
        print("")
        if is_pr_path and pr_merged:
            print("Status: verifying (PR merged, awaiting user confirmation)")
            print("")
            print("PR merged. Waiting for user to confirm verification.")
        else:
            print("Status: verifying (awaiting user confirmation)")
            print("")
            print(f"Please verify User Validation items in the Plan:")
            print(f"  {plan_path}")
        print("")
        print("After user verifies, run:")
        next_ref = plan_issue or plan_name
        print(f"  flow.sh verify {next_ref} --confirm")
        return 0

    # --confirm received: user authorization gate passed

    # 7. HARD GATE: User Validation must pass
    try:
        check_user_validation(plan_path)
    except ValidationError as e:
        log_error("")
        log_error(f"User Validation gate failed - cannot proceed with verify --confirm")
        log_error("")
        log_error("Please complete the user validation scenarios and check the final confirmation checkbox:")
        log_error("  1. Perform the scenarios described in ### User Validation section")
        log_error("  2. Check the final checkbox: - [x] 用户已完成上述功能验证并确认结果符合预期")
        log_error("  ⚠️ Agent 禁止代为勾选，必须由用户本人执行")
        log_error(f"  3. Re-run: flow.sh verify {input_ref} --confirm")
        return 1

    log_success("User validation passed")

    # 8. Validate state transition
    target_status = "done"

    if not is_valid_transition(current_status, target_status):
        log_error(f"Invalid state transition: {current_status} -> {target_status}")
        return 1

    # 9. Update Plan status to done
    if update_plan_status(plan_path, target_status):
        log_success(f"Plan status updated: {target_status}")
    else:
        log_error("Failed to update Plan status")
        return 1

    # 10. Sync Issue if exists
    if effective_issue and repo:
        # Sync status label to status/done
        sync_status_label(effective_issue, target_status, repo)

        # Sync final state to Issue body
        sync_plan_to_issue_body(effective_issue, plan_path, repo, str(workspace_root))

        # Close Issue
        try:
            subprocess.run(
                ['gh', 'issue', 'close', str(effective_issue), '--repo', repo,
                 '--comment', 'Plan verified and marked as done.'],
                capture_output=True,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

    # 11. Output confirmation
    print("")
    print("Status: done")
    if is_pr_path and pr_merged:
        print("Reason: PR merged + user validation confirmed")
    else:
        print("Reason: user validation confirmed")
    print("")
    print(f"Next: flow.sh archive {plan_issue or plan_name}")
    print("")
    print("Ready to archive. Run:")
    print(f"  flow.sh archive {plan_issue or plan_name}")

    return 0


# ============================================
# argparse registration
# ============================================

def register_verify_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register verify subcommand."""
    verify_parser = subparsers.add_parser(
        "verify",
        help="Verify and confirm completion, transition to done"
    )
    verify_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name"
    )
    verify_parser.add_argument(
        "--confirm",
        action="store_true",
        default=False,
        help="Confirm user validation and transition to done"
    )
