#!/usr/bin/env python3
# link.py - Plan link domain operations
#
# Provides:
#   - update_issue_plan_link: Update Issue Plan link to archived URL
#
# Ported from lib/plan-sync.sh update_issue_plan_link()

import os
import re
import subprocess
from pathlib import Path

from dev_flow.core.workspace import find_workspace_root


def _build_relative_path(archived_file: str, workspace_root: Path) -> str:
    """
    Build relative path from docs/.
    
    Args:
        archived_file: Absolute path to archived plan file
        workspace_root: Workspace root path
        
    Returns:
        Relative path like "projects/ontology/plans/done/20260422-plan.md"
    """
    archived_path = Path(archived_file)
    docs_root = workspace_root / 'docs'
    
    try:
        relative = archived_path.relative_to(docs_root)
        return str(relative)
    except ValueError:
        # Last resort: use filename directly
        return archived_path.name


def update_issue_plan_link(issue_number: int, plan_file: str, repo: str, workspace_root: str = None):
    """
    Update Issue Plan link after archive.
    
    This updates the Plan link in Related Resources table to the archived path.
    
    Args:
        issue_number: Issue number to update
        plan_file: Absolute path to archived plan file
        repo: Repository in owner/repo format (e.g., "sampx/wopal-space")
        workspace_root: Optional workspace root path (used for testing mock)
        
    The function:
        1. Gets current Issue body
        2. Extracts plan name from archived file
        3. Builds GitHub blob URL for archived path
        4. Updates Plan link in Related Resources table
        5. Updates Issue via gh CLI
    """
    workspace = Path(workspace_root) if workspace_root else find_workspace_root()
    
    if not os.path.isfile(plan_file):
        print(f"Warning: Archived plan file not found: {plan_file}")
        return
    
    # Extract plan name (remove .md extension and date prefix if present)
    plan_name = Path(plan_file).stem
    
    # Build relative path from docs/
    relative_path = _build_relative_path(plan_file, workspace)
    
    # Build GitHub blob URL
    blob_url = f"https://github.com/{repo}/blob/main/docs/{relative_path}"
    
    # Get current Issue body - check for test mock first
    state_dir = workspace / 'state'
    body_file = state_dir / 'body.md'
    
    if body_file.exists():
        # Test mock mode: read from file
        current_body = body_file.read_text()
    else:
        # Production mode: use gh CLI
        try:
            result = subprocess.run(
                ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'body', '--jq', '.body'],
                capture_output=True,
                text=True,
                check=True
            )
            current_body = result.stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("Warning: gh CLI not available, skipping Plan link update")
            return
    
    # Update Plan link in Related Resources table
    # Pattern: [plan-name](old-url-or-path)
    new_body = re.sub(
        rf'\[{re.escape(plan_name)}\]\([^)]*\)',
        f'[{plan_name}]({blob_url})',
        current_body
    )
    
    # If Plan link not found by name, try updating the whole row
    if new_body == current_body:
        # Pattern: | Plan | [any-name](any-url-or-path) |
        new_body = re.sub(
            r'(\| Plan \| \[)[^]]+\]\([^)]*\)',
            f'| Plan | [{plan_name}]({blob_url})',
            current_body
        )
    
    # Update Issue - check for test mock first
    edit_args_file = state_dir / 'edit-args.txt'
    
    if state_dir.exists():
        # Test mock mode: write args to file
        edit_args_file.write_text(f'issue edit {issue_number} --repo {repo} --body {new_body}\n')
    else:
        # Production mode: use gh CLI
        try:
            subprocess.run(
                ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', new_body],
                capture_output=True,
                check=True
            )
            print(f"Issue #{issue_number} Plan link updated to archived path")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"Warning: Failed to update Issue #{issue_number} Plan link")