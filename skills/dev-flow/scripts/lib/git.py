"""Git operations wrapper for dev-flow.

Provides subprocess-based Git operations with clear error handling.
All functions work with an explicit repo_path to support multi-repo scenarios.
"""

import subprocess
from pathlib import Path


def is_repo_dirty(repo_path: str) -> bool:
    """Check if git repo has uncommitted changes.

    Args:
        repo_path: Path to git repository root

    Returns:
        True if repo has uncommitted changes (staged or unstaged)
        False if repo is clean or path is not a valid repo
    """
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    # If there's any output, repo is dirty
    return bool(result.stdout.strip())


def get_current_branch(repo_path: str) -> str:
    """Get current branch name.

    Args:
        repo_path: Path to git repository root

    Returns:
        Branch name, or empty string if not on a branch (detached HEAD)
        or path is not a valid repo
    """
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def get_remote_url(repo_path: str) -> str:
    """Get remote URL for origin.

    Args:
        repo_path: Path to git repository root

    Returns:
        Remote URL string, or empty string if no origin configured
    """
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def commit_all(repo_path: str, message: str) -> bool:
    """Commit all changes with given message.

    Args:
        repo_path: Path to git repository root
        message: Commit message

    Returns:
        True if commit succeeded (or nothing to commit)
        False if commit failed
    """
    # Stage all changes
    subprocess.run(
        ["git", "add", "-A"],
        cwd=repo_path,
        capture_output=True,
    )

    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    # Git returns 1 if nothing to commit, which is acceptable
    # Return True for success (0) or nothing to commit
    return result.returncode == 0 or "nothing to commit" in result.stdout


def push(repo_path: str) -> bool:
    """Push current branch to remote.

    Args:
        repo_path: Path to git repository root

    Returns:
        True if push succeeded (or already up to date)
        False if push failed
    """
    branch = get_current_branch(repo_path)
    if not branch:
        return False  # Can't push detached HEAD

    result = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


def is_git_repo(path: str) -> bool:
    """Check if path is inside a git repository.

    Args:
        path: Any path to check

    Returns:
        True if path is inside a git repo
    """
    result = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def get_repo_root(path: str) -> str:
    """Get repository root directory from any path inside it.

    Args:
        path: Any path inside a git repo

    Returns:
        Absolute path to repo root, or empty string if not in a repo
    """
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def get_common_git_dir(path: str) -> str:
    """Get the common git directory (shared across worktrees).

    For a main working tree this is .git/; for a worktree it resolves
    to the main repo's .git/ directory.  Comparing this value across
    two paths is a reliable way to test whether they belong to the
    same underlying repository.

    Args:
        path: Any path inside a git repo

    Returns:
        Absolute path to the common git directory, or empty string
    """
    result = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        cwd=path,
        capture_output=True,
        text=True,
    )
    raw = result.stdout.strip()
    if not raw:
        return ""
    # git rev-parse --git-common-dir returns a path relative to the repo working
    # directory.  Resolve it against cwd (the `path` argument) so it becomes
    # absolute regardless of the process CWD.
    common_dir = (Path(path) / raw).resolve()
    return str(common_dir)


def is_commit_in_remote(repo_path: str, remote: str = "origin", branch: str = "main") -> bool:
    """Check if HEAD commit is already pushed to remote branch.

    Args:
        repo_path: Path to git repository root
        remote: Remote name (default: origin)
        branch: Branch name (default: main)

    Returns:
        True if HEAD is ancestor of remote/branch (already pushed)
        False if HEAD is not pushed yet or cannot determine
    """
    # Fetch remote first (silent)
    subprocess.run(
        ["git", "fetch", remote, branch],
        cwd=repo_path,
        capture_output=True,
    )

    # Check if HEAD is ancestor of remote/branch
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "HEAD", f"{remote}/{branch}"],
        cwd=repo_path,
        capture_output=True,
    )

    # returncode 0 = HEAD is ancestor (already pushed)
    return result.returncode == 0


def is_branch_merged(branch: str, target: str, repo_path: str = ".") -> bool:
    """Check if branch has been merged into target.

    Returns True if all commits from branch are reachable from target.
    """
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", branch, target],
        cwd=repo_path,
        capture_output=True,
    )
    return result.returncode == 0


def get_relative_path(file_path: str, base_path: str) -> str:
    """Get relative path from base_path to file_path.

    Args:
        file_path: Absolute file path
        base_path: Base directory path

    Returns:
        Relative path string
    """
    file = Path(file_path).resolve()
    base = Path(base_path).resolve()

    try:
        return str(file.relative_to(base))
    except ValueError:
        # file_path is not relative to base_path
        return str(file)


def merge_branch(
    repo_path: str,
    branch: str,
    target: str = 'main',
    no_ff: bool = True,
) -> tuple[bool, list[str]]:
    """Merge branch into target branch.

    Args:
        repo_path: Path to git repository root
        branch: Source branch to merge
        target: Target branch to merge into (default: main)
        no_ff: Use --no-ff for merge commit (default: True)

    Returns:
        Tuple of (success, conflict_files).
        success: True if merge succeeded without conflicts.
        conflict_files: List of files with conflicts (empty if success).
    """
    # Ensure we are on target branch
    subprocess.run(
        ["git", "checkout", target],
        cwd=repo_path,
        capture_output=True,
    )

    # Build merge command
    cmd = ["git", "merge"]
    if no_ff:
        cmd.append("--no-ff")
    cmd.append(branch)

    result = subprocess.run(
        cmd,
        cwd=repo_path,
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        return (True, [])

    # Merge failed — check for conflicts
    diff_result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=U"],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    conflict_files = [
        f for f in diff_result.stdout.strip().split('\n') if f
    ]

    if conflict_files:
        # Abort the merge to leave repo in clean state
        subprocess.run(
            ["git", "merge", "--abort"],
            cwd=repo_path,
            capture_output=True,
        )
        return (False, conflict_files)

    # Non-conflict failure
    subprocess.run(
        ["git", "merge", "--abort"],
        cwd=repo_path,
        capture_output=True,
    )
    return (False, [])


def branch_exists(repo_path: str, branch: str) -> bool:
    """Check if a local branch exists.

    Args:
        repo_path: Path to git repository root
        branch: Branch name to check

    Returns:
        True if branch exists locally
    """
    result = subprocess.run(
        ["git", "branch", "--list", branch],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def delete_branch(repo_path: str, branch: str, force: bool = False) -> bool:
    """Delete a local branch.

    Args:
        repo_path: Path to git repository root
        branch: Branch name to delete
        force: Use -D instead of -d

    Returns:
        True if deletion succeeded
    """
    flag = "-D" if force else "-d"
    result = subprocess.run(
        ["git", "branch", flag, branch],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def push_branch(repo_path: str, branch: str = 'main') -> bool:
    """Push specified branch to origin.

    Args:
        repo_path: Path to git repository root
        branch: Branch name to push (default: main)

    Returns:
        True if push succeeded
    """
    result = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=repo_path,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def has_uncommitted_changes(repo_path: str) -> bool:
    """Check if repo has uncommitted changes. Alias for is_repo_dirty.

    Args:
        repo_path: Path to git repository root

    Returns:
        True if repo has uncommitted changes
    """
    return is_repo_dirty(repo_path)


def commit_paths(repo_root: str, paths: list[str], message: str) -> bool:
    """Stage and commit specific paths in a given repo.

    Only stages the listed paths (not git add -A), then commits.
    Returns True if commit succeeded or there was nothing to commit.

    Args:
        repo_root: Path to git repository root
        paths: List of repo-relative paths to stage and commit
        message: Commit message

    Returns:
        True if commit succeeded or nothing to commit
    """
    if not paths:
        return True

    # Stage specific paths
    add_result = subprocess.run(
        ["git", "add", *paths],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if add_result.returncode != 0:
        return False

    # Commit
    commit_result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )

    if commit_result.returncode == 0:
        return True

    # "nothing to commit" is acceptable
    if "nothing to commit" in commit_result.stdout:
        return True

    return False


def push_repo(repo_root: str, branch: str | None = None) -> bool:
    """Push a specific branch in a given repo.

    If branch is None, pushes the current branch.

    Args:
        repo_root: Path to git repository root
        branch: Branch name to push (None = current branch)

    Returns:
        True if push succeeded
    """
    if branch is None:
        branch = get_current_branch(repo_root)
        if not branch:
            return False

    result = subprocess.run(
        ["git", "push", "origin", branch],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0
