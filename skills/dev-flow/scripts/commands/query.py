#!/usr/bin/env python3
# query.py - Query commands for dev-flow
#
# Ported from scripts/cmd/query.sh
#
# Commands:
#   query status <issue> - Show Issue/Plan status
#   query list - List all active Plans

from __future__ import annotations

import argparse
import subprocess
import json
import os
import re
from pathlib import Path

from plan import find_plan
from lib.logging import log_info, log_success, log_warn, log_error, log_step
from lib.workspace import find_workspace_root, detect_space_repo
from lib import project as _project_resolver


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
    import re
    
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


def extract_slug(plan_name: str) -> str:
    """
    Extract slug from plan name (last segment).
    
    With Issue: 42-fix-task-wait-bug -> task-wait-bug
    Without Issue: refactor-optimize-files -> optimize-files
    """
    # Remove issue-number prefix (if present)
    name = re.sub(r'^[0-9]+-', '', plan_name)
    # Remove type prefix
    name = re.sub(r'^(feature|enhance|fix|refactor|docs|chore|test)-', '', name)
    return name


# ============================================
# cmd_status: Show Issue/Plan status
# ============================================

def cmd_query_status(args: argparse.Namespace) -> int:
    """Show Issue and Plan status."""
    input_ref = args.target
    
    if not input_ref:
        log_error("Issue number or Plan name required")
        print("Usage: flow.sh status <issue-or-plan>")
        return 1
    
    # Smart lookup: find plan by issue number or plan name
    try:
        plan_file = find_plan(input_ref)
    except (FileNotFoundError, ValueError):
        log_error(f"No plan found for: {input_ref}")
        return 1
    
    plan_name = get_plan_name(plan_file)
    metadata = get_plan_metadata(plan_file)
    
    status = metadata.get('status', 'draft')
    prd = metadata.get('prd', '')
    project = metadata.get('project', '')
    created = metadata.get('created', '')
    plan_issue_str = metadata.get('issue', '')
    
    # Extract issue number from plan metadata (e.g., "#129" -> 129)
    plan_issue_num = None
    if plan_issue_str:
        m = re.search(r'#(\d+)', plan_issue_str)
        if m:
            plan_issue_num = int(m.group(1))
    
    print("")
    
    # If plan has an issue, fetch and display issue info
    if plan_issue_num:
        try:
            repo = detect_space_repo(find_workspace_root())
            log_step(f"Fetching Issue #{plan_issue_num} info...")
            issue_info = get_issue_info(str(plan_issue_num), repo)
            
            title = issue_info.get('title', '')
            state = issue_info.get('state', '')
            labels = [l['name'] for l in issue_info.get('labels', [])]
            
            print(f"Issue #{plan_issue_num}")
            print(f"  Title: {title}")
            print(f"  State: {state}")
            print(f"  Labels: {' '.join(labels)}")
            print("")
        except RuntimeError:
            log_warn(f"Issue #{plan_issue_num} info not available via gh CLI")
            print("")
    
    # Always show plan info
    print(f"Plan: {plan_name}")
    print(f"  File: {plan_file}")
    print(f"  Status: {status}")
    print(f"  PRD: {prd or '<none>'}")
    print(f"  Created: {created}")
    
    # Check worktree status (only for plans with issue)
    if plan_issue_num:
        slug = extract_slug(plan_name)
        branch = f"issue-{plan_issue_num}-{slug}"
        worktree_path = ""
        
        if project:
            workspace_root = find_workspace_root()
            worktree_path = str(workspace_root / ".worktrees" / f"{project}-{branch}")
        
        if worktree_path and os.path.isdir(worktree_path):
            print("")
            print(f"Worktree: {worktree_path}")
            try:
                result = subprocess.run(
                    ["git", "branch", "--show-current"],
                    cwd=worktree_path,
                    capture_output=True,
                    text=True,
                )
                wt_branch = result.stdout.strip() or "detached"
                print(f"  Branch: {wt_branch}")
            except Exception:
                print("  Branch: (unknown)")
    
    print("")
    print("State Machine (4-state): planning -> executing -> verifying -> done")
    print(f"               Current: {status}")
    
    return 0


# ============================================
# cmd_list: List active Plans
# ============================================

def _scan_local_plans(workspace_root: str) -> list[dict]:
    """
    Scan local Plan files (excluding done/ directories).

    Uses lib.project._search_dirs() to discover plan directories
    across new paths and DEPRECATED legacy read-only fallback.

    Returns list of dicts: {name, project, status, has_issue, issue_number}
    """
    results = []
    ws = Path(workspace_root)

    # Use canonical search dirs from lib.project
    search_dirs = _project_resolver._search_dirs(ws)

    for plans_dir in search_dirs:
        # Skip done/ subdirectories for active plan listing
        if plans_dir.name == "done":
            continue

        # Derive project name from path
        # New paths: projects/<name>/docs/plans → <name>
        # Ontology: .wopal/docs/plans → "wopal-space-ontology"
        # DEPRECATED: docs/projects/<name>/plans → <name>
        # DEPRECATED: docs/projects/plans → "plans"
        parts = plans_dir.relative_to(ws).parts
        if parts[0] == "projects" and len(parts) >= 3:
            project_name = parts[1]
        elif parts[0] == ".wopal":
            project_name = "wopal-space-ontology"
        elif parts[0] == "docs" and parts[1] == "projects":
            # DEPRECATED: legacy read-only compatibility
            if len(parts) >= 4:
                project_name = parts[2]
            else:
                project_name = "plans"
        else:
            project_name = "unknown"

        for f in sorted(plans_dir.glob("*.md")):
            # Skip files inside done/ subdirectory
            if f.parent.name == "done":
                continue

            plan_name = f.stem
            metadata = get_plan_metadata(str(f))
            status = metadata.get('status', 'draft')
            issue_str = metadata.get('issue', '')

            # Extract issue number
            issue_number = None
            has_issue = False
            if issue_str:
                m = re.search(r'#(\d+)', issue_str)
                if m:
                    issue_number = int(m.group(1))
                    has_issue = True

            results.append({
                'name': plan_name,
                'project': project_name,
                'status': status,
                'has_issue': has_issue,
                'issue_number': issue_number,
            })

    return results


def cmd_query_list(args: argparse.Namespace) -> int:
    """List all active Plans from GitHub Issues and local Plan files."""
    print("Active Plans")
    print("============")
    print("")
    
    workspace_root = find_workspace_root()
    
    # 1. Scan local Plan files
    local_plans = _scan_local_plans(str(workspace_root))
    
    # 2. Fetch active Issues from GitHub
    issue_numbers = set()
    issues_by_number = {}
    
    try:
        repo = detect_space_repo(find_workspace_root())
        result = subprocess.run(
            ["gh", "issue", "list", "--repo", repo, "--state", "open",
             "--search", "label:status/planning OR label:status/in-progress OR label:status/verifying",
             "--json", "number,title,labels",
             "--jq", r'.[] | "\(.number)|\(.title)|\(.labels | map(.name) | join(","))"'],
            capture_output=True,
            text=True,
        )
        
        issues_output = result.stdout.strip()
        if issues_output:
            for line in issues_output.split('\n'):
                if not line:
                    continue
                parts = line.split('|')
                if len(parts) < 3:
                    continue
                number, title, labels_str = parts[0], parts[1], parts[2]
                labels = labels_str.split(',') if labels_str else []
                
                status_label = "unknown"
                for label in labels:
                    label = label.strip()
                    if label == "status/planning":
                        status_label = "planning"
                    elif label == "status/in-progress":
                        status_label = "executing"
                    elif label == "status/verifying":
                        status_label = "verifying"
                
                issue_numbers.add(int(number))
                issues_by_number[int(number)] = {
                    'title': title,
                    'status': status_label,
                }
    except RuntimeError:
        pass
    
    # 3. Merge and display
    # Track which plans have been displayed via Issue lookup
    displayed_plan_names = set()
    count = 0
    
    # First, display Issue-linked plans from GitHub
    for issue_num, info in sorted(issues_by_number.items()):
        print(f"[{info['status']}] #{issue_num}: {info['title']}")
        count += 1
        
        # Find matching local plan to avoid duplicate display
        for lp in local_plans:
            if lp['has_issue'] and lp['issue_number'] == issue_num:
                displayed_plan_names.add(lp['name'])
                break
    
    # Then, display local plans without Issue (not already displayed)
    for lp in local_plans:
        if lp['name'] in displayed_plan_names:
            continue
        if lp['status'] in ('planning', 'executing', 'verifying'):
            print(f"[{lp['status']}] {lp['name']} (no issue)")
            count += 1
    
    print("")
    print(f"Total: {count} active item(s)")
    
    return 0
