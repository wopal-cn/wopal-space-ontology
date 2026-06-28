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
    get_plan_project_path,
    get_plan_worktree,
)
from lib.git import commit_paths, get_current_branch
from lib.worktree import resolve_active_plan, ResolveActivePlanError
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


def _check_feature_branch_merged(workspace_root: Path, plan_path: str) -> int:
    """Check that the feature branch has been merged to the integration branch.

    Reads Plan Worktree metadata to get the feature branch name,
    determines the integration branch based on project type, and runs
    git branch --merged to verify.

    Args:
        workspace_root: Workspace root path
        plan_path: Path to the Plan file

    Returns:
        0 if merged (or no worktree metadata), 1 if not merged or on error
    """
    from pathlib import Path as _Path

    wt_meta = get_plan_worktree(plan_path)
    if not wt_meta or not wt_meta.get("branch"):
        return 0

    feature_branch = wt_meta["branch"]

    # Determine repo root for git operations
    project_path = get_plan_project_path(plan_path)
    if project_path:
        repo_root = str(_Path(workspace_root) / project_path)
    else:
        repo_root = str(workspace_root)

    # Determine integration branch based on project type
    project_type = get_plan_field(plan_path, "Project Type")
    if project_type == "ontology-worktree":
        # .wopal/ worktree sits on the current space layer branch (space/<name>),
        # detected at runtime — there is no fixed integration branch name.
        integration_branch = get_current_branch(repo_root)
    else:
        integration_branch = "main"

    # Prefer Verification Commit SHA — works even if branch ref is deleted
    verification_commit = get_plan_field(plan_path, "Verification Commit")
    if verification_commit:
        try:
            result = subprocess.run(
                ["git", "merge-base", "--is-ancestor", verification_commit, integration_branch],
                cwd=repo_root,
                capture_output=True,
            )
            if result.returncode == 0:
                return 0
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
        # SHA not found in ancestry — not merged
        log_error(
            f"Feature branch '{feature_branch}' not yet merged to "
            f"{integration_branch}. Please merge first."
        )
        return 1

    # Run git branch --merged <integration> and check for feature branch
    try:
        result = subprocess.run(
            ["git", "branch", "--merged", integration_branch],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        log_error(
            f"Failed to check merge status for branch '{feature_branch}'"
        )
        return 1

    if result.returncode != 0:
        log_error(
            f"Failed to check merge status for branch '{feature_branch}'"
        )
        return 1

    # Parse merged branches: strip "* " / "+ " prefix, trim whitespace
    merged_branches = [
        b.strip().lstrip("*+ ") for b in result.stdout.strip().split("\n")
        if b.strip()
    ]

    if feature_branch in merged_branches:
        return 0

    # Branch not found in local merged list.
    # Fallback 1: check remote merged branches (branch may exist remotely)
    try:
        result2 = subprocess.run(
            ["git", "branch", "-r", "--merged", integration_branch],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        remote_branches = [
            b.strip() for b in result2.stdout.strip().split("\n") if b.strip()
        ]
        for rb in remote_branches:
            if rb.endswith(f"/{feature_branch}"):
                return 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # Fallback 2: branch deleted everywhere, check if merge exists in history
    # Works for both FF merge (branch name in commit messages) and
    # non-FF merge ("Merge branch 'xxx'" commit)
    try:
        result3 = subprocess.run(
            ["git", "log", "--oneline", integration_branch,
             "--grep", feature_branch],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if result3.stdout.strip():
            return 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    log_error(
        f"Feature branch '{feature_branch}' not yet merged to "
        f"{integration_branch}. Please merge first."
    )
    return 1


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

    # 7. Check feature branch merged to integration (D-03)
    merge_check = _check_feature_branch_merged(workspace_root, plan_path)
    if merge_check != 0:
        return merge_check

    # 8. Resolve active Plan — enforce merged state (D-05)
    try:
        active = resolve_active_plan(plan_path, "verify", workspace_root)
    except ResolveActivePlanError as e:
        log_error(str(e))
        return 1

    # 8. HARD GATE: User Validation must pass — check active Plan
    try:
        check_user_validation(str(active.active_plan_path))
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

    # 9. Validate state transition
    target_status = "done"

    if not is_valid_transition(current_status, target_status):
        log_error(f"Invalid state transition: {current_status} -> {target_status}")
        return 1

    # 10. Update Plan status to done (use active Plan path)
    if update_plan_status(str(active.active_plan_path), target_status):
        log_success(f"Plan status updated: {target_status}")
    else:
        log_error("Failed to update Plan status")
        return 1

    # 11. Commit Plan status=done on integration branch (D-05)
    plan_repo_root = str(active.commit_repo_root)
    plan_rel = active.repo_relative_plan_path
    if plan_issue:
        plan_commit_msg = f"docs(plan): verify plan #{plan_issue}"
    else:
        plan_commit_msg = f"docs(plan): verify plan {_get_plan_name(str(active.active_plan_path))}"
        max_total = 72
        if len(plan_commit_msg) > max_total:
            prefix = "docs(plan): verify plan "
            plan_commit_msg = prefix + _get_plan_name(str(active.active_plan_path))[:max_total - len(prefix)]
    if not commit_paths(plan_repo_root, [plan_rel], plan_commit_msg):
        log_warn("Failed to commit Plan status=done in Plan's repo")
    else:
        log_success("Plan status=done committed to Plan's repo")

    # 12. Sync Issue if exists
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

    # 13. Output confirmation
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
