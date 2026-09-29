#!/usr/bin/env python3
# plan.py - Plan domain operations for dev-flow
#
# Provides:
#   Metadata: get_plan_field, get_plan_project, get_plan_project_path,
#             get_plan_type, get_plan_issue, get_plan_status,
#             set_plan_field, get_plan_worktree, set_plan_worktree
#   Project:  resolve_project_repo, resolve_project_path, ProjectType
#   Naming:   validate_plan_name, make_plan_name
#   Body:     build_plan_link_for_issue
#   Find:     find_plan, find_plan_by_name, find_plan_by_issue
#   Link:     update_issue_plan_link

from __future__ import annotations

import os
import re
import subprocess
from enum import Enum
from pathlib import Path

from lib.workspace import find_workspace_root
from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.git import get_current_branch
from lib.project import resolve_plan_location, build_plan_blob_url
from lib import project as _project_resolver
from labels import normalize_plan_type
from issue import replace_plan_row_in_body


# ============================================
# Metadata (from metadata.py)
# ============================================

def get_plan_field(plan_path: str, field_name: str) -> str:
    """Extract arbitrary field value from Plan metadata section.
    
    Metadata format: "- **FieldName**: value"
    """
    path = Path(plan_path)
    if not path.exists():
        return ""
    
    content = path.read_text()
    
    pattern = rf'^\- \*\*{re.escape(field_name)}\*\*:[ \t]*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    
    if match:
        return match.group(1).strip()
    
    return ""
def get_plan_project(plan_path: str) -> str:
    """Extract Target Project from Plan metadata."""
    return get_plan_field(plan_path, "Target Project")


def get_plan_project_path(plan_path: str) -> str:
    """Extract Project Path from Plan metadata."""
    return get_plan_field(plan_path, "Project Path")


def get_plan_type(plan_path: str) -> str:
    """Extract Type from Plan metadata."""
    return get_plan_field(plan_path, "Type")


def get_plan_issue(plan_path: str) -> int | None:
    """Extract Issue number from Plan metadata."""
    issue_field = get_plan_field(plan_path, "Issue")
    
    if not issue_field:
        return None
    
    match = re.search(r'#?(\d+)', issue_field)
    if match:
        return int(match.group(1))
    
    return None


def get_plan_status(plan_path: str) -> str:
    """Extract Status from Plan metadata."""
    return get_plan_field(plan_path, "Status")


def set_plan_field(plan_path: str, field_name: str, field_value: str) -> bool:
    """Set or update a metadata field in Plan file."""
    path = Path(plan_path)
    if not path.exists():
        return False
    
    content = path.read_text()
    
    pattern = rf'^\- \*\*{re.escape(field_name)}\*\*:[ \t]*.*$'
    match = re.search(pattern, content, re.MULTILINE)
    
    if match:
        new_line = f'- **{field_name}**: {field_value}'
        new_content = re.sub(pattern, new_line, content, count=1, flags=re.MULTILINE)
    else:
        status_pattern = r'^\- \*\*Status\*\*:[ \t]*.*$'
        status_match = re.search(status_pattern, content, re.MULTILINE)
        
        if status_match:
            new_line = f'- **{field_name}**: {field_value}'
            new_content = content[:status_match.end()] + '\n' + new_line + content[status_match.end():]
        else:
            return False
    
    path.write_text(new_content)
    return True


def get_plan_worktree(plan_path: str) -> dict | None:
    """Extract Worktree metadata from Plan file.

    Supports the structured formats: - **Worktree**: with branch + path
    sub-fields (new 2-field and old 9-field).

    Returns:
        {'branch': str, 'path': str} if found, None otherwise
    """
    from lib.worktree import parse_worktree_meta
    return parse_worktree_meta(plan_path)


def set_plan_worktree(plan_path: str, branch: str, path: str) -> bool:
    """Set Worktree metadata in Plan file using the new 2-field format."""
    from lib.worktree import write_worktree_context
    return write_worktree_context(plan_path, branch, path)


# ============================================
# Project (from project.py)
# ============================================

class ProjectType(Enum):
    """Project type enumeration."""
    STANDARD = "standard"


def _parse_github_repo_url(url: str) -> str | None:
    """Parse GitHub remote URL to owner/repo format."""
    match = re.search(r'github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$', url)
    if match:
        return match.group(1)
    return None


def _get_default_branch(project_path: Path) -> str:
    """Detect the remote default branch for a git repository."""
    # 1. Query remote HEAD
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--symref", "origin", "HEAD"],
            cwd=project_path,
            capture_output=True, text=True, check=True,
        )
        first_line = result.stdout.strip().split("\n")[0]
        if first_line.startswith("ref: refs/heads/"):
            return first_line.split("/")[-1].split("\t")[0]
    except subprocess.CalledProcessError:
        pass

    # 2. Fall back to local cache
    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            cwd=project_path,
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip().split("/")[-1]
    except subprocess.CalledProcessError:
        pass

    return "main"


def resolve_project_repo(project_path: Path) -> tuple[str | None, str]:
    """Dynamically resolve GitHub repo and base branch from project path."""
    if not project_path.exists():
        return None, "main"

    repo = None
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=project_path,
            capture_output=True, text=True, check=True,
        )
        repo = _parse_github_repo_url(result.stdout.strip())
    except subprocess.CalledProcessError:
        pass

    dot_git = project_path / ".git"
    if dot_git.exists() and dot_git.is_file():
        base_branch = get_current_branch(project_path) or "main"
    else:
        base_branch = _get_default_branch(project_path)

    return repo, base_branch


def resolve_project_path(
    plan_path: str,
    project_name: str,
    workspace_root: Path,
) -> Path | None:
    """Resolve project's git root directory path.

    Resolution order:
      1. Read 'Project Path' from Plan metadata -> find git root -> return
      2. Fallback projects/<project_name> -> return if it's a git repo
      3. Search workspace children for dir named <project_name>
    """
    # Step 1: Plan-declared path
    declared = get_plan_field(plan_path, "Project Path")
    if declared:
        candidate = workspace_root / declared
        git_root = _find_git_root(candidate)
        if git_root:
            return git_root

    # Step 2: Fallback to projects/<project_name>
    if project_name:
        candidate = workspace_root / "projects" / project_name
        git_root = _find_git_root(candidate)
        if git_root:
            return git_root

    # Step 3: Search workspace children
    if project_name:
        for entry in workspace_root.iterdir():
            if entry.is_dir():
                candidate = entry / project_name
                git_root = _find_git_root(candidate)
                if git_root:
                    return git_root

    return None


def _find_git_root(path: Path) -> Path | None:
    """Find git root by checking path/.git, then parent/.git."""
    if not path.exists():
        return None
    if (path / ".git").exists():
        return path
    parent = path.parent
    if (parent / ".git").exists():
        return parent
    return None


def _is_git_repo(project_path: Path) -> bool:
    """Check if path is inside a git repository."""
    return _find_git_root(project_path) is not None


# ============================================
# Naming (from naming.py)
# ============================================

class ValidationError(Exception):
    """Raised when plan naming validation fails"""
    pass


_SLUG_MAX_LENGTH = 20


def validate_plan_name(name: str) -> None:
    """Validate Plan naming convention.
    
    Naming: <issue_number>-<type>-<scope>-<slug>.md OR <type>-<scope>-<slug>.md (no Issue)
    """
    pattern = r'^([0-9]+)?-?(feature|enhance|fix|perf|refactor|docs|chore|test)-([a-z0-9]+)-([a-z0-9-]+)$'
    
    if not re.match(pattern, name):
        raise ValidationError(
            f"Invalid plan name: {name}\n"
            "\n"
            "Plan naming convention (scope is mandatory):\n"
            "  <issue_number>-<type>-<scope>-<slug>.md  (with Issue)\n"
            "  <type>-<scope>-<slug>.md                 (no Issue)\n"
            "\n"
            "Types: feature, enhance, fix, perf, refactor, docs, chore, test\n"
            "Scope: short lowercase identifier (e.g., cli, dev-flow, plugin)\n"
            "Slug: short lowercase with hyphens\n"
        )


def make_plan_name(
    issue_number: int | None,
    plan_type: str,
    scope: str,
    slug: str,
    slug_from_title: bool = False
) -> str:
    """Generate plan name from components.

    Type is normalized via labels.normalize_plan_type (single source of truth).
    The slug segment is capped at 20 chars (references/plan-guide.md slug rules);
    an over-long slug is rejected, never silently truncated.

    slug_from_title marks a slug auto-derived from the title so the error can
    point at the right input (the title vs an explicit --slug).
    """
    if len(slug) > _SLUG_MAX_LENGTH:
        if slug_from_title:
            fix = "Shorten the title (the slug derives from its description)"
        else:
            fix = "Pass a shorter --slug"
        raise ValidationError(
            f"Slug too long: {len(slug)} chars (max {_SLUG_MAX_LENGTH}): '{slug}'. "
            f"{fix}: keep 1-2 core nouns, drop verb phrases "
            "(see references/plan-guide.md 'Slug rules')."
        )

    normalized_type = normalize_plan_type(plan_type)

    if issue_number:
        return f"{issue_number}-{normalized_type}-{scope}-{slug}"
    else:
        return f"{normalized_type}-{scope}-{slug}"


# ============================================
# Body (from body.py)
# ============================================

def build_plan_link_for_issue(plan_file: str, plan_name: str, repo: str, workspace_root: str = None) -> str:
    """Build Plan link row for Issue's Related Resources table.
    
    Uses resolve_plan_location() to determine the Plan's actual project repo,
    so the blob URL points to the correct repo and branch.
    
    Args:
        plan_file: Absolute or relative path to Plan file
        plan_name: Plan name (used as display text)
        repo: Space repo (unused for blob URL; kept for API compatibility)
        workspace_root: Workspace root path (required for path resolution)
    """
    plan_status = get_plan_field(plan_file, "Status")
    if plan_status in ('planning', 'draft'):
        return "| Plan | _待关联_ |"
    
    if workspace_root:
        loc = resolve_plan_location(Path(plan_file), Path(workspace_root))
        github_url = build_plan_blob_url(loc)
    else:
        github_url = ""
    
    return f"| Plan | [{plan_name}]({github_url}) |"


# ============================================
# Find (from find.py)
# ============================================

def find_plan(input_ref: str, workspace_root: str | Path | None = None) -> str:
    """Smart plan lookup: find plan by Issue number OR plan name.

    Delegates to lib.project.find_plan() for path resolution.
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    location = _project_resolver.find_plan(input_ref, Path(workspace_root))
    return str(location.path)


def find_plan_by_name(plan_name: str, workspace_root: str | Path = None) -> str:
    """Find plan file by plan name.

    Delegates to lib.project.find_plan() for path resolution.
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    location = _project_resolver.find_plan(plan_name, Path(workspace_root))
    return str(location.path)


def find_plan_by_issue(issue_number: int, workspace_root: str | Path = None) -> str:
    """Find plan file by issue number.

    Delegates to lib.project.find_plan() for path resolution.
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    location = _project_resolver.find_plan(str(issue_number), Path(workspace_root))
    return str(location.path)


# ============================================
# Link (from link.py)
# ============================================

def _build_relative_path(archived_file: str, workspace_root: Path) -> str:
    """Build relative path from docs/."""
    archived_path = Path(archived_file)
    docs_root = workspace_root / 'docs'
    
    try:
        relative = archived_path.relative_to(docs_root)
        return str(relative)
    except ValueError:
        return archived_path.name


def update_issue_plan_link(issue_number: int, plan_file: str, repo: str, workspace_root: str = None):
    """Update Issue Plan link after archive.
    
    Uses resolve_plan_location() to determine the Plan's actual project repo,
    so the blob URL points to the correct repo and branch.
    
    Args:
        issue_number: Issue number to update
        plan_file: Path to the (archived) Plan file
        repo: Space repo (used for gh CLI --repo flag for Issue operations)
        workspace_root: Workspace root path
    """
    workspace = Path(workspace_root) if workspace_root else find_workspace_root()
    
    if not os.path.isfile(plan_file):
        print(f"Warning: Archived plan file not found: {plan_file}")
        return
    
    plan_name = Path(plan_file).stem

    # Resolve Plan location to get correct repo + branch + relative path
    loc = resolve_plan_location(Path(plan_file), workspace)
    blob_url = build_plan_blob_url(loc)
    
    # Get current Issue body
    state_dir = workspace / 'state'
    body_file = state_dir / 'body.md'
    
    if body_file.exists():
        current_body = body_file.read_text()
    else:
        try:
            result = subprocess.run(
                ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'body', '--jq', '.body'],
                capture_output=True,
                text=True,
                check=True
            )
            # `gh --jq` appends one trailing newline; strip exactly that one so
            # the row rewrite preserves the body's real trailing bytes.
            current_body = result.stdout[:-1] if result.stdout.endswith("\n") else result.stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("Warning: gh CLI not available, skipping Plan link update")
            return
    
    # Update the Plan row through the single row-replacement primitive
    new_body = replace_plan_row_in_body(
        current_body, f"| Plan | [{plan_name}]({blob_url}) |")
    
    # Update Issue
    edit_args_file = state_dir / 'edit-args.txt'
    
    if state_dir.exists():
        edit_args_file.write_text(f'issue edit {issue_number} --repo {repo} --body {new_body}\n')
    else:
        try:
            subprocess.run(
                ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', new_body],
                capture_output=True,
                check=True
            )
            print(f"Issue #{issue_number} Plan link updated to archived path")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"Warning: Failed to update Issue #{issue_number} Plan link")
