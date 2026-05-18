#!/usr/bin/env python3
# plan.py - Plan command for dev-flow
#
# Ported from scripts/cmd/plan.sh
#
# Command:
#   plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]
#   plan --title "<title>" --project <name> --type <type> [--scope <scope>] [--prd <path>] [--deep] [--check]
#
# Flow (Issue mode):
#   1. Check if Plan already exists (find_plan_by_issue)
#   2. Get Issue info from GitHub
#   3. Extract title, project, type, scope from Issue
#   4. Generate plan name (make_plan_name)
#   5. Create plan file from template
#   6. Fill metadata (Issue, Type, Target Project, Created)
#   7. Output Plan file path
#
# Flow (no-issue mode):
#   1. Validate --title, --project, --type required
#   2. Extract scope from title pattern or use --scope
#   3. Generate plan name: <type>-<scope>-<slug>
#   4. Create plan file from template (no Issue metadata)
#   5. Output Plan file path
#
# --check mode:
#   1. Find Plan (by Issue or by name)
#   2. Call check_doc_plan validation
#   3. Output validation result

from __future__ import annotations

import argparse
import subprocess
import sys
import os
import json
import re
from pathlib import Path
from datetime import date

from dev_flow.domain.plan.find import find_plan, find_plan_by_issue, find_plan_by_name
from dev_flow.domain.plan.naming import make_plan_name, validate_plan_name, ValidationError
from dev_flow.domain.plan.metadata import get_plan_status
from dev_flow.domain.issue.title import extract_scope, extract_type
from dev_flow.domain.issue.sync import ensure_label_exists, sync_status_label_group
from dev_flow.domain.labels import normalize_plan_type
from dev_flow.domain.workflow import PLAN_STATES
from dev_flow.domain.validation import check_doc_plan
from dev_flow.core.logging import log_info, log_success, log_error, log_warn
from dev_flow.core.workspace import find_workspace_root, detect_space_repo


# ============================================
# Helpers
# ============================================


def _get_issue_info(issue_number: int, repo: str) -> dict:
    """Get Issue info from GitHub."""
    result = subprocess.run(
        ["gh", "issue", "view", str(issue_number), "--repo", repo,
         "--json", "title,body,number,state,labels"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to get issue #{issue_number}")
        raise RuntimeError("gh issue view failed")
    
    return json.loads(result.stdout)


def _extract_project_from_labels(issue_info: dict) -> str:
    """Extract project name from issue labels."""
    for label in issue_info.get("labels", []):
        name = label.get("name", "")
        if name.startswith("project/"):
            return name[8:]  # Remove "project/" prefix
    return ""


def _extract_project_metadata_from_body(issue_info: dict) -> tuple[str | None, str | None]:
    """Extract Project Type and Project Path from Issue body metadata section.
    
    Args:
        issue_info: Issue info dict from GitHub
        
    Returns:
        Tuple of (project_type, project_path) - both may be None if not present
    """
    body = issue_info.get("body", "")
    
    if not body:
        return None, None
    
    # Look for metadata fields in Issue body
    # Pattern: "- **Project Type**: <value>" or "- **Project Path**: <value>"
    project_type_match = re.search(r'^-\s*\*\*Project Type\*\*:\s*(.+)$', body, re.MULTILINE)
    project_path_match = re.search(r'^-\s*\*\*Project Path\*\*:\s*(.+)$', body, re.MULTILINE)
    
    project_type = project_type_match.group(1).strip() if project_type_match else None
    project_path = project_path_match.group(1).strip() if project_path_match else None
    
    return project_type, project_path


def _title_to_slug(title: str) -> str:
    """Convert Issue title to slug (lowercase, hyphen-separated)."""
    # Extract description part: type(scope): description
    match = re.match(r'^[a-z]+\([^)]+\):\s*(.*)$', title)
    if match:
        description = match.group(1)
    else:
        description = title
    
    # Normalize: lowercase, replace spaces/punctuation with hyphens
    slug = description.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)  # Remove special chars
    slug = re.sub(r'\s+', '-', slug)      # Replace spaces with hyphens
    slug = re.sub(r'-+', '-', slug)       # Collapse multiple hyphens
    slug = slug.strip('-')
    
    return slug


def _resolve_scope_from_title(title: str) -> str:
    """Extract scope from title pattern: type(scope): description."""
    return extract_scope(title) or ""


def _resolve_plan_dir(project: str, workspace_root: Path) -> Path:
    """Resolve Plan directory path."""
    if project:
        return workspace_root / "docs" / "products" / project / "plans"
    else:
        return workspace_root / "docs" / "products" / "plans"


def _print_existing_plan_info(plan_file: str, target_ref: str) -> None:
    """Print existing plan info and next action.
    
    Args:
        plan_file: Path to plan file
        target_ref: Issue number or plan name (used in next action hint)
    """
    current_status = get_plan_status(plan_file)
    
    print(f"Plan: {plan_file}")
    print(f"Status: {current_status}")
    
    status_to_next = {
        "planning": f"Next: flow.sh approve {target_ref}",
        "executing": f"Next: flow.sh complete {target_ref}",
        "verifying": f"Next: flow.sh verify {target_ref} --confirm",
        "done": f"Next: flow.sh archive {target_ref}",
    }
    
    next_action = status_to_next.get(current_status, "Next: continue from current plan state")
    print(next_action)


# ============================================
# Create Plan from Template
# ============================================

def create_plan_from_template(
    plan_name: str,
    plan_dir: Path,
    issue_number: int | None,
    plan_type: str,
    project: str,
    workspace_root: Path,
    prd_path: str | None = None,
    deep_mode: bool = False,
    project_path: str | None = None,
    project_type: str | None = None,
) -> Path:
    """Create Plan file from template.
    
    Args:
        plan_name: Plan name (without .md extension)
        plan_dir: Directory to create plan in
        issue_number: Issue number (None for no-issue mode)
        plan_type: Plan type (feature, fix, etc.)
        project: Target project name
        workspace_root: Workspace root path
        prd_path: Optional PRD file path
        deep_mode: Whether to enable deep mode for plan structure
        project_path: Optional project path (for ontology-worktree type)
        project_type: Optional project type (e.g., "ontology-worktree")
        
    Returns:
        Path to created plan file
    """
    plan_file = plan_dir / f"{plan_name}.md"
    
    if plan_file.exists():
        log_error(f"Plan already exists: {plan_file}")
        raise FileExistsError(f"Plan already exists: {plan_file}")
    
    # Ensure directory exists
    plan_dir.mkdir(parents=True, exist_ok=True)
    
    # Read template
    template_path = workspace_root / "agents" / "wopal" / "skills" / "dev-flow" / "templates" / "plan.md"
    
    # Template might be in skill directory relative to workspace
    if not template_path.exists():
        # Try alternate path
        template_path = workspace_root / ".agents" / "skills" / "dev-flow" / "templates" / "plan.md"
    
    if not template_path.exists():
        log_error(f"Plan template not found at {template_path}")
        raise FileNotFoundError("Plan template not found")
    
    template_content = template_path.read_text()
    
    # Build metadata lines
    if issue_number:
        issue_line = f"- **Issue**: #{issue_number}"
    else:
        issue_line = ""  # Empty for no-issue mode
    
    type_line = f"- **Type**: {plan_type}"
    project_line = f"- **Target Project**: {project}"
    
    # Project path and type lines (for ontology-worktree projects)
    if project_path:
        project_path_line = f"- **Project Path**: {project_path}"
    else:
        project_path_line = ""
    
    if project_type:
        project_type_line = f"- **Project Type**: {project_type}"
    else:
        project_type_line = ""
    
    created_date = date.today().strftime("%Y-%m-%d")
    
    # Replace placeholders
    content = template_content.replace("{plan_name}", plan_name)
    content = content.replace("{issue_line}", issue_line)
    content = content.replace("{type_line}", type_line)
    content = content.replace("{project_line}", project_line)
    content = content.replace("{project_path_line}", project_path_line)
    content = content.replace("{project_type_line}", project_type_line)
    content = content.replace("{date}", created_date)
    
    # Handle --deep and --prd placeholders if present in template
    if deep_mode and "{deep_flag}" in content:
        content = content.replace("{deep_flag}", "--deep")
    elif "{deep_flag}" in content:
        content = content.replace("{deep_flag}", "")
    
    if prd_path and "{prd_path}" in content:
        content = content.replace("{prd_path}", f"--prd {prd_path}")
    elif "{prd_path}" in content:
        content = content.replace("{prd_path}", "")
    
    # Remove empty lines in metadata section (when lines are empty)
    lines = content.split("\n")
    cleaned_lines = []
    prev_empty = False
    
    for line in lines:
        is_empty = line.strip() == ""
        # Skip consecutive empty lines
        if is_empty and prev_empty:
            continue
        cleaned_lines.append(line)
        prev_empty = is_empty
    
    content = "\n".join(cleaned_lines)
    
    # Write plan file
    plan_file.write_text(content)
    
    return plan_file


# ============================================
# plan command
# ============================================

def cmd_plan(args: argparse.Namespace) -> int:
    """Create a Plan from Issue or from title (no-issue mode).
    
    Modes:
    1. Issue mode: plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]
    2. No-issue mode: plan --title "<title>" --project <name> --type <type> [--scope <scope>] [--prd <path>] [--deep] [--check]
    3. Check mode: plan <issue> --check OR plan --title "..." --check
    
    Returns:
        0 on success, 1 on error
    """
    issue_number = None
    input_ref = args.target
    title = args.title
    project = args.project
    plan_type_arg = args.type
    scope_arg = args.scope
    prd_path = args.prd
    deep_mode = args.deep
    check_only = args.check
    
    workspace_root = find_workspace_root()
    repo = detect_space_repo(workspace_root)
    
    # Resolve input_ref: digits → issue_number, string → plan name for check mode
    if input_ref and re.match(r'^\d+$', input_ref):
        issue_number = int(input_ref)
    
    # Validate: either Issue number OR title required
    if not input_ref and not title:
        log_error("Either Issue number, plan name, or --title required")
        log_error("Usage: flow.sh plan <issue-or-plan> [--project <name>] [--prd <path>] [--deep] [--check]")
        log_error("   or: flow.sh plan --title \"<title>\" --project <name> --type <type> [--scope <scope>] [--deep] [--check]")
        return 1
    
    # No-issue mode: require title, project, and type
    if title:
        if not project:
            log_error("--project required when using --title")
            return 1
        if not plan_type_arg:
            log_error("--type required when using --title")
            log_error("Available types: feature, enhance, fix, perf, refactor, docs, chore, test")
            return 1
        # Validate type
        try:
            plan_type = normalize_plan_type(plan_type_arg)
        except ValidationError as e:
            log_error(str(e))
            log_error("Available types: feature, enhance, fix, perf, refactor, docs, chore, test")
            return 1
    else:
        plan_type = ""
    
    # Resolve scope for no-issue mode
    scope = scope_arg or ""
    if title and not scope:
        scope = _resolve_scope_from_title(title)
    
    # ========================================
    # --check mode: find plan and validate
    # ========================================
    if check_only:
        plan_file = None
        
        if issue_number:
            # Find by Issue
            try:
                plan_file = find_plan_by_issue(issue_number, str(workspace_root))
            except FileNotFoundError:
                pass
        elif input_ref:
            # Find by plan name
            try:
                plan_file = find_plan_by_name(input_ref, str(workspace_root))
            except FileNotFoundError:
                pass
        else:
            # No-issue: reconstruct plan name
            if not scope:
                log_error("Scope required for no-issue plans. Add --scope <name> or use title pattern: type(scope): description")
                return 1
            
            slug = _title_to_slug(title)
            slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
            plan_name = f"{plan_type}-{scope}-{slug}"
            plan_dir = _resolve_plan_dir(project, workspace_root)
            plan_file = str(plan_dir / f"{plan_name}.md")
        
        if not plan_file or not Path(plan_file).exists():
            log_error("No plan found")
            if issue_number:
                log_error(f"Create plan first: flow.sh plan {issue_number}")
            elif input_ref:
                log_error(f"Create plan first: flow.sh plan {input_ref}")
            else:
                log_error(f"Create plan first: flow.sh plan --title \"{title}\" --project {project} --type {plan_type} --scope {scope}")
            return 1
        
        # Validate plan
        try:
            check_doc_plan(plan_file)
            log_success("Plan passes validation")
            if issue_number:
                print(f"Next: flow.sh approve {issue_number}")
            elif input_ref:
                print(f"Next: flow.sh approve {input_ref}")
            else:
                # For no-issue, reconstruct plan name for hint
                slug = _title_to_slug(title)
                slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
                plan_name = f"{plan_type}-{scope}-{slug}"
                print(f"Next: flow.sh approve {plan_name}")
            return 0
        except ValidationError as e:
            log_error("Plan has issues. Fix and re-run with --check")
            print(str(e))
            return 1
    
    # ========================================
    # Issue mode: check existing plan
    # ========================================
    if issue_number:
        try:
            plan_file = find_plan_by_issue(issue_number, str(workspace_root))
            _print_existing_plan_info(plan_file, str(issue_number))
            return 0
        except FileNotFoundError:
            # No existing plan, proceed to create
            pass
    
    # ========================================
    # No-issue mode: check existing plan by plan-name
    # ========================================
    if input_ref and not issue_number:
        # Plan-name lookup
        try:
            plan_file = find_plan_by_name(input_ref, str(workspace_root))
            _print_existing_plan_info(str(plan_file), input_ref)
            return 0
        except FileNotFoundError:
            # No existing plan, proceed to create
            pass
    
    # ========================================
    # No-issue mode: check existing plan
    # ========================================
    if title and scope:
        slug = _title_to_slug(title)
        slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
        plan_name = f"{plan_type}-{scope}-{slug}"
        plan_dir = _resolve_plan_dir(project, workspace_root)
        plan_file = plan_dir / f"{plan_name}.md"
        
        if plan_file.exists():
            _print_existing_plan_info(str(plan_file), plan_name)
            return 0
    
    # ========================================
    # Create new plan
    # ========================================
    issue_project_type = None
    issue_project_path = None
    
    if issue_number:
        # Issue mode: fetch info from Issue
        log_info(f"Fetching Issue #{issue_number}")
        issue_info = _get_issue_info(issue_number, repo)
        title = issue_info.get("title", "")
        
        if not title:
            log_error(f"Issue #{issue_number} has no title")
            return 1
        
        # Extract project from labels (or use --project override)
        if not project:
            project = _extract_project_from_labels(issue_info)
        
        if not project:
            log_error(f"Cannot determine project from Issue #{issue_number}")
            log_error("Please add a 'project/<name>' label to the Issue")
            return 1
        
        # Extract type and scope from title
        raw_type = extract_type(title)
        scope = extract_scope(title)
        
        if not scope:
            log_error(f"Issue title missing scope: {title}")
            log_error("Expected format: <type>(<scope>): <description>")
            return 1
        
        if not raw_type:
            log_error(f"Issue title missing type: {title}")
            return 1
        
        # Normalize type
        try:
            plan_type = normalize_plan_type(raw_type)
        except ValidationError as e:
            log_error(str(e))
            return 1
        
        # Generate plan name
        slug = _title_to_slug(title)
        slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
        
        try:
            plan_name = make_plan_name(issue_number, plan_type, scope, slug)
        except ValidationError as e:
            log_error(str(e))
            return 1
        
        # Extract Project Type and Project Path from Issue body
        issue_project_type, issue_project_path = _extract_project_metadata_from_body(issue_info)
    else:
        # No-issue mode: use provided title, project, type, scope
        if not scope:
            log_error("Scope required for no-issue plans. Add --scope <name> or use title pattern: type(scope): description")
            return 1
        
        slug = _title_to_slug(title)
        slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
        
        try:
            plan_name = make_plan_name(None, plan_type, scope, slug)
        except ValidationError as e:
            log_error(str(e))
            return 1
    
    log_info(f"Plan name: {plan_name}")
    
    # Resolve plan directory
    plan_dir = _resolve_plan_dir(project, workspace_root)
    
    # Create plan file from template
    try:
        plan_file = create_plan_from_template(
            plan_name,
            plan_dir,
            issue_number,
            plan_type,
            project,
            workspace_root,
            prd_path=prd_path,
            deep_mode=deep_mode,
            project_path=issue_project_path,
            project_type=issue_project_type,
        )
        log_success(f"Plan created: {plan_file}")
    except (FileExistsError, FileNotFoundError) as e:
        log_error(str(e))
        return 1
    
    # Issue mode: Update Issue labels
    if issue_number:
        ensure_label_exists("status/planning", repo)
        sync_status_label_group(issue_number, "status/planning", repo)
        
        # Output summary
        print(f"Plan: {plan_file}")
        print(f"Issue: #{issue_number} | Project: {project} | Status: planning")
        print(f"Next: flow.sh approve {issue_number}")
    else:
        # No-issue mode: Output summary
        print(f"Plan: {plan_file}")
        print(f"Project: {project} | Status: planning")
        print(f"Next: flow.sh approve {plan_name}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_plan_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register plan subcommand."""
    plan_parser = subparsers.add_parser(
        "plan",
        help="Create a Plan from Issue or from title (no-issue mode)",
        description="Create a Plan file and enter planning phase.\n\n"
        "Two modes:\n"
        "  Issue mode: plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]\n"
        "  No-issue mode: plan --title \"<title>\" --project <name> --type <type> [--scope <scope>]",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    plan_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name (optional in no-issue mode)"
    )
    plan_parser.add_argument(
        "--title",
        help="Plan title (required in no-issue mode, format: type(scope): description)"
    )
    plan_parser.add_argument(
        "--project",
        help="Target Project name (extracted from Issue labels in issue mode, required in no-issue mode)"
    )
    plan_parser.add_argument(
        "--type",
        help="Plan type: feature, enhance, fix, perf, refactor, docs, chore, test (required in no-issue mode)"
    )
    plan_parser.add_argument(
        "--scope",
        help="Scope identifier (extracted from title pattern in no-issue mode if omitted)"
    )
    plan_parser.add_argument(
        "--prd",
        help="PRD file path to reference in plan"
    )
    plan_parser.add_argument(
        "--deep",
        action="store_true",
        help="Enable deep mode for enhanced plan structure"
    )
    plan_parser.add_argument(
        "--check",
        action="store_true",
        help="Check existing plan validation instead of creating new plan"
    )