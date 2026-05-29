#!/usr/bin/env python3
# plan.py - Plan domain operations for dev-flow
#
# Merged from domain/plan/ (metadata.py, project.py, naming.py, body.py,
#                            find.py, link.py, commit.py)
#
# Provides:
#   Metadata: get_plan_field, get_plan_project, get_plan_project_path,
#             get_plan_type, get_plan_issue, get_plan_status,
#             set_plan_field, get_plan_worktree, set_plan_worktree
#   Project:  resolve_project_type, resolve_project_info, resolve_project_repo,
#             resolve_project_path, ProjectType
#             (get_ontology_main_repo -> imported from lib.workspace)
#   Naming:   validate_plan_name, make_plan_name
#   Body:     build_issue_body_from_plan, build_plan_link_for_issue
#   Find:     find_plan, find_plan_by_name, find_plan_by_issue
#   Link:     update_issue_plan_link
#   Commit:   build_commit_message, commit_project_changes,
#             commit_ontology_worktree, push_project_changes,
#             push_ontology_worktree

from __future__ import annotations

import os
import re
import subprocess
import glob
from enum import Enum
from pathlib import Path

from lib.workspace import find_workspace_root, get_ontology_main_repo
from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.git import has_uncommitted_changes, get_current_branch, push_branch
from lib.project import resolve_plan_location, build_plan_blob_url
from lib import project as _project_resolver


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
    
    pattern = rf'^\- \*\*{re.escape(field_name)}\*\*:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    
    if match:
        return match.group(1).strip()
    
    return ""


def parse_metadata(plan_path: str) -> dict:
    """Parse all metadata fields from a Plan file into a dict.

    Args:
        plan_path: Path to Plan markdown file

    Returns:
        Dict with all metadata fields (Status, Type, Target Project, etc.)
    """
    path = Path(plan_path)
    if not path.exists():
        return {}

    content = path.read_text()

    metadata = {}
    for match in re.finditer(r'^\- \*\*([^*]+)\*\*:\s*(.+)$', content, re.MULTILINE):
        key = match.group(1).strip()
        value = match.group(2).strip()
        metadata[key] = value

    return metadata


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
    
    pattern = rf'^\- \*\*{re.escape(field_name)}\*\*:\s*.*$'
    match = re.search(pattern, content, re.MULTILINE)
    
    if match:
        new_line = f'- **{field_name}**: {field_value}'
        new_content = re.sub(pattern, new_line, content, count=1, flags=re.MULTILINE)
    else:
        status_pattern = r'^\- \*\*Status\*\*:\s*.*$'
        status_match = re.search(status_pattern, content, re.MULTILINE)
        
        if status_match:
            new_line = f'- **{field_name}**: {field_value}'
            new_content = content[:status_match.end()] + '\n' + new_line + content[status_match.end():]
        else:
            return False
    
    path.write_text(new_content)
    return True


def get_plan_worktree(plan_path: str) -> dict | None:
    """Extract Worktree field from Plan metadata.

    Worktree format: "- **Worktree**: <branch> | <path>"
    """
    raw = get_plan_field(plan_path, "Worktree")
    if not raw:
        return None

    parts = raw.split('|', 1)
    if len(parts) != 2:
        return None

    branch = parts[0].strip()
    path = parts[1].strip()

    if not branch or not path:
        return None

    return {'branch': branch, 'path': path}


def set_plan_worktree(plan_path: str, branch: str, path: str) -> bool:
    """Set Worktree field in Plan metadata."""
    value = f"{branch} | {path}"
    return set_plan_field(plan_path, "Worktree", value)


# ============================================
# Project (from project.py)
# ============================================

class ProjectType(Enum):
    """Project type enumeration."""
    STANDARD = "standard"
    ONTOLOGY_WORKTREE = "ontology-worktree"


def _parse_github_repo_url(url: str) -> str | None:
    """Parse GitHub remote URL to owner/repo format."""
    match = re.search(r'github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$', url)
    if match:
        return match.group(1)
    return None


def _get_wopal_repo_name(workspace_root: Path) -> str | None:
    """Get the GitHub repo short name from .wopal's origin remote."""
    dot_git = workspace_root / ".wopal" / ".git"
    if not dot_git.exists() or not dot_git.is_file():
        return None

    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=workspace_root / ".wopal",
            capture_output=True, text=True, check=True,
        )
        repo = _parse_github_repo_url(result.stdout.strip())
        if repo:
            return repo.split("/")[-1]
    except subprocess.CalledProcessError:
        pass

    return None


def resolve_project_type(project_name: str, workspace_root: Path | None = None) -> ProjectType:
    """Resolve project type from workspace structure."""
    if workspace_root:
        repo_name = _get_wopal_repo_name(workspace_root)
        if repo_name and repo_name == project_name:
            return ProjectType.ONTOLOGY_WORKTREE
    return ProjectType.STANDARD


def resolve_project_info(project_name: str, workspace_root: Path) -> tuple[ProjectType, str | None]:
    """Resolve project type and workspace-relative path."""
    repo_name = _get_wopal_repo_name(workspace_root)
    if repo_name and repo_name == project_name:
        return ProjectType.ONTOLOGY_WORKTREE, ".wopal"
    return ProjectType.STANDARD, None


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

    # Step 2: Backward compat fallback
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


# Valid types for plan name
_PLAN_VALID_TYPES = ['feature', 'enhance', 'fix', 'refactor', 'docs', 'chore', 'test']


def validate_plan_name(name: str) -> None:
    """Validate Plan naming convention.
    
    Naming: <issue_number>-<type>-<scope>-<slug>.md OR <type>-<scope>-<slug>.md (no Issue)
    """
    pattern = r'^([0-9]+)?-?(feature|enhance|fix|refactor|docs|chore|test)-([a-z0-9]+)-([a-z0-9-]+)$'
    
    if not re.match(pattern, name):
        raise ValidationError(
            f"Invalid plan name: {name}\n"
            "\n"
            "Plan naming convention (scope is mandatory):\n"
            "  <issue_number>-<type>-<scope>-<slug>.md  (with Issue)\n"
            "  <type>-<scope>-<slug>.md                 (no Issue)\n"
            "\n"
            "Types: feature, enhance, fix, refactor, docs, chore, test\n"
            "Scope: short lowercase identifier (e.g., cli, dev-flow, plugin)\n"
            "Slug: short lowercase with hyphens\n"
        )


def make_plan_name(
    issue_number: int | None,
    plan_type: str,
    scope: str,
    slug: str
) -> str:
    """Generate plan name from components."""
    normalized_type = _normalize_type(plan_type)
    
    if issue_number:
        return f"{issue_number}-{normalized_type}-{scope}-{slug}"
    else:
        return f"{normalized_type}-{scope}-{slug}"


def _normalize_type(raw_type: str) -> str:
    """Normalize plan type to canonical value."""
    raw = raw_type.lower()
    
    if raw in ('feat', 'feature'):
        return 'feature'
    elif raw in ('enhance', 'enhancement'):
        return 'enhance'
    elif raw in ('fix', 'bug'):
        return 'fix'
    elif raw in ('perf', 'performance'):
        return 'perf'
    elif raw == 'refactor':
        return 'refactor'
    elif raw in ('docs', 'doc', 'documentation'):
        return 'docs'
    elif raw in ('chore', 'ci'):
        return 'chore'
    elif raw == 'test':
        return 'test'
    else:
        raise ValidationError(f"Invalid plan type: {raw_type}")


# ============================================
# Body (from body.py)
# ============================================

def _extract_plan_section(plan_file: str, section: str, limit: int = 0) -> str:
    """Extract a markdown section body from a plan file.
    
    Handles fenced code blocks — only matches ## headings outside code blocks.
    """
    content = []
    in_code = False
    found = False
    count = 0
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip().startswith('```'):
                in_code = not in_code
                continue
            
            if not in_code and line.strip() == f"## {section}":
                found = True
                continue
            
            if found and not in_code and line.startswith("##") and not line.startswith(f"## {section}"):
                break
            
            if found and not in_code:
                content.append(line)
                count += 1
                if limit > 0 and count >= limit:
                    break
    
    return ''.join(content).strip()


def _extract_subsection(plan_file: str, subsection: str) -> str:
    """Extract a named subsection from a section."""
    content = []
    in_subsection = False
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip() == f"### {subsection}":
                in_subsection = True
                continue
            
            if in_subsection and (line.startswith("###") or (line.startswith("##") and not line.startswith("###"))):
                break
            
            if in_subsection:
                content.append(line)
    
    return ''.join(content).strip()


def _extract_acceptance_criteria(plan_file: str) -> str:
    """Extract Acceptance Criteria section (including Agent/User sub-sections).
    
    Converts numbered checkboxes (1. [ ]) to GitHub-compatible format (- [ ]).
    """
    content = []
    in_section = False
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip() == "## Acceptance Criteria":
                in_section = True
                continue
            
            if in_section and line.startswith("## ") and not line.startswith("## Acceptance Criteria"):
                break
            
            if in_section:
                content.append(line)
    
    raw_content = ''.join(content).strip()
    
    converted = re.sub(r'^(\s*)(\d+)\.\s+\[\s*\]', r'\1- [ ]', raw_content, flags=re.MULTILINE)
    converted = re.sub(r'^(\s*)(\d+)\.\s+\[x\]', r'\1- [x]', converted, flags=re.MULTILINE)
    
    return converted


def _render_issue_section(heading: str, content: str, placeholder: str = "") -> str:
    """Render a markdown section with heading."""
    if not content:
        content = placeholder
    
    return f"## {heading}\n\n{content}\n"


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


def build_issue_body_from_plan(plan_file: str, plan_name: str, repo: str, workspace_root: str = None) -> str:
    """Build Plan link for Issue body (delegates to build_plan_link_for_issue)."""
    return build_plan_link_for_issue(plan_file, plan_name, repo, workspace_root)


# ============================================
# Find (from find.py)
# ============================================

def find_plan(input_ref: str, workspace_root: str | Path | None = None) -> str:
    """Smart plan lookup: find plan by Issue number OR plan name.

    Delegates to lib.project.find_plan() for path resolution.
    Returns the plan file path as a string for backward compatibility.
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    location = _project_resolver.find_plan(input_ref, Path(workspace_root))
    return str(location.path)


def find_plan_by_name(plan_name: str, workspace_root: str | Path = None) -> str:
    """Find plan file by plan name.

    Delegates to lib.project.find_plan() which handles new paths
    and DEPRECATED legacy read-only fallback.
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    location = _project_resolver.find_plan(plan_name, Path(workspace_root))
    return str(location.path)


def find_plan_by_issue(issue_number: int, workspace_root: str | Path = None) -> str:
    """Find plan file by issue number.

    Delegates to lib.project.find_plan() which handles new paths
    and DEPRECATED legacy read-only fallback.
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
            current_body = result.stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("Warning: gh CLI not available, skipping Plan link update")
            return
    
    # Update Plan link in Related Resources table
    new_body = re.sub(
        rf'\[{re.escape(plan_name)}\]\([^)]*\)',
        f'[{plan_name}]({blob_url})',
        current_body
    )
    
    if new_body == current_body:
        new_body = re.sub(
            r'(\| Plan \| \[)[^]]+\]\([^)]*\)',
            f'| Plan | [{plan_name}]({blob_url})',
            current_body
        )
    
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


# ============================================
# Commit (from commit.py)
# ============================================

# Plan type to git commit type mapping
_PLAN_TYPE_TO_COMMIT = {
    'feature': 'feat',
    'enhance': 'enhance',
    'fix': 'fix',
    'refactor': 'refactor',
    'docs': 'docs',
    'test': 'test',
    'chore': 'chore',
    'perf': 'perf',
}

_MAX_COMMIT_FIRST_LINE = 72


def _get_issue_title(issue_number: int, repo: str) -> str | None:
    """Get Issue title via gh CLI."""
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo,
             '--json', 'title', '--jq', '.title'],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _parse_plan_name_for_commit(plan_name: str) -> tuple[str, str]:
    """Parse plan name to (type, rest) for commit message."""
    name = Path(plan_name).stem
    name = re.sub(r'^\d{8}-', '', name)
    name = re.sub(r'^[0-9]+-', '', name)

    match = re.match(r'^([a-z]+)-(.+)$', name)
    if match:
        return match.group(1), match.group(2)
    return 'chore', name


def _slug_to_description(slug: str) -> str:
    """Convert hyphen-separated slug to space-separated description."""
    return slug.replace('-', ' ')


def build_commit_message(
    plan_name: str,
    plan_type: str,
    issue_number: int | None,
    repo: str | None,
) -> str:
    """Build descriptive commit message from Issue title or Plan name."""
    if issue_number and repo:
        title = _get_issue_title(issue_number, repo)
        if title:
            suffix = f" (#{issue_number})"
            total_len = len(title) + len(suffix)
            if total_len <= _MAX_COMMIT_FIRST_LINE:
                return f"{title}{suffix}"
            m = re.match(r'^([a-z]+\([^)]+\):\s*)(.*)$', title)
            if m:
                prefix, desc = m.group(1), m.group(2)
                max_desc = _MAX_COMMIT_FIRST_LINE - len(prefix) - len(suffix)
                return f"{prefix}{desc[:max_desc]}{suffix}"

    parsed_type, slug = _parse_plan_name_for_commit(plan_name)
    effective_type = _PLAN_TYPE_TO_COMMIT.get(parsed_type, plan_type) or 'chore'
    description = _slug_to_description(slug)
    msg = f"{effective_type}: {description}"
    if len(msg) > _MAX_COMMIT_FIRST_LINE:
        prefix_len = len(f"{effective_type}: ")
        description = description[:_MAX_COMMIT_FIRST_LINE - prefix_len]
        msg = f"{effective_type}: {description}"
    return msg


def commit_project_changes(
    project_path: str,
    plan_type: str,
    issue_number: int | None,
    plan_name: str | None = None,
    repo: str | None = None,
) -> bool:
    """Commit (but NOT push) project repo changes."""
    if plan_name:
        commit_msg = build_commit_message(plan_name, plan_type, issue_number, repo)
    else:
        commit_type = _PLAN_TYPE_TO_COMMIT.get(plan_type, 'chore')
        if issue_number:
            commit_msg = f"{commit_type}: implement plan changes (#{issue_number})"
        else:
            commit_msg = f"{commit_type}: implement plan changes"

    subprocess.run(
        ["git", "add", "-A"],
        cwd=project_path,
        capture_output=True,
    )

    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        cwd=project_path,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if "nothing to commit" in result.stdout:
            log_info("No changes to commit in project repo")
            return True
        log_error(f"Project commit failed: {result.stderr.strip()}")
        return False

    log_success(f"Project committed: {commit_msg}")
    return True


def commit_ontology_worktree(
    workspace_root: Path,
    plan_type: str,
    issue_number: int | None,
    plan_name: str | None = None,
    repo: str | None = None,
) -> bool:
    """Commit (but NOT push) ontology worktree changes."""
    ontology_path = workspace_root / ".wopal"

    if not ontology_path.exists():
        log_error("Ontology worktree path not found: .wopal/")
        return False

    if not has_uncommitted_changes(str(ontology_path)):
        log_info("No uncommitted changes in ontology worktree")
        return True

    branch = get_current_branch(ontology_path)
    if not branch:
        log_error("Cannot resolve ontology worktree branch")
        return False

    if plan_name:
        commit_msg = build_commit_message(plan_name, plan_type, issue_number, repo)
    else:
        commit_type = _PLAN_TYPE_TO_COMMIT.get(plan_type, 'chore')
        if issue_number:
            commit_msg = f"{commit_type}: implement plan changes (#{issue_number})"
        else:
            commit_msg = f"{commit_type}: implement plan changes"

    log_step(f"Committing ontology changes to {branch}...")

    subprocess.run(
        ["git", "add", "-A"],
        cwd=str(ontology_path),
        capture_output=True,
    )

    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        cwd=str(ontology_path),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if "nothing to commit" in result.stdout:
            log_info("No changes to commit in ontology worktree")
            return True
        log_error(f"Ontology commit failed: {result.stderr.strip()}")
        return False

    log_success(f"Ontology committed: {commit_msg}")
    return True


def push_project_changes(project_path: str) -> bool:
    """Push project repo changes to origin/main."""
    if not push_branch(project_path, 'main'):
        log_error("Project push failed")
        return False
    log_success("Project pushed to origin/main")
    return True


def push_ontology_worktree(workspace_root: Path) -> bool:
    """Push ontology worktree changes to origin."""
    ontology_path = workspace_root / ".wopal"
    branch = get_current_branch(ontology_path)
    if not branch:
        log_error("Cannot resolve ontology worktree branch")
        return False

    if not push_branch(str(ontology_path), branch):
        log_error("Ontology push failed")
        return False
    log_success(f"Ontology pushed to origin/{branch}")
    return True
