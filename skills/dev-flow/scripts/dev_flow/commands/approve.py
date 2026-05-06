#!/usr/bin/env python3
# approve.py - Approve command for dev-flow
#
# Ported from scripts/cmd/approve.sh
#
# Command:
#   approve <issue> --confirm - Approve Plan and transition to executing phase
#   approve <plan-name> --confirm - Approve Plan (no-issue mode)
#   approve <issue> --confirm --worktree - Create isolated worktree for execution
#
# Flow:
#   1. Find Plan file (by issue number OR plan name)
#   2. Run check_doc validation
#   3. If no --confirm: snapshot commit/push + await approval
#   4. If --confirm: preflight checks + status transition + Issue sync
#
# Preflight checks (--confirm mode):
#   - check_doc validation
#   - Target Project dirty workspace check (BLOCK or stash if --worktree)
#   - Worktree creation (if --worktree)
#
# Issue sync (--confirm mode):
#   - Sync status label (planning -> in-progress)
#   - Sync plan content to Issue body
#   - Ensure Issue labels (type, project)

from __future__ import annotations

import argparse
import subprocess
import sys
import re
from pathlib import Path

from dev_flow.domain.plan.find import find_plan, find_plan_by_issue, find_plan_by_name, _find_workspace_root
from dev_flow.domain.plan.metadata import get_plan_project, get_plan_issue, get_plan_status, set_plan_worktree
from dev_flow.domain.plan.naming import validate_plan_name
from dev_flow.domain.workflow import parse_plan_status, is_valid_transition
from dev_flow.domain.validation.check_doc import check_doc_plan, ValidationError
from dev_flow.domain.issue.sync import (
    sync_status_label,
    sync_plan_to_issue_body,
    ensure_issue_labels,
)
from dev_flow.infra.git import (
    is_repo_dirty,
    is_commit_in_remote,
    get_relative_path,
    find_worktree_script,
)


# ============================================
# Logging
# ============================================

def log_info(msg: str) -> None:
    print(f"\033[0;34m[INFO]\033[0m {msg}")


def log_success(msg: str) -> None:
    print(f"\033[0;32m[OK]\033[0m {msg}")


def log_error(msg: str) -> None:
    print(f"\033[0;31m[ERROR]\033[0m {msg}", file=sys.stderr)


def log_warn(msg: str) -> None:
    print(f"\033[0;33m[WARN]\033[0m {msg}")


def log_step(msg: str) -> None:
    print(f"\033[0;36m[STEP]\033[0m {msg}")


# ============================================
# Helpers
# ============================================

def _get_space_repo() -> str:
    """Get space repo in owner/repo format."""
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error("Cannot get repo info. Ensure gh CLI is configured")
        raise RuntimeError("gh repo view failed")
    return result.stdout.strip()


def _find_project_path(project: str, workspace_root: Path) -> Path | None:
    """
    Find project directory path.
    
    Standard mapping: projects/<project_name>
    
    Args:
        project: Project name from Plan metadata
        workspace_root: Workspace root path
        
    Returns:
        Project directory path, or None if not found
    """
    project_path = workspace_root / "projects" / project
    
    if project_path.exists():
        return project_path
    
    return None


def _extract_slug(plan_name: str) -> str:
    """Extract slug from plan name.
    
    Plan name format: <issue>-<type>-<scope>-<slug> OR <type>-<scope>-<slug>
    
    Args:
        plan_name: Plan name (without .md extension)
        
    Returns:
        Slug portion of plan name
    """
    # Remove .md if present
    name = plan_name.replace('.md', '')
    
    # Split by hyphens
    parts = name.split('-')
    
    # If first part is digits (Issue number), skip it
    if parts[0].isdigit():
        parts = parts[1:]
    
    # Skip type (second or first part depending on Issue presence)
    if len(parts) > 1:
        parts = parts[1:]
    
    # Skip scope
    if len(parts) > 1:
        parts = parts[1:]
    
    return '-'.join(parts) if parts else name


# ============================================
# Git Operations
# ============================================

def _commit_and_push_plan(plan_path: str, issue_number: int | None, workspace_root: Path) -> bool:
    """Commit and push Plan file after status transition.

    Mirrors Bash _commit_and_push_plan_if_needed:
    1. git add + commit plan file (if dirty)
    2. git push origin main (if not already pushed)

    Args:
        plan_path: Absolute path to Plan file
        issue_number: Issue number (for commit message), or None
        workspace_root: Workspace root path

    Returns:
        True if commit/push succeeded, False if failed
    """
    plan_relative = get_relative_path(plan_path, str(workspace_root))

    # Check if plan file has uncommitted changes
    status_result = subprocess.run(
        ["git", "status", "--porcelain", "--", plan_relative],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )

    if status_result.stdout.strip():
        log_step("Auto-committing Plan file...")

        if issue_number:
            commit_msg = f"docs(plan): approve plan #{issue_number}"
        else:
            plan_filename = Path(plan_path).stem
            commit_msg = f"docs(plan): approve plan {plan_filename}"
            # Enforce commit-msg hook limits: description ≤ 60, total ≤ 72
            max_total = 72
            if len(commit_msg) > max_total:
                prefix = "docs(plan): approve plan "
                max_name = max_total - len(prefix)
                commit_msg = prefix + plan_filename[:max_name]

        # git add
        add_result = subprocess.run(
            ["git", "add", plan_relative],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
        )
        if add_result.returncode != 0:
            log_error(f"git add failed: {add_result.stderr}")
            return False

        # git commit
        commit_result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
        )
        if commit_result.returncode != 0:
            log_error("Auto-commit failed. Please commit manually")
            if commit_result.stdout:
                print(commit_result.stdout, file=sys.stderr)
            if commit_result.stderr:
                print(commit_result.stderr, file=sys.stderr)
            return False

        log_success(f"Plan file committed: {commit_msg}")

    # Push if not already in remote
    branch_result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )
    current_branch = branch_result.stdout.strip() or "main"

    if not is_commit_in_remote(str(workspace_root), "origin", current_branch):
        log_step("Auto-pushing Plan file to origin/main...")
        push_result = subprocess.run(
            ["git", "push", "origin", current_branch],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
        )
        if push_result.returncode != 0:
            log_error(f"Auto-push failed. Please push manually: cd {workspace_root} && git push")
            return False
        log_success("Plan file pushed successfully")

    return True


def _stash_project_changes(project_path: Path, issue_number: int | None) -> bool:
    """Stash uncommitted changes in project repo.
    
    Args:
        project_path: Path to project directory
        issue_number: Issue number (for stash message)
        
    Returns:
        True if stash succeeded
    """
    stash_msg = f"dev-flow: stash before worktree for #{issue_number}" if issue_number else "dev-flow: stash before worktree"
    
    result = subprocess.run(
        ["git", "stash", "push", "-m", stash_msg],
        cwd=str(project_path),
        capture_output=True,
        text=True,
    )
    
    return result.returncode == 0


def _pop_stash(project_path: Path) -> bool:
    """Pop stashed changes in project repo.
    
    Args:
        project_path: Path to project directory
        
    Returns:
        True if pop succeeded
    """
    result = subprocess.run(
        ["git", "stash", "pop"],
        cwd=str(project_path),
        capture_output=True,
        text=True,
    )
    
    return result.returncode == 0


# ============================================
# Worktree Creation
# ============================================

def _create_worktree(project: str, branch: str, workspace_root: Path) -> bool:
    """Create isolated worktree for project execution.
    
    Args:
        project: Project name
        branch: Branch name for worktree
        workspace_root: Workspace root path
        
    Returns:
        True if worktree creation succeeded
    """
    worktree_script = find_worktree_script(workspace_root)

    if worktree_script is None:
        log_warn("git-worktrees skill not found, skipping worktree creation")
        return False
    
    log_step("Pre-flight: creating worktree...")
    log_info(f"Project: {project}, Branch: {branch}")
    
    # Execute worktree script
    result = subprocess.run(
        ["bash", str(worktree_script), "create", project, branch, "--no-install", "--no-test"],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_error("Worktree creation failed - aborting approve")
        print(result.stderr)
        return False
    
    log_success("Worktree created successfully")
    return True


# ============================================
# Update Plan Status
# ============================================

def update_plan_status(plan_path: str, new_status: str) -> bool:
    """
    Update Plan file status line.
    
    Args:
        plan_path: Path to Plan markdown file
        new_status: New status value (e.g., "executing")
        
    Returns:
        True if updated successfully
    """
    path = Path(plan_path)
    if not path.exists():
        log_error(f"Plan file not found: {plan_path}")
        return False
    
    content = path.read_text()
    
    # Update status line: - **Status**: planning -> - **Status**: executing
    new_content = re.sub(
        r'^\- \*\*Status\*\*:\s*\w+',
        f'- **Status**: {new_status}',
        content,
        count=1,
        flags=re.MULTILINE
    )
    
    if new_content == content:
        log_error("Failed to update status line in Plan file")
        return False
    
    path.write_text(new_content)
    return True


# ============================================
# approve command
# ============================================

def cmd_approve(args: argparse.Namespace) -> int:
    """Approve Plan and transition to executing phase.
    
    Modes:
    1. approve <issue-or-plan> - validate + snapshot commit/push for review
    2. approve <issue-or-plan> --confirm - preflight + status transition + Issue sync
    3. approve <issue-or-plan> --confirm --worktree - create isolated worktree
    
    Returns:
        0 on success, 1 on error
    """
    input_ref = args.target
    confirm = args.confirm
    use_worktree = args.worktree
    
    if not input_ref:
        log_error("Issue number or Plan name required")
        log_error("Usage: flow.sh approve <issue-or-plan> [--confirm] [--worktree]")
        return 1
    
    workspace_root = _find_workspace_root()
    
    # 1. Smart lookup: Issue number OR Plan name
    try:
        plan_path = find_plan(input_ref, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1
    
    log_info(f"Found plan: {plan_path}")
    
    # Get plan name (for output)
    plan_name = Path(plan_path).stem
    
    # 2. Check Plan status is "planning"
    current_status = parse_plan_status(plan_path)
    
    if not current_status:
        current_status = get_plan_status(plan_path)
    
    if current_status != "planning":
        log_error(f"Plan must be in planning state to approve (current: {current_status})")
        log_error("")
        
        if current_status == "executing":
            log_error("Plan already approved. Next: flow.sh complete <plan>")
        elif current_status == "verifying":
            log_error("Plan awaiting verification. Next: flow.sh verify <plan> --confirm")
        elif current_status == "done":
            log_error("Plan already archived.")
        else:
            log_error("Unknown status. Check plan file.")
        
        return 1
    
    # 3. Run check_doc validation (before any state changes)
    try:
        check_doc_plan(plan_path)
    except ValidationError as e:
        log_error("Plan failed check-doc validation")
        print(str(e))
        log_error(f"Fix the issues and retry: flow.sh approve {input_ref}")
        return 1
    
    # 4. Extract Issue number (if plan has Issue link)
    issue_number = get_plan_issue(plan_path)
    
    # ============================================
    # Non --confirm mode: validate + await approval (no auto-commit)
    # ============================================
    if not confirm:
        print("Status: awaiting approval")
        print(f"Plan validated. Next: flow.sh approve {input_ref} --confirm")
        print("")
        print("收到用户审批授权后，由 agent 执行:")
        print(f"  flow.sh approve {input_ref} --confirm")
        return 0
    
    # ============================================
    # --confirm mode: preflight checks + state transition
    # ============================================
    
    repo = _get_space_repo()
    project = get_plan_project(plan_path)
    
    # --- Preflight Check 1: Target Project dirty workspace ---
    project_path = _find_project_path(project, workspace_root) if project else None
    dirty_workspace = False
    stashed = False
    
    if project and project_path and (project_path / '.git').exists():
        dirty_workspace = is_repo_dirty(str(project_path))
    
    # --- Preflight Check 2: Worktree creation (if requested) ---
    worktree_created = False
    branch = ""
    
    if use_worktree:
        if not project:
            log_error("Cannot create worktree: no Target Project in plan")
            return 1
        
        # Generate branch name
        slug = _extract_slug(plan_name)
        if issue_number:
            branch = f"issue-{issue_number}-{slug}"
        else:
            branch = slug
        
        # Stash dirty workspace changes before worktree creation
        if dirty_workspace:
            log_warn(f"目标项目 {project} 有未提交的变更，自动 stash 以创建 worktree")
            if not _stash_project_changes(project_path, issue_number):
                log_error("Stash 失败，无法继续创建 worktree")
                return 1
            stashed = True
            log_success("已 stash 未提交变更")
        
        # Create worktree
        if _create_worktree(project, branch, workspace_root):
            worktree_created = True

            # Write Worktree field to Plan metadata
            worktree_path = f"{workspace_root}/.worktrees/{project}-{branch}"
            if set_plan_worktree(plan_path, branch, worktree_path):
                log_success(f"Plan Worktree field set: {branch} | {worktree_path}")
            else:
                log_warn("Failed to write Worktree field to Plan")

            # Restore stashed changes to main workspace
            if stashed:
                if _pop_stash(project_path):
                    log_success("已恢复之前 stash 的变更")
                else:
                    log_warn(f"Stash restore 失败，变更仍在 stash 中: cd {project_path} && git stash list")
        else:
            log_error("Worktree creation failed - aborting approve")
            
            # Restore stashed changes on failure
            if stashed:
                _pop_stash(project_path)
                log_warn("已恢复之前 stash 的变更")
            
            print("")
            print("Plan 状态保持 planning，未进入 executing")
            print("请检查 worktree 创建失败原因后重试")
            return 1
    
    elif dirty_workspace:
        # No --worktree but dirty workspace: block and warn
        status_result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(project_path),
            capture_output=True,
            text=True,
        )
        git_status = status_result.stdout.strip()
        
        log_error(f"目标项目 {project} 有未提交的变更")
        print("")
        print("未提交文件列表:")
        for line in git_status.split('\n')[:10]:
            if line:
                print(f"  {line}")
        print("")
        print("风险: 新任务与旧变更混在一起会污染当前 Issue，增加回滚与验证成本")
        print("")
        print("建议处理方式:")
        print(f"  1. 先提交当前变更: cd {project_path} && git add . && git commit")
        print(f"  2. 改用 worktree 隔离: flow.sh approve {input_ref} --confirm --worktree（会自动 stash 旧变更）")
        print("")
        return 1
    
    # ============================================
    # STATE TRANSITION (only after all checks pass)
    # ============================================
    
    log_step("Transitioning state: planning -> executing")
    
    # Update Plan status to executing
    if not update_plan_status(plan_path, "executing"):
        log_error("Failed to update Plan status")
        return 1
    
    log_success("Plan status updated to: executing")
    
    # Commit/push the status transition before syncing Issue
    if not _commit_and_push_plan(plan_path, issue_number, workspace_root):
        log_error("Failed to commit/push Plan file")
        return 1
    
    # ============================================
    # Issue sync (if plan has Issue link)
    # ============================================
    
    if issue_number:
        # Sync Issue status label (planning -> in-progress)
        sync_status_label(issue_number, "executing", repo)
        
        # Sync approved plan to Issue body (automatic)
        sync_plan_to_issue_body(issue_number, plan_path, repo, str(workspace_root))
        
        # Ensure Issue labels are correct
        ensure_issue_labels(issue_number, plan_path, repo)
    
    # Output confirmation
    print("Status: executing")
    if issue_number:
        print(f"Issue: #{issue_number}")
    if worktree_created:
        print(f"Worktree: {workspace_root}/.worktrees/{project}-{branch}")
    
    # Use issue_number for Issue-driven mode, plan_name for no-issue mode
    next_ref = str(issue_number) if issue_number else plan_name
    print("")
    print(f"Next: flow.sh complete {next_ref}")
    print("")
    print(f"实施完成后，执行: flow.sh complete {next_ref}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_approve_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register approve subcommand."""
    approve_parser = subparsers.add_parser(
        "approve",
        help="Approve Plan and transition to executing phase"
    )
    approve_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name"
    )
    approve_parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm approval and transition state"
    )
    approve_parser.add_argument(
        "--worktree",
        action="store_true",
        help="Create isolated worktree for execution"
    )
