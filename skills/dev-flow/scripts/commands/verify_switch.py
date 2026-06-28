"""verify_switch command — unified verification switch for dev-flow.

Switches workspace to feature branch for verification:
  - ontology-worktree: git checkout .wopal/ to feature branch
  - standard: git checkout project repo to feature branch + remove worktree
"""

import re
import subprocess
from pathlib import Path

from lib.git import commit_paths, get_current_branch, get_dirty_lines, get_relative_path
from lib.workspace import find_workspace_root, get_ontology_main_repo
from lib.worktree import parse_worktree_context
from lib.logging import log_info, log_success, log_error, log_warn, log_step
from plan import find_plan, get_plan_field, get_plan_project_path, resolve_project_path



def _git_fetch(cwd: str) -> bool:
    """Run git fetch in the given directory.

    Args:
        cwd: Directory to run git fetch in

    Returns:
        True if fetch succeeded
    """
    result = subprocess.run(
        ["git", "fetch"],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"git fetch failed: {result.stderr.strip()}")
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
    result = subprocess.run(
        ["git", "checkout", branch],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"git checkout {branch} failed: {result.stderr.strip()}")
        return False
    return True


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

    result = subprocess.run(
        ["git", "worktree", "remove", str(target), "--force"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to remove worktree at {target}: {result.stderr.strip()}")
        return False

    # Prune stale worktree references
    subprocess.run(
        ["git", "worktree", "prune"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )

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


def _update_plan_after_switch(plan_path: str, repo_root: str) -> None:
    """Update Plan Worktree metadata after switching.

    - Replace path: <original> → path: (removed)
    - Add Verification Dir metadata field after Worktree block
    - Commit the Plan change

    Args:
        plan_path: Absolute path to the Plan file
        repo_root: Git repo root where Plan lives (for commit)
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
        verification_line = f"- **Verification Dir**: {repo_root}\n"
        content = content[:end_pos] + verification_line + content[end_pos:]

    plan_file.write_text(content)

    # Commit the Plan change
    plan_file_rel = get_relative_path(str(plan_file), repo_root)
    commit_paths(
        repo_root,
        [plan_file_rel],
        "docs(plan): verify-switch — update worktree metadata",
    )


def _switch_ontology(
    workspace_root: Path,
    wt_ctx,
    issue: str,
    plan_path: str,
) -> bool:
    """Switch .wopal/ to feature branch for ontology-worktree.

    Steps:
    1. Check dirty on .wopal/ — warn, don't block
    2. Remove worktree from main repo
    3. git fetch in .wopal/
    4. git checkout <feature_branch> in .wopal/
    5. Update Plan metadata
    6. Print verification guidance

    Args:
        issue: Issue number or plan name (for guidance output)
        plan_path: Path to Plan file (for metadata update)
    Returns:
        True if switch succeeded
    """
    wopal_dir = workspace_root / ".wopal"
    branch = wt_ctx.branch
    # Merge target is the current space layer branch (space/<name>), detected
    # at runtime before checkout — .wopal/ worktree currently sits on it.
    merge_target = get_current_branch(str(wopal_dir))
    wt_path = str(_resolve_wt_path(wt_ctx.path, workspace_root))

    # Get repo_root from ontology main repo for guidance message
    main_repo = get_ontology_main_repo(workspace_root)
    repo_root = str(main_repo) if main_repo else str(wopal_dir)

    # 1. Check dirty on .wopal/
    dirty_files = _check_dirty(str(wopal_dir))
    if dirty_files:
        log_warn(
            f"Canonical path has uncommitted changes "
            f"({len(dirty_files)} files)"
        )

    # 2. Remove worktree from main repo
    main_repo = get_ontology_main_repo(workspace_root)
    if main_repo:
        if not _remove_worktree(str(main_repo), wt_path):
            log_error("Failed to remove worktree for ontology-worktree switch")
            return False

    # 3. Fetch
    if not _git_fetch(str(wopal_dir)):
        return False

    # 4. Checkout
    if not _git_checkout(branch, str(wopal_dir)):
        return False

    # 5. Update Plan metadata
    _update_plan_after_switch(plan_path, str(wopal_dir))

    # 6. Print verification guidance
    log_success(f"Switched .wopal/ to '{branch}'")
    print()
    log_step("Verification steps:")
    print(f"  1. Restart ellamaka to verify ontology changes")
    print(f"  2. Verify the feature branch: '{branch}'")
    print(f"  3. After verification, merge manually:")
    print(f"     cd {repo_root} && git checkout {merge_target} && git pull && git merge {branch}")
    print(f"  4. Run: flow.sh verify {issue} --confirm")
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
    merge_target = "main"

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

    # 5. Update Plan metadata
    _update_plan_after_switch(plan_path, repo_root)

    # 6. Print verification guidance
    log_success(f"Switched project repo to '{branch}'")
    print()
    log_step("Verification steps:")
    print(f"  1. Run tests in the project repo")
    print(f"  2. After verification, merge manually:")
    print(f"     cd {repo_root} && git checkout {merge_target} && git pull && git merge {branch}")
    print(f"  3. Run: flow.sh verify {issue} --confirm")
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
    project_type = wt_ctx.project_type

    if not branch:
        log_error("Worktree metadata has empty branch")
        return False

    if project_type == "ontology-worktree":
        return _switch_ontology(workspace_root, wt_ctx, issue, str(plan_path))
    else:
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
