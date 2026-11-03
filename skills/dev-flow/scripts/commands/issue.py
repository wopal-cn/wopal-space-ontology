#!/usr/bin/env python3
# issue.py - Issue management commands for dev-flow
#
# Commands:
#   issue create --title "<title>" [--project <name> ...] [--type <type>] [options]
#   issue edit <issue> [--title <title>] [--type <type>]
#                  [--add-project <name> ...] [--remove-project <name> ...]
#                  [--body-file <path>] [--append <path>]
#   issue merge --into <primary> <issue...>
#   issue close <issue>
#   issue delete <issue>
#   issue list [--project X] [--status Y] [--limit N]
#   issue view <issue> [--json]

from __future__ import annotations

import argparse
import subprocess
import re
import os
from pathlib import Path

from issue import (
    validate_issue_title,
    extract_type,
    ValidationError,
    build_structured_issue_body,
    ensure_label_exists,
    sync_type_label_group,
    sync_project_label_group,
    remove_project_label,
    remove_status_labels,
)
from labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
)
from lib.logging import log_warn, log_success, log_error
from lib.workspace import find_workspace_root, detect_space_repo
from lib.github import list_issues, STATUS_LABEL_MAP


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


def _validate_project_name(project: str) -> bool:
    """Return whether a project name is valid for project/* labels."""
    return bool(re.match(r'^[a-z0-9-]+$', project))


def _normalize_issue_ref(value: str | int) -> str:
    """Normalize #123 / 123 into a positive decimal issue number."""
    text = str(value).strip()
    if text.startswith("#"):
        text = text[1:]
    if not text.isdigit() or int(text) <= 0:
        raise ValueError(f"Invalid issue number: {value}")
    return str(int(text))


def _ensure_merge_history_line(body: str, line: str) -> str:
    """Add one visible merge-history line exactly once."""
    normalized = body or ""
    if re.search(rf"(?m)^{re.escape(line)}\s*$", normalized):
        return normalized

    heading = re.search(r"(?m)^## Merge History\s*$", normalized)
    if not heading:
        prefix = normalized.rstrip()
        if prefix:
            prefix += "\n\n"
        return f"{prefix}## Merge History\n\n{line}\n"

    after_heading = normalized[heading.end():]
    next_heading = re.search(r"(?m)^##\s+", after_heading)
    section_end = heading.end() + (next_heading.start() if next_heading else len(after_heading))
    before = normalized[:section_end].rstrip()
    after = normalized[section_end:]
    separator = "\n\n" if after and not after.startswith("\n") else "\n"
    return f"{before}\n{line}{separator}{after.lstrip(chr(10)) if after else ''}"


def _merged_into_target(body: str) -> str | None:
    match = re.search(r"(?m)^- Merged into: #(\d+)\s*$", body or "")
    return match.group(1) if match else None



# ============================================
# issue create command
# ============================================

def cmd_issue_create(args: argparse.Namespace) -> int:
    """Create structured GitHub Issue."""
    title = args.title
    projects = list(getattr(args, "project", None) or [])
    
    # Validate required args
    if not title:
        log_error("Missing --title")
        return 1
    # Validate project name format when project scope is already known.
    for project in projects:
        if not _validate_project_name(project):
            log_error(f"Invalid project name: {project}")
            log_error("Project name must be lowercase alphanumeric with hyphens")
            return 1
    
    # Validate title format
    try:
        validate_issue_title(title)
    except ValidationError as e:
        log_error(str(e))
        return 1
    
    # Determine type (explicit --type takes precedence; fall back to title prefix)
    inferred_type = infer_issue_type_from_title(title)

    if args.type:
        try:
            plan_type = normalize_plan_type(args.type)
        except ValidationError as e:
            log_error(f"Invalid --type: {args.type}")
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
    
    # Get repo and ensure labels
    workspace_root = find_workspace_root()
    repo = detect_space_repo(workspace_root)
    ensure_flow_labels_exist(repo)
    ensure_label_exists(type_label, repo)
    for project in projects:
        ensure_label_exists(f"project/{project}", repo)
    
    # Build gh args
    gh_args = [
        "gh", "issue", "create",
        "--repo", repo,
        "--title", title,
        "--body", body,
        "--label", "status/planning",
        "--label", type_label,
    ]
    for project in projects:
        gh_args.extend(["--label", f"project/{project}"])
    
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
# issue edit command
# ============================================

def cmd_issue_edit(args: argparse.Namespace) -> int:
    """Edit an existing Issue: title, type, project labels, and body.

    Body modes:
      --body-file  replace the whole body with file content
      --append     append file content to the body end
    """
    issue_number = args.issue_number
    if not issue_number:
        log_error("Missing issue number")
        return 1

    repo = detect_space_repo(find_workspace_root())

    # Fetch current issue for title/type fallback and append mode.
    issue_info = get_issue_info(issue_number, repo)
    current_body = issue_info.get("body", "")
    current_title = issue_info.get("title", "")

    # --- Determine next title ---
    next_title = args.title or current_title
    try:
        validate_issue_title(next_title)
    except ValidationError as e:
        log_error(str(e))
        return 1

    # --- Determine next type (for label sync) ---
    if args.type:
        try:
            next_type = normalize_plan_type(args.type)
        except ValidationError as e:
            log_error(f"Invalid --type: {args.type}")
            return 1
    else:
        inferred = infer_issue_type_from_title(next_title)
        if not inferred:
            log_error("Cannot determine issue type")
            return 1
        next_type = inferred

    # --- Determine project label mutations ---
    add_projects = list(getattr(args, "add_project", None) or [])
    remove_projects = list(getattr(args, "remove_project", None) or [])
    for project in [*add_projects, *remove_projects]:
        if not _validate_project_name(project):
            log_error(f"Invalid project name: {project}")
            log_error("Project name must be lowercase alphanumeric with hyphens")
            return 1
    overlap = sorted(set(add_projects) & set(remove_projects))
    if overlap:
        log_error(f"Project cannot be both added and removed: {', '.join(overlap)}")
        return 1

    # --- Resolve body ---
    body_file = getattr(args, "body_file", None) or getattr(args, "append", None)
    if body_file:
        if not os.path.isfile(body_file):
            log_error(f"File not found: {body_file}")
            return 1

        file_content = Path(body_file).read_text()
        if not file_content.strip():
            log_error("Source file is empty")
            return 1

        first_line = file_content.strip().split("\n")[0] if file_content.strip() else ""
        if first_line and not first_line.startswith("#") and not first_line.startswith("-"):
            log_warn("File does not start with heading or list item")

        if getattr(args, "append", None):
            trimmed = current_body.rstrip("\n")
            new_body = (trimmed + "\n\n" + file_content) if trimmed else file_content
            mode = "append"
        else:
            new_body = file_content
            mode = "replace"
        if not new_body.endswith("\n"):
            new_body += "\n"
    else:
        # No body change: keep current body
        new_body = current_body
        mode = "body-unchanged"

    # --- Run gh issue edit ---
    gh_args = [
        "gh", "issue", "edit", issue_number, "--repo", repo,
        "--title", next_title, "--body", new_body,
    ]
    result = subprocess.run(gh_args, capture_output=True, text=True)
    if result.returncode != 0:
        log_error(f"Failed to edit issue #{issue_number}")
        log_error(result.stderr)
        return 1

    # --- Sync labels ---
    type_label = plan_type_to_issue_label(next_type)
    sync_type_label_group(issue_number, type_label, repo)
    for project in add_projects:
        sync_project_label_group(issue_number, f"project/{project}", repo)
    for project in remove_projects:
        remove_project_label(issue_number, f"project/{project}", repo)

    log_success(f"Issue #{issue_number} updated (title/type/projects + {mode})")
    return 0


# ============================================
# issue merge command
# ============================================

def cmd_issue_merge(args: argparse.Namespace) -> int:
    """Merge duplicate Issues into an already-authored primary Issue."""
    try:
        target = _normalize_issue_ref(args.into)
        raw_sources = [_normalize_issue_ref(value) for value in (args.issues or [])]
    except ValueError as exc:
        log_error(str(exc))
        return 1

    # Deduplicate while preserving the user's order.
    sources = list(dict.fromkeys(raw_sources))
    if not sources:
        log_error("Missing source issues to merge")
        return 1
    if target in sources:
        log_error(f"Issue #{target} cannot be merged into itself")
        return 1

    repo = detect_space_repo(find_workspace_root())

    # Preflight every Issue before the first mutation so bad input cannot
    # create an avoidable half-merge.
    try:
        target_info = get_issue_info(target, repo)
        source_infos = {source: get_issue_info(source, repo) for source in sources}
    except RuntimeError:
        log_error("Failed to read all issues for merge")
        return 1

    for source, info in source_infos.items():
        existing_target = _merged_into_target(info.get("body", ""))
        if existing_target and existing_target != target:
            log_error(
                f"Issue #{source} is already merged into #{existing_target}; "
                f"cannot merge it into #{target}"
            )
            return 1

    target_body = target_info.get("body", "") or ""
    next_target_body = target_body
    for source in sources:
        next_target_body = _ensure_merge_history_line(
            next_target_body, f"- Merged from: #{source}"
        )

    if next_target_body != target_body:
        result = subprocess.run(
            ["gh", "issue", "edit", target, "--repo", repo,
             "--body", next_target_body],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            log_error(f"Failed to record merge sources on primary Issue #{target}")
            return 1

    for source in sources:
        info = source_infos[source]
        source_body = info.get("body", "") or ""
        next_source_body = _ensure_merge_history_line(
            source_body, f"- Merged into: #{target}"
        )
        if next_source_body != source_body:
            result = subprocess.run(
                ["gh", "issue", "edit", source, "--repo", repo,
                 "--body", next_source_body],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                log_error(f"Failed to record merge target on Issue #{source}")
                return 1

        # A merged source is no longer an active work item. Removing status
        # labels is independent from close state, which keeps retries safe.
        source_labels = [
            label.get("name", "")
            for label in info.get("labels", [])
            if isinstance(label, dict)
        ]
        if not remove_status_labels(source, repo, source_labels):
            log_error(
                f"Failed to remove active status labels from merged Issue #{source}; "
                "source was not closed"
            )
            return 1
        if str(info.get("state", "")).upper() != "CLOSED":
            result = subprocess.run(
                ["gh", "issue", "close", source, "--repo", repo,
                 "--reason", "not planned"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                log_error(f"Failed to close merged Issue #{source}")
                return 1

    log_success(
        f"Merged {', '.join(f'#{source}' for source in sources)} into #{target}"
    )
    return 0


# ============================================
# issue close command
# ============================================

def cmd_issue_close(args: argparse.Namespace) -> int:
    """Close an Issue in the space repo."""
    issue_number = args.issue_number
    if not issue_number:
        log_error("Missing issue number")
        return 1

    repo = detect_space_repo(find_workspace_root())
    result = subprocess.run(
        ["gh", "issue", "close", issue_number, "--repo", repo],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to close issue #{issue_number}")
        log_error(result.stderr)
        return 1

    log_success(f"Issue #{issue_number} closed")
    return 0


# ============================================
# issue delete command
# ============================================

def cmd_issue_delete(args: argparse.Namespace) -> int:
    """Delete an Issue in the space repo."""
    issue_number = args.issue_number
    if not issue_number:
        log_error("Missing issue number")
        return 1

    repo = detect_space_repo(find_workspace_root())
    result = subprocess.run(
        ["gh", "issue", "delete", issue_number, "--repo", repo, "--yes"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to delete issue #{issue_number}")
        log_error(result.stderr)
        return 1

    log_success(f"Issue #{issue_number} deleted")
    return 0


# ============================================
# issue list command
# ============================================

def cmd_issue_list(args: argparse.Namespace) -> int:
    """List open Issues from the space repo with repo URL.

    Auto-detects the space repository (no manual --repo needed).
    Supports --project and --status filtering.
    """
    workspace_root = find_workspace_root()
    try:
        repo = detect_space_repo(workspace_root)
    except RuntimeError as e:
        log_error(f"Failed to detect space repo: {e}")
        return 1

    projects = list(getattr(args, 'project', None) or [])
    statuses = list(getattr(args, 'status', None) or [])
    limit = getattr(args, 'limit', 50)

    # Validate project names (same rule as issue create)
    for p in projects:
        if not re.match(r'^[a-z0-9-]+$', p):
            log_error(f"Invalid project name: {p}")
            log_error("Project name must be lowercase alphanumeric with hyphens")
            return 1

    # Validate status aliases (single authority in lib.github.STATUS_LABEL_MAP)
    valid_statuses = set(STATUS_LABEL_MAP.keys())
    for s in statuses:
        if s.lower() not in valid_statuses:
            log_error(
                f"Invalid status: {s}. Allowed: {', '.join(sorted(valid_statuses))}"
            )
            return 1

    issues = list_issues(
        repo=repo,
        state="open",
        projects=projects,
        statuses=statuses,
        limit=limit,
    )
    if issues is None:
        log_error(f"Failed to list issues in {repo}")
        return 1

    if not issues:
        print(f"No open issues in {repo}.")
        return 0
# ============================================
# issue list command
# ============================================

def cmd_issue_list(args: argparse.Namespace) -> int:
    """List open Issues from the space repo with repo URL.

    Auto-detects the space repository (no manual --repo needed).
    Supports --project and --status filtering.
    """
    workspace_root = find_workspace_root()
    try:
        repo = detect_space_repo(workspace_root)
    except RuntimeError as e:
        log_error(f"Failed to detect space repo: {e}")
        return 1

    projects = list(getattr(args, 'project', None) or [])
    statuses = list(getattr(args, 'status', None) or [])
    limit = getattr(args, 'limit', 50)

    # Validate project names (same rule as issue create)
    for p in projects:
        if not re.match(r'^[a-z0-9-]+$', p):
            log_error(f"Invalid project name: {p}")
            log_error("Project name must be lowercase alphanumeric with hyphens")
            return 1

    # Validate status aliases (single authority in lib.github.STATUS_LABEL_MAP)
    valid_statuses = set(STATUS_LABEL_MAP.keys())
    for s in statuses:
        if s.lower() not in valid_statuses:
            log_error(
                f"Invalid status: {s}. Allowed: {', '.join(sorted(valid_statuses))}"
            )
            return 1

    issues = list_issues(
        repo=repo,
        state="open",
        projects=projects,
        statuses=statuses,
        limit=limit,
    )
    if issues is None:
        log_error(f"Failed to list issues in {repo}")
        return 1

    if not issues:
        print(f"No open issues in {repo}.")
        return 0

    for issue in issues:
        number = issue.get("number", "?")
        title = issue.get("title", "")
        label_names = [l.get("name", "") for l in issue.get("labels", []) if l.get("name")]
        label_str = " ".join(f"[{l}]" for l in label_names)
        print(f"#{number}  {title}  {label_str}".rstrip())

    # Show the repo the issues belong to
    if "/" in repo:
        owner, name = repo.split("/", 1)
        print(f"\nIssues in: https://github.com/{owner}/{name}")

    return 0


# ============================================
# issue view
# ============================================

def cmd_issue_view(args: argparse.Namespace) -> int:
    """View a single Issue by number from the space repo.

    Auto-detects the space repository (no manual --repo needed).
    Prints a readable rendering by default, raw JSON with --json.
    """
    import json

    workspace_root = find_workspace_root()
    try:
        repo = detect_space_repo(workspace_root)
    except RuntimeError as e:
        log_error(f"Failed to detect space repo: {e}")
        return 1

    try:
        info = get_issue_info(args.issue, repo)
    except RuntimeError:
        log_error(f"Failed to view issue #{args.issue} in {repo}")
        return 1

    if getattr(args, "json_flag", False):
        print(json.dumps(info, ensure_ascii=False, indent=2))
        return 0

    labels = [l.get("name", "") for l in info.get("labels", []) if l.get("name")]
    label_str = " ".join(f"[{l}]" for l in labels)
    print(f"#{info.get('number', '?')}  {info.get('title', '')}")
    if label_str:
        print(f"Labels: {label_str}")
    print(f"State: {info.get('state', '')}")
    print("")
    print(info.get("body", ""))

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
    create_parser.add_argument(
        "--project", action="append", help="Project name (repeatable; optional)"
    )
    create_parser.add_argument("--type", help="Issue type (feat/fix/perf/etc.)")
    create_parser.add_argument("--body", help="Raw issue body")
    create_parser.add_argument("--body-file", help="Read issue body from file")
    
    # issue edit
    edit_parser = issue_subparsers.add_parser("edit", help="Edit existing issue")
    edit_parser.add_argument("issue_number", nargs="?", help="Issue number to edit")
    edit_parser.add_argument("--title", help="New issue title")
    edit_parser.add_argument("--type", help="New issue type")
    edit_parser.add_argument(
        "--add-project", action="append", help="Add a project label (repeatable)"
    )
    edit_parser.add_argument(
        "--remove-project", action="append", help="Remove a project label (repeatable)"
    )
    edit_parser.add_argument("--body-file", help="Replace issue body with file content")
    edit_parser.add_argument("--append", help="Append file content to issue body")

    # issue merge
    merge_parser = issue_subparsers.add_parser(
        "merge", help="Merge duplicate issues into one primary issue"
    )
    merge_parser.add_argument("--into", required=True, help="Primary issue number")
    merge_parser.add_argument("issues", nargs="+", help="Source issue numbers to merge")
    
    # issue list
    list_parser = issue_subparsers.add_parser("list", help="List open issues in space repo")
    list_parser.add_argument("--limit", type=int, default=50, help="Max issues to list (default 50)")
    list_parser.add_argument("--project", action="append", dest="project",
                             help="Filter by project name (repeatable, OR-combined)")
    list_parser.add_argument("--status", action="append", dest="status",
                             help="Filter by status (planning/executing/in-progress/verifying/done, repeatable, OR-combined)")

    # issue view
    view_parser = issue_subparsers.add_parser(
        "view", help="View a single issue by number in space repo")
    view_parser.add_argument("issue", help="Issue number (e.g. 215)")
    view_parser.add_argument("--json", dest="json_flag", action="store_true",
                             help="Print raw JSON instead of formatted output")

    # issue close
    close_parser = issue_subparsers.add_parser("close", help="Close an issue")
    close_parser.add_argument("issue_number", nargs="?", help="Issue number to close")

    # issue delete
    delete_parser = issue_subparsers.add_parser("delete", help="Delete an issue")
    delete_parser.add_argument("issue_number", nargs="?", help="Issue number to delete")


def cmd_issue(args: argparse.Namespace) -> int:
    """Dispatch issue subcommand."""
    if args.issue_cmd == "create":
        return cmd_issue_create(args)
    elif args.issue_cmd == "edit":
        return cmd_issue_edit(args)
    elif args.issue_cmd == "merge":
        return cmd_issue_merge(args)
    elif args.issue_cmd == "list":
        return cmd_issue_list(args)
    elif args.issue_cmd == "view":
        return cmd_issue_view(args)
    elif args.issue_cmd == "close":
        return cmd_issue_close(args)
    elif args.issue_cmd == "delete":
        return cmd_issue_delete(args)
    else:
        log_error(f"Unknown issue subcommand: {args.issue_cmd}")
        return 1
