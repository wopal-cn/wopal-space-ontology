#!/usr/bin/env python3
# sync.py - Issue sync operations for dev-flow
#
# Provides:
#   - sync_status_label: Sync Issue status label based on plan status
#   - sync_plan_to_issue_body: Update Issue body with plan content
#   - ensure_issue_labels: Ensure Issue has correct labels from plan metadata
#
# Ported from lib/plan-sync.sh, lib/labels.sh

import subprocess
import re
import json
from pathlib import Path

from dev_flow.domain.labels import plan_type_to_issue_label
from dev_flow.domain.plan.metadata import get_plan_project, get_plan_type
from dev_flow.domain.plan.body import build_issue_body_from_plan


def _get_issue_labels(issue_number: int, repo: str) -> list:
    """Get current labels for an issue.
    
    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format
        
    Returns:
        List of label names
    """
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'labels', '--jq', '.labels[].name'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip().split('\n') if result.stdout.strip() else []
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


# Status label group (4-state model)
STATUS_LABELS = ["status/planning", "status/in-progress", "status/verifying", "status/done"]


def plan_status_to_issue_label(status: str) -> str:
    """Map plan status to Issue label (4-state model).
    
    Args:
        status: Plan status (planning, executing, verifying, done)
        
    Returns:
        Corresponding Issue label name
    """
    label_map = {
        "planning": "status/planning",
        "executing": "status/in-progress",
        "verifying": "status/verifying",
        "done": "status/done",
    }
    return label_map.get(status, "")


def sync_status_label(issue_number: int, status: str, repo: str) -> None:
    """Sync Issue status label based on plan status.
    
    Uses batch sync to ensure only one status label is active.
    
    Args:
        issue_number: Issue number
        status: Plan status (planning, executing, verifying)
        repo: Repository in owner/repo format (REQUIRED)
    """
    if not repo:
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    target_label = plan_status_to_issue_label(status)
    if not target_label:
        return
    
    # Get current labels
    current_labels = _get_issue_labels(issue_number, repo)
    
    # Build add/remove lists
    labels_to_remove = [l for l in STATUS_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    # Batch sync using single gh call
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def sync_plan_to_issue_body(issue_number: int, plan_file: str, repo: str, workspace_root: str = None) -> None:
    """Sync approved plan content to Issue body.
    
    Updates Issue body with plan content (Goal, Scope, AC, etc.)
    
    Args:
        issue_number: Issue number
        plan_file: Path to plan file
        repo: Repository in owner/repo format (REQUIRED)
        workspace_root: Workspace root path
    """
    if not repo:
        return
    
    if not Path(plan_file).exists():
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    # Build plan body content from plan file
    plan_name = Path(plan_file).stem
    body = build_issue_body_from_plan(plan_file, plan_name, repo, workspace_root)
    
    # Update Issue body
    subprocess.run(
        ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', body],
        capture_output=True,
    )


# Project label group — removed hardcoded PROJECT_LABELS.
# sync_project_label_group() now dynamically matches any project/* label.


def plan_project_to_issue_label(project: str) -> str:
    """Map project name to Issue label.
    
    Args:
        project: Project name
        
    Returns:
        Issue label name (project/<name>), or empty string if project is empty
    """
    if project:
        return f"project/{project}"
    return ""


def _get_project_labels_from_issue(issue_number: int | str, repo: str) -> list[str]:
    """Get all project/* labels currently on an issue."""
    result = subprocess.run(
        ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'labels', '-q', '.'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return []
    
    try:
        labels = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    
    return [l['name'] for l in labels if re.match(r'^project/', l.get('name', ''))]


def ensure_issue_labels(issue_number: int, plan_file: str, repo: str) -> None:
    """Ensure Issue has correct labels based on Plan metadata.
    
    Syncs status, type, and project labels.
    
    Args:
        issue_number: Issue number
        plan_file: Path to plan file
        repo: Repository in owner/repo format (REQUIRED)
    """
    if not repo:
        return
    
    if not Path(plan_file).exists():
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    # Get metadata from plan
    plan_type = get_plan_type(plan_file)
    plan_project = get_plan_project(plan_file)
    
    # Type label
    type_label = ""
    if plan_type:
        try:
            type_label = plan_type_to_issue_label(plan_type)
        except Exception:
            pass
    
    # Project label
    project_label = plan_project_to_issue_label(plan_project)
    
    # Sync labels
    if type_label:
        sync_type_label_group(issue_number, type_label, repo)
    
    if project_label:
        sync_project_label_group(issue_number, project_label, repo)


# Type label group
TYPE_LABELS = ["type/feature", "type/bug", "type/perf", "type/refactor", "type/docs", "type/test", "type/chore"]


def sync_type_label_group(issue_number: int, target_label: str, repo: str) -> None:
    """Sync type label group on Issue.
    
    Args:
        issue_number: Issue number
        target_label: Target type label
        repo: Repository
    """
    current_labels = _get_issue_labels(issue_number, repo)
    
    labels_to_remove = [l for l in TYPE_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    # Ensure label exists
    ensure_label_exists(target_label, repo)
    
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def sync_project_label_group(issue_number: int, target_label: str, repo: str) -> None:
    """Sync project label group on Issue.
    
    Dynamically removes any project/* labels and adds the target.
    No hardcoded project list — works with any project name.
    
    Args:
        issue_number: Issue number
        target_label: Target project label
        repo: Repository
    """
    current_labels = _get_issue_labels(issue_number, repo)
    
    # Remove any project/* labels except the target
    labels_to_remove = [l for l in current_labels if re.match(r'^project/', l) and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def sync_status_label_group(issue_number: int | str, target_label: str, repo: str) -> None:
    """Sync status label group on Issue - command layer adapter.
    
    Takes a target label directly (e.g. 'status/in-progress') and performs
    batch sync: removes other status/* labels, adds target.
    
    This is the unified interface for command layer callers that already
    know the desired label, as opposed to sync_status_label which takes
    a plan status string.
    
    Args:
        issue_number: Issue number (int or str)
        target_label: Target status label (e.g. 'status/in-progress')
        repo: Repository in owner/repo format
    """
    current_labels = _get_issue_labels(issue_number, repo)
    
    labels_to_remove = [l for l in STATUS_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def ensure_label_exists(label_name: str, repo: str) -> None:
    """Ensure a label exists in the repo.
    
    Args:
        label_name: Label name to ensure
        repo: Repository
    """
    # Get label properties
    color, description = _get_label_props(label_name)
    
    # Create label (ignore if already exists)
    subprocess.run(
        ['gh', 'label', 'create', label_name, '--repo', repo, '--color', color, '--description', description],
        capture_output=True,
    )


def _get_label_props(label_name: str) -> tuple:
    """Get label color and description.
    
    Args:
        label_name: Label name
        
    Returns:
        Tuple of (color, description)
    """
    # Default colors and descriptions for dev-flow labels
    props_map = {
        "status/planning": ("fbca04", "Planning"),
        "status/in-progress": ("1d76db", "Currently in progress"),
        "status/verifying": ("5319e7", "Awaiting user verification"),
        "status/done": ("0e8a16", "User validation passed"),
        "type/feature": ("1d76db", "New feature"),
        "type/bug": ("d73a4a", "Bug fix"),
        "type/perf": ("5319e7", "Performance optimization"),
        "type/refactor": ("cfd3d0", "Code refactoring"),
        "type/docs": ("0075ca", "Documentation"),
        "type/test": ("fbca04", "Testing"),
        "type/chore": ("f9d0c4", "Chore/maintenance"),
    }
    
    return props_map.get(label_name, ("dddddd", ""))