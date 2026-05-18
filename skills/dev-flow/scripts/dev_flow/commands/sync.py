#!/usr/bin/env python3
# sync.py - Sync commands for dev-flow
#
# Ported from scripts/cmd/sync.sh and lib/plan-sync.sh
#
# Commands:
#   sync <issue> - Sync Plan to Issue (body + labels)
#   sync <issue> --body-only - Only update Issue body
#   sync <issue> --labels-only - Only update labels

from __future__ import annotations

import argparse
import subprocess
import sys
import json
import os
import re
from pathlib import Path

from dev_flow.domain.plan.find import find_plan_by_issue
from dev_flow.domain.issue.sync import (
    sync_status_label_group,
    sync_type_label_group,
    sync_project_label_group,
    ensure_label_exists,
    plan_status_to_issue_label,
    plan_project_to_issue_label,
)
from dev_flow.domain.labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
    ValidationError,
)
from dev_flow.domain.plan.body import build_issue_body_from_plan as _build_issue_body
from dev_flow.core.logging import log_info, log_success, log_warn, log_error
from dev_flow.core.workspace import find_workspace_root, detect_space_repo


# ============================================
# GitHub CLI Helpers
# ============================================


def get_issue_info(issue_number: str, repo: str) -> dict:
    """Get issue info as JSON dict."""
    result = subprocess.run(
        ["gh", "issue", "view", issue_number, "--repo", repo,
         "--json", "title,body,number,state,labels"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to get issue #{issue_number}")
        raise RuntimeError("gh issue view failed")
    
    return json.loads(result.stdout)


# ============================================
# Plan Metadata Helpers
# ============================================

def get_plan_metadata(plan_file: str) -> dict:
    """
    Extract metadata from Plan file.
    
    Returns dict with: status, prd, issue, created, mode, project, type
    """
    if not os.path.isfile(plan_file):
        return {}
    
    metadata = {}
    
    with open(plan_file, 'r') as f:
        content = f.read()
    
    # Extract metadata fields using simple regex
    # Status line: - **Status**: planning
    status_match = re.search(r'^\- \*\*Status\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['status'] = status_match.group(1).strip() if status_match else 'draft'
    
    # PRD line: - **PRD**: `path`
    prd_match = re.search(r'^\- \*\*PRD\*\*:\s*`(.+)`', content, re.MULTILINE)
    metadata['prd'] = prd_match.group(1).strip() if prd_match else ''
    
    # Issue line: - **Issue**: #123
    issue_match = re.search(r'^\- \*\*Issue\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['issue'] = issue_match.group(1).strip() if issue_match else ''
    
    # Created line: - **Created**: 2026-04-22
    created_match = re.search(r'^\- \*\*Created\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['created'] = created_match.group(1).strip() if created_match else ''
    
    # Mode line: - **Mode**: lite
    mode_match = re.search(r'^\- \*\*Mode\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['mode'] = mode_match.group(1).strip() if mode_match else 'lite'
    
    # Target Project line: - **Target Project**: ontology
    project_match = re.search(r'^\- \*\*Target Project\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['project'] = project_match.group(1).strip() if project_match else ''
    
    # Type line: - **Type**: feature
    type_match = re.search(r'^\- \*\*Type\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['type'] = type_match.group(1).strip().lower() if type_match else ''
    
    return metadata


def get_plan_name(plan_file: str) -> str:
    """Get plan name from file path."""
    return Path(plan_file).stem


def extract_primary_plan_issue(plan_file: str) -> str:
    """Extract first Issue number from Plan metadata."""
    metadata = get_plan_metadata(plan_file)
    issue_line = metadata.get('issue', '')
    
    # Pattern: #123, #456 -> extract first number
    match = re.search(r'#(\d+)', issue_line)
    return match.group(1) if match else ''


# ============================================
# Sync Operations
# ============================================

# ============================================
# Sync Operations
# ============================================

def sync_plan_to_issue(issue_number: str, plan_file: str, repo: str) -> int:
    """
    Sync approved plan to Issue body.
    
    This replaces the entire Issue body with normalized content from Plan.
    Preserves Agent Verification checkbox states.
    """
    if not os.path.isfile(plan_file):
        log_warn(f"Plan file not found: {plan_file}")
        return 1
    
    if not shutil_which("gh"):
        log_warn("gh CLI not available, skipping issue sync")
        return 0
    
    log_info(f"Syncing plan to Issue #{issue_number}...")
    
    plan_name = get_plan_name(plan_file)
    new_body = _build_issue_body(plan_file, plan_name, repo)
    
    # Update Issue body
    result = subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo, "--body", new_body],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_warn(f"Failed to update Issue #{issue_number}")
        return 1
    
    log_success(f"Issue #{issue_number} updated with plan content")
    return 0


def ensure_issue_labels(issue_number: str, plan_file: str, repo: str) -> int:
    """
    Ensure Issue has correct labels based on Plan metadata.
    
    This ensures status, type, and project labels are correct.
    """
    if not os.path.isfile(plan_file):
        log_warn(f"Plan file not found: {plan_file}")
        return 1
    
    if not shutil_which("gh"):
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


def shutil_which(cmd: str) -> bool:
    """Check if command exists."""
    return subprocess.run(["which", cmd], capture_output=True).returncode == 0


# ============================================
# find_plan: Smart lookup (Issue number OR Plan name)
# ============================================

def find_plan(input: str) -> str:
    """
    Find Plan by Issue number OR Plan name.
    
    - If numeric → find_plan_by_issue
    - If string → search all plan directories
    """
    if not input:
        log_error("Issue number or Plan name required")
        raise ValueError("input required")
    
    # Numeric input → Issue lookup
    if re.match(r'^[0-9]+$', input):
        return find_plan_by_issue(int(input))
    
    # String input → search all plan directories
    workspace_root = find_workspace_root()
    search_dir = Path(workspace_root) / "docs" / "products"
    
    if not search_dir.exists():
        log_error("No plan directory found")
        raise FileNotFoundError("No plan directory")
    
    # Search: docs/products/plans/ and docs/products/*/plans/
    matches = []
    
    # Global plans
    global_plans_dir = search_dir / "plans"
    if global_plans_dir.exists():
        for f in global_plans_dir.glob("*.md"):
            if f.stem == input or input in f.stem:
                matches.append(str(f))
    
    # Project plans (excluding done)
    for project_dir in search_dir.iterdir():
        if project_dir.is_dir() and project_dir.name != "plans":
            plans_dir = project_dir / "plans"
            if plans_dir.exists():
                for f in plans_dir.glob("*.md"):
                    if "done" not in str(f.parent) and (f.stem == input or input in f.stem):
                        matches.append(str(f))
    
    if not matches:
        log_error(f"No plan found matching: {input}")
        raise FileNotFoundError(f"No plan found: {input}")
    
    if len(matches) > 1:
        log_error(f"Multiple plans matched: {input}")
        for m in matches:
            print(f"  - {m}", file=sys.stderr)
        raise ValueError(f"Multiple plans: {input}")
    
    return matches[0]


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