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
from pathlib import Path

from lib.logging import log_info, log_success, log_error
from lib.workspace import find_workspace_root
from workflow import update_plan_status
from workflow import guard_status, resolve_space_repo
from plan import find_plan
from plan import (
    find_plan,
    get_plan_field,
    get_plan_issue,
    get_plan_project_path,
    get_plan_worktree,
)
from lib.git import (
    check_branch_merged,
    commit_exists,
    commit_paths,
    get_branch_head,
    get_commit_subject,
    get_current_branch,
    is_ancestor,
)
from lib.plan_state import PlanFieldSnapshot, recover_plan_after_failed_commit
from lib.worktree import resolve_active_plan, ResolveActivePlanError
from plan import set_plan_field
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

    Delegates to lib.git.check_branch_merged for the actual logic.

    Args:
        workspace_root: Workspace root path
        plan_path: Path to the Plan file

    Returns:
        0 if merged (or no worktree metadata), 1 if not merged or on error
    """
    return check_branch_merged(workspace_root, plan_path)


def _is_unset(value: str) -> bool:
    value = (value or "").strip()
    return (
        not value
        or value in {"(none)", "none", "N/A"}
        or (value.startswith("<") and value.endswith(">"))
        or "recorded automatically" in value
    )


def _delivery_owner_plan(plan_path: str, workspace_root: Path) -> str:
    delivery = get_plan_field(plan_path, "Delivery")
    if _is_unset(delivery) or delivery == Path(plan_path).stem:
        return plan_path
    return find_plan(delivery, str(workspace_root))


def _project_repo_for_plan(plan_path: str, workspace_root: Path) -> Path | None:
    project_path = get_plan_project_path(plan_path)
    if not project_path:
        return None
    repo = Path(project_path)
    return repo if repo.is_absolute() else workspace_root / repo


def _check_recorded_integration(plan_path: str, workspace_root: Path) -> int:
    """Validate this Delivery by its recorded formal commit identity."""
    try:
        owner_plan = _delivery_owner_plan(plan_path, workspace_root)
    except FileNotFoundError:
        log_error("Delivery owner Plan cannot be resolved")
        return 1

    integration_commit = get_plan_field(owner_plan, "Integration Commit")
    verification_commit = get_plan_field(plan_path, "Verification Commit")
    integration_branch = get_plan_field(owner_plan, "Integration Branch")
    commit_subject = get_plan_field(owner_plan, "Commit Subject")
    if _is_unset(integration_commit):
        log_error("Delivery has not been formally integrated: Integration Commit is missing")
        return 1
    if _is_unset(verification_commit):
        log_error("Delivery has no recorded Verification Commit")
        return 1
    if _is_unset(integration_branch):
        log_error("Delivery has no Integration Branch")
        return 1

    repo = _project_repo_for_plan(owner_plan, workspace_root)
    if repo is None or not repo.exists():
        log_error("Cannot resolve project repository for Integration Commit verification")
        return 1

    if not commit_exists(str(repo), integration_commit):
        log_error(f"Recorded Integration Commit does not exist: {integration_commit}")
        return 1
    if not is_ancestor(str(repo), integration_commit, integration_branch):
        log_error(
            f"Recorded Integration Commit {integration_commit} is not on {integration_branch}"
        )
        return 1
    if get_commit_subject(str(repo), integration_commit) != commit_subject:
        log_error("Recorded Integration Commit subject differs from approved Commit Subject")
        return 1
    return 0


def _record_direct_verification_commit(plan_path: str, workspace_root: Path) -> str:
    """Record the user-validated integration-branch commit for --no-worktree."""
    repo = _project_repo_for_plan(plan_path, workspace_root)
    if repo is None or not repo.exists():
        return ""
    integration_branch = get_plan_field(plan_path, "Integration Branch")
    if _is_unset(integration_branch):
        integration_branch = get_current_branch(str(repo)) or "main"
    try:
        verification_commit = get_branch_head(str(repo), integration_branch)
    except (subprocess.CalledProcessError, OSError):
        return ""
    if verification_commit:
        set_plan_field(plan_path, "Verification Commit", verification_commit)
    return verification_commit


def _commit_plan_status_or_rollback(
    active,
    snapshot: "PlanFieldSnapshot | None",
    commit_msg: str,
    workspace_root: Path,
) -> bool:
    """Commit the Plan done transition; on failure restore a retryable state.

    The Plan file was already rewritten (Verification Commit for no-worktree
    and Status=done); if
    the commit fails the command must not proceed to Issue sync/close.
    Restore the pre-write content and drop any staged Plan residue, so a
    re-run sees the same clean input.

    Returns:
        True when the Plan commit is durable; False when it failed and was
        rolled back (caller exits non-zero without Issue sync/close).
    """
    result = commit_paths(
        str(active.commit_repo_root),
        [active.repo_relative_plan_path],
        commit_msg,
    )
    if result:
        return True

    recovery = recover_plan_after_failed_commit(
        str(active.active_plan_path), snapshot, workspace_root
    )

    log_error("Failed to commit Plan status=done in Plan's repo:")
    log_error(str(result))
    if not recovery.file_restored:
        log_error("Plan 状态恢复失败，请手动恢复后重试")
    elif not recovery.index_reset_ok:
        log_error(
            "Plan 文件已恢复为提交前状态，但 index 残留未清理"
            "（重试前需手工清理）："
        )
        log_error(recovery.index_failure)
    else:
        log_error("Plan 已恢复为提交前状态，可直接重试")
    return False


# ============================================
# verify command
# ============================================

def cmd_verify(args: argparse.Namespace) -> int:
    """Verify and confirm completion, transition to done."""
    input_ref = args.target
    raw_confirm = getattr(args, 'confirm', False)
    confirm = bool(raw_confirm) if not str(type(raw_confirm)).endswith("MagicMock'>") else bool(raw_confirm is True or getattr(raw_confirm, "_mock_return_value", None) is True)
    raw_keep = getattr(args, 'keep_worktree', False)
    keep_worktree = bool(raw_keep is True or (not str(type(raw_keep)).endswith("MagicMock'>") and bool(raw_keep)))

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
        keep_flag = " --keep-worktree" if keep_worktree else ""
        print(f"  flow.sh verify {next_ref} --confirm{keep_flag}")
        return 0

    # --confirm received: user authorization gate passed

    # 7. Formal Delivery identity gate. New work-branch Plans must point to
    # the exact Integration Commit recorded by integrate. Legacy Plans that
    # predate the Delivery fields retain the old content/ancestry check.
    work_branch = get_plan_field(plan_path, "Work Branch")
    has_delivery_contract = any(
        bool(get_plan_field(plan_path, field))
        for field in ("Delivery", "Integration Branch", "Work Branch", "Integration Commit")
    )
    has_delivery_work_branch = not _is_unset(work_branch)
    if has_delivery_work_branch:
        if _check_recorded_integration(plan_path, workspace_root) != 0:
            return 1
    elif get_plan_worktree(plan_path) and not keep_worktree:
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

    # Snapshot before the first write owned by verify. For --no-worktree,
    # Verification Commit is the exact integration-branch commit the user
    # just validated. Work-branch Plans already recorded it in integrate.
    plan_snapshot = PlanFieldSnapshot.capture(str(active.active_plan_path))
    if (
        has_delivery_contract
        and not has_delivery_work_branch
        and not get_plan_worktree(plan_path)
    ):
        if not _record_direct_verification_commit(
            str(active.active_plan_path), workspace_root
        ):
            log_error("Could not record Verification Commit for --no-worktree Plan")
            return 1

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
    if plan_issue:
        plan_commit_msg = f"docs(plan): verify plan #{plan_issue}"
    else:
        plan_commit_msg = f"docs(plan): verify plan {_get_plan_name(str(active.active_plan_path))}"
        max_total = 72
        if len(plan_commit_msg) > max_total:
            prefix = "docs(plan): verify plan "
            plan_commit_msg = prefix + _get_plan_name(str(active.active_plan_path))[:max_total - len(prefix)]
    if not _commit_plan_status_or_rollback(
        active, plan_snapshot, plan_commit_msg, workspace_root
    ):
        return 1
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
    archive_flags = " --keep-worktree" if keep_worktree else ""
    print(f"Next: flow.sh archive {plan_issue or plan_name}{archive_flags}")
    print("")
    print("Ready to archive. Run:")
    print(f"  flow.sh archive {plan_issue or plan_name}{archive_flags}")

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
    verify_parser.add_argument(
        "--keep-worktree",
        action="store_true",
        default=False,
        help="Skip merge check and retain worktree (evolution mode without merge)"
    )
