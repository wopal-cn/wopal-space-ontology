#!/usr/bin/env python3
# issue.py - Issue create/update commands for dev-flow
#
# Ported from scripts/cmd/issue.sh
#
# Commands:
#   issue create --title "<title>" --project <name> [--type <type>] [options]
#   issue update <issue> [options]

from __future__ import annotations

import argparse
import subprocess
import sys
import re
import os
from pathlib import Path

from issue import (
    validate_issue_title,
    extract_type,
    ValidationError,
)
from issue import build_structured_issue_body
from issue import (
    ensure_label_exists,
    sync_type_label_group,
    sync_project_label_group,
)
from labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
)
from plan import (
    resolve_project_info,
    ProjectType,
)
from lib.logging import log_info, log_warn, log_success, log_error
from lib.workspace import find_workspace_root, detect_space_repo


# ============================================
# GitHub CLI Helpers
# ============================================


def ensure_flow_labels_exist(repo: str) -> None:
    """Ensure all dev-flow status labels exist."""
    for label in ["status/planning", "status/in-progress", "status/verifying", "status/done", "pr/opened"]:
        ensure_label_exists(label, repo)


def infer_issue_type_from_title(title: str) -> str | None:
    """Infer issue type from title prefix."""
    raw_type = extract_type(title)
    if not raw_type:
        return None
    try:
        return normalize_plan_type(raw_type)
    except ValidationError:
        return None


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
    
    import json
    return json.loads(result.stdout)


def extract_project_from_labels(issue_info: dict) -> str:
    """Extract project name from issue labels."""
    for label in issue_info.get("labels", []):
        name = label.get("name", "")
        if name.startswith("project/"):
            return name[8:]  # Remove "project/" prefix
    return ""


# ============================================
# Issue Body Update Helpers
# ============================================

def replace_issue_section(body: str, heading: str, content: str) -> str:
    """Replace content of a section in issue body."""
    section_marker = f"## {heading}"
    lines = body.split("\n")
    result_lines = []
    in_section = False
    replaced = False
    
    for line in lines:
        if line == section_marker:
            in_section = True
            result_lines.append(line)
            result_lines.append("")
            if content:
                result_lines.append(content)
            replaced = True
            continue
        
        if in_section and line.startswith("##") and not line.startswith("## " + heading):
            # End of section
            in_section = False
            result_lines.append(line)
            continue
        
        if in_section:
            # Skip old content
            continue
        
        result_lines.append(line)
    
    # If section not found and we have content, append it
    if not replaced and content:
        result_lines.append("")
        result_lines.append(section_marker)
        result_lines.append("")
        result_lines.append(content)
    
    return "\n".join(result_lines)


def format_list_items(raw_items: str) -> str:
    """Format comma-separated items as markdown list."""
    if not raw_items:
        return ""
    items = [item.strip() for item in raw_items.split(",") if item.strip()]
    return "\n".join(f"- {item}" for item in items)


def update_structured_issue_body(body: str, **kwargs) -> str:
    """Update structured issue body with new field values."""
    updated_body = body
    
    # Field to section mapping
    field_to_section = {
        "goal": "Goal",
        "background": "Background",
        "confirmed_bugs": "Confirmed Bugs",
        "content_model_defects": "Content Model Defects",
        "cleanup_scope": "Cleanup Scope",
        "key_findings": "Key Findings",
        "baseline": "Baseline",
        "target": "Target",
        "affected_components": "Affected Components",
        "refactor_strategy": "Refactor Strategy",
        "target_documents": "Target Documents",
        "audience": "Audience",
        "test_scope": "Test Scope",
        "test_strategy": "Test Strategy",
        "scope": "In Scope",
        "out_of_scope": "Out of Scope",
        "acceptance_criteria": "Acceptance Criteria",
    }
    
    for field, section in field_to_section.items():
        value = kwargs.get(field)
        if not value:
            continue
        
        # Format list fields
        if field in ["scope", "out_of_scope", "affected_components", "target_documents"]:
            content = format_list_items(value)
        else:
            content = value
        
        updated_body = replace_issue_section(updated_body, section, content)
    
    # Handle reference (Related Resources table)
    reference = kwargs.get("reference")
    if reference:
        # Upsert Research row in Related Resources table
        if "## Related Resources" in updated_body:
            # Replace Research row
            lines = updated_body.split("\n")
            result_lines = []
            in_resources = False
            
            for line in lines:
                if line == "## Related Resources":
                    in_resources = True
                    result_lines.append(line)
                    continue
                
                if in_resources and line.startswith("##") and not line.startswith("## Related Resources"):
                    in_resources = False
                    result_lines.append(line)
                    continue
                
                if in_resources and "| Research |" in line:
                    result_lines.append(f"| Research | {reference} |")
                    continue
                
                result_lines.append(line)
            
            updated_body = "\n".join(result_lines)
    
    return updated_body


# ============================================
# issue create command
# ============================================

def cmd_issue_create(args: argparse.Namespace) -> int:
    """Create structured GitHub Issue."""
    title = args.title
    project = args.project
    
    # Validate required args
    if not title:
        log_error("Missing --title")
        return 1
    if not project:
        log_error("Missing --project")
        return 1
    
    # Validate project name format
    if not re.match(r'^[a-z0-9-]+$', project):
        log_error(f"Invalid project name: {project}")
        log_error("Project name must be lowercase alphanumeric with hyphens")
        return 1
    
    # Validate title format
    try:
        validate_issue_title(title)
    except ValidationError as e:
        log_error(str(e))
        return 1
    
    # Determine type
    inferred_type = infer_issue_type_from_title(title)
    
    if args.type:
        try:
            plan_type = normalize_plan_type(args.type)
        except ValidationError as e:
            log_error(f"Invalid --type: {args.type}")
            return 1
        
        # Check type mismatch
        if inferred_type and plan_type != inferred_type:
            log_error(f"Type mismatch: title implies '{inferred_type}' but --type is '{plan_type}'")
            return 1
    else:
        if not inferred_type:
            log_error("Missing --type and cannot infer type from title")
            return 1
        plan_type = inferred_type
    
    # Get type label
    try:
        type_label = plan_type_to_issue_label(plan_type)
    except ValidationError as e:
        log_error(f"Unsupported type mapping: {plan_type}")
        return 1
    
    # Determine body content
    if getattr(args, 'body_file', None):
        body_file = args.body_file
        if not os.path.isfile(body_file):
            log_error(f"body-file not found: {body_file}")
            return 1
        with open(body_file, 'r') as f:
            body = f.read()
    elif getattr(args, 'body', None):
        body = args.body
    else:
        # Generate empty five-section skeleton
        body = build_structured_issue_body()
    
    # Inject project type metadata for ontology-worktree projects
    workspace_root = find_workspace_root()
    project_type, project_path = resolve_project_info(project, workspace_root)
    if project_type == ProjectType.ONTOLOGY_WORKTREE and project_path:
        injection = (
            f"- **Project Type**: {project_type.value}\n"
            f"- **Project Path**: {project_path}\n"
            "\n"
        )
        body = injection + body
    
    # Get repo and ensure labels
    repo = detect_space_repo(workspace_root)
    ensure_flow_labels_exist(repo)
    ensure_label_exists(type_label, repo)
    ensure_label_exists(f"project/{project}", repo)
    
    # Build gh args
    gh_args = [
        "gh", "issue", "create",
        "--repo", repo,
        "--title", title,
        "--body", body,
        "--label", "status/planning",
        "--label", type_label,
        "--label", f"project/{project}",
    ]
    
    # Run gh issue create
    result = subprocess.run(gh_args, capture_output=True, text=True)
    if result.returncode != 0:
        log_error("Failed to create Issue")
        log_error(result.stderr)
        return 1
    
    issue_url = result.stdout.strip()
    issue_number = re.search(r'/issues/(\d+)$', issue_url)
    if issue_number:
        num = issue_number.group(1)
        print(f"Issue #{num}: {issue_url}")
        print(f"Next: flow.sh plan {num}")
    else:
        print(issue_url)
    
    return 0


# ============================================
# issue update command
# ============================================

def cmd_issue_update(args: argparse.Namespace) -> int:
    """Update structured GitHub Issue fields."""
    print("[DEPRECATED] use issue write --body-file or --append instead", file=sys.stderr)
    issue_number = args.issue_number
    
    if not issue_number:
        log_error("Missing issue number")
        return 1
    
    repo = detect_space_repo(find_workspace_root())
    
    # Get current issue info
    issue_info = get_issue_info(issue_number, repo)
    current_body = issue_info.get("body", "")
    current_title = issue_info.get("title", "")
    
    # Determine next title
    next_title = args.title or current_title
    
    # Validate title
    try:
        validate_issue_title(next_title)
    except ValidationError as e:
        log_error(str(e))
        return 1
    
    # Determine next type
    if args.type:
        try:
            next_type = normalize_plan_type(args.type)
        except ValidationError as e:
            log_error(f"Invalid --type: {args.type}")
            return 1
    else:
        inferred = infer_issue_type_from_title(next_title)
        if not inferred:
            log_error("Cannot determine issue type for update")
            return 1
        next_type = inferred
    
    # Determine next project
    next_project = args.project
    if not next_project:
        next_project = extract_project_from_labels(issue_info)
    
    # Build update kwargs
    update_kwargs = {}
    if args.goal:
        update_kwargs["goal"] = args.goal
    if args.background:
        update_kwargs["background"] = args.background
    if args.confirmed_bugs:
        update_kwargs["confirmed_bugs"] = args.confirmed_bugs
    if args.content_model_defects:
        update_kwargs["content_model_defects"] = args.content_model_defects
    if args.cleanup_scope:
        update_kwargs["cleanup_scope"] = args.cleanup_scope
    if args.key_findings:
        update_kwargs["key_findings"] = args.key_findings
    if args.baseline:
        update_kwargs["baseline"] = args.baseline
    if args.target:
        update_kwargs["target"] = args.target
    if args.affected_components:
        update_kwargs["affected_components"] = args.affected_components
    if args.refactor_strategy:
        update_kwargs["refactor_strategy"] = args.refactor_strategy
    if args.target_documents:
        update_kwargs["target_documents"] = args.target_documents
    if args.audience:
        update_kwargs["audience"] = args.audience
    if args.test_scope:
        update_kwargs["test_scope"] = args.test_scope
    if args.test_strategy:
        update_kwargs["test_strategy"] = args.test_strategy
    if args.scope:
        update_kwargs["scope"] = args.scope
    if args.out_of_scope:
        update_kwargs["out_of_scope"] = args.out_of_scope
    if args.reference:
        update_kwargs["reference"] = args.reference
    if args.acceptance_criteria:
        update_kwargs["acceptance_criteria"] = args.acceptance_criteria
    
    # Update body
    updated_body = update_structured_issue_body(current_body, **update_kwargs)
    
    # Update title and body
    result = subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo,
         "--title", next_title, "--body", updated_body],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to update issue #{issue_number}")
        log_error(result.stderr)
        return 1
    
    # Sync type label
    type_label = plan_type_to_issue_label(next_type)
    sync_type_label_group(issue_number, type_label, repo)
    
    # Sync project label
    if next_project:
        project_label = f"project/{next_project}"
        sync_project_label_group(issue_number, project_label, repo)
    
    log_success(f"Issue #{issue_number} updated")
    return 0


# ============================================
# issue write command
# ============================================

def cmd_issue_write(args: argparse.Namespace) -> int:
    """Write to issue body (full replace or append)."""
    issue_number = args.issue_number
    if not issue_number:
        log_error("Missing issue number")
        return 1
    
    body_file = getattr(args, 'body_file', None) or getattr(args, 'append', None)
    if not body_file:
        log_error("Must specify --body-file or --append")
        return 1
    
    if not os.path.isfile(body_file):
        log_error(f"File not found: {body_file}")
        return 1
    
    file_content = Path(body_file).read_text()
    
    # Check for empty file
    if not file_content.strip():
        log_error("Source file is empty")
        return 1
    
    # Warning if file doesn't start with markdown-ish content
    first_line = file_content.strip().split('\n')[0] if file_content.strip() else ''
    if first_line and not first_line.startswith('#') and not first_line.startswith('-'):
        log_warn("File does not start with heading or list item")
    
    repo = detect_space_repo(find_workspace_root())
    
    if getattr(args, 'append', None):
        # Append mode: read current body + append new content
        issue_info = get_issue_info(issue_number, repo)
        current_body = issue_info.get("body", "")
        trimmed = current_body.rstrip('\n')
        if trimmed:
            new_body = trimmed + "\n\n" + file_content
        else:
            new_body = file_content
        if not new_body.endswith('\n'):
            new_body += '\n'
    else:
        # Replace mode
        new_body = file_content
        if not new_body.endswith('\n'):
            new_body += '\n'
    
    result = subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo, "--body", new_body],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to write to issue #{issue_number}")
        log_error(result.stderr)
        return 1
    
    mode = "append" if getattr(args, 'append', None) else "replace"
    log_success(f"Issue #{issue_number} body updated ({mode})")
    return 0


# ============================================
# argparse registration
# ============================================

def register_issue_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register issue subcommand and its subcommands."""
    issue_parser = subparsers.add_parser("issue", help="Issue management")
    issue_subparsers = issue_parser.add_subparsers(dest="issue_cmd")
    
    # issue create
    create_parser = issue_subparsers.add_parser("create", help="Create new issue")
    create_parser.add_argument("--title", required=False, help="Issue title")
    create_parser.add_argument("--project", required=False, help="Project name")
    create_parser.add_argument("--type", help="Issue type (feat/fix/perf/etc.)")
    create_parser.add_argument("--body", help="Raw issue body")
    create_parser.add_argument("--body-file", help="Read issue body from file")
    
    # issue update (deprecated - use issue write instead)
    update_parser = issue_subparsers.add_parser("update", help="Update existing issue")
    update_parser.add_argument("issue_number", nargs="?", help="Issue number to update")
    update_parser.add_argument("--title", help="New issue title")
    update_parser.add_argument("--type", help="New issue type")
    update_parser.add_argument("--project", help="New project")
    update_parser.add_argument("--goal", help="Update goal section")
    update_parser.add_argument("--background", help="Update background section")
    update_parser.add_argument("--confirmed-bugs", help="Update confirmed bugs section")
    update_parser.add_argument("--content-model-defects", help="Update content model defects section")
    update_parser.add_argument("--cleanup-scope", help="Update cleanup scope section")
    update_parser.add_argument("--key-findings", help="Update key findings section")
    update_parser.add_argument("--baseline", help="Update baseline section")
    update_parser.add_argument("--target", help="Update target section")
    update_parser.add_argument("--affected-components", help="Update affected components section")
    update_parser.add_argument("--refactor-strategy", help="Update refactor strategy section")
    update_parser.add_argument("--target-documents", help="Update target documents section")
    update_parser.add_argument("--audience", help="Update audience section")
    update_parser.add_argument("--test-scope", help="Update test scope section")
    update_parser.add_argument("--test-strategy", help="Update test strategy section")
    update_parser.add_argument("--scope", help="Update in-scope section")
    update_parser.add_argument("--out-of-scope", help="Update out-of-scope section")
    update_parser.add_argument("--reference", help="Update reference in Related Resources")
    update_parser.add_argument("--acceptance-criteria", help="Update acceptance criteria section")
    
    # issue write
    write_parser = issue_subparsers.add_parser("write", help="Write to issue body")
    write_parser.add_argument("issue_number", nargs="?", help="Issue number")
    write_parser.add_argument("--body-file", help="Replace issue body with file content")
    write_parser.add_argument("--append", help="Append file content to issue body")


def cmd_issue(args: argparse.Namespace) -> int:
    """Dispatch issue subcommand."""
    if args.issue_cmd == "create":
        return cmd_issue_create(args)
    elif args.issue_cmd == "update":
        return cmd_issue_update(args)
    elif args.issue_cmd == "write":
        return cmd_issue_write(args)
    else:
        log_error(f"Unknown issue subcommand: {args.issue_cmd}")
        return 1