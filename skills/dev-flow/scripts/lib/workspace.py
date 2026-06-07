#!/usr/bin/env python3
# workspace.py - Workspace root and space repo detection for dev-flow
#
# Provides:
#   - find_workspace_root: Locate workspace root using .wopal/.git worktree signature
#   - detect_space_repo: Parse owner/repo from workspace root's git remote URL
#   - get_ontology_main_repo: Resolve ontology main repository from .wopal/.git file

import os
import re
from pathlib import Path

from lib.git import get_remote_url


def _traverse_up(start: Path) -> Path | None:
    """Walk up from start looking for .wopal/.git worktree file."""
    current = start
    while current != current.parent:
        wopal_git = current / ".wopal" / ".git"
        if wopal_git.exists() and wopal_git.is_file():
            try:
                if wopal_git.read_text().strip().startswith("gitdir:"):
                    return current
            except Exception:
                pass
        current = current.parent
    return None


def find_workspace_root(start: Path | None = None) -> Path:
    """Find workspace root by locating .wopal/.git worktree file.

    Uses the directory containing this script file as traversal start,
    which is deterministic regardless of caller's cwd. The script lives
    under .wopal/skills/dev-flow/scripts/lib/, so traversal will always
    find the workspace root in a single pass.

    Args:
        start: Override traversal start (used for testing only)

    Raises:
        RuntimeError: If workspace root cannot be found
    """
    try:
        script_start = Path(__file__).resolve().parent
    except NameError:
        script_start = Path.cwd()

    result = _traverse_up(start if start else script_start)
    if result:
        return result

    raise RuntimeError(
        f"Cannot find workspace root from {script_start}. "
        "Expected .wopal/.git worktree file at workspace root."
    )


def detect_space_repo(workspace_root: Path) -> str:
    """Detect space repository (owner/repo) from workspace root's origin URL.
    
    Uses git remote get-url origin and parses both HTTPS and SSH formats.
    
    Args:
        workspace_root: Path to workspace root directory
        
    Returns:
        Repository in owner/repo format (e.g., "sampx/wopal-space")
        
    Raises:
        RuntimeError: If URL cannot be parsed or remote not configured
    """
    url = get_remote_url(str(workspace_root))
    
    if not url:
        raise RuntimeError(f"No origin remote configured at {workspace_root}")
    
    # Parse HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
    https_match = re.match(r'https?://github\.com/([^/]+)/([^/]+?)(\.git)?$', url)
    if https_match:
        return f"{https_match.group(1)}/{https_match.group(2)}"
    
    # Parse SSH format: git@github.com:owner/repo.git or git@github.com:owner/repo
    ssh_match = re.match(r'git@github\.com:([^/]+)/([^/]+?)(\.git)?$', url)
    if ssh_match:
        return f"{ssh_match.group(1)}/{ssh_match.group(2)}"
    
    raise RuntimeError(f"Cannot parse GitHub URL: {url}. "
                       "Expected HTTPS (https://github.com/owner/repo) "
                       "or SSH (git@github.com:owner/repo) format.")


def get_ontology_main_repo(workspace_root: Path) -> Path | None:
    """Resolve ontology main repository path from .wopal/.git file.

    The .wopal/.git file is a worktree pointer with format:
        gitdir: /path/to/main/repo/.git/worktrees/-wopal

    This is the single implementation replacing the duplicated logic in
    domain/plan/project.py and commands/verify_switch.py.

    Args:
        workspace_root: Workspace root path

    Returns:
        Path to ontology main repository, or None if not resolvable
    """
    dot_git_path = workspace_root / ".wopal" / ".git"

    if not dot_git_path.exists() or not dot_git_path.is_file():
        return None

    try:
        content = dot_git_path.read_text().strip()
        # Format: "gitdir: /path/to/.git/worktrees/-wopal"
        if content.startswith("gitdir: "):
            gitdir_path = content[len("gitdir: "):].strip()
            # Extract main repo: remove /.git/worktrees/<name> suffix
            # gitdir: /Users/sam/.wopal/ontologies/wopal-space-ontology/.git/worktrees/-wopal
            # main repo: /Users/sam/.wopal/ontologies/wopal-space-ontology
            if "/.git/worktrees/" in gitdir_path:
                main_repo = gitdir_path.split("/.git/worktrees/")[0]
                return Path(main_repo)
    except Exception:
        return None

    return None
