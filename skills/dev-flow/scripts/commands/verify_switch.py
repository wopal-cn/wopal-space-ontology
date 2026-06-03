"""verify_switch command — worktree verification switch for dev-flow.

Handles the two-phase verification workflow using WorktreeContext:
  Phase 1: Switch .wopal/ to feature branch (ontology) or inform ready (standard)
  Phase 2: Merge feature back + verify --confirm

Behavior is driven by WorktreeContext.verify_mode:
  - "switch-runtime" (ontology-worktree): Remove issue worktree → checkout feature
  - "direct" (standard): Code already in worktree, no switch needed

Falls back to legacy get_plan_worktree() when WorktreeContext is unavailable.
"""

import subprocess
from pathlib import Path

from lib.workspace import find_workspace_root
from lib.worktree import parse_worktree_context
from plan import find_plan
from plan import get_plan_worktree, get_plan_field, set_plan_field
from lib.git import merge_branch, get_current_branch


def _remove_worktree(repo_root: Path, worktree_path: str) -> bool:
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
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _run_verify(workspace_root: Path, issue: str) -> bool:
    """Run flow.sh verify <issue> --confirm."""
    flow_sh = workspace_root / ".wopal" / "skills" / "dev-flow" / "scripts" / "flow.sh"
    result = subprocess.run(
        ["bash", str(flow_sh), "verify", issue, "--confirm"],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr, flush=True)
    return result.returncode == 0


def _run_switch_runtime_phase1(
    workspace_root: Path,
    plan_path: str,
    wt_ctx,
) -> bool:
    """Phase 1 for ontology-worktree: remove worktree, checkout feature branch.

    Uses wt_ctx.repo_root for worktree removal and wt_ctx.base_branch for
    recording the main branch to return to in Phase 2.
    """
    wopal_dir = workspace_root / ".wopal"
    branch = wt_ctx.branch
    wt_path = wt_ctx.path

    # Resolve worktree path: use absolute if already absolute, otherwise relative to workspace root
    raw_path = Path(str(wt_path))
    resolved_wt_path = raw_path if raw_path.is_absolute() else workspace_root / str(wt_path)

    # Remove the issue worktree using repo_root (not get_ontology_main_repo)
    repo_root = Path(str(wt_ctx.repo_root))
    if not _remove_worktree(repo_root, str(resolved_wt_path)):
        print(f"WARNING: Failed to remove worktree at {resolved_wt_path}")

    # Record current branch as main (Phase 2 will return here)
    main_branch = get_current_branch(str(wopal_dir)) or wt_ctx.base_branch
    set_plan_field(plan_path, "MainBranch", main_branch)

    # Checkout .wopal/ to feature branch
    result = subprocess.run(
        ["git", "checkout", branch],
        cwd=str(wopal_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERROR: Failed to checkout {branch}: {result.stderr}")
        return False

    print(f"Switched .wopal/ from {main_branch} to {branch}")
    print("Restart ellamaka to verify the changes.")
    return True


def _run_switch_runtime_phase2(
    workspace_root: Path,
    plan_path: str,
    issue: str,
    wt_ctx,
) -> bool:
    """Phase 2 for ontology-worktree: checkout main, merge feature, verify."""
    wopal_dir = workspace_root / ".wopal"
    branch = wt_ctx.branch
    merge_target = wt_ctx.merge_target

    success, conflicts = merge_branch(
        str(wopal_dir),
        branch,
        target=merge_target,
        no_ff=False,
    )

    if not success:
        if conflicts:
            print(f"ERROR: Merge conflicts in: {', '.join(conflicts)}")
            print(f"Resolve conflicts manually, then re-run `flow.sh verify-switch {issue} --merge`")
        else:
            print("ERROR: Merge failed")
        return False

    print(f"Merged {branch} into {merge_target}")

    # Run verify --confirm
    if not _run_verify(workspace_root, issue):
        print("WARNING: verify --confirm failed, check Plan state")
        return False

    return True


def _run_direct_guide(issue: str, wt_ctx) -> bool:
    """Print guidance for standard project: verify-switch is ontology-only.

    Standard projects don't need verify-switch — the worktree is directly
    accessible and merging is a manual git operation.
    """
    branch = wt_ctx.branch
    print(f"verify-switch is for ontology-worktree only (standard project detected).")
    print(f"Feature branch: {branch}")
    print(f"Worktree: {wt_ctx.path}")
    print()
    print("To verify and complete this Plan:")
    print(f"  1. cd {wt_ctx.path} && pnpm test:run")
    print(f"  2. If satisfied, merge: cd <project> && git checkout main && git merge {branch}")
    print(f"  3. flow.sh verify {issue} --confirm")
    print(f"  4. flow.sh archive {issue}")
    return True


def _run_legacy_phase1(
    workspace_root: Path,
    plan_path: str,
    wt: dict,
) -> bool:
    """Phase 1 using legacy worktree metadata (backward compatibility)."""
    from lib.workspace import get_ontology_main_repo

    wopal_dir = workspace_root / ".wopal"
    branch = wt.get("branch", "")
    wt_path = wt.get("path", "")

    ontology_git_dir = get_ontology_main_repo(workspace_root)
    if ontology_git_dir:
        if not _remove_worktree(ontology_git_dir, wt_path):
            print(f"WARNING: Failed to remove worktree at {wt_path}")

    # Record current branch as main (Phase 2 will return here)
    main_branch = get_current_branch(str(wopal_dir)) or "space/main"
    set_plan_field(plan_path, "MainBranch", main_branch)

    # Checkout .wopal/ to feature branch
    result = subprocess.run(
        ["git", "checkout", branch],
        cwd=str(wopal_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERROR: Failed to checkout {branch}: {result.stderr}")
        return False

    print(f"Switched .wopal/ from {main_branch} to {branch}")
    print("Restart ellamaka to verify the changes.")
    return True


def _run_legacy_phase2(
    workspace_root: Path,
    plan_path: str,
    issue: str,
    wt: dict,
) -> bool:
    """Phase 2 using legacy worktree metadata (backward compatibility)."""
    wopal_dir = workspace_root / ".wopal"
    branch = wt.get("branch", "")

    main_branch = get_plan_field(plan_path, "MainBranch") or "space/main"

    success, conflicts = merge_branch(
        str(wopal_dir),
        branch,
        target=main_branch,
        no_ff=False,
    )

    if not success:
        if conflicts:
            print(f"ERROR: Merge conflicts in: {', '.join(conflicts)}")
            print(f"Resolve conflicts manually, then re-run `flow.sh verify-switch {issue} --merge`")
        else:
            print("ERROR: Merge failed")
        return False

    print(f"Merged {branch} into {main_branch}")

    # Run verify --confirm
    if not _run_verify(workspace_root, issue):
        print("WARNING: verify --confirm failed, check Plan state")
        return False

    return True


def run_verify_switch(issue: str, merge: bool = False) -> bool:
    """Execute the verification switch workflow.

    Uses WorktreeContext as the primary source of truth for branch paths and
    verify mode. Falls back to legacy get_plan_worktree() only when
    WorktreeContext is unavailable (backward compatibility).

    Args:
        issue: Issue number or plan name
        merge: If True, execute Phase 2 (merge back + verify).
               If False, execute Phase 1 (switch to feature for verification).

    Returns:
        True if successful
    """
    workspace_root = find_workspace_root()

    # Locate Plan
    plan_path = find_plan(issue, str(workspace_root))
    if not plan_path:
        print(f"ERROR: Plan not found for issue {issue}")
        return False

    # Try WorktreeContext first (new path)
    wt_ctx = parse_worktree_context(plan_path)

    if wt_ctx is not None:
        # WorktreeContext available — drive behavior from verify_mode
        if wt_ctx.verify_mode == "switch-runtime":
            if not merge:
                return _run_switch_runtime_phase1(workspace_root, plan_path, wt_ctx)
            else:
                return _run_switch_runtime_phase2(workspace_root, plan_path, issue, wt_ctx)
        elif wt_ctx.verify_mode == "direct":
            return _run_direct_guide(issue, wt_ctx)
        else:
            print(f"ERROR: Unknown verify_mode: {wt_ctx.verify_mode}")
            return False

    # Legacy fallback — WorktreeContext unavailable
    wt = get_plan_worktree(plan_path)
    if not wt:
        print("ERROR: No worktree field in Plan metadata")
        return False

    branch = wt.get("branch", "")
    wt_path = wt.get("path", "")

    if not branch or not wt_path:
        print("ERROR: Incomplete worktree metadata in Plan")
        return False

    if not merge:
        return _run_legacy_phase1(workspace_root, plan_path, wt)
    else:
        return _run_legacy_phase2(workspace_root, plan_path, issue, wt)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Worktree verification switch for dev-flow"
    )
    parser.add_argument("issue", help="Issue number or plan name")
    parser.add_argument("--merge", action="store_true",
                        help="Phase 2: merge feature into main and verify")
    args = parser.parse_args()

    success = run_verify_switch(args.issue, merge=args.merge)
    exit(0 if success else 1)
