#!/usr/bin/env python3
# archive.py - Archive command for dev-flow
#
# Ported from scripts/cmd/archive.sh
#
# Command:
#   archive <issue> - Archive a completed Plan
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "done"
#   2.5. Sync Plan to Issue (body + labels)
#   3. Detect worktree / project changes and auto-handle
#   4. Archive Plan file (move to done/)
#   5. Update Issue Plan link
#   6. Commit archived plan in space repo
#   7. Close GitHub Issue

from __future__ import annotations

import argparse
import subprocess
import sys
import os
import re
import glob as glob_mod
from pathlib import Path
from datetime import date

from dev_flow.domain.plan.find import find_plan, find_plan_by_issue, _find_workspace_root
from dev_flow.domain.plan.metadata import (
    get_plan_project,
    get_plan_type,
    get_plan_issue,
    get_plan_status,
    get_plan_worktree,
)
from dev_flow.domain.workflow import parse_plan_status
from dev_flow.domain.plan.link import update_issue_plan_link
from dev_flow.domain.issue.sync import (
    sync_plan_to_issue_body,
    sync_status_label,
    ensure_issue_labels,
)
from dev_flow.infra.git import (
    is_repo_dirty,
    merge_branch,
    branch_exists,
    delete_branch,
    push_branch,
    has_uncommitted_changes,
    commit_all,
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
    """Find project directory path.

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


# ============================================
# Worktree / Project Change Detection
# ============================================

def _detect_worktree(
    plan_path: str,
    project: str,
    workspace_root: Path,
) -> dict | None:
    """Detect worktree info from Plan metadata or filesystem.

    Priority:
    1. Plan Worktree field (set by approve --confirm --worktree)
    2. Fallback: glob match .worktrees/<project>-issue-<N>-*

    Args:
        plan_path: Path to Plan file
        project: Project name
        workspace_root: Workspace root path

    Returns:
        Dict with 'branch' and 'path' keys, or None
    """
    # Try Plan metadata first
    wt = get_plan_worktree(plan_path)
    if wt:
        # Verify the path actually exists
        if Path(wt['path']).exists():
            return wt
        # Path gone — metadata stale
        return None

    # Fallback: glob match
    plan_issue = get_plan_issue(plan_path)
    if not plan_issue:
        return None

    pattern = str(workspace_root / ".worktrees" / f"{project}-issue-{plan_issue}-*")
    matches = glob_mod.glob(pattern)

    if not matches:
        return None

    wt_path = matches[0]
    # Extract branch from directory name: <project>-issue-<N>-<slug> → issue-<N>-<slug>
    dir_name = Path(wt_path).name
    # Remove project prefix: "ontology-issue-115-slug" → "issue-115-slug"
    parts = dir_name.split('-', 1)
    branch = parts[1] if len(parts) > 1 else dir_name

    return {'branch': branch, 'path': wt_path}


def _is_pr_path(plan_path: str, issue_number: int, repo: str) -> bool:
    """Check if Issue has a PR opened (pr/opened label).

    Args:
        plan_path: Path to Plan file
        issue_number: Issue number
        repo: Repository in owner/repo format

    Returns:
        True if Issue has pr/opened label
    """
    result = subprocess.run(
        [
            "gh", "issue", "view", str(issue_number),
            "--repo", repo,
            "--json", "labels",
            "-q", '.labels[].name',
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return False

    labels = result.stdout.strip().split('\n')
    return "pr/opened" in labels


def _commit_project_changes(
    project_path: str,
    plan_type: str,
    issue_number: int | None,
) -> bool:
    """Auto-commit and push project repo changes.

    Args:
        project_path: Path to project directory
        plan_type: Plan type for commit message
        issue_number: Issue number for commit message

    Returns:
        True if commit and push succeeded
    """
    # Normalize plan type to valid git commit type
    plan_type_to_commit = {
        'feature': 'feat',
        'enhance': 'enhance',
        'fix': 'fix',
        'refactor': 'refactor',
        'docs': 'docs',
        'test': 'test',
        'chore': 'chore',
        'perf': 'perf',
    }
    commit_type = plan_type_to_commit.get(plan_type, 'chore')

    # Build commit message
    if issue_number:
        commit_msg = f"{commit_type}: implement plan changes (#{issue_number})"
    else:
        commit_msg = f"{commit_type}: implement plan changes"

    # Stage all
    subprocess.run(
        ["git", "add", "-A"],
        cwd=project_path,
        capture_output=True,
    )

    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        cwd=project_path,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if "nothing to commit" in result.stdout:
            log_info("No changes to commit in project repo")
            return True
        log_error(f"Project commit failed: {result.stderr.strip()}")
        return False

    log_success(f"Project committed: {commit_msg}")

    # Push
    if not push_branch(project_path, 'main'):
        log_error("Project push failed")
        return False

    log_success("Project pushed to origin/main")
    return True


def _merge_worktree_branch(
    project_path: str,
    branch: str,
    worktree_path: str,
) -> tuple[bool, list[str]]:
    """Merge worktree branch into main with --no-ff.

    Args:
        project_path: Path to project directory (cwd for git operations)
        branch: Branch name to merge
        worktree_path: Path to worktree (for reference)

    Returns:
        Tuple of (success, conflict_files)
    """
    log_step(f"Merging branch '{branch}' into main...")

    success, conflicts = merge_branch(project_path, branch, target='main', no_ff=True)

    if success:
        log_success(f"Branch '{branch}' merged into main")
        return (True, [])

    if conflicts:
        log_error(f"Merge conflicts detected in {len(conflicts)} file(s):")
        for f in conflicts:
            log_error(f"  {f}")
        log_error("Resolve conflicts manually, then:")
        log_error(f"  cd {project_path}")
        log_error("  git add . && git commit")
    else:
        log_error(f"Merge failed for branch '{branch}' (non-conflict error)")

    return (False, conflicts)


def _cleanup_worktree(
    project_path: str,
    branch: str,
    worktree_path: str,
    workspace_root: Path,
) -> bool:
    """Remove worktree and delete branch.

    Args:
        project_path: Path to project directory (cwd for git operations)
        branch: Branch name to delete
        worktree_path: Path to worktree directory
        workspace_root: Workspace root path

    Returns:
        True if cleanup succeeded
    """
    ok = True
    project_name = Path(project_path).name

    worktree_script = find_worktree_script(workspace_root)
    if worktree_script is not None:
        log_step(f"Cleaning up via worktree.sh: {project_name} {branch}")
        result = subprocess.run(
            [
                "bash",
                str(worktree_script),
                "remove",
                project_name,
                branch,
                "--force",
            ],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            log_success("Worktree cleanup completed via worktree.sh")
            return True

        log_warn("worktree.sh cleanup failed, falling back to direct git cleanup")

    # Remove worktree
    log_step(f"Removing worktree: {worktree_path}")
    result = subprocess.run(
        ["git", "worktree", "remove", worktree_path],
        cwd=str(project_path),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        # Try force remove
        result = subprocess.run(
            ["git", "worktree", "remove", "--force", worktree_path],
            cwd=str(project_path),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            log_warn(f"Failed to remove worktree: {worktree_path}")
            ok = False
        else:
            log_success("Worktree removed (forced)")
    else:
        log_success("Worktree removed")

    # Delete branch
    if branch_exists(str(project_path), branch):
        if delete_branch(str(project_path), branch, force=True):
            log_success(f"Branch '{branch}' deleted")
        else:
            log_warn(f"Failed to delete branch '{branch}'")
            ok = False

    return ok


# ============================================
# Archive Plan File
# ============================================

def archive_plan_file(plan_path: str, workspace_root: Path) -> str:
    """Move Plan file to done/ directory with date prefix.

    Uses git mv if plan is tracked, otherwise uses regular mv.

    Args:
        plan_path: Path to Plan file
        workspace_root: Workspace root path

    Returns:
        Path to archived file
    """
    plan_file = Path(plan_path)

    if not plan_file.exists():
        log_error(f"Plan file not found: {plan_path}")
        raise FileNotFoundError(f"Plan file not found: {plan_path}")

    # Determine destination
    plan_dir = plan_file.parent
    done_dir = plan_dir / "done"
    done_dir.mkdir(parents=True, exist_ok=True)

    archive_date = date.today().strftime("%Y%m%d")
    archived_name = f"{archive_date}-{plan_file.name}"
    archived_file = done_dir / archived_name

    # Check if plan is tracked in git
    plan_rel = plan_file.relative_to(workspace_root)
    archived_rel = archived_file.relative_to(workspace_root)

    is_tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(plan_rel)],
        cwd=str(workspace_root),
        capture_output=True,
    ).returncode == 0

    if is_tracked:
        # Use git mv
        subprocess.run(
            ["git", "mv", str(plan_rel), str(archived_rel)],
            cwd=str(workspace_root),
            capture_output=True,
            check=True,
        )
    else:
        # Use regular mv
        plan_file.rename(archived_file)

    return str(archived_file)


# ============================================
# Close Issue
# ============================================

def close_issue(issue_number: int, repo: str, comment: str) -> bool:
    """Close GitHub Issue with comment.

    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format
        comment: Comment to add when closing

    Returns:
        True if closed successfully
    """
    result = subprocess.run(
        ["gh", "issue", "close", str(issue_number),
         "--repo", repo, "--comment", comment],
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


# ============================================
# Commit Archived Plan
# ============================================

def commit_archived_plan(
    archived_file: str,
    issue_number: int | None,
    workspace_root: Path
) -> bool:
    """Commit and push archived plan in space repo.

    Args:
        archived_file: Path to archived plan file
        issue_number: Issue number (optional)
        workspace_root: Workspace root path

    Returns:
        True if committed successfully
    """
    # Check staged changes
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(workspace_root),
        capture_output=True,
    )

    # returncode 0 = no staged changes
    # returncode 1 = has staged changes
    if result.returncode == 0:
        log_warn("No staged changes for archived plan")
        return True

    if result.returncode != 1:
        log_warn("Failed to inspect staged changes")
        return False

    # Build commit message
    if issue_number:
        commit_msg = f"chore: archive plan #{issue_number}"
    else:
        plan_name = Path(archived_file).stem
        # Strip YYYYMMDD- prefix for hook length limit (≤60 chars)
        plan_name = re.sub(r'^\d{8}-', '', plan_name)
        commit_msg = f"chore: archive plan {plan_name}"

    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        log_warn("Failed to commit archived plan")
        if result.stderr.strip():
            log_warn(f"  {result.stderr.strip()}")
        return False

    # Push
    result = subprocess.run(
        ["git", "push"],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        log_warn("Failed to push archived plan")
        return False

    return True


# ============================================
# archive command
# ============================================

def cmd_archive(args: argparse.Namespace) -> int:
    """Archive a completed Plan.

    Steps:
    1. Find Plan file
    2. Check status is "done"
    2.5. Sync Plan to Issue
    3. Detect worktree and handle project changes:
       - Has worktree + PR path → cleanup worktree only
       - Has worktree + no PR → merge branch to main → push → cleanup
       - No worktree → auto-commit project changes if any
    4. Archive Plan file
    5. Update Issue Plan link
    6. Commit + push space repo
    7. Close Issue
    """
    input_ref = args.target

    if not input_ref:
        log_error("Missing issue number or plan name")
        log_error("Usage: flow.sh archive <issue-or-plan>")
        return 1

    workspace_root = _find_workspace_root()

    # 1. Find Plan file (smart lookup: Issue number or plan name)
    try:
        plan_path = find_plan(input_ref, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1

    log_info(f"Found plan: {plan_path}")

    # 2. Check Plan status is "done"
    current_status = parse_plan_status(plan_path)

    if not current_status:
        current_status = get_plan_status(plan_path)

    if current_status != "done":
        log_error(f"Plan must be in done state to archive (current: {current_status})")
        log_error("")

        suggestion_map = {
            "planning": f"Run: flow.sh approve {input_ref} --confirm",
            "executing": f"Run: flow.sh complete {input_ref}",
            "verifying": f"Run: flow.sh verify {input_ref} --confirm",
        }

        suggestion = suggestion_map.get(current_status, "Check plan status")
        log_error(suggestion)

        return 1

    # Extract Plan metadata
    project = get_plan_project(plan_path)
    plan_type = get_plan_type(plan_path) or "chore"
    plan_issue = get_plan_issue(plan_path)
    repo = _get_space_repo()

    # 2.5. Sync Plan to Issue before archiving (if Issue exists)
    if plan_issue:
        log_info(f"Syncing Plan #{plan_issue} to Issue...")

        sync_plan_to_issue_body(
            issue_number=plan_issue,
            plan_file=plan_path,
            repo=repo,
            workspace_root=str(workspace_root),
        )

        sync_status_label(
            issue_number=plan_issue,
            status="done",
            repo=repo,
        )

        ensure_issue_labels(
            issue_number=plan_issue,
            plan_file=plan_path,
            repo=repo,
        )

        log_success(f"Plan synced to Issue #{plan_issue}")

    # 3. Detect worktree and handle project changes
    worktree_handled = False
    project_committed = False

    if project:
        project_path = _find_project_path(project, workspace_root)

        if project_path and (project_path / '.git').exists():
            wt = _detect_worktree(plan_path, project, workspace_root)

            if wt:
                branch = wt['branch']
                wt_path = wt['path']

                if plan_issue and _is_pr_path(plan_path, plan_issue, repo):
                    # Has worktree + PR path → just cleanup worktree
                    log_info("PR path detected — skipping merge, cleaning up worktree")
                    _cleanup_worktree(str(project_path), branch, wt_path, workspace_root)
                    worktree_handled = True
                else:
                    # Has worktree + no PR → merge branch to main
                    # Check worktree for uncommitted changes first
                    if has_uncommitted_changes(wt_path):
                        log_error(f"Worktree has uncommitted changes: {wt_path}")
                        log_error("Commit changes in worktree first, then re-run archive")
                        return 1

                    success, conflicts = _merge_worktree_branch(
                        str(project_path), branch, wt_path,
                    )

                    if not success:
                        if conflicts:
                            log_error("Resolve merge conflicts before archiving")
                        return 1

                    # Push merged main
                    if push_branch(str(project_path), 'main'):
                        log_success("Merged main pushed to origin")
                    else:
                        log_warn("Failed to push merged main")

                    # Cleanup worktree
                    _cleanup_worktree(str(project_path), branch, wt_path, workspace_root)
                    worktree_handled = True
            else:
                # No worktree → check project repo for uncommitted changes
                if has_uncommitted_changes(str(project_path)):
                    log_step(f"Auto-committing project changes in {project}...")
                    if _commit_project_changes(str(project_path), plan_type, plan_issue):
                        project_committed = True
                    else:
                        log_error("Failed to commit project changes")
                        return 1

    # 4. Archive Plan file
    try:
        archived_file = archive_plan_file(plan_path, workspace_root)
        log_success(f"Plan archived: {archived_file}")
    except Exception as e:
        log_error(f"Failed to archive plan: {e}")
        return 1

    # 5. Update Issue Plan link (only if Issue exists)
    if plan_issue:
        update_issue_plan_link(
            issue_number=plan_issue,
            plan_file=archived_file,
            repo=repo,
            workspace_root=str(workspace_root),
        )

    # 6. Stage all changes (rename + sync content updates)
    archived_rel = Path(archived_file).relative_to(workspace_root)
    subprocess.run(
        ["git", "add", str(archived_rel)],
        cwd=str(workspace_root),
        capture_output=True,
        check=True,
    )

    # 7. Commit archived plan
    commit_archived_plan(archived_file, plan_issue, workspace_root)

    # 8. Close Issue
    if plan_issue:
        if close_issue(plan_issue, repo, "Plan archived. Closing issue."):
            log_success(f"Issue #{plan_issue} closed")
        else:
            log_warn(f"Failed to close Issue #{plan_issue}")

    # Output summary
    print("")
    log_success("Archive completed")
    print(f"  File: {archived_file}")
    if plan_issue:
        print(f"  Issue: #{plan_issue} (closed)")
    if worktree_handled:
        print(f"  Worktree: cleaned up")
    if project_committed:
        print(f"  Project: changes committed and pushed")

    return 0


# ============================================
# argparse registration
# ============================================

def register_archive_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register archive subcommand."""
    archive_parser = subparsers.add_parser(
        "archive",
        help="Archive a completed Plan"
    )
    archive_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name"
    )
