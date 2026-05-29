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

from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.workspace import find_workspace_root
from workflow import guard_status, resolve_space_repo
from plan import find_plan, find_plan_by_issue
from plan import (
    get_plan_project,
    get_plan_type,
    get_plan_issue,
    get_plan_status,
    get_plan_worktree,
    get_plan_field,
)
from plan import (
    resolve_project_path,
    get_current_branch,
)
from workflow import parse_plan_status
from plan import update_issue_plan_link
from issue import (
    sync_plan_to_issue_body,
    sync_status_label,
    ensure_issue_labels,
)
from lib.git import (
    is_repo_dirty,
    merge_branch,
    branch_exists,
    delete_branch,
    push_branch,
    has_uncommitted_changes,
    commit_all,
    commit_paths,
    push_repo,
    get_relative_path,
)
from plan import push_project_changes, push_ontology_worktree, commit_project_changes
from lib.worktree import clean_worktree
from lib.project import resolve_plan_location


# ============================================
# Helpers
# ============================================




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

    Uses lib.worktree.clean_worktree for one-stop cleanup
    (remove + prune + branch deletion).

    Args:
        project_path: Path to project directory (cwd for git operations)
        branch: Branch name to delete
        worktree_path: Path to worktree directory
        workspace_root: Workspace root path

    Returns:
        True if cleanup succeeded
    """
    project_name = Path(project_path).name

    log_step(f"Cleaning up worktree: {project_name} {branch}")

    worktree_base = workspace_root / ".worktrees"
    result = clean_worktree(Path(project_path), branch, worktree_base)

    if result.get('removed'):
        log_success("Worktree removed")
    else:
        log_warn(f"Failed to remove worktree: {worktree_path}")

    if result.get('branch_deleted'):
        log_success(f"Branch '{branch}' deleted")
    elif result.get('errors'):
        for err in result['errors']:
            log_warn(f"Cleanup warning: {err}")

    return result.get('removed', False)


# ============================================
# Archive Plan File
# ============================================

def archive_plan_file(plan_path: str, workspace_root: Path) -> str:
    """Move Plan file to done/ directory with date prefix.

    Repo-aware: resolves Plan's repo_root via resolve_plan_location()
    and uses that repo for git mv operations (D-06).

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

    # Idempotency: if already under done/, return as-is
    if plan_file.parent.name == "done":
        log_info(f"Plan already archived: {plan_path}")
        return str(plan_file)

    # Determine destination
    plan_dir = plan_file.parent
    done_dir = plan_dir / "done"
    done_dir.mkdir(parents=True, exist_ok=True)

    archive_date = date.today().strftime("%Y%m%d")
    archived_name = f"{archive_date}-{plan_file.name}"
    archived_file = done_dir / archived_name

    # Resolve Plan's owning repo
    plan_location = resolve_plan_location(plan_file, workspace_root)
    repo_root = str(plan_location.repo_root)

    # Check if plan is tracked in git (within Plan's repo)
    plan_rel = get_relative_path(str(plan_file), repo_root)
    archived_rel = get_relative_path(str(archived_file), repo_root)

    is_tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", plan_rel],
        cwd=repo_root,
        capture_output=True,
    ).returncode == 0

    if is_tracked:
        # Use git mv in Plan's repo
        subprocess.run(
            ["git", "mv", plan_rel, archived_rel],
            cwd=repo_root,
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
    """Commit and push archived plan in Plan's repo.

    Repo-aware: resolves Plan's repo_root via resolve_plan_location()
    and commits/pushes in that repo instead of always using workspace_root (D-06).

    Args:
        archived_file: Path to archived plan file
        issue_number: Issue number (optional)
        workspace_root: Workspace root path

    Returns:
        True if committed successfully
    """
    # Resolve Plan's owning repo from the archived file path
    plan_location = resolve_plan_location(Path(archived_file), workspace_root)
    repo_root = str(plan_location.repo_root)
    plan_rel = plan_location.repo_relative_path

    # Check staged changes in Plan's repo
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=repo_root,
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
    prefix = "chore: archive plan "
    max_desc = 60  # hook limit
    if issue_number:
        commit_msg = f"chore: archive plan #{issue_number}"
    else:
        plan_name = Path(archived_file).stem
        # Strip YYYYMMDD- prefix for hook length limit (≤60 chars)
        plan_name = re.sub(r'^\d{8}-', '', plan_name)
        if len(prefix) + len(plan_name) > max_desc:
            plan_name = plan_name[: max_desc - len(prefix) - 3] + "..."
        commit_msg = f"{prefix}{plan_name}"

    # Commit in Plan's repo
    if not commit_paths(repo_root, [plan_rel], commit_msg):
        # Fallback: try commit_all for staged changes (git mv stages automatically)
        result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            log_warn("Failed to commit archived plan")
            if result.stderr.strip():
                log_warn(f"  {result.stderr.strip()}")
            return False

    # Push in Plan's repo
    if not push_repo(repo_root, plan_location.branch):
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

    workspace_root = find_workspace_root()

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

    if not guard_status(current_status, "done", input_ref):
        return 1

    # Extract Plan metadata
    project = get_plan_project(plan_path)
    plan_type = get_plan_type(plan_path) or "chore"
    plan_issue = get_plan_issue(plan_path)
    plan_name = Path(plan_path).stem  # Extract plan name for commit message
    repo = resolve_space_repo(plan_issue, workspace_root)

    if plan_issue and not repo:
        log_warn(f"Cannot resolve space repo for Issue #{plan_issue}; skipping Issue sync")
        plan_issue = None

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
    #    Special handling for ontology-worktree projects (.wopal/)
    #    Standard projects follow the existing worktree detection/merge/cleanup flow
    worktree_handled = False
    project_committed = False
    ontology_committed = False

    # Read Project Type from Plan metadata
    project_type_str = get_plan_field(plan_path, "Project Type")
    is_ontology_worktree = project_type_str == "ontology-worktree"

    if is_ontology_worktree:
        # Ontology worktree: push .wopal/ changes (committed during complete)
        log_step("Ontology worktree project detected — pushing .wopal/ changes")
        if push_ontology_worktree(workspace_root):
            ontology_committed = True
        else:
            log_error("Failed to push ontology worktree changes")
            return 1
    elif project:
        project_path = resolve_project_path(plan_path, project, workspace_root)

        if project_path:
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
                # No worktree → push project changes (committed during complete)
                if has_uncommitted_changes(str(project_path)):
                    log_warn(f"Uncommitted changes found in {project} — should have been committed during complete")
                    log_step(f"Committing uncommitted changes in {project}...")
                    if not commit_project_changes(str(project_path), plan_type, plan_issue, plan_name, repo):
                        log_error("Failed to commit project changes")
                        return 1
                log_step(f"Pushing project changes in {project}...")
                if push_project_changes(str(project_path)):
                    project_committed = True
                else:
                    log_error("Failed to push project changes")
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

    # 6. Stage archived plan in Plan's repo (rename is already staged by git mv)
    #    If git mv was used, the rename is already staged. For safety, also
    #    stage the archived file path.
    plan_location = resolve_plan_location(Path(archived_file), workspace_root)
    repo_root = str(plan_location.repo_root)
    archived_repo_rel = get_relative_path(archived_file, repo_root)
    subprocess.run(
        ["git", "add", archived_repo_rel],
        cwd=repo_root,
        capture_output=True,
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
    if ontology_committed:
        print(f"  Ontology: .wopal/ changes committed and pushed")

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
