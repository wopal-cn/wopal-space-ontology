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
import os
import subprocess
import re
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
    check_branch_merged,
    has_uncommitted_changes,
    commit_paths,
    push_repo,
    get_current_branch,
    get_relative_path,
    is_commit_pushed,
    GitMutationFailure,
)
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
    2. Fallback: derive from full Plan name (branch = <project>-<plan-name>,
       worktree dir = branch). Does not depend on Issue number, so no-Issue
       plans are also located.

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

    # Fallback: derive from full Plan name (no Issue number dependency)
    plan_name = Path(plan_path).stem
    branch = f"{project}-{plan_name}"
    wt_path = workspace_root / ".worktrees" / branch

    if not wt_path.exists():
        return None

    return {'branch': branch, 'path': str(wt_path)}


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
        True when cleanup completed: worktree removed and the branch is
        either deleted, already absent, or explicitly skipped (checked out).
        False when a real step failed — the caller reports partial cleanup.
    """
    project_name = Path(project_path).name

    log_step(f"Cleaning up worktree: {project_name} {branch}")

    worktree_base = workspace_root / ".worktrees"
    result = clean_worktree(Path(project_path), branch, worktree_base)

    removed = result.get('removed', False)
    branch_status = result.get('branch_status', 'failed')
    branch_deleted = result.get('branch_deleted', False)

    if removed:
        log_success("Worktree removed")
    else:
        log_warn(f"Failed to remove worktree: {worktree_path}")

    if branch_deleted:
        log_success(f"Branch '{branch}' deleted")
    elif branch_status == "absent":
        log_info(f"Branch '{branch}' already absent")
    elif branch_status == "skipped":
        log_warn(
            f"Branch '{branch}' is currently checked out in {project_path} — "
            "deletion skipped; switch that checkout away and delete the "
            "branch manually."
        )
    for err in result.get('errors', []):
        log_warn(f"Cleanup warning: {err}")

    # Complete only when the worktree is gone and no real branch-deletion
    # failure left the ref behind ("skipped"/"absent" are explicit terminal
    # states, reported above).
    return removed and branch_status != "failed"


def _delivery_id(plan_path: str) -> str:
    value = get_plan_field(plan_path, "Delivery")
    if not isinstance(value, str):
        value = ""
    value = value.strip()
    if (
        not value
        or value in {"(none)", "none", "N/A"}
        or (value.startswith("<") and value.endswith(">"))
    ):
        return Path(plan_path).stem
    return value


def _active_delivery_members(
    workspace_root: Path, delivery: str, current_plan: Path
) -> list[Path]:
    """Return other unarchived Plans that still belong to this Delivery."""
    plans_root = workspace_root / ".wopal-space" / "plans"
    if not plans_root.exists():
        return []
    members: list[Path] = []
    current_resolved = current_plan.resolve()
    for candidate in plans_root.rglob("*.md"):
        if "done" in candidate.relative_to(plans_root).parts:
            continue
        if candidate.resolve() == current_resolved:
            continue
        candidate_delivery = _delivery_id(str(candidate))
        if candidate.stem == delivery or candidate_delivery == delivery:
            members.append(candidate)
    return sorted(members)


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
        # Use git mv in Plan's repo. Inspect the exit code ourselves so a
        # failure carries full mutation diagnostics (command / cwd / exit /
        # stderr) instead of the bare CalledProcessError string.
        mv_cmd = ["git", "mv", plan_rel, archived_rel]
        mv_result = subprocess.run(
            mv_cmd,
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        if mv_result.returncode != 0:
            raise RuntimeError(
                "Failed to move Plan into done/:\n"
                f"{GitMutationFailure.from_completed(mv_cmd, repo_root, mv_result)}"
            )
    else:
        # Use regular mv
        plan_file.rename(archived_file)

    return str(archived_file)


def _recover_staged_archive_sources(repo_root: str, archived_file: str) -> list[str]:
    """Recover staged deletion paths for a re-run archive commit (B-01).

    On a re-run after a commit failure, the original `git mv` left the
    old path staged as a deletion (or a rename). `archive_plan_file`'s
    idempotency short-circuit returns the archived path, so `source_path`
    can no longer name the original. Read staged deletions/renames from
    the index and match by file name to recover the source paths so the
    pathspec commit carries the full rename.
    """
    archived_name = Path(archived_file).name
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-status"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    sources = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if not parts:
            continue
        status = parts[0]
        if status.startswith("D") and len(parts) >= 2:
            if Path(parts[1]).name == archived_name:
                sources.append(parts[1])
        elif status.startswith("R") and len(parts) >= 3:
            if Path(parts[2]).name == archived_name:
                sources.append(parts[1])
    return sources


def _stage_archived_plan(
    archived_file: str, repo_root: str
) -> GitMutationFailure | None:
    """Stage the archived Plan path in its repo.

    Inspects the exit code so a failed stage keeps full mutation diagnostics
    (command / cwd / exit / stdout / stderr) instead of only stderr — B-04.

    Returns:
        None on success; GitMutationFailure (falsy) on non-zero `git add`.
    """
    rel = get_relative_path(archived_file, repo_root)
    cmd = ["git", "add", rel]
    result = subprocess.run(
        cmd,
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return GitMutationFailure.from_completed(cmd, repo_root, result)
    return None


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
    workspace_root: Path,
    source_path: str | None = None,
) -> bool:
    """Commit and push archived plan in Plan's repo.

    Repo-aware: resolves Plan's repo_root via resolve_plan_location()
    and commits/pushes in that repo instead of always using workspace_root (D-06).

    Durability contract: the archive record is durable only once the push
    succeeds. When there is nothing new to commit (a re-run after a push
    failure), the commit step is skipped but the push is still attempted and
    alone decides the result.

    B-05 path isolation: the commit carries only the Plan's own paths. For a
    tracked `git mv` the staged rename spans two paths (old location removed,
    new location added); both are named explicitly so the rename lands in
    full. Unrelated staged entries never ride along and keep their index
    state (managed by commit_paths' pathspec commit).

    Args:
        archived_file: Path to archived plan file
        issue_number: Issue number (optional)
        workspace_root: Workspace root path
        source_path: Pre-move Plan path when it differs from archived_file
            (a tracked rename); its staged deletion must be committed too.

    Returns:
        True if the archived plan is committed and pushed; False when the
        commit or the push failed (durability not reached)
    """
    # Resolve Plan's owning repo from the archived file path
    plan_location = resolve_plan_location(Path(archived_file), workspace_root)
    repo_root = str(plan_location.repo_root)
    plan_rel = plan_location.repo_relative_path

    # Name every path the archive commit must carry; a `git mv` rename needs
    # both its source (removal) and destination (addition).
    commit_targets = [plan_rel]
    if source_path and source_path != archived_file:
        source_rel = get_relative_path(source_path, repo_root)
        if source_rel not in commit_targets:
            commit_targets.insert(0, source_rel)
    else:
        # B-01: re-run after a commit failure. archive_plan_file's
        # idempotency short-circuit made source_path point at the archived
        # path, so the original deletion is no longer named here. Recover
        # it from the staged index so the pathspec commit carries the full
        # rename (old path deletion + new path addition).
        for recovered in _recover_staged_archive_sources(repo_root, archived_file):
            if recovered not in commit_targets:
                commit_targets.insert(0, recovered)

    # The commit below lands on the repo's current HEAD. Push must target the
    # branch that actually carries it: for a plain checkout
    # resolve_plan_location() resolves the default branch, which can differ
    # from the checked-out branch — pushing it would report success while the
    # archive commit never leaves the machine (B-03).
    push_branch = get_current_branch(repo_root)
    if not push_branch:
        log_error(
            "Cannot archive: Plan repo is in detached HEAD state, so the "
            f"archive commit cannot be pushed to any branch ({repo_root})."
        )
        return False
    if plan_location.branch and plan_location.branch != push_branch:
        log_warn(
            f"Plan repo is checked out on '{push_branch}', not the resolved "
            f"default branch '{plan_location.branch}'; pushing '{push_branch}' "
            "so the archive commit is durable."
        )

    # Check staged changes in Plan's repo
    staged_result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=repo_root,
        capture_output=True,
    )

    # returncode 0 = no staged changes
    # returncode 1 = has staged changes
    if staged_result.returncode == 0:
        # Re-run after a push failure: the commit already exists locally.
        # Skip only the commit; the push below is still required.
        log_warn("No staged changes for archived plan")
    elif staged_result.returncode != 1:
        log_warn("Failed to inspect staged changes")
        return False
    else:
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

        # Commit in Plan's repo (path-isolated: only the archive paths move)
        primary = commit_paths(repo_root, commit_targets, commit_msg)
        if not primary:
            # Keep the primary attempt's evidence before trying the fallback;
            # the second failure must never overwrite the first (B-04).
            log_warn("Failed to commit archived plan (primary attempt):")
            log_warn(str(primary))
            # Fallback: retry the commit with the same pathspec (git mv may
            # have staged entries the primary add/commit sequence missed).
            fallback_cmd = ["git", "commit", "-m", commit_msg, "--", *commit_targets]
            fallback = subprocess.run(
                fallback_cmd,
                cwd=repo_root,
                capture_output=True,
                text=True,
            )
            if fallback.returncode != 0:
                fallback_failure = GitMutationFailure.from_completed(
                    fallback_cmd, repo_root, fallback,
                )
                log_warn("Failed to commit archived plan (fallback attempt):")
                log_warn(str(fallback_failure))
                return False

    # Push in Plan's repo — the durability point; also runs when the commit
    # step was skipped (re-run after a push failure).
    push_result = push_repo(repo_root, push_branch)
    if not push_result:
        log_warn(f"Failed to push archived plan:\n{push_result}")
        return False

    # Durability verification: the commit must really be contained in
    # origin/<push_branch>, not merely accepted from another local ref.
    if not is_commit_pushed(repo_root, push_branch):
        log_warn(
            f"Archive commit is not contained in origin/{push_branch} after "
            "the push — durability not reached."
        )
        return False

    return True


def _report_archive_not_durable(archived_file: str) -> None:
    """Actionable guidance when the archive record did not reach durability.

    The Plan file has already been moved under done/ with a date prefix, so
    the original ref can no longer locate it; name the actual file and the
    archived-name re-run command.
    """
    archived_name = Path(archived_file).stem
    log_error(
        "Archive record not persisted — worktree/branch cleanup and "
        "Issue close skipped."
    )
    log_error(f"Archived plan file: {archived_file}")
    log_error(
        "After fixing the cause, re-run with the archived name: "
        f"flow.sh archive {archived_name}"
    )


# ============================================
# archive command
# ============================================

def cmd_archive(args: argparse.Namespace) -> int:
    """Archive a completed Plan.

    Plan-only archive: never commits implementation code.
    Steps:
    1. Find Plan file
    2. Check status is "done"
    3. Detect worktree + verify cleanup preconditions (read-only):
       - Has worktree + PR path → no merge check
       - Has worktree + no PR → check merge status
       - No worktree → push project changes (committed during complete)
    4. Archive Plan file (move to done/)
    5. Stage + commit + push archived plan in Plan's repo (durability point)
    6. Issue sync / link / labels — only after durability (D-06)
    7. Worktree/branch cleanup — only after durability; failure is reported
       as partial cleanup
    8. Close Issue
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
    keep_worktree = getattr(args, "keep_worktree", False)

    delivery = _delivery_id(plan_path)
    delivery_members = _active_delivery_members(
        workspace_root, delivery, Path(plan_path)
    )
    is_delivery_owner = delivery == plan_name
    if is_delivery_owner and delivery_members:
        log_error(
            "Delivery owner must be archived last; active members remain: "
            + ", ".join(member.stem for member in delivery_members)
        )
        return 1
    if not is_delivery_owner and not keep_worktree:
        log_error(
            "Shared Delivery member must be archived with --keep-worktree; "
            f"owner '{delivery}' performs the final branch/worktree cleanup"
        )
        return 1

    if plan_issue and not repo:
        log_warn(f"Cannot resolve space repo for Issue #{plan_issue}; skipping Issue sync")
        plan_issue = None

    # 2.5. Issue sync is a durability-gated step (D-06): it must not run
    #      before the archive record is committed and pushed. The sync block
    #      lives after commit_archived_plan below; a durability failure exits
    #      without touching the Issue.

    # 3. Detect worktree and verify cleanup preconditions.
    #    Archive never commits or pushes implementation code. Destructive
    #    cleanup (worktree removal / branch deletion) is deferred until the
    #    archive record is durable (step 10); this step only reads state and
    #    aborts before any mutation.
    worktree_handled = False
    cleanup_target = None  # (project_path, branch, resolved wt_path)
    if keep_worktree:
        log_info("Evolution mode (--keep-worktree): skipping worktree and branch cleanup")
    elif project:
        project_path = resolve_project_path(plan_path, project, workspace_root)

        if project_path:
            wt = _detect_worktree(plan_path, project, workspace_root)

            if wt:
                branch = wt['branch']
                wt_path = wt['path']
                # Resolve wt_path (may be absolute or workspace-relative)
                wt_path_resolved = Path(wt_path)
                if not wt_path_resolved.is_absolute():
                    wt_path_resolved = workspace_root / wt_path_resolved

                if plan_issue and _is_pr_path(plan_path, plan_issue, repo):
                    # Has worktree + PR path → no merge check, cleanup queued
                    log_info("PR path detected — skipping merge check")
                else:
                    # Has worktree + no PR
                    if not wt_path_resolved.exists():
                        # Worktree directory was cleaned up earlier (typically
                        # by verify-switch). The feature branch may still be
                        # present in the project repo. Skip merge — by this
                        # point the branch has either been merged into the
                        # integration branch (verify --confirm ensures this)
                        # or is intentionally orphaned.
                        log_info(f"Worktree path no longer exists: {wt_path_resolved}")
                        log_info("Skipping merge check; feature branch cleanup queued")
                    else:
                        # Worktree directory present → check merge status
                        if has_uncommitted_changes(str(wt_path_resolved)):
                            if not args.force:
                                log_warn(f"Worktree has uncommitted changes: {wt_path_resolved}")
                                log_warn("Archive will proceed but uncommitted worktree changes may be lost when worktree is cleaned up")

                        # Check if feature branch has been merged
                        merge_status = check_branch_merged(workspace_root, plan_path)
                        if merge_status != 0:
                            log_error("Feature branch not yet merged. Please merge first.")
                            return 1

                        log_info("Feature branch already merged, skipping merge")

                cleanup_target = (str(project_path), branch, wt_path_resolved)
            else:
                # No worktree — remind user to push project changes
                if has_uncommitted_changes(str(project_path)):
                    if not args.force:
                        log_warn(f"Project {project} has uncommitted changes — these changes will NOT be committed by archive")
                    # Continue — dirty working tree no longer blocks archive
                log_warn(f"请手动 push 项目变更: cd {project_path} && git push")

    # 4. Archive Plan file
    try:
        archived_file = archive_plan_file(plan_path, workspace_root)
        log_success(f"Plan archived: {archived_file}")
    except Exception as e:
        log_error(f"Failed to archive plan: {e}")
        return 1

    # 5. Issue Plan link update is durability-gated together with the rest
    #    of the Issue side effects (see step 9.5 below).

    # 6. Stage archived plan in Plan's repo (rename is already staged by git mv)
    #    If git mv was used, the rename is already staged. For safety, also
    #    stage the archived file path; a failed stage aborts before any
    #    external or destructive step.
    plan_location = resolve_plan_location(Path(archived_file), workspace_root)
    repo_root = str(plan_location.repo_root)
    stage_failure = _stage_archived_plan(archived_file, repo_root)
    if stage_failure is not None:
        log_error(f"Failed to stage archived plan:\n{stage_failure}")
        _report_archive_not_durable(archived_file)
        return 1

    # 7. Commit + push the archived plan — the durability point of the
    #    archive record. Nothing destructive or externally visible may run
    #    before this succeeds (D-07); a push failure means not durable.
    if not commit_archived_plan(
        archived_file, plan_issue, workspace_root, source_path=plan_path
    ):
        _report_archive_not_durable(archived_file)
        return 1

    # 8. Issue side effects — now that the archive record is durable (D-06):
    #     body sync, status label, type/project labels and the Plan link all
    #     point at the archived path. The original plan path no longer
    #     exists; the archived file is the source of the synced content.
    #     B-02: the blob URL must point at the branch that actually carries
    #     the archive commit (push verified it), not resolve_plan_location's
    #     default branch which may differ for a plain checkout.
    #     B-03: sync_plan_to_issue_body returns False on failure; the command
    #     must not report unconditional success when the Issue body is stale.
    if plan_issue:
        log_info(f"Syncing Plan #{plan_issue} to Issue...")

        # Resolve the branch that actually carries the archive commit; the
        # durability check above already rejected detached HEAD.
        plan_location = resolve_plan_location(Path(archived_file), workspace_root)
        push_branch = get_current_branch(str(plan_location.repo_root))

        synced = sync_plan_to_issue_body(
            issue_number=plan_issue,
            plan_file=archived_file,
            repo=repo,
            workspace_root=str(workspace_root),
        )
        if not synced:
            log_error(
                f"Archive record is durable, but Issue #{plan_issue} body "
                "sync failed; Issue body may be stale. Re-run: "
                f"flow.sh archive {Path(archived_file).stem}"
            )
        else:
            sync_status_label(
                issue_number=plan_issue,
                status="done",
                repo=repo,
            )

            ensure_issue_labels(
                issue_number=plan_issue,
                plan_file=archived_file,
                repo=repo,
            )

            update_issue_plan_link(
                issue_number=plan_issue,
                plan_file=archived_file,
                repo=repo,
                workspace_root=str(workspace_root),
                branch=push_branch,
            )

            log_success(f"Plan synced to Issue #{plan_issue}")

    # 10. Destructive cleanup, now that the archive record is durable.
    #     A cleanup failure is reported as partial cleanup: the archive
    #     record itself is already persisted and is never rolled back.
    cleanup_failed = False
    if cleanup_target is not None:
        cleanup_project, cleanup_branch, cleanup_wt_path = cleanup_target
        if _cleanup_worktree(
            cleanup_project,
            cleanup_branch,
            str(cleanup_wt_path),
            workspace_root,
        ):
            worktree_handled = True
        else:
            cleanup_failed = True
            log_error(
                "Partial cleanup: the archive record is durable (committed "
                "and pushed), but worktree/branch cleanup failed — residual "
                "directories may remain under .worktrees/. Fix the cause "
                "and finish cleanup manually."
            )

    # 11. Close Issue
    if plan_issue:
        if close_issue(plan_issue, repo, "Plan archived. Closing issue."):
            log_success(f"Issue #{plan_issue} closed")
        else:
            log_warn(f"Failed to close Issue #{plan_issue}")

    # Output summary
    print("")
    if cleanup_failed:
        log_error("Archive partial: record persisted, cleanup incomplete")
        print(f"  File: {archived_file}")
        if plan_issue:
            print(f"  Issue: #{plan_issue} (closed)")
        return 1

    log_success("Archive completed")
    print(f"  File: {archived_file}")
    if plan_issue:
        print(f"  Issue: #{plan_issue} (closed)")
    if worktree_handled:
        print(f"  Worktree: cleaned up")

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
    archive_parser.add_argument(
        "--force",
        action="store_true",
        help="Skip dirty working tree warnings"
    )
    archive_parser.add_argument(
        "--keep-worktree",
        action="store_true",
        default=False,
        help="Retain worktree directory and branch for evolution mode (skip cleanup)"
    )
