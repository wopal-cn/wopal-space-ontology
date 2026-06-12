#!/usr/bin/env python3
# issue.py - Issue domain operations for dev-flow
#
# Merged from domain/issue/ (title.py, body.py, link.py, sync.py)
#
# Provides:
#   Title: extract_scope, extract_type, validate_issue_title, build_title
#   Body: build_structured_issue_body
#   Link: build_repo_blob_url
#   Sync: sync_status_label, sync_plan_to_issue_body, ensure_issue_labels,
#         sync_status_label_group, sync_type_label_group, sync_project_label_group,
#         ensure_label_exists, plan_status_to_issue_label

import subprocess
import re
import json
from pathlib import Path

from lib.github import get_issue_labels
from labels import plan_type_to_issue_label

# Lazy imports for plan module to avoid circular dependency
# plan.py imports build_repo_blob_url from this module
def _get_plan_functions():
    """Lazy import plan module functions to break circular import."""
    import plan as _plan
    return _plan.get_plan_project, _plan.get_plan_type, _plan.build_issue_body_from_plan


# ============================================
# Title (from title.py)
# ============================================

class ValidationError(Exception):
    """Raised when validation fails"""
    pass


# Valid types for Issue title
VALID_TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'enhance']


def extract_scope(title: str) -> str:
    """Extract scope from Issue title.
    
    Format: type(scope): description
    
    Args:
        title: Issue title string
        
    Returns:
        Scope string (e.g., "cli") or empty string if not found
    """
    match = re.match(r'^[a-z]+\(([^)]+)\):', title)
    if match:
        return match.group(1)
    return ""


def extract_type(title: str) -> str:
    """Extract type from Issue title.
    
    Format: type(scope): description or type: description
    
    Args:
        title: Issue title string
        
    Returns:
        Type string (e.g., "feat") or empty string if not found
    """
    match = re.match(r'^([a-z]+)(\([^)]+\))?:', title)
    if match:
        return match.group(1)
    return ""


def validate_issue_title(title: str) -> None:
    """Validate Issue title format and length.
    
    Format: <type>(<scope>): <description>
    
    Constraints:
        - type must be valid (feat/fix/perf/refactor/docs/test/chore/enhance)
        - scope is MANDATORY (must be present in parentheses)
        - description <= 50 chars
        - total title <= 72 chars
        
    Args:
        title: Issue title string
        
    Raises:
        ValidationError: If title is invalid
    """
    # Check format: type(scope): description (scope is now mandatory)
    if not re.match(r'^[a-z]+\([^)]+\):\s*.+$', title):
        raise ValidationError(
            "Invalid title format. Expected: <type>(<scope>): <description>\n"
            "Scope is mandatory - must be enclosed in parentheses\n"
            f"Example: feat(cli): add skills remove command\n"
            f"Your title: {title}"
        )
    
    # Extract type
    type_val = extract_type(title)
    
    # Validate type
    if type_val not in VALID_TYPES:
        raise ValidationError(
            f"Invalid type: {type_val}\n"
            f"Valid types: feat, fix, perf, refactor, docs, test, chore, enhance"
        )
    
    # Extract scope
    scope = extract_scope(title)
    
    # Scope is now mandatory
    if not scope:
        raise ValidationError(
            "Scope is mandatory but not found in title\n"
            "Expected format: <type>(<scope>): <description>"
        )
    
    # Extract description (after type(scope): ), strip whitespace like Bash sed
    match = re.match(r'^[a-z]+\([^)]+\):\s*(.*)$', title)
    if match:
        description = match.group(1).strip()
    else:
        description = ""
    
    # Check description is not empty
    if not description:
        raise ValidationError("Description cannot be empty")
    
    # Check description length (<= 50 chars)
    if len(description) > 50:
        raise ValidationError(
            f"Description too long: {len(description)} chars (max 50)\n"
            f"Description: {description}"
        )
    
    # Check description is ASCII (English only)
    if not description.isascii():
        raise ValidationError(
            f"Description must be English (ASCII characters only)\n"
            f"Per AGENTS.md Issue title convention: description should be English imperative sentence\n"
            f"Your description: {description}"
        )
    
    # Check total title length (<= 72 chars)
    if len(title) > 72:
        raise ValidationError(
            f"Title too long: {len(title)} chars (max 72)"
        )


def build_title(type_: str, scope: str, description: str) -> str:
    """Build Issue title from components.

    Args:
        type_: Issue type (e.g., "feat", "fix")
        scope: Scope string (e.g., "cli")
        description: Description string

    Returns:
        Formatted Issue title string
    """
    return f"{type_}({scope}): {description}"


# ============================================
# Body (from body.py)
# ============================================

def _render_section(heading: str, content: str, fallback: str = None) -> str:
    """Render a single issue section with consistent formatting."""
    if content:
        return f"## {heading}\n\n{content}\n"
    elif fallback:
        return f"## {heading}\n\n{fallback}\n"
    return ""


def _format_list(raw_items: str, prefix: str = "- ") -> str:
    """Format comma-separated items as markdown list."""
    if not raw_items:
        return ""
    
    items = [item.strip() for item in raw_items.split(',') if item.strip()]
    if not items:
        return ""
    
    return "\n".join(f"{prefix}{item}" for item in items)


def _render_related_resources_table(reference: str = None) -> str:
    """Build Related Resources table."""
    lines = [
        "## Related Resources",
        "",
        "| Resource | Link |",
        "|----------|------|"
    ]
    
    if reference:
        lines.append(f"| Research | {reference} |")
    
    lines.append("| Plan | _待关联_ |")
    
    return "\n".join(lines) + "\n"


def build_structured_issue_body(**kwargs) -> str:
    """Build structured Issue body with unified five-section layout.

    Section order:
        Goal -> Context -> Scope (In/Out) -> Acceptance Criteria -> Related Resources

    Args:
        type: Issue type (unused for rendering, kept for API compat)
        goal: One-line goal description
        context: Background context (research, decisions, references)
        scope: In-scope items, comma-separated
        out_of_scope: Out-of-scope items, comma-separated
        reference: Research document path

    Returns:
        Formatted Issue body markdown
    """
    goal = kwargs.get('goal', '')
    context = kwargs.get('context', '')
    scope = kwargs.get('scope', '')
    out_of_scope = kwargs.get('out_of_scope', '')
    reference = kwargs.get('reference', '')

    sections = []

    # Goal (always present with fallback)
    sections.append(_render_section("Goal", goal, "<一句话描述目标>"))

    # Context (always present)
    sections.append(_render_section("Context", context, "<!-- 背景、研究发现、决策依据、参考资料 —— agent 自由写入 -->"))

    # Scope: In / Out (always present)
    scope_lines = [
        "## Scope",
        "",
        "### In",
        "",
        _format_list(scope) or "- ",
        "",
        "### Out",
        "",
        _format_list(out_of_scope) or "- ",
    ]
    sections.append("\n".join(scope_lines) + "\n")

    # Acceptance Criteria (always present with fallback)
    sections.append(_render_section("Acceptance Criteria", "", "待 plan 阶段细化"))

    # Related Resources (always present)
    sections.append(_render_related_resources_table(reference))

    body = "\n".join(sections)

    return body


# ============================================
# Link (from link.py)
# ============================================

def build_repo_blob_url(repo: str, repo_path: str, branch: str = "main") -> str:
    """Build GitHub blob URL for a repository path.
    
    Args:
        repo: Repository in owner/repo format (e.g., "sampx/wopal-space")
        repo_path: Path within the repository
        branch: Branch name (default: "main")
        
    Returns:
        Full GitHub blob URL
    """
    return f"https://github.com/{repo}/blob/{branch}/{repo_path}"


# ============================================
# Sync (from sync.py)
# ============================================

# Status label group (4-state model)
STATUS_LABELS = ["status/planning", "status/in-progress", "status/verifying", "status/done"]


def plan_status_to_issue_label(status: str) -> str:
    """Map plan status to Issue label (4-state model)."""
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
    current_labels = get_issue_labels(issue_number, repo)
    
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
    """Sync Plan link row in Issue's Related Resources section.
    
    Only updates the | Plan | ... | row, preserving all other Issue body content.
    """
    if not repo:
        return
    
    if not Path(plan_file).exists():
        return
    
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    _, _, _build_issue_body = _get_plan_functions()
    plan_name = Path(plan_file).stem
    new_plan_row = _build_issue_body(plan_file, plan_name, repo, workspace_root)
    
    if not new_plan_row or "待关联" in new_plan_row:
        return
    
    current_body = _get_issue_body(issue_number, repo)
    if current_body is None:
        return
    
    new_body = _replace_plan_row_in_body(current_body, new_plan_row)
    if new_body == current_body:
        return
    
    subprocess.run(
        ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', new_body],
        capture_output=True,
    )


def _get_issue_body(issue_number: int, repo: str) -> str | None:
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'body', '--jq', '.body'],
            capture_output=True, text=True, check=True,
        )
        return result.stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _replace_plan_row_in_body(current_body: str, new_plan_row: str) -> str:
    plan_row_pattern = re.compile(r'\| Plan \| .+ \|')
    rr_match = re.search(r'^##\s+Related Resources\s*$', current_body, re.MULTILINE)
    if rr_match:
        rr_start = rr_match.start()
        next_section = re.search(r'^##\s+', current_body[rr_match.end():], re.MULTILINE)
        rr_end = rr_match.end() + next_section.start() if next_section else len(current_body)
        rr_section = current_body[rr_start:rr_end]
        if plan_row_pattern.search(rr_section):
            new_rr = plan_row_pattern.sub(new_plan_row, rr_section, count=1)
            return current_body[:rr_start] + new_rr + current_body[rr_end:]
        else:
            return current_body[:rr_end] + new_plan_row + "\n" + current_body[rr_end:]
    else:
        return current_body.rstrip('\n') + f"\n\n## Related Resources\n\n{new_plan_row}\n"


def plan_project_to_issue_label(project: str) -> str:
    """Map project name to Issue label."""
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
    _get_plan_project, _get_plan_type, _ = _get_plan_functions()
    plan_type = _get_plan_type(plan_file)
    plan_project = _get_plan_project(plan_file)
    
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
    """Sync type label group on Issue."""
    current_labels = get_issue_labels(issue_number, repo)
    
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
    """
    current_labels = get_issue_labels(issue_number, repo)
    
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
    
    Takes a target label directly and performs batch sync.
    """
    current_labels = get_issue_labels(issue_number, repo)
    
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
    """Ensure a label exists in the repo."""
    color, description = _get_label_props(label_name)
    
    subprocess.run(
        ['gh', 'label', 'create', label_name, '--repo', repo, '--color', color, '--description', description],
        capture_output=True,
    )


def _get_label_props(label_name: str) -> tuple:
    """Get label color and description."""
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
