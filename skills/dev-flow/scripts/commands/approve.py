#!/usr/bin/env python3
# approve.py - Approve command for dev-flow
#
# Command (requires --confirm):
#   approve <issue> --confirm - Approve Plan and transition to executing phase
#   approve <plan-name> --confirm - Approve Plan (no-issue mode)
#   approve <issue> --confirm --no-worktree - Skip worktree creation
#
# Flow (--confirm required):
#   1. Find Plan file (by issue number OR plan name)
#   2. Run check_doc validation
#   3. Preflight checks + status transition (reviewing/planning → executing)
#   4. Issue sync + worktree creation
#
# Preflight checks (--confirm mode):
#   - check_doc validation
#   - Target Project dirty workspace check (BLOCK or stash if worktree)
#   - Worktree creation (default; skip with --no-worktree)
#
# Issue sync (--confirm mode):
#   - Sync status label (reviewing -> in-progress)
#   - Sync plan content to Issue body
#   - Ensure Issue labels (type, project)

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.workspace import find_workspace_root, detect_space_repo, get_ontology_main_repo
from workflow import update_plan_status, parse_plan_status, STATUS_PLANNING, STATUS_REVIEWING
from plan import find_plan
from plan import get_plan_project, get_plan_issue, get_plan_status, get_plan_field
from plan import resolve_project_path, ProjectType
from validation import check_doc_plan, ValidationError
from issue import (
    sync_status_label,
    sync_plan_to_issue_body,
    ensure_issue_labels,
)
from lib.git import (
    is_repo_dirty,
    get_current_branch,
)
from lib.plan_commit import commit_and_push_plan
from lib.worktree import create_worktree, write_worktree_context


# ============================================
# Helpers
# ============================================

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


def _has_unmerged_files(repo_path: str) -> bool:
    """Check if git repo has unmerged (UU) files from incomplete merge.
    
    Args:
        repo_path: Path to git repository root
        
    Returns:
        True if any file is in unmerged state
    """
    result = subprocess.run(
        ["git", "ls-files", "--unmerged"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


# ============================================
# Worktree Creation
# ============================================

def _create_worktree(project_dir: Path, branch: str, workspace_root: Path) -> Path | None:
    """Create isolated worktree for project execution.
    
    Args:
        project_dir: Resolved project git root path
        branch: Branch name for worktree
        workspace_root: Workspace root path
        
    Returns:
        Path to created worktree, or None on failure
    """
    worktree_base = workspace_root / ".worktrees"
    
    log_step("Pre-flight: creating worktree...")
    log_info(f"Project: {project_dir.name}, Branch: {branch}")
    
    try:
        wt_path = create_worktree(project_dir, branch, worktree_base)
        log_success(f"Worktree created successfully: {wt_path}")
        return wt_path
    except Exception as e:
        log_error(f"Worktree creation failed - aborting approve: {e}")
        return None


# ============================================
# approve command
# ============================================

def cmd_approve(args: argparse.Namespace) -> int:
    """Approve Plan and transition to executing phase (--confirm required).
    
    Modes:
    1. approve <issue-or-plan> --confirm - preflight + status transition + Issue sync
    2. approve <issue-or-plan> --confirm --no-worktree - skip worktree creation
    
    Returns:
        0 on success, 1 on error
    """
    input_ref = args.target
    confirm = args.confirm
    use_worktree = not args.no_worktree  # default: worktree enabled
    
    if not input_ref:
        log_error("Issue number or Plan name required")
        log_error("Usage: flow.sh approve <issue-or-plan> [--confirm] [--no-worktree]")
        return 1
    
    workspace_root = find_workspace_root()
    
    # 1. Smart lookup: Issue number OR Plan name
    try:
        plan_path = find_plan(input_ref, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1
    
    log_info(f"Found plan: {plan_path}")
    
    # Get plan name (for output)
    plan_name = Path(plan_path).stem
    
    # ============================================
    # --confirm is required
    # ============================================
    if not confirm:
        log_error("submit command replaces approve without --confirm")
        log_error("Use: flow.sh submit <plan>")
        return 1
    
    # 2. Check Plan status is "planning" or "reviewing"
    current_status = parse_plan_status(plan_path)
    
    if not current_status:
        current_status = get_plan_status(plan_path)
    
    if current_status not in (STATUS_PLANNING, STATUS_REVIEWING):
        log_error(f"Plan must be in planning or reviewing state to approve (current: {current_status})")
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
        log_error(f"Fix the issues and retry: flow.sh submit {input_ref}")
        return 1
    
    # 4. Extract Issue number (if plan has Issue link)
    issue_number = get_plan_issue(plan_path)
    
    # ============================================
    # --confirm mode: preflight checks + state transition
    # ============================================
    
    repo = detect_space_repo(workspace_root)
    project = get_plan_project(plan_path)
    
    # --- Preflight Check 1: Target Project dirty workspace ---
    project_path = resolve_project_path(plan_path, project, workspace_root) if project else None
    dirty_workspace = False
    
    if project_path:
        dirty_workspace = is_repo_dirty(str(project_path))
    
    # --- Preflight: compute worktree parameters ---
    worktree_created = False
    branch = ""
    worktree_path = None  # type: Path | None

    if use_worktree:
        if not project:
            log_error("Cannot create worktree: no Target Project in plan")
            return 1

        # Read Project Type from Plan metadata
        project_type_str = get_plan_field(plan_path, "Project Type")

        # Generate branch name
        slug = _extract_slug(plan_name)
        if issue_number:
            branch = f"issue-{issue_number}-{slug}"
        else:
            branch = slug

        # Determine planned worktree path (without creating it yet)
        if project_type_str == ProjectType.ONTOLOGY_WORKTREE.value:
            worktrees_dir = workspace_root / ".worktrees"
            worktree_name = f"ontology-{branch}"
            worktree_path = worktrees_dir / worktree_name
        else:
            # Standard: predict path using same slug logic as create_worktree
            worktree_base = workspace_root / ".worktrees"
            project_name = project_path.name if project_path else project
            branch_slug = branch.replace("/", "-")
            worktree_path = worktree_base / f"{project_name}-{branch_slug}"
        
        # Block on unmerged files for standard projects
        if project_type_str != ProjectType.ONTOLOGY_WORKTREE.value:
            if project_path and _has_unmerged_files(str(project_path)):
                log_error(f"目标项目 {project} 有未解决的合并冲突（UU 状态），请先解决后再执行 approve")
                return 1
            
            # Warn about dirty workspace but proceed
            if dirty_workspace:
                log_warn(f"目标项目 {project} 有未提交的变更，建议先提交后再执行 approve")

        # Write minimal Worktree metadata (branch + path) to Plan
        wt_rel = str(worktree_path)
        if write_worktree_context(plan_path, branch, wt_rel):
            log_success(f"Plan Worktree metadata written: {branch}")
        else:
            log_warn("Failed to write Worktree metadata to Plan")

    elif dirty_workspace:
        # --no-worktree with dirty workspace: block and warn
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
        print(f"  2. 默认会创建 worktree 隔离（当前使用了 --no-worktree）")
        print("")
        return 1
    
    # ============================================
    # STATE TRANSITION (commit Plan BEFORE worktree creation)
    # ============================================
    
    log_step(f"Transitioning state: {current_status} -> executing")
    
    # Update Plan status to executing
    if not update_plan_status(plan_path, "executing"):
        log_error("Failed to update Plan status")
        return 1
    
    log_success("Plan status updated to: executing")
    
    # Commit/push the Plan baseline (executing + Worktree metadata) on integration branch
    if not commit_and_push_plan(plan_path, issue_number, workspace_root, message_prefix="approve"):
        log_error("Failed to commit/push Plan baseline")
        return 1
    
    # ============================================
    # WORKTREE CREATION (after Plan baseline is committed)
    # ============================================
    
    if use_worktree and branch and worktree_path:
        project_type_str = get_plan_field(plan_path, "Project Type")

        if project_type_str == ProjectType.ONTOLOGY_WORKTREE.value:
            # Resolve ontology main repo path
            main_repo = get_ontology_main_repo(workspace_root)
            if main_repo is None:
                log_error("无法解析 ontology 主仓库路径")
                log_error("请检查 .wopal/.git 文件是否存在且格式正确（worktree 指针）")
                return 1
            
            log_step("Creating ontology worktree from committed baseline...")
            log_info(f"Main repo: {main_repo}")
            log_info(f"Branch: {branch}")
            
            # Determine base branch from .wopal/ worktree's current branch
            ontology_worktree = workspace_root / ".wopal"
            base_branch = get_current_branch(ontology_worktree)
            if not base_branch:
                log_error("无法解析 ontology worktree 当前分支")
                return 1

            # Create feature branch from base branch in the main repo
            branch_result = subprocess.run(
                ["git", "branch", branch, base_branch],
                cwd=str(main_repo),
                capture_output=True,
                text=True,
            )
            if branch_result.returncode != 0:
                log_error(f"创建 feature 分支失败: {branch}")
                print(branch_result.stderr)
                return 1
            log_info(f"Created branch: {branch} (from {base_branch})")
            
            # Create worktree from the new branch
            wt_result = subprocess.run(
                ["git", "worktree", "add", str(worktree_path), branch],
                cwd=str(main_repo),
                capture_output=True,
                text=True,
            )
            if wt_result.returncode != 0:
                log_error("Ontology worktree 创建失败")
                print(wt_result.stderr)
                # Cleanup: delete the branch we just created
                subprocess.run(
                    ["git", "branch", "-d", branch],
                    cwd=str(main_repo),
                    capture_output=True,
                )
                return 1
            
            log_success(f"Ontology worktree created: {worktree_path}")
            worktree_created = True

        else:
            # Standard project: create worktree from committed baseline
            if not project_path:
                log_error(f"无法解析项目路径: {project}")
                return 1
            
            log_step("Creating worktree from committed baseline...")
            actual_wt_path = _create_worktree(project_path, branch, workspace_root)
            if actual_wt_path is not None:
                worktree_created = True
                worktree_path = actual_wt_path
                log_success(f"Worktree created: {worktree_path}")
            else:
                log_error("Worktree creation failed - aborting approve")
                print("")
                print("Plan 状态保持 planning，未进入 executing")
                print("请检查 worktree 创建失败原因后重试")
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
        print(f"Worktree: {worktree_path}")
    
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
        "--no-worktree",
        action="store_true",
        help="Skip worktree creation (worktree is created by default)"
    )
