"""verify_switch command — worktree verification switch for dev-flow.

Handles the two-phase verification workflow for ontology-worktree projects:
  Phase 1: Remove issue worktree → switch .wopal/ to feature branch
  Phase 2: Switch back to main → merge → verify --confirm

Paths are derived from Plan metadata, never hardcoded in skills.
"""

import os
import subprocess
from pathlib import Path

from lib.workspace import find_workspace_root, get_ontology_main_repo
from plan import find_plan
from plan import get_plan_worktree, get_plan_field, set_plan_field
from lib.git import merge_branch, get_current_branch


def _remove_worktree(ontology_git_dir: Path, worktree_path: str) -> bool:
    """Remove a git worktree from the ontology repository.

    Args:
        ontology_git_dir: Path to main ontology repository
        worktree_path: Absolute path to the worktree to remove

    Returns:
        True if removal succeeded or worktree doesn't exist
    """
    target = Path(worktree_path)
    if not target.exists():
        return True

    result = subprocess.run(
        ["git", "worktree", "remove", str(target), "--force"],
        cwd=str(ontology_git_dir),
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


def run_verify_switch(issue: str, merge: bool = False) -> bool:
    """Execute the verification switch workflow.

    Args:
        issue: Issue number or plan name
        merge: If True, execute Phase 2 (merge back + verify).
               If False, execute Phase 1 (switch to feature for verification).

    Returns:
        True if successful
    """
    workspace_root = find_workspace_root()
    wopal_dir = workspace_root / ".wopal"

    # Locate Plan and extract worktree metadata
    plan_path = find_plan(issue, str(workspace_root))
    if not plan_path:
        print(f"ERROR: Plan not found for issue {issue}")
        return False

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
        # Phase 1: switch to feature branch for user verification
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

    else:
        # Phase 2: merge back to main after verification
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
