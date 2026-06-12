#!/usr/bin/env python3
# worktree.py - Git worktree operations for dev-flow
#
# Replaces worktree.sh with pure Python implementation using subprocess git.
# Uses lib/workspace.py for workspace detection (not .workspace.md).
#
# Provides:
#   - scan_projects: Scan workspace for git projects
#   - create_worktree: Create a git worktree
#   - list_worktrees: List worktrees filtered by base path
#   - remove_worktree: Remove a git worktree (with --force fallback)
#   - delete_branch: Delete a local branch (with -D fallback)
#   - clean_worktree: One-stop cleanup (remove_worktree + delete_branch)

import os
import re
import subprocess
from dataclasses import dataclass, fields
from pathlib import Path

from lib.project import resolve_plan_location


# ============================================
# WorktreeContext
# ============================================

@dataclass
class WorktreeContext:
    """Structured worktree configuration stored in Plan metadata.

    Minimal fields written by write_worktree_context:
        branch: Worktree branch name
        path: Worktree directory path (relative to workspace root)
        project_type: "standard" or "ontology-worktree" (from Plan metadata)

    Other info read from Plan Metadata:
        Project Path: repo root path (used instead of repo_root)
    """
    branch: str
    path: Path
    project_type: str = "standard"  # "standard" | "ontology-worktree"


def _worktree_field_name(field: str) -> str:
    """Convert python field name to Plan metadata key.

    e.g. 'project_type' -> 'project_type', 'verify_mode' -> 'verify_mode'
    """
    return field


def parse_worktree_context(plan_path: str) -> WorktreeContext | None:
    """Parse WorktreeContext from Plan metadata.

    Supports two formats:
    1. New structured format (indented list under Worktree heading)
    2. Legacy format: "- **Worktree**: branch | path"

    Args:
        plan_path: Path to Plan markdown file

    Returns:
        WorktreeContext if found, None otherwise
    """
    path = Path(plan_path)
    if not path.exists():
        return None

    content = path.read_text()

    # Extract only the ## Metadata section to avoid matching
    # Worktree placeholders in design/scope sections.
    metadata_section = _extract_metadata_section(content)

    # Try new structured format first
    ctx = _parse_structured_worktree(metadata_section)
    if ctx is not None:
        # Read project_type from Plan metadata if not in WorktreeContext
        if ctx.project_type == 'standard':
            meta_type = _read_plan_project_type(metadata_section)
            if meta_type and meta_type != 'standard':
                ctx.project_type = meta_type
        return ctx

    # Fallback to legacy format: "- **Worktree**: branch | path"
    ctx = _parse_legacy_worktree(metadata_section)
    if ctx is not None:
        # Read project_type from Plan metadata
        meta_type = _read_plan_project_type(metadata_section)
        if meta_type:
            ctx.project_type = meta_type
        return ctx

    return None


def _extract_metadata_section(content: str) -> str:
    """Extract content between '## Metadata' and the next '## ' heading.

    Falls back to full content if no Metadata heading is found.
    """
    pattern = r'^## Metadata\s*\n(.*?)(?=^## |\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        return match.group(1)
    return content


def _read_plan_project_type(content: str) -> str | None:
    """Read Project Type from Plan Metadata section.

    Looks for '- **Project Type**: <value>' in the Metadata block.
    Returns None if not found.
    """
    pattern = r'^\- \*\*Project Type\*\*:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def _parse_structured_worktree(content: str) -> WorktreeContext | None:
    """Parse new structured Worktree block from Plan content.

    Format:
        - **Worktree**:
          - enabled: true
          - branch: feature/test-1-slug
          - path: .worktrees/project-issue-1-slug
          - ...
    """
    # Match the Worktree field heading and its indented sub-fields
    pattern = r'^- \*\*Worktree\*\*:\s*$\n((?:  - .+\n)*)'
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None

    block = match.group(1)
    kv: dict[str, str] = {}

    for line in block.strip().split('\n'):
        line = line.strip()
        if not line.startswith('- '):
            continue
        line = line[2:]  # strip "- "
        if ':' not in line:
            continue
        key, _, value = line.partition(':')
        kv[key.strip()] = value.strip()

    if not kv:
        return None

    # Build WorktreeContext from parsed kv
    try:
        return WorktreeContext(
            branch=kv.get('branch', ''),
            path=Path(kv.get('path', '')),
            project_type=kv.get('project_type', 'standard'),
        )
    except Exception:
        return None


def _parse_legacy_worktree(content: str) -> WorktreeContext | None:
    """Parse legacy '- **Worktree**: branch | path' format."""
    pattern = r'^\- \*\*Worktree\*\*:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None

    raw = match.group(1).strip()
    parts = raw.split('|', 1)
    if len(parts) != 2:
        return None

    branch = parts[0].strip()
    wt_path = parts[1].strip()

    if not branch or not wt_path:
        return None

    return WorktreeContext(
        branch=branch,
        path=Path(wt_path),
        project_type='standard',
    )


def write_worktree_context(plan_path: str, branch: str, path: str) -> bool:
    """Write minimal Worktree metadata to Plan file (branch + path only).

    Replaces existing Worktree field (new or legacy format) with simplified block.

    Args:
        plan_path: Path to Plan markdown file
        branch: Feature branch name
        path: Workspace-relative worktree path

    Returns:
        True if write succeeded, False otherwise
    """
    wt_path = Path(path)
    # Normalize to forward-slash relative path string
    if wt_path.is_absolute():
        try:
            rel = wt_path.as_posix()
        except Exception:
            rel = str(wt_path)
    else:
        rel = wt_path.as_posix()

    p = Path(plan_path)
    if not p.exists():
        return False

    content = p.read_text()

    lines = [
        '- **Worktree**:',
        f'  - branch: {branch}',
        f'  - path: {rel}',
    ]
    new_block = '\n'.join(lines)

    # Try replacing existing structured format
    structured_pattern = r'^\- \*\*Worktree\*\*:\s*$\n((?:  - .+\n)*)'
    structured_match = re.search(structured_pattern, content, re.MULTILINE)
    if structured_match:
        new_content = content[:structured_match.start()] + new_block + content[structured_match.end():]
        p.write_text(new_content)
        return True

    # Try replacing legacy format
    legacy_pattern = r'^\- \*\*Worktree\*\*:\s*.+$'
    legacy_match = re.search(legacy_pattern, content, re.MULTILINE)
    if legacy_match:
        new_content = content[:legacy_match.start()] + new_block + content[legacy_match.end():]
        p.write_text(new_content)
        return True

    # No existing Worktree field — insert after Status field
    status_pattern = r'^\- \*\*Status\*\*:\s*.*$'
    status_match = re.search(status_pattern, content, re.MULTILINE)
    if status_match:
        insert_pos = status_match.end()
        new_content = content[:insert_pos] + '\n' + new_block + content[insert_pos:]
        p.write_text(new_content)
        return True

    return False


def parse_worktree_meta(plan_path: str) -> dict | None:
    """Parse minimal Worktree metadata (branch + path) from Plan file.

    Supports all formats: new 2-field, old 9-field structured, and legacy pipe.

    Returns:
        {"branch": str, "path": str} if found, None otherwise.
    """
    ctx = parse_worktree_context(plan_path)
    if ctx is None:
        return None
    return {"branch": ctx.branch, "path": str(ctx.path)}


class ResolveActivePlanError(Exception):
    """Raised when resolve_active_plan cannot determine the active Plan."""
    pass


@dataclass
class ActivePlanInfo:
    """Result of active Plan resolution.

    Attributes:
        active_plan_path: Absolute path to the active Plan file
        commit_repo_root: Absolute path to the Git working tree root
            where Plan-only commits must be executed
        repo_relative_plan_path: Plan path relative to commit_repo_root
        branch_context: "integration" when on main/integration branch,
            "feature" when on a feature worktree branch
    """
    active_plan_path: Path
    commit_repo_root: Path
    repo_relative_plan_path: str
    branch_context: str  # "integration" | "feature"


def resolve_active_plan(
    main_plan_path: str,
    command_phase: str,
    workspace_root: str | Path | None = None,
) -> ActivePlanInfo:
    """Resolve the active Plan path for a given command phase.

    Logic:
        1. Read Worktree metadata from main Plan.
        2. No Worktree metadata -> return main Plan (integration branch).
        3. complete/review phase + worktree exists -> map to worktree Plan copy.
        4. verify phase + not merged -> raise ResolveActivePlanError.
        5. Merged / no worktree / other phases -> return main Plan.

    Args:
        main_plan_path: Path to the main-branch Plan file (from find_plan)
        command_phase: One of "approve", "complete", "review",
            "verify", "archive"
        workspace_root: Workspace root path. If None, auto-detected.

    Returns:
        ActivePlanInfo with resolved paths and branch context.

    Raises:
        ResolveActivePlanError: When verify is called on an unmerged branch.
    """
    from lib.workspace import find_workspace_root as _find_ws

    if workspace_root is None:
        workspace_root = _find_ws()
    workspace_root = Path(workspace_root).resolve()

    main_plan = Path(main_plan_path).resolve()
    main_loc = resolve_plan_location(main_plan, workspace_root)

    # Step 1: Read worktree metadata
    wt_meta = parse_worktree_meta(str(main_plan))

    # Step 2: No worktree -> main Plan on integration branch
    if wt_meta is None:
        return ActivePlanInfo(
            active_plan_path=main_plan,
            commit_repo_root=main_loc.repo_root,
            repo_relative_plan_path=main_loc.repo_relative_path,
            branch_context="integration",
        )

    branch = wt_meta["branch"]
    wt_rel_path = wt_meta["path"]

    # Step 3: complete/review -> worktree Plan copy
    if command_phase in ("complete", "review"):
        worktree_dir = workspace_root / wt_rel_path
        repo_relative = main_loc.repo_relative_path
        worktree_plan = worktree_dir / repo_relative

        # Determine the repo root for the worktree
        if worktree_plan.exists():
            wt_loc = resolve_plan_location(worktree_plan, workspace_root)
            return ActivePlanInfo(
                active_plan_path=worktree_plan,
                commit_repo_root=wt_loc.repo_root,
                repo_relative_plan_path=wt_loc.repo_relative_path,
                branch_context="feature",
            )
        # Worktree dir doesn't exist or plan not in worktree — fall through
        # to main plan (e.g., worktree already cleaned up)
        return ActivePlanInfo(
            active_plan_path=main_plan,
            commit_repo_root=main_loc.repo_root,
            repo_relative_plan_path=main_loc.repo_relative_path,
            branch_context="integration",
        )

    # Step 4: verify → return main Plan on integration branch.
    # Merge detection is verify.py's sole responsibility (single source of truth).
    if command_phase == "verify":
        return ActivePlanInfo(
            active_plan_path=main_plan,
            commit_repo_root=main_loc.repo_root,
            repo_relative_plan_path=main_loc.repo_relative_path,
            branch_context="integration",
        )

    # Step 5: archive and other phases -> main Plan
    return ActivePlanInfo(
        active_plan_path=main_plan,
        commit_repo_root=main_loc.repo_root,
        repo_relative_plan_path=main_loc.repo_relative_path,
        branch_context="integration",
    )


def scan_projects(workspace_root: Path) -> list[str]:
    """Scan workspace root for git project directories.

    Uses os.listdir to scan subdirectories, detecting those containing .git.
    Does not depend on .workspace.md.

    Args:
        workspace_root: Workspace root path

    Returns:
        List of project directory names (not full paths)
    """
    projects = []
    if not workspace_root.is_dir():
        return projects

    for entry in os.listdir(workspace_root):
        entry_path = workspace_root / entry
        if entry_path.is_dir():
            git_path = entry_path / ".git"
            if git_path.exists():
                projects.append(entry)

    return sorted(projects)


def create_worktree(project_dir: Path, branch: str, worktree_base: Path) -> Path:
    """Create a git worktree for a project.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name for the worktree
        worktree_base: Base directory where worktrees are stored

    Returns:
        Path to the created worktree directory

    Raises:
        RuntimeError: If worktree creation fails
    """
    project_name = project_dir.name
    branch_slug = branch.replace("/", "-")
    worktree_path = worktree_base / f"{project_name}-{branch_slug}"

    # Ensure worktree_base exists
    worktree_base.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["git", "worktree", "add", str(worktree_path), branch],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        # Try with HEAD if branch doesn't exist yet — create new branch
        result = subprocess.run(
            ["git", "worktree", "add", "-b", branch, str(worktree_path), "HEAD"],
            cwd=str(project_dir),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Failed to create worktree at {worktree_path}: {result.stderr.strip()}"
            )

    return worktree_path


def list_worktrees(worktree_base: Path, project: str | None = None) -> list[str]:
    """List worktrees filtered by base path.

    Args:
        worktree_base: Base directory where worktrees are stored
        project: Optional project name to filter by

    Returns:
        List of worktree paths (as strings)
    """
    # Find a git repo to run 'git worktree list' from
    # walk up from worktree_base to find a git repo
    search_dir = worktree_base
    git_dir = None
    for parent in [search_dir] + list(search_dir.parents):
        if (parent / ".git").exists():
            git_dir = parent
            break

    if git_dir is None:
        return []

    result = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return []

    # Parse porcelain output: each worktree is separated by blank lines
    # Lines start with "worktree " followed by the path
    worktrees = []
    for line in result.stdout.strip().split('\n'):
        if line.startswith("worktree "):
            wt_path = line[len("worktree "):]
            # Filter by worktree_base prefix
            try:
                wt = Path(wt_path)
                if wt.is_relative_to(worktree_base) or str(wt).startswith(str(worktree_base)):
                    if project is None or project in wt.name:
                        worktrees.append(wt_path)
            except (ValueError, OSError):
                pass

    return worktrees


def remove_worktree(project_dir: Path, branch: str, worktree_base: Path) -> None:
    """Remove a git worktree (equivalent to worktree.sh cmd_remove).

    Tries git worktree remove, then --force on failure.
    Always runs git worktree prune afterwards.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name of the worktree
        worktree_base: Base directory where worktrees are stored

    Raises:
        RuntimeError: If both normal and force remove fail
    """
    project_name = project_dir.name
    branch_slug = branch.replace("/", "-")
    worktree_path = worktree_base / f"{project_name}-{branch_slug}"

    if worktree_path.exists():
        # Try normal remove
        result = subprocess.run(
            ["git", "worktree", "remove", str(worktree_path)],
            cwd=str(project_dir),
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            # Force remove on failure
            result = subprocess.run(
                ["git", "worktree", "remove", str(worktree_path), "--force"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    f"Failed to remove worktree {worktree_path}: {result.stderr.strip()}"
                )

    # Always prune (whether remove succeeded or path didn't exist)
    subprocess.run(
        ["git", "worktree", "prune"],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
    )


def delete_branch(git_dir: Path, branch: str) -> bool:
    """Delete a local branch (git branch -d, then -D on failure).

    Skips if branch is the current branch.

    Args:
        git_dir: Path to git repository root
        branch: Branch name to delete

    Returns:
        True if branch was deleted, False if skipped or failed
    """
    # Check current branch — skip if it's the branch to delete
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )
    current = result.stdout.strip()
    if current == branch:
        return False

    # Try soft delete (-d)
    result = subprocess.run(
        ["git", "branch", "-d", branch],
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        return True

    # Force delete (-D) on failure
    result = subprocess.run(
        ["git", "branch", "-D", branch],
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


def clean_worktree(project_dir: Path, branch: str, worktree_base: Path) -> dict:
    """One-stop cleanup for archive.py (equivalent to worktree.sh remove).

    Performs: remove_worktree + delete_branch
    Returns a result dict for callers to report.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name of the worktree
        worktree_base: Base directory where worktrees are stored

    Returns:
        {"removed": bool, "branch_deleted": bool, "errors": list[str]}
    """
    errors = []

    # 1. Remove worktree
    removed = False
    try:
        remove_worktree(project_dir, branch, worktree_base)
        removed = True
    except Exception as e:
        errors.append(f"Failed to remove worktree: {e}")

    # 2. Delete branch
    branch_deleted = False
    try:
        branch_deleted = delete_branch(project_dir, branch)
        if not branch_deleted:
            # Branch might not exist or is current — not an error
            pass
    except Exception as e:
        errors.append(f"Failed to delete branch: {e}")

    return {
        "removed": removed,
        "branch_deleted": branch_deleted,
        "errors": errors,
    }
