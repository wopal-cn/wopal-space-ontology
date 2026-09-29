#!/usr/bin/env python3
# sync.py - Sync commands for dev-flow
#
# Ported from scripts/cmd/sync.sh and lib/plan-sync.sh
#
# Commands:
#   sync <issue> - Sync Plan to Issue (body + labels)
#   sync <issue> --body-only - Only update Issue body
#   sync <issue> --labels-only - Only update labels
#
# Body sync delegates to issue.sync_plan_to_issue_body (single implementation).

from __future__ import annotations

import argparse
import shutil
import re
from pathlib import Path

from issue import (
    sync_status_label_group,
    sync_type_label_group,
    sync_project_label_group,
    plan_status_to_issue_label,
    plan_project_to_issue_label,
    sync_plan_to_issue_body,
)
from labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
    ValidationError,
)
from commands.plan import get_plan_metadata
from lib.logging import log_info, log_success, log_warn, log_error
from lib.workspace import find_workspace_root, detect_space_repo
from lib import project as _project_resolver


# ============================================
# Sync Operations
# ============================================

def extract_primary_plan_issue(plan_file: str) -> str:
    """Extract first Issue number from Plan metadata."""
    metadata = get_plan_metadata(plan_file)
    issue_line = metadata.get('issue', '')
    
    # Pattern: #123, #456 -> extract first number
    match = re.search(r'#(\d+)', issue_line)
    return match.group(1) if match else ''


def sync_plan_to_issue(issue_number: str, plan_file: str, repo: str) -> int:
    """Sync the Plan's mapped sections and link row to the Issue body.

    Adapter over issue.sync_plan_to_issue_body (the single implementation):
    three-section surgical sync + Plan row update, non-mapped content preserved.
    """
    if not Path(plan_file).is_file():
        log_warn(f"Plan file not found: {plan_file}")
        return 1

    if not shutil.which("gh"):
        log_warn("gh CLI not available, skipping issue sync")
        return 0

    log_info(f"Syncing Plan to Issue #{issue_number}...")

    workspace_root = str(find_workspace_root())
    if not sync_plan_to_issue_body(int(issue_number), plan_file, repo, workspace_root):
        log_warn(f"Failed to sync Issue #{issue_number}")
        return 1

    log_success(f"Issue #{issue_number} synced")
    return 0


def ensure_issue_labels(issue_number: str, plan_file: str, repo: str) -> int:
    """
    Ensure Issue has correct labels based on Plan metadata.
    
    This ensures status, type, and project labels are correct.
    """
    if not Path(plan_file).is_file():
        log_warn(f"Plan file not found: {plan_file}")
        return 1
    
    if not shutil.which("gh"):
        log_warn("gh CLI not available, skipping label sync")
        return 0
    
    # Extract metadata from Plan
    metadata = get_plan_metadata(plan_file)
    plan_type = metadata.get('type', '')
    plan_project = metadata.get('project', '')
    plan_status = metadata.get('status', 'draft')
    
    # Status label
    status_label = plan_status_to_issue_label(plan_status)
    
    # Type label
    type_label = ""
    if plan_type:
        try:
            normalized_type = normalize_plan_type(plan_type)
            type_label = plan_type_to_issue_label(normalized_type)
        except ValidationError:
            pass
    
    # Project label
    project_label = plan_project_to_issue_label(plan_project)
    
    # Sync label groups
    sync_status_label_group(issue_number, status_label, repo)
    sync_type_label_group(issue_number, type_label, repo)
    sync_project_label_group(issue_number, project_label, repo)
    
    return 0


# ============================================
# find_plan: Smart lookup (Issue number OR Plan name)
# ============================================

def find_plan(input: str) -> str:
    """
    Find Plan by Issue number OR Plan name.

    Delegates to lib.project.find_plan() for canonical path resolution.

    Returns plan file path as string.
    """
    if not input:
        log_error("Issue number or Plan name required")
        raise ValueError("input required")

    workspace_root = find_workspace_root()
    location = _project_resolver.find_plan(input, workspace_root)
    return str(location.path)


# ============================================
# cmd_sync: Sync Plan to Issue
# ============================================

def cmd_sync(args: argparse.Namespace) -> int:
    """Manually sync Plan content back to Issue without state transition."""
    input_arg = args.issue_or_plan
    body_only = args.body_only
    labels_only = args.labels_only
    
    if not input_arg:
        log_error("Issue number or Plan name required")
        print("Usage: flow.sh sync <issue-or-plan> [--body-only] [--labels-only]")
        return 1
    
    if body_only and labels_only:
        log_error("--body-only and --labels-only cannot be used together")
        return 1
    
    try:
        plan_file = find_plan(input_arg)
    except (FileNotFoundError, ValueError) as e:
        log_error(f"No plan found for: {input_arg}")
        return 1
    
    issue_number = extract_primary_plan_issue(plan_file)
    if not issue_number:
        log_error(f"Plan has no linked Issue: {plan_file}")
        return 1
    
    repo = detect_space_repo(find_workspace_root())
    
    # Sync body (unless labels_only)
    if not labels_only:
        rc = sync_plan_to_issue(issue_number, plan_file, repo)
        if rc != 0:
            return rc
    
    # Sync labels (unless body_only)
    if not body_only:
        rc = ensure_issue_labels(issue_number, plan_file, repo)
        if rc != 0:
            return rc
    
    print(f"Synced Issue: #{issue_number}")
    print(f"Plan: {plan_file}")
    
    if body_only:
        print("Mode: body only")
    elif labels_only:
        print("Mode: labels only")
    else:
        print("Mode: body + labels")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_sync_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register sync subcommand."""
    sync_parser = subparsers.add_parser("sync", help="Sync Plan to Issue")
    sync_parser.add_argument("issue_or_plan", nargs="?", help="Issue number or Plan name")
    sync_parser.add_argument("--body-only", action="store_true", help="Only update Issue body")
    sync_parser.add_argument("--labels-only", action="store_true", help="Only update labels")