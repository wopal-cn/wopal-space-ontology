"""verify_switch command — unified verification switch for dev-flow.

Switches workspace to feature branch for verification:
  - ontology-worktree: git checkout .wopal/ to feature branch
  - standard: git checkout project repo to feature branch + remove worktree

User confirmation is required unless --yes is passed.
"""

import subprocess
from pathlib import Path

from lib.workspace import find_workspace_root
from lib.worktree import parse_worktree_context
from lib.logging import log_info, log_success, log_error, log_warn, log_step
from plan import find_plan, get_plan_worktree, get_plan_field


def _confirm_switch(branch: str, target_desc: str) -> bool:
    """Prompt user to confirm switching to feature branch.

    Args:
        branch: Feature branch name
        target_desc: Description of the target directory being switched

    Returns:
        True if user confirms, False otherwise
    """
    try:
        answer = input(
            f"Switch {target_desc} to '{branch}' for verification? [y/N] "
        )
        return answer.strip().lower() == "y"
    except EOFError:
        # Non-interactive environment without --yes
        log_error("Non-interactive terminal. Use --yes to skip confirmation.")
        return False


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
    """Remove a git worktree from the given repository.

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
        log_warn(f"Failed to remove worktree at {target}: {result.stderr.strip()}")
        return False
    return True


def _resolve_wt_path(wt_path: Path | str, workspace_root: Path) -> Path:
    """Resolve worktree path: absolute if already absolute, else relative to workspace root."""
    raw = Path(str(wt_path))
    return raw if raw.is_absolute() else workspace_root / str(wt_path)


def _switch_ontology(
    workspace_root: Path,
    wt_ctx,
    issue: str,
) -> bool:
    """Switch .wopal/ to feature branch for ontology-worktree.

    Steps:
    1. git fetch in .wopal/
    2. git checkout <feature_branch> in .wopal/
    3. Print verification guidance

    Does NOT remove the worktree (ontology needs it).

    Args:
        issue: Issue number or plan name (for guidance output)
    Returns:
        True if switch succeeded
    """
    wopal_dir = workspace_root / ".wopal"
    repo_root = str(wt_ctx.repo_root)
    branch = wt_ctx.branch
    merge_target = getattr(wt_ctx, "merge_target", "space/main")

    # Fetch
    if not _git_fetch(str(wopal_dir)):
        return False

    # Checkout
    if not _git_checkout(branch, str(wopal_dir)):
        return False

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
) -> bool:
    """Switch project repo to feature branch for standard project.

    Steps:
    1. git fetch in project repo
    2. git checkout <feature_branch> in project repo
    3. git worktree remove <worktree_path>
    4. Print verification guidance

    Args:
        issue: Issue number or plan name (for guidance output)
    Returns:
        True if switch succeeded
    """
    repo_root = str(wt_ctx.repo_root)
    branch = wt_ctx.branch
    wt_path = str(_resolve_wt_path(wt_ctx.path, workspace_root))
    merge_target = getattr(wt_ctx, "merge_target", "main")

    # Fetch
    if not _git_fetch(repo_root):
        return False

    # Checkout
    if not _git_checkout(branch, repo_root):
        return False

    # Remove worktree
    _remove_worktree(repo_root, wt_path)

    log_success(f"Switched project repo to '{branch}'")
    print()
    log_step("Verification steps:")
    print(f"  1. Run tests in the project repo")
    print(f"  2. After verification, merge manually:")
    print(f"     cd {repo_root} && git checkout {merge_target} && git pull && git merge {branch}")
    print(f"  3. Run: flow.sh verify {issue} --confirm")
    return True


def _switch_legacy(
    workspace_root: Path,
    wt: dict,
    issue: str,
    project_type: str | None = None,
    target: str | None = None,
) -> bool:
    """Legacy fallback: switch workspace to feature branch.

    Used when WorktreeContext is unavailable. Target must be resolved
    by the caller (from Project Path / Target Project metadata).

    Args:
        issue: Issue number or plan name (for guidance output)
        project_type: Project type from Plan metadata (optional)
        target: Resolved target directory for git operations (required for standard)
    Returns:
        True if switch succeeded
    """
    branch = wt.get("branch", "")

    if not branch:
        log_error("Incomplete worktree metadata: missing branch")
        return False

    if target is None:
        log_error(
            "Legacy Plan: no target directory resolved. "
            "This should not happen — report as a bug."
        )
        return False

    # Fetch
    if not _git_fetch(target):
        return False

    # Checkout
    if not _git_checkout(branch, target):
        return False

    log_success(f"Switched to '{branch}'")
    print()
    log_step("Verification steps:")
    print(f"  1. Verify the feature branch: '{branch}'")
    print(f"  2. After verification, merge manually")
    print(f"  3. Run: flow.sh verify {issue} --confirm")
    return True


def run_verify_switch(issue: str, yes: bool = False) -> bool:
    """Execute the unified verification switch workflow.

    Switches workspace to feature branch for verification:
    - Reads Plan Worktree metadata (WorktreeContext preferred, legacy fallback)
    - Determines target directory based on project type
    - Prompts user for confirmation (skipped with --yes)
    - Executes git fetch + git checkout
    - Standard: cleans up worktree after switch

    Args:
        issue: Issue number or plan name
        yes: If True, skip user confirmation prompt

    Returns:
        True if successful
    """
    workspace_root = find_workspace_root()

    # Locate Plan
    plan_path = find_plan(issue, str(workspace_root))
    if not plan_path:
        log_error(f"Plan not found for issue {issue}")
        return False

    # Try WorktreeContext first (new path)
    wt_ctx = parse_worktree_context(plan_path)

    # Treat legacy pipe-format as legacy: Path('') resolves to '.' which is unusable
    if wt_ctx is not None and str(wt_ctx.repo_root) in ('', '.'):
        wt_ctx = None  # Force fallthrough to legacy handling

    if wt_ctx is not None:
        branch = wt_ctx.branch
        project_type = wt_ctx.project_type

        if project_type == "ontology-worktree":
            target_desc = ".wopal/ (ontology-worktree)"
        else:
            target_desc = f"{wt_ctx.repo_root} (standard project)"

        # User confirmation (skip with --yes)
        if not yes and not _confirm_switch(branch, target_desc):
            log_info("Switch cancelled by user.")
            return False

        if project_type == "ontology-worktree":
            return _switch_ontology(workspace_root, wt_ctx, issue)
        else:
            return _switch_standard(workspace_root, wt_ctx, issue)

    # Legacy fallback — WorktreeContext unavailable
    wt = get_plan_worktree(plan_path)
    if not wt:
        log_error("No worktree field in Plan metadata")
        return False

    branch = wt.get("branch", "")
    wt_path = wt.get("path", "")

    if not branch or not wt_path:
        log_error("Incomplete worktree metadata in Plan")
        return False

    # Read Project Type from Plan for legacy path
    legacy_project_type = get_plan_field(plan_path, "Project Type") or None

    # Resolve target directory from Plan metadata
    if legacy_project_type == "ontology-worktree":
        legacy_target = str(workspace_root / ".wopal")
        target_desc = ".wopal/ (ontology-worktree)"
    else:
        # standard or unknown — default to standard, resolve from Project Path / Target Project
        pp = get_plan_field(plan_path, "Project Path")
        tp = get_plan_field(plan_path, "Target Project")
        if pp:
            legacy_target = str(workspace_root / pp)
        elif tp:
            legacy_target = str(workspace_root / "projects" / tp)
        else:
            log_error(
                "Legacy Plan: cannot determine target directory. "
                "Missing Project Path and Target Project in Plan metadata."
            )
            return False
        target_desc = f"{legacy_target} (standard project)"

    # User confirmation (skip with --yes)
    if not yes and not _confirm_switch(branch, target_desc):
        log_info("Switch cancelled by user.")
        return False

    return _switch_legacy(
        workspace_root, wt, issue,
        project_type=legacy_project_type, target=legacy_target,
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Unified verification switch for dev-flow"
    )
    parser.add_argument("issue", help="Issue number or plan name")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    args = parser.parse_args()

    success = run_verify_switch(args.issue, yes=args.yes)
    exit(0 if success else 1)
