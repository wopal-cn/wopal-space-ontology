#!/usr/bin/env python3
# plan_commit.py - Shared Plan commit/push operations
#
# Extracted from approve.py for reuse by submit and approve commands.

from __future__ import annotations

import subprocess
from pathlib import Path

from lib.logging import log_step, log_success, log_error
from lib.git import (
    is_commit_in_remote,
    commit_paths,
    push_repo,
)
from lib.project import resolve_plan_location


def commit_and_push_plan(
    plan_path: str,
    issue_number: int | None,
    workspace_root: Path,
    message_prefix: str = "approve",
) -> bool:
    """Commit and push Plan file after status transition.

    Repo-aware: resolves Plan's repo via resolve_plan_location() and
    commits/pushes in that repo instead of always using workspace_root.

    Args:
        plan_path: Absolute path to Plan file
        issue_number: Issue number (for commit message), or None
        workspace_root: Workspace root path
        message_prefix: Prefix for commit message verb (e.g. "approve", "submit")

    Returns:
        True if commit/push succeeded, False if failed
    """
    # Resolve Plan's owning repo
    plan_location = resolve_plan_location(Path(plan_path), workspace_root)
    repo_root = str(plan_location.repo_root)
    plan_relative = plan_location.repo_relative_path

    # Check if plan file has uncommitted changes
    status_result = subprocess.run(
        ["git", "status", "--porcelain", "--", plan_relative],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )

    if status_result.stdout.strip():
        log_step("Auto-committing Plan file...")

        if issue_number:
            commit_msg = f"docs(plan): {message_prefix} plan #{issue_number}"
        else:
            plan_filename = Path(plan_path).stem
            commit_msg = f"docs(plan): {message_prefix} plan {plan_filename}"
            # Enforce commit-msg hook limits: description ≤ 60, total ≤ 72
            max_total = 72
            if len(commit_msg) > max_total:
                prefix = f"docs(plan): {message_prefix} plan "
                max_name = max_total - len(prefix)
                commit_msg = prefix + plan_filename[:max_name]

        if not commit_paths(repo_root, [plan_relative], commit_msg):
            log_error("Auto-commit failed. Please commit manually")
            return False

        log_success(f"Plan file committed: {commit_msg}")

    # Push if not already in remote
    current_branch = plan_location.branch

    if not is_commit_in_remote(repo_root, "origin", current_branch):
        log_step(f"Auto-pushing Plan file to origin/{current_branch}...")
        if not push_repo(repo_root, current_branch):
            log_error(f"Auto-push failed. Please push manually: cd {repo_root} && git push")
            return False
        log_success("Plan file pushed successfully")

    return True
