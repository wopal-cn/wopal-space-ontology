#!/usr/bin/env python3
# worktree.py - Git worktree operations for dev-flow
#
# Replaces worktree.sh with pure Python implementation using subprocess git.
# Uses lib/workspace.py for workspace detection (not .workspace.md).
#
# Provides:
#   - create_worktree: Create a git worktree
#   - remove_worktree: Remove a git worktree using Git safety checks
#   - delete_branch: Delete a local branch (with -D fallback)
#   - clean_worktree: One-stop cleanup (remove_worktree + delete_branch)

import os
import re
import subprocess
from dataclasses import dataclass, field, fields
from pathlib import Path

from lib.git import GitMutationFailure
from lib.logging import log_warn
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
        project_type: "standard" (from Plan metadata)

    Other info read from Plan Metadata:
        Project Path: repo root path (used instead of repo_root)
    """
    branch: str
    path: Path
    project_type: str = "standard"


def parse_worktree_context(plan_path: str) -> WorktreeContext | None:
    """Parse WorktreeContext from Plan metadata.

    Supports the structured format (indented list under Worktree heading).

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

    # Parse the structured format
    ctx = _parse_structured_worktree(metadata_section)
    if ctx is not None:
        # Read project_type from Plan metadata if not in WorktreeContext
        if ctx.project_type == 'standard':
            meta_type = _read_plan_project_type(metadata_section)
            if meta_type and meta_type != 'standard':
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


def write_worktree_context(plan_path: str, branch: str, path: str) -> bool:
    """Write minimal Worktree metadata to Plan file (branch + path only).

    Replaces an existing structured Worktree field with the simplified block.

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

    Supports the structured format.

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
    # Worktree directory = branch (branch already contains the project prefix)
    worktree_path = worktree_base / branch_slug

    # Ensure worktree_base exists
    worktree_base.mkdir(parents=True, exist_ok=True)

    add_cmd = ["git", "worktree", "add", str(worktree_path), branch]
    result = subprocess.run(
        add_cmd,
        cwd=str(project_dir),
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        first_attempt = GitMutationFailure.from_completed(
            add_cmd, str(project_dir), result,
        )
        # Try with HEAD if branch doesn't exist yet — create new branch
        retry_cmd = ["git", "worktree", "add", "-b", branch, str(worktree_path), "HEAD"]
        result = subprocess.run(
            retry_cmd,
            cwd=str(project_dir),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            second_attempt = GitMutationFailure.from_completed(
                retry_cmd, str(project_dir), result,
            )
            raise RuntimeError(
                f"Failed to create worktree at {worktree_path}:\n"
                f"  attempt 1: {first_attempt}\n"
                f"  attempt 2: {second_attempt}"
            )

    return worktree_path
def _find_worktree_path_by_branch(project_dir: Path, branch: str) -> Path | None:
    """Locate a worktree's real registered path via `git worktree list`.

    The git registry is authoritative; the branch-derived dir is only a
    fallback.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name to locate

    Returns:
        Registered worktree path, or None if the branch is not registered
    """
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=str(project_dir),
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None

    current_path: Path | None = None
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            current_path = Path(line[len("worktree "):].strip())
        elif line.startswith("branch "):
            branch_ref = line[len("branch "):].strip()
            if branch_ref == f"refs/heads/{branch}":
                return current_path
    return None


def _git_output(path: Path, *args: str) -> tuple[int, str]:
    """Run Git in one worktree and return its exit code with combined output."""
    cmd = ["git", "-C", str(path), *args]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode, (result.stdout + result.stderr).strip()


def _local_only_work(worktree_path: Path) -> tuple[bool, list[str]]:
    """Report tracked changes and local-only work in a worktree.

    Returns:
        (has_parent_changes, submodule_paths_with_local_work)

    Ignored build and test output is intentionally excluded. A missing
    submodule is not local work: it has not been initialized.
    """
    rc, lines = _git_output(
        worktree_path, "status", "--porcelain", "--ignore-submodules=none",
    )
    if rc != 0:
        return True, []
    parent_lines = []
    for line in lines.splitlines():
        if line.startswith(" M ") or line.startswith("M  "):
            continue
        parent_lines.append(line)
    parent_changed = bool(parent_lines)

    registered = worktree_path / ".gitmodules"
    if not registered.is_file():
        return parent_changed, []

    rc, names = _git_output(
        worktree_path, "config", "-f", ".gitmodules", "--get-regexp",
        r"^submodule\..*\.path$",
    )
    if rc != 0:
        return parent_changed, []

    unsafe: list[str] = []
    for relative in (
        line.split(maxsplit=1)[1] for line in names.splitlines() if " " in line
    ):
        child = worktree_path / relative
        if not child.is_dir():
            continue
        rc, _ = _git_output(child, "rev-parse", "--git-dir")
        if rc != 0:
            continue
        rc, dirty = _git_output(
            child, "status", "--porcelain", "--ignore-submodules=none",
        )
        if rc != 0 or dirty:
            unsafe.append(relative)
            continue

        pinned_rc, pinned = _git_output(worktree_path, "rev-parse", ":" + relative)
        head_rc, head = _git_output(child, "rev-parse", "HEAD")
        if pinned_rc != 0 or head_rc != 0 or pinned.strip() != head.strip():
            unsafe.append(relative)
            continue
        rc, containing = _git_output(
            child, "branch", "-r", "--contains", head.strip(),
        )
        if rc != 0 or not containing:
            unsafe.append(relative)
    return parent_changed, unsafe


def _remove_clean_worktree(
    project_dir: Path, worktree_path: Path, *, allow_force: bool,
) -> None:
    """Remove one worktree after confirming no local-only work remains."""
    parent_changed, unsafe_submodules = _local_only_work(worktree_path)
    if parent_changed or unsafe_submodules:
        details = []
        if parent_changed:
            details.append("tracked or untracked files")
        if unsafe_submodules:
            details.append(
                "local-only submodule work: " + ", ".join(unsafe_submodules)
            )
        raise RuntimeError("\n".join([
            f"Failed to remove worktree {worktree_path}:",
            "Preserved " + "; ".join(details) + ".",
            "Save or publish it, then rerun cleanup.",
        ]))

    cmd = ["git", "worktree", "remove"]
    if allow_force:
        cmd.append("--force")
    cmd.append(str(worktree_path))
    result = subprocess.run(cmd, cwd=str(project_dir), capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError("\n".join([
            f"Failed to remove worktree {worktree_path}:",
            str(GitMutationFailure.from_completed(cmd, str(project_dir), result)),
        ]))


def remove_worktree_path(project_dir: Path, worktree_path: Path) -> None:
    """Remove one worktree by path, preserving local-only work."""
    if not worktree_path.exists():
        return
    result = subprocess.run(
        ["git", "worktree", "remove", str(worktree_path)],
        cwd=str(project_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        _remove_clean_worktree(project_dir, worktree_path, allow_force=True)


def remove_worktree(project_dir: Path, branch: str, worktree_base: Path) -> list[str]:
    """Remove a git worktree, preserving any local-only work.

    Normal removal is tried first. Git's refusal is inspected rather than
    blindly force-deleted: ignored build and test output is safe to remove,
    while tracked changes, non-ignored untracked files, and submodule state
    that is not fully reproducible must stop cleanup.
    Always runs git worktree prune after a successful removal.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name of the worktree
        worktree_base: Base directory where worktrees are stored

    Returns:
        List of prune problem descriptions (empty when clean). Removal
        failures still raise.

    Raises:
        RuntimeError: If removal fails.
    """
    branch_slug = branch.replace("/", "-")
    # Locate the real registered path first (git registry is authoritative).
    # Fall back to the branch-derived dir when the branch is not registered.
    worktree_path = _find_worktree_path_by_branch(project_dir, branch)
    if worktree_path is None:
        # Worktree directory = branch (branch already contains the project prefix)
        worktree_path = worktree_base / branch_slug

    remove_worktree_path(project_dir, worktree_path)

    # Always prune (whether remove succeeded or path didn't exist).
    # `git worktree prune` can exit 0 while printing a deletion error to
    # stderr (e.g. Permission denied), so both are inspected; a failure is
    # reported and returned, never silently ignored (B-04).
    warnings: list[str] = []
    prune_cmd = ["git", "worktree", "prune"]
    prune = subprocess.run(
        prune_cmd,
        cwd=str(project_dir),
        capture_output=True,
        text=True,
    )
    if prune.returncode != 0:
        failure = GitMutationFailure.from_completed(
            prune_cmd, str(project_dir), prune,
        )
        log_warn(f"git worktree prune failed:\n{failure}")
        warnings.append(f"git worktree prune failed:\n{failure}")
    elif prune.stderr.strip():
        log_warn(f"git worktree prune reported errors: {prune.stderr.strip()}")
        warnings.append(
            f"git worktree prune reported errors: {prune.stderr.strip()}"
        )
    return warnings


@dataclass
class BranchDeleteResult:
    """Outcome of delete_branch, distinguishing the four real states.

    status:
        "deleted" — the local ref was deleted (soft or forced)
        "absent"  — the local ref does not exist (nothing to do)
        "skipped" — the branch is currently checked out (cannot delete)
        "failed"  — both `git branch -d` and `-D` failed; attempts carry
                    the full mutation diagnostics
    """

    status: str
    attempts: list[GitMutationFailure] = field(default_factory=list)

    @property
    def deleted(self) -> bool:
        return self.status == "deleted"

    @property
    def incomplete(self) -> bool:
        """True when a real deletion failure left the ref behind."""
        return self.status == "failed"


def delete_branch(git_dir: Path, branch: str) -> BranchDeleteResult:
    """Delete a local branch (git branch -d, then -D on failure).

    Distinguishes "absent" (nothing to delete) and "skipped" (the branch
    is currently checked out) from a real "failed" deletion; failures keep
    the exact git diagnostics instead of collapsing into a bare False.

    Args:
        git_dir: Path to git repository root
        branch: Branch name to delete

    Returns:
        BranchDeleteResult with status and, on failure, both attempts'
        diagnostics.
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
        return BranchDeleteResult("skipped")

    # No ref → nothing to delete. Distinguish "ref does not exist" (exit 1,
    # empty stderr under --quiet) from "rev-parse itself failed" (permission,
    # corruption — non-empty stderr). The latter must not be reported as
    # absent (W-02): that would let cleanup succeed on an unknown state.
    exists = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )
    if exists.returncode != 0:
        if exists.stderr.strip():
            return BranchDeleteResult(
                "failed",
                attempts=[GitMutationFailure(
                    command=["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
                    cwd=str(git_dir),
                    exit_code=exists.returncode,
                    stdout=exists.stdout,
                    stderr=exists.stderr,
                )],
            )
        return BranchDeleteResult("absent")

    # Try soft delete (-d)
    d_cmd = ["git", "branch", "-d", branch]
    result = subprocess.run(
        d_cmd,
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return BranchDeleteResult("deleted")

    # Force delete (-D) on failure
    D_cmd = ["git", "branch", "-D", branch]
    force_result = subprocess.run(
        D_cmd,
        cwd=str(git_dir),
        capture_output=True,
        text=True,
    )
    if force_result.returncode == 0:
        return BranchDeleteResult("deleted")

    return BranchDeleteResult(
        "failed",
        attempts=[
            GitMutationFailure.from_completed(d_cmd, str(git_dir), result),
            GitMutationFailure.from_completed(D_cmd, str(git_dir), force_result),
        ],
    )


def clean_worktree(project_dir: Path, branch: str, worktree_base: Path) -> dict:
    """One-stop cleanup for archive.py (equivalent to worktree.sh remove).

    Performs: remove_worktree + delete_branch
    Returns a result dict for callers to report.

    Args:
        project_dir: Path to the project's git root directory
        branch: Branch name of the worktree
        worktree_base: Base directory where worktrees are stored

    Returns:
        {"removed": bool, "branch_deleted": bool, "branch_status": str,
         "errors": list[str]}
        branch_status is the BranchDeleteResult status: deleted / absent /
        skipped / failed.
    """
    errors = []

    # 1. Remove worktree
    removed = False
    try:
        warnings = remove_worktree(project_dir, branch, worktree_base)
        removed = True
        if warnings:
            errors.extend(warnings)
    except Exception as e:
        errors.append(f"Failed to remove worktree: {e}")

    # A failed removal means the worktree may still contain the only copy
    # of local work. Never continue to delete its branch.
    if not removed:
        return {
            "removed": False,
            "branch_deleted": False,
            "branch_status": "skipped",
            "errors": errors,
        }

    # 2. Delete branch — a real failure keeps both attempts' diagnostics
    #    so callers can report the incomplete cleanup truthfully.
    branch_deleted = False
    branch_status = "failed"
    try:
        branch_result = delete_branch(project_dir, branch)
        branch_status = branch_result.status
        branch_deleted = branch_result.deleted
        if branch_result.incomplete:
            detail = "\n".join(str(a) for a in branch_result.attempts)
            errors.append(
                f"Failed to delete branch '{branch}':\n{detail}"
            )
    except Exception as e:
        errors.append(f"Failed to delete branch: {e}")

    return {
        "removed": removed,
        "branch_deleted": branch_deleted,
        "branch_status": branch_status,
        "errors": errors,
    }
