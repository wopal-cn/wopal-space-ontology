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
#   3. Detect worktree and handle cleanup (never commits implementation code)
#   4. Archive Plan file (move to done/)
#   5. Update Issue Plan link
#   6. Commit archived plan in Plan's repo
#   7. Close GitHub Issue

from __future__ import annotations

import argparse
import subprocess
import re
import glob as glob_mod
from pathlib import Path
from datetime import date

from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.workspace import find_workspace_root
from workflow import guard_status, resolve_space_repo
from plan import find_plan
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
)
from workflow import parse_plan_status
from plan import update_issue_plan_link
from issue import (
    sync_plan_to_issue_body,
    sync_status_label,
    ensure_issue_labels,
)
from lib.git import (
    merge_branch,
    push_branch,
    has_uncommitted_changes,
    commit_paths,
    push_repo,
    get_relative_path,
)
from plan import push_project_changes, push_ontology_worktree
from lib.worktree import clean_worktree
from lib.project import resolve_plan_location


# ============================================
# Helpers
# ============================================




# ============================================
# Phase Doc Plan Status Update
# ============================================

_PHASE_TABLE_HEADER = "| Project | Plan | Status |"
_PHASE_TABLE_SEP = "|---------|------|--------|"


def _update_phase_doc_plan_status(
    workspace_root: Path,
    plan_name: str,
    product: str,
    phase: str,
    new_status: str = "done",
) -> str | None:
    """Update Plan status in a product phase doc's Related Plans table.

    Returns the updated file path on success, None otherwise (silently skipped
    or warned).
    """
    if not product or not phase:
        log_info("No Product/Phase metadata, skipping phase doc update")
        return None

    phases_dir = workspace_root / "docs" / "products" / product / "phases"
    if not phases_dir.exists():
        log_warn(f"Phases directory not found: {phases_dir}")
        return None

    # Find matching phase doc(s) — prefer exact match, then glob
    candidates = sorted(phases_dir.glob(f"*{phase}*.md"))

    if not candidates:
        log_warn(f"No phase doc found for product={product}, phase={phase}")
        return None

    phase_doc_path = candidates[0]

    content = phase_doc_path.read_text()
    lines = content.splitlines(keepends=True)

    header_idx = None
    for i, line in enumerate(lines):
        if line.strip() == _PHASE_TABLE_HEADER:
            header_idx = i
            break

    if header_idx is None:
        log_warn(f"No Related Plans table found in {phase_doc_path.name}")
        return None

    # Walk rows after separator
    updated = False
    for i in range(header_idx + 2, len(lines)):
        raw = lines[i]
        # Stop at blank line or next non-table line
        stripped = raw.strip()
        if not stripped or not stripped.startswith("|"):
            break

        # Parse table row cells
        cells = [c.strip() for c in stripped.split("|")]
        # cells from split on "| a | b | c |" → ['', ' a ', ' b ', ' c ', '']
        # Filter empty edge cells
        cells = [c for c in cells if c != ""]
        if len(cells) < 3:
            continue

        plan_cell = cells[1]
        if plan_cell == plan_name:
            # Replace Status column (last cell) with new_status
            old_status = cells[2]
            lines[i] = raw.replace(old_status, new_status, 1)
            updated = True
            break

    if not updated:
        log_warn(f"Plan '{plan_name}' not found in phase doc Related Plans table")
        return None

    phase_doc_path.write_text("".join(lines))
    log_success(f"Updated phase doc {phase_doc_path.name}: {plan_name} → {new_status}")
    return str(phase_doc_path)


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

    Plan metadata is returned even when the worktree directory has been
    cleaned up (e.g. by verify-switch). The branch recorded there still
    needs to be deleted by archive. Path-existence checks belong to the
    caller.

    Args:
        plan_path: Path to Plan file
        project: Project name
        workspace_root: Workspace root path

    Returns:
        Dict with 'branch' and 'path' keys, or None
    """
    # Plan metadata always wins — even if path is gone the branch still
    # needs cleanup
    wt = get_plan_worktree(plan_path)
    if wt:
        return wt

    # Fallback: glob match (only when Plan metadata is absent)
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

    Plan-only archive: never commits implementation code.
    Steps:
    1. Find Plan file
    2. Check status is "done"
    2.5. Sync Plan to Issue
    3. Detect worktree and handle cleanup:
       - Has worktree + PR path → cleanup worktree only
       - Has worktree + no PR → merge branch to main → push → cleanup
       - No worktree → push project changes (committed during complete)
    4. Archive Plan file (move to done/)
    5. Update Issue Plan link
    6. Commit + push archived plan in Plan's repo
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

    # 3. Detect worktree and handle cleanup
    #    Archive never commits implementation code — dirty trees block the command.
    worktree_handled = False
    project_pushed = False
    ontology_pushed = False

    # Read Project Type from Plan metadata
    project_type_str = get_plan_field(plan_path, "Project Type")
    is_ontology_worktree = project_type_str == "ontology-worktree"

    if is_ontology_worktree:
        # Ontology worktree: push .wopal/ changes (committed during complete/verify)
        log_step("Ontology worktree project detected — pushing .wopal/ changes")
        if not push_ontology_worktree(workspace_root):
            log_error("Failed to push ontology worktree changes")
            return 1
        ontology_pushed = True
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
                    # Has worktree + no PR
                    # Resolve wt_path (may be absolute or workspace-relative)
                    wt_path_resolved = Path(wt_path)
                    if not wt_path_resolved.is_absolute():
                        wt_path_resolved = workspace_root / wt_path_resolved

                    if not wt_path_resolved.exists():
                        # Worktree directory was cleaned up earlier (typically
                        # by verify-switch). The feature branch may still be
                        # present in the project repo. Skip merge — by this
                        # point the branch has either been merged into the
                        # integration branch (verify --confirm ensures this)
                        # or is intentionally orphaned.
                        log_info(f"Worktree path no longer exists: {wt_path_resolved}")
                        log_info("Skipping merge; cleaning up feature branch only")
                    else:
                        # Worktree directory present → normal flow
                        if has_uncommitted_changes(str(wt_path_resolved)):
                            log_error(f"Worktree has uncommitted changes: {wt_path_resolved}")
                            log_error("Commit changes in worktree first, then re-run archive")
                            return 1

                        success, conflicts = _merge_worktree_branch(
                            str(project_path), branch, str(wt_path_resolved),
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

                    # Always cleanup — clean_worktree is safe when the
                    # worktree directory is gone; it still deletes the
                    # feature branch.
                    _cleanup_worktree(
                        str(project_path),
                        branch,
                        str(wt_path_resolved),
                        workspace_root,
                    )
                    worktree_handled = True
            else:
                # No worktree → push project changes (committed during complete)
                if has_uncommitted_changes(str(project_path)):
                    log_error(f"Project {project} has uncommitted changes — archive does not commit implementation code")
                    log_error("Commit changes first, then re-run archive")
                    return 1
                log_step(f"Pushing project changes in {project}...")
                if push_project_changes(str(project_path)):
                    project_pushed = True
                else:
                    log_error("Failed to push project changes")
                    return 1

    # 4. Cache Product/Phase metadata before Plan is moved
    product_meta = get_plan_field(plan_path, "Product")
    phase_meta = get_plan_field(plan_path, "Phase")

    # 5. Archive Plan file
    try:
        archived_file = archive_plan_file(plan_path, workspace_root)
        log_success(f"Plan archived: {archived_file}")
    except Exception as e:
        log_error(f"Failed to archive plan: {e}")
        return 1

    # 6. Update Issue Plan link (only if Issue exists)
    if plan_issue:
        update_issue_plan_link(
            issue_number=plan_issue,
            plan_file=archived_file,
            repo=repo,
            workspace_root=str(workspace_root),
        )

    # 7. Stage archived plan in Plan's repo (rename is already staged by git mv)
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

    # 8. Update phase doc Related Plans table and commit in workspace root
    phase_doc_path = _update_phase_doc_plan_status(
        workspace_root, plan_name, product_meta, phase_meta,
    )
    if phase_doc_path and product_meta and phase_meta:
        # Stage only the modified phase doc file, commit in workspace root
        ws_root_str = str(workspace_root)
        phase_doc_rel = os.path.relpath(phase_doc_path, ws_root_str)
        subprocess.run(
            ["git", "add", phase_doc_rel],
            cwd=ws_root_str,
            capture_output=True,
        )
        commit_msg = f"chore: archive plan {plan_name} — update phase doc {product_meta}/{phase_meta}"
        result = subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=ws_root_str,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            log_success(f"Phase doc Related Plans updated: {product_meta}/{phase_meta}")
            push_result = subprocess.run(
                ["git", "push"],
                cwd=ws_root_str,
                capture_output=True,
                text=True,
            )
            if push_result.returncode != 0:
                log_warn(f"Failed to push phase doc: {push_result.stderr.strip()}")
        else:
            log_warn(f"Failed to commit phase doc: {result.stderr.strip()}")

    # 9. Commit archived plan (and phase doc if updated)
    commit_archived_plan(archived_file, plan_issue, workspace_root)

    # 10. Close Issue
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
    if project_pushed:
        print(f"  Project: changes pushed")
    if ontology_pushed:
        print(f"  Ontology: .wopal/ changes pushed")

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
