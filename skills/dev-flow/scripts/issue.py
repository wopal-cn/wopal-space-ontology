#!/usr/bin/env python3
# issue.py - Issue domain operations for dev-flow
#
# Provides:
#   Title: extract_scope, extract_type, validate_issue_title
#   Body: build_structured_issue_body
#   Sync pipeline: extract_plan_section, extract_acceptance_criteria,
#                  build_synced_issue_body, replace_plan_row_in_body
#   Sync: sync_status_label, sync_plan_to_issue_body, ensure_issue_labels,
#         sync_status_label_group, sync_type_label_group, sync_project_label_group,
#         ensure_label_exists, plan_status_to_issue_label

import subprocess
import re
import json
from pathlib import Path

from lib.github import get_issue_labels
from lib.logging import log_warn
from labels import plan_type_to_issue_label, normalize_plan_type

def _get_plan_functions():
    """Lazy import plan module functions to break circular import."""
    import plan as _plan
    return _plan.get_plan_project, _plan.get_plan_type, _plan.build_plan_link_for_issue


# ============================================
# Title (from title.py)
# ============================================

class ValidationError(Exception):
    """Raised when validation fails"""
    pass


# Valid types for Issue title (canonical values, aligned with labels.py)
VALID_TYPES = ['feature', 'enhance', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore']


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

    Issue title is free-form. A loose type prefix is optional and used for
    label inference. Scope is no longer mandatory.

    Constraints:
        - if a type prefix is present, it must be a valid type
        - description <= 50 chars
        - total title <= 72 chars

    Args:
        title: Issue title string

    Raises:
        ValidationError: If title is invalid
    """
    # Extract type prefix (optional). If present, validate it.
    type_val = extract_type(title)
    if type_val:
        try:
            normalize_plan_type(type_val)
        except Exception:
            raise ValidationError(
                f"Invalid type: {type_val}\n"
                f"Valid types: feature, enhance, fix, perf, refactor, docs, test, chore"
            )

    # Extract description: strip optional type(scope): or type: prefix
    match = re.match(r'^[a-z]+(\([^)]+\))?:\s*(.*)$', title)
    if match:
        description = match.group(2).strip()
    else:
        description = title.strip()

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


# ============================================
# Plan -> Issue sync pipeline (extract -> render -> replace)
# ============================================

def _find_section_span(text: str, heading: str) -> tuple[int, int] | None:
    """Locate the body span of a top-level '## {heading}' section.

    Fence-aware: '## ' lines inside fenced code blocks are ignored. Returns
    (body_start, body_end) where body_start is the offset just past the heading
    line and body_end is the offset of the next top-level heading line (or the
    end of text). Returns None when the heading is absent.
    """
    pos = 0
    in_code = False
    body_start = None
    for line in text.splitlines(keepends=True):
        if line.strip().startswith('```'):
            in_code = not in_code
        elif not in_code:
            if body_start is None:
                if line.strip() == f"## {heading}":
                    body_start = pos + len(line)
            elif re.match(r'^##(?:\s|$)', line):
                return (body_start, pos)
        pos += len(line)
    if body_start is not None:
        return (body_start, len(text))
    return None


def _has_section(text: str, heading: str) -> bool:
    """Whether a top-level '## {heading}' section exists (fence-aware)."""
    return _find_section_span(text, heading) is not None


def extract_plan_section(plan_file: str, section: str, limit: int = 0) -> str:
    """Extract a top-level '## {section}' body from a Plan file.

    Fence-aware: fenced code content is preserved verbatim and '## ' lines
    inside fenced blocks do not terminate the section.
    """
    path = Path(plan_file)
    if not path.exists():
        return ""

    text = path.read_text()
    span = _find_section_span(text, section)
    if span is None:
        return ""

    content = text[span[0]:span[1]].strip()
    if limit > 0:
        content = "\n".join(content.splitlines()[:limit]).strip()
    return content


def extract_acceptance_criteria(plan_file: str) -> str:
    """Extract the Plan's Acceptance Criteria with numbered checkboxes converted.

    The '### Agent Verification' / '### User Validation' sub-sections are kept;
    numbered checkboxes (1. [ ] / 1. [x]) become GitHub-compatible - [ ] / - [x].
    """
    content = extract_plan_section(plan_file, "Acceptance Criteria")

    converted = re.sub(r'^(\s*)(\d+)\.\s+\[\s*\]', r'\1- [ ]', content, flags=re.MULTILINE)
    converted = re.sub(r'^(\s*)(\d+)\.\s+\[x\]', r'\1- [x]', converted, flags=re.MULTILINE)

    return converted


def _render_scope_section_body(in_scope: str, out_of_scope: str) -> str:
    """Render Plan In/Out scope content as the canonical '### In'/'### Out' body."""
    return f"### In\n\n{in_scope}\n\n### Out\n\n{out_of_scope}"


def _replace_section_body(body: str, heading: str, new_content: str) -> str:
    """Replace a section's body in place, keeping its heading line.

    Normalizes the spacing around the new content to exactly one blank line.
    Returns the body unchanged when the heading is absent.
    """
    span = _find_section_span(body, heading)
    if span is None:
        return body
    start, end = span
    suffix = "\n" if end >= len(body) else "\n\n"
    return body[:start] + f"\n{new_content}{suffix}" + body[end:]


def build_synced_issue_body(current_body: str, plan_file: str, plan_name: str,
                            repo: str, workspace_root: str = None) -> str:
    """Build the synced Issue body: three mapped sections + Plan link row.

    Replaces the bodies of Issue '## Goal', '## Scope' and
    '## Acceptance Criteria' with the Plan's mapped sections ('## Scope'
    renders as '### In' / '### Out'; legacy '## In Scope' / '## Out of Scope'
    headings are updated in place) and updates the '| Plan |' row. Every byte
    outside these ranges is preserved. Missing Plan sections or missing Issue
    targets are skipped with a warning; syncing is idempotent.
    """
    body = current_body

    if _has_section(body, "Goal"):
        goal = extract_plan_section(plan_file, "Goal")
        if goal:
            body = _replace_section_body(body, "Goal", goal)
        else:
            log_warn("Plan has no 'Goal' section; Issue '## Goal' not synced")
    else:
        log_warn("Issue body has no '## Goal' section; skipped")

    in_scope = extract_plan_section(plan_file, "In Scope")
    out_of_scope = extract_plan_section(plan_file, "Out of Scope")
    if _has_section(body, "Scope"):
        if in_scope and out_of_scope:
            body = _replace_section_body(
                body, "Scope", _render_scope_section_body(in_scope, out_of_scope))
        else:
            log_warn("Plan is missing 'In Scope'/'Out of Scope'; Issue '## Scope' not synced")
    else:
        scope_targets = (("In Scope", in_scope), ("Out of Scope", out_of_scope))
        legacy_found = any(_has_section(body, heading) for heading, _ in scope_targets)
        for heading, content in scope_targets:
            if not _has_section(body, heading):
                continue
            if content:
                body = _replace_section_body(body, heading, content)
            else:
                log_warn(f"Plan has no '{heading}' section; Issue '## {heading}' not synced")
        if not legacy_found:
            log_warn("Issue body has no '## Scope' (or legacy '## In Scope'/'## Out of Scope'); skipped")

    if _has_section(body, "Acceptance Criteria"):
        criteria = extract_acceptance_criteria(plan_file)
        if criteria:
            body = _replace_section_body(body, "Acceptance Criteria", criteria)
        else:
            log_warn("Plan has no 'Acceptance Criteria' section; Issue '## Acceptance Criteria' not synced")
    else:
        log_warn("Issue body has no '## Acceptance Criteria' section; skipped")

    _, _, _build_plan_link = _get_plan_functions()
    plan_row = _build_plan_link(plan_file, plan_name, repo, workspace_root)
    if plan_row:
        body = replace_plan_row_in_body(body, plan_row)

    return body


def sync_plan_to_issue_body(issue_number: int, plan_file: str, repo: str, workspace_root: str = None) -> bool:
    """Sync the three mapped sections and the Plan link row to the Issue body.

    The Issue's '## Goal', '## Scope' and '## Acceptance Criteria' bodies are
    replaced from the Plan and the '| Plan |' row is updated; every byte outside
    those ranges is preserved (surgical, idempotent). Missing sections are
    skipped with a warning; nothing is inserted for a missing target.

    Returns True when the sync succeeded (including the already-in-sync no-op),
    False when it could not be performed (missing plan, gh unavailable, Issue
    fetch or edit failure).
    """
    if not repo:
        return False

    if not Path(plan_file).exists():
        return False

    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

    current_body = _get_issue_body(issue_number, repo)
    if current_body is None:
        return False

    plan_name = Path(plan_file).stem
    new_body = build_synced_issue_body(current_body, plan_file, plan_name, repo, workspace_root)

    if new_body == current_body:
        return True

    result = subprocess.run(
        ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', new_body],
        capture_output=True,
    )
    return result.returncode == 0


def _get_issue_body(issue_number: int, repo: str) -> str | None:
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'body', '--jq', '.body'],
            capture_output=True, text=True, check=True,
        )
        # `gh --jq` prints one trailing newline after the string; strip exactly
        # that one so edits write back the body's real bytes (no +1 growth).
        body = result.stdout
        return body[:-1] if body.endswith("\n") else body
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def replace_plan_row_in_body(current_body: str, new_plan_row: str) -> str:
    """Replace the '| Plan |' row, scoped to the Related Resources section.

    The single row-replacement primitive shared by the sync pipeline
    (build_synced_issue_body) and the archive link refresh
    (plan.update_issue_plan_link). Falls back to appending the row — or the
    whole Related Resources section — when it is absent.
    """
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
