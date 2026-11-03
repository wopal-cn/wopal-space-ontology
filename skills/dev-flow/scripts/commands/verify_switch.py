"""verify_switch command — unified verification switch for dev-flow.

Switches workspace to feature branch for verification:
  - standard: git checkout project repo to feature branch + remove worktree
"""

import re
import subprocess
from pathlib import Path

from lib.git import commit_paths, get_dirty_lines, GitMutationFailure
from lib.project import resolve_plan_location
from lib.workspace import find_workspace_root
from lib.worktree import parse_worktree_context
from lib.logging import log_success, log_error, log_warn, log_step
from plan import find_plan, get_plan_field, resolve_project_path



def _git_fetch(cwd: str) -> bool:
    """Run git fetch in the given directory.

    Args:
        cwd: Directory to run git fetch in

    Returns:
        True if fetch succeeded
    """
    cmd = ["git", "fetch"]
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(
            "git fetch failed:\n"
            f"{GitMutationFailure.from_completed(cmd, cwd, result)}"
        )
        return False
    return True


def _git_checkout(branch: str, cwd: str) -> bool:
    """Run git checkout in the given directory.

    Args:
        branch: Branch to checkout
        cwd: Directory to run git checkout in

    Returns:
        True if checkout succeeded
    """
    cmd = ["git", "checkout", branch]
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(
            f"git checkout {branch} failed:\n"
            f"{GitMutationFailure.from_completed(cmd, cwd, result)}"
        )
        return False
    return True


def _prune_worktrees(repo_root: str) -> list[str]:
    """Prune stale worktree references; report failures, never swallow them.

    `git worktree prune` may exit 0 while printing a deletion error to
    stderr (e.g. Permission denied), so both the exit code and stderr are
    inspected. Prune is janitorial: problems are returned for the caller to
    report without aborting the switch.

    Args:
        repo_root: Path to the git repository root

    Returns:
        List of problem descriptions (empty when prune was clean).
    """
    cmd = ["git", "worktree", "prune"]
    result = subprocess.run(
        cmd,
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    problems: list[str] = []
    if result.returncode != 0:
        problems.append(
            "git worktree prune failed:\n"
            f"{GitMutationFailure.from_completed(cmd, repo_root, result)}"
        )
    elif result.stderr.strip():
        problems.append(
            f"git worktree prune reported errors: {result.stderr.strip()}"
        )
    return problems


def _remove_worktree(repo_root: str, worktree_path: str) -> bool:
    """Remove a git worktree and prune stale references.

    Uses git worktree remove --force then git worktree prune
    to ensure complete cleanup (avoids "branch already used by worktree" errors).

    Args:
        repo_root: Path to the git repository root
        worktree_path: Absolute path to the worktree to remove

    Returns:
        True if removal succeeded or worktree doesn't exist
    """
    target = Path(worktree_path)
    if not target.exists():
        return True

    cmd = ["git", "worktree", "remove", str(target), "--force"]
    result = subprocess.run(
        cmd,
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(
            f"Failed to remove worktree at {target}:\n"
            f"{GitMutationFailure.from_completed(cmd, repo_root, result)}"
        )
        return False

    # Prune stale worktree references; failures are reported (non-fatal).
    for problem in _prune_worktrees(repo_root):
        log_error(f"Worktree removed, but {problem}")

    return True


def _resolve_wt_path(wt_path: Path | str, workspace_root: Path) -> Path:
    """Resolve worktree path: absolute if already absolute, else relative to workspace root."""
    raw = Path(str(wt_path))
    return raw if raw.is_absolute() else workspace_root / str(wt_path)


def _check_dirty(cwd: str) -> list[str]:
    """Run git status --porcelain, return dirty file lines (empty if clean).

    Args:
        cwd: Directory to check

    Returns:
        List of dirty file lines from git status --porcelain
    """
    return get_dirty_lines(cwd)


def _update_plan_after_switch(
    plan_path: str, workspace_root: Path, verification_dir: str
) -> bool:
    """Update Plan Worktree metadata after switching.

    - Replace path: <original> → path: (removed)
    - Add Verification Dir metadata field after Worktree block
    - Commit the Plan change in the Plan's own repo (space repo)

    Plan files live under .wopal-space/plans/ in the space repo, not in the
    project repo that was just switched. The owning repo is resolved from
    the Plan path itself (same pattern as lib.plan_state.reset_plan_index);
    committing anywhere else silently loses the metadata edit.

    Args:
        plan_path: Absolute path to the Plan file
        workspace_root: Workspace root path
        verification_dir: Directory where the user runs verification (the
            switched project repo) — recorded as metadata, not committed there

    Returns:
        True when the metadata edit is committed in the Plan's repo; False
        when the commit failed (the edit is on disk but uncommitted — the
        caller exits non-zero with manual-commit guidance).
    """
    plan_file = Path(plan_path)
    content = plan_file.read_text()

    # Replace path: <anything> → path: (removed) in Worktree block
    content = re.sub(r'(  - path: ).+', r'\1(removed)', content)

    # Normalize trailing newline before regex matching.
    # Without this, the regex won't consume the last Worktree sub-field line
    # when it sits at EOF, causing Verification Dir to be inserted inside the block.
    if not content.endswith("\n"):
        content += "\n"

    # Insert Verification Dir AFTER the Worktree block, not inside it.
    # The Worktree block ends at the last 2-indent line belonging to it;
    # "Verification Dir" is a top-level metadata field and must be 0-indent.
    wt_pattern = r'(- \*\*Worktree\*\*:.*\n(?:(?:  - .+\n)|(?:[ \t]*\n))*)'
    wt_match = re.search(wt_pattern, content)
    if wt_match:
        end_pos = wt_match.end()
        verification_line = f"- **Verification Dir**: {verification_dir}\n"
        content = content[:end_pos] + verification_line + content[end_pos:]

    plan_file.write_text(content)

    # Commit the Plan change in the Plan's owning repo — a failed commit is
    # reported, never silently swallowed.
    location = resolve_plan_location(plan_file, workspace_root)
    result = commit_paths(
        str(location.repo_root),
        [location.repo_relative_path],
        "docs(plan): verify-switch — update worktree metadata",
    )
    if not result:
        log_error("Failed to commit Plan metadata update after switch:")
        log_error(str(result))
        log_error(
            f"Plan 元数据已写入磁盘但未提交（仓库: {location.repo_root}）"
        )
        log_error(
            f"手动提交: git -C {location.repo_root} add "
            f"{location.repo_relative_path} && git -C {location.repo_root} "
            f'commit -m "docs(plan): verify-switch — update worktree metadata"'
        )
        return False

    return True


def _switch_standard(
    workspace_root: Path,
    wt_ctx,
    issue: str,
    plan_path: str,
) -> bool:
    """Switch project repo to feature branch for standard project.

    Steps:
    1. git fetch in project repo
    2. Check dirty on canonical path — warn, don't block
    3. Remove worktree FIRST
    4. git checkout <feature_branch>
    5. Update Plan metadata
    6. Print verification guidance

    Args:
        issue: Issue number or plan name (for guidance output)
        plan_path: Path to Plan file (for metadata update)
    Returns:
        True if switch succeeded
    """
    branch = wt_ctx.branch
    wt_path = str(_resolve_wt_path(wt_ctx.path, workspace_root))

    # Get repo_root from Plan metadata (Project Path)
    project = get_plan_field(plan_path, "Target Project")
    repo_path = resolve_project_path(plan_path, project, workspace_root)
    if not repo_path:
        log_error(f"Cannot resolve project path from Plan metadata")
        return False
    repo_root = str(repo_path)

    # 1. Fetch
    if not _git_fetch(repo_root):
        return False

    # 2. Check dirty on canonical path (warn, don't block)
    dirty_files = _check_dirty(repo_root)
    if dirty_files:
        log_warn(
            f"Canonical path has uncommitted changes "
            f"({len(dirty_files)} files)"
        )

    # 3. Remove worktree FIRST
    if not _remove_worktree(repo_root, wt_path):
        log_error("Failed to remove worktree for standard project switch")
        return False

    # 4. THEN checkout
    if not _git_checkout(branch, repo_root):
        return False

    # 5. Update Plan metadata (committed in the Plan's own repo)
    if not _update_plan_after_switch(plan_path, workspace_root, repo_root):
        return False

    # 6. Print verification guidance
    log_success(f"Switched project repo to '{branch}'")
    print()
    log_step("Verification steps:")
    print(f"  1. Run tests in the project repo")
    print(f"  2. After verification, return to the integration branch")
    print(f"  3. Run: flow.sh integrate {issue} --confirm")
    print(f"  4. Run: flow.sh verify {issue} --confirm")
    return True


def run_verify_switch(issue: str) -> bool:
    """Execute the unified verification switch workflow.

    Switches workspace to feature branch for verification:
    - Reads Plan Worktree metadata (WorktreeContext required)
    - Determines target directory based on project type
    - Executes git fetch + git checkout
    - Standard: cleans up worktree after switch

    Args:
        issue: Issue number or plan name

    Returns:
        True if successful
    """
    workspace_root = find_workspace_root()

    # Locate Plan
    plan_path = find_plan(issue, str(workspace_root))
    if not plan_path:
        log_error(f"Plan not found for issue {issue}")
        return False

    # Parse WorktreeContext — structured format required
    wt_ctx = parse_worktree_context(plan_path)

    if wt_ctx is None:
        log_error("Plan has no valid Worktree metadata (structured format required)")
        log_error("Please update the Plan to use structured Worktree format")
        return False

    branch = wt_ctx.branch

    if not branch:
        log_error("Worktree metadata has empty branch")
        return False

    return _switch_standard(workspace_root, wt_ctx, issue, str(plan_path))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Unified verification switch for dev-flow"
    )
    parser.add_argument("issue", help="Issue number or plan name")
    args = parser.parse_args()

    success = run_verify_switch(args.issue)
    exit(0 if success else 1)
