#!/usr/bin/env python3
# find.py - Plan file search operations
#
# Provides:
#   - find_plan: Smart lookup by Issue number OR plan name
#   - find_plan_by_issue: Find plan file by issue number (including archived)
#   - find_plan_by_name: Find plan file by plan name (no-issue mode)
#   - _find_workspace_root: Locate workspace root (shared by all commands)

import os
import glob
import re
from pathlib import Path


def find_plan(input_ref: str, workspace_root: str | Path = None) -> str:
    """
    Smart plan lookup: find plan by Issue number OR plan name.
    
    This mirrors the Bash `find_plan` function behavior:
    - If input looks like an Issue number (digits), use find_plan_by_issue
    - Otherwise, use find_plan_by_name
    
    Args:
        input_ref: Issue number (e.g., "121") or plan name (e.g., "refactor-dev-flow-cleanup")
        workspace_root: Workspace root directory (optional, auto-detected if not provided)
        
    Returns:
        Path to plan file
        
    Raises:
        FileNotFoundError: If no matching plan found
    """
    if workspace_root is None:
        workspace_root = _find_workspace_root()
    
    workspace_root = str(workspace_root)
    
    # Check if input looks like an Issue number
    if re.match(r'^\d+$', input_ref):
        return find_plan_by_issue(int(input_ref), workspace_root)
    else:
        return find_plan_by_name(input_ref, workspace_root)


def find_plan_by_name(plan_name: str, workspace_root: str | Path = None) -> str:
    """
    Find plan file by plan name (no-issue mode).
    
    Search order:
    1. Active plans in docs/products/plans/ matching exact name
    2. Project-specific plans in docs/products/*/plans/ matching exact name
    3. Archived plans in docs/products/*/plans/done/ (YYYYMMDD-prefix)
    
    Args:
        plan_name: Plan name (without .md extension, e.g., "refactor-dev-flow-cleanup")
        workspace_root: Workspace root directory (optional, auto-detected if not provided)
        
    Returns:
        Path to plan file
        
    Raises:
        FileNotFoundError: If no matching plan found
    """
    if workspace_root is None:
        workspace_root = _find_workspace_root()
    
    workspace_root = str(workspace_root)
    
    # Search locations in order
    search_dirs = [
        # Space-level active plans
        os.path.join(workspace_root, "docs/products/plans"),
        # Project-level active plans
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans")) if os.path.isdir(d)],
        # Archived plans (done directories)
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans/done")) if os.path.isdir(d)],
    ]
    
    for search_dir in search_dirs:
        if not os.path.isdir(search_dir):
            continue
        
        # For archived directory, look for YYYYMMDD-<plan_name>.md
        if "done" in search_dir:
            # Archived files have date prefix: 20260422-<plan_name>.md
            archived_pattern = os.path.join(search_dir, f"*-{plan_name}.md")
            matches = glob.glob(archived_pattern)
        else:
            # Active files: exact name match
            active_pattern = os.path.join(search_dir, f"{plan_name}.md")
            matches = glob.glob(active_pattern)
        
        if matches:
            # Return first match (there should only be one)
            return matches[0]
    
    raise FileNotFoundError(f"No plan found for: {plan_name}")


def find_plan_by_issue(issue_number: int, workspace_root: str | Path = None) -> str:
    """
    Find plan file by issue number, searching active and archived directories.
    
    Search order:
    1. Active plans in docs/products/plans/
    2. Project-specific plans in docs/products/*/plans/
    3. Archived plans in docs/products/*/plans/done/ (YYYYMMDD-prefix)
    
    Args:
        issue_number: Issue number to search for
        workspace_root: Workspace root directory (optional, auto-detected if not provided)
        
    Returns:
        Path to plan file
        
    Raises:
        FileNotFoundError: If no matching plan found
    """
    if workspace_root is None:
        workspace_root = _find_workspace_root()
    
    workspace_root = str(workspace_root)
    
    # Pattern for issue-prefixed plan: <issue_number>-<type>-<scope>-<slug>.md
    pattern_prefix = f"{issue_number}-"
    
    # Search locations in order
    search_dirs = [
        # Space-level active plans
        os.path.join(workspace_root, "docs/products/plans"),
        # Project-level active plans
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans")) if os.path.isdir(d)],
        # Archived plans (done directories)
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans/done")) if os.path.isdir(d)],
    ]
    
    for search_dir in search_dirs:
        if not os.path.isdir(search_dir):
            continue
        
        # For archived directory, look for YYYYMMDD-<issue>-pattern
        if "done" in search_dir:
            # Archived files have date prefix: 20260422-120-xxx.md
            archived_pattern = os.path.join(search_dir, f"*-{pattern_prefix}*.md")
            matches = glob.glob(archived_pattern)
        else:
            # Active files: 120-xxx.md
            active_pattern = os.path.join(search_dir, f"{pattern_prefix}*.md")
            matches = glob.glob(active_pattern)
        
        if matches:
            # Return first match (there should only be one)
            return matches[0]
    
    raise FileNotFoundError(f"No plan found for issue #{issue_number}")


def _find_workspace_root() -> Path:
    """Find workspace root by searching for .wopal or .git directory.
    
    Uses isdir() to ensure .git is a real directory (not a worktree file).
    This avoids false matches when running from inside .wopal/ (a git worktree).
    """
    current = os.getcwd()
    
    while current != "/":
        if os.path.isdir(os.path.join(current, ".wopal")):
            return Path(current)
        if os.path.isdir(os.path.join(current, ".git")):
            return Path(current)
        current = os.path.dirname(current)
    
    return Path(os.getcwd())