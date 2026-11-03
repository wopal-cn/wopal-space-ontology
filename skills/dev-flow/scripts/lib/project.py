#!/usr/bin/env python3
# project.py - Shared project context and Plan location resolver
#
# All Plan files live under .wopal-space/plans/<project>/ in the space repo.
# resolve_plan_location() walks up from a Plan file to find its owning repo.

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from lib.git import get_current_branch, get_remote_url


class ProjectType(Enum):
    STANDARD = "standard"


@dataclass
class PlanLocation:
    path: Path
    repo_root: Path
    repo_relative_path: str
    github_repo: str | None
    branch: str
    is_archived: bool


def _parse_github_url(url: str) -> str | None:
    match = re.search(r'github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$', url)
    return match.group(1) if match else None


def get_repo_slug(path: Path) -> str | None:
    url = get_remote_url(str(path))
    if not url:
        return None
    return _parse_github_url(url)


def get_default_branch(project_path: Path) -> str:
    """Resolve the default branch of a repo using LOCAL git refs only.

    The default branch name is always derivable locally (origin/HEAD symref,
    remote refs, or init.defaultBranch). A remote `git ls-remote` round-trip
    is deliberately avoided: it performs network I/O plus credential lookups
    that hang under a sandbox (flow.sh verify/archive timeout root cause).

    Order:
      1. origin/HEAD symbolic-ref (authoritative default-branch marker)
      2. rev-parse --abbrev-ref origin/HEAD (remote ref fallback)
      3. init.defaultBranch config
      4. "main" (universal modern default)
    """
    # 1. origin/HEAD symref — fast, local, authoritative
    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            cwd=str(project_path),
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip().split("/")[-1]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 2. rev-parse --abbrev-ref origin/HEAD — local remote ref
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "origin/HEAD"],
            cwd=str(project_path),
            capture_output=True, text=True, check=True,
        )
        if result.stdout.strip():
            return result.stdout.strip().split("/")[-1]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 3. init.defaultBranch config
    try:
        result = subprocess.run(
            ["git", "config", "--get", "init.defaultBranch"],
            cwd=str(project_path),
            capture_output=True, text=True, check=True,
        )
        if result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 4. Universal default
    return "main"


def resolve_plan_dir(project_name: str, workspace_root: Path) -> Path:
    return workspace_root / ".wopal-space" / "plans" / project_name


def search_plan_dirs(workspace_root: Path) -> list[Path]:
    dirs: list[Path] = []

    plans_root = workspace_root / ".wopal-space" / "plans"
    if plans_root.is_dir():
        for project_dir in sorted(plans_root.iterdir()):
            # Only real project directories participate in dev-flow lookup.
            # Reserved directories (leading underscore) are not Plan stores.
            if project_dir.is_dir() and not project_dir.name.startswith("_"):
                dirs.append(project_dir)
                done = project_dir / "done"
                if done.is_dir():
                    dirs.append(done)

    return dirs


class AmbiguousPlanError(FileNotFoundError):
    """Several active Plans match one reference; callers must not guess."""


_ISSUE_FIELD = re.compile(r"^-\s*\*\*Issue\*\*:[ \t]*(.*)$", re.MULTILINE)
_ISSUE_NUMBER = re.compile(r"#(\d+)")


def _plan_issue(plan_file: Path) -> int | None:
    """Read a Plan's single Issue number from metadata.

    Multi-Issue Plan metadata is intentionally not interpreted. Current Plans
    have a 0..1 Issue contract; archived historical documents are left as-is
    rather than kept alive through a compatibility resolver.
    """
    try:
        head = plan_file.read_text(encoding="utf-8", errors="ignore")[:4000]
    except OSError:
        return None
    match = _ISSUE_FIELD.search(head)
    if not match:
        return None
    value = match.group(1).strip()
    single = re.fullmatch(r"#(\d+)", value)
    return int(single.group(1)) if single else None


def find_plan(input_ref: str, workspace_root: Path) -> PlanLocation:
    workspace_root = Path(workspace_root).resolve()
    dirs = search_plan_dirs(workspace_root)

    if re.match(r'^\d+$', input_ref):
        prefix = f"{input_ref}-"
        for d in dirs:
            for f in sorted(d.iterdir()):
                if f.is_file() and f.name.startswith(prefix) and f.suffix == ".md":
                    return resolve_plan_location(f, workspace_root)

        # Fallback: a Plan can be created without an Issue and get one linked
        # later, so its file name never gains the numeric prefix. Match the
        # Issue metadata field instead. Plans are never renamed to carry the
        # number: the feature branch is derived from the Plan name.
        wanted = int(input_ref)
        matches = [
            f
            for d in dirs
            for f in sorted(d.glob("*.md"))
            if f.is_file() and wanted == _plan_issue(f)
        ]
        if matches:
            active = [f for f in matches if f.parent.name != "done"]
            chosen = active or matches
            if len(chosen) > 1:
                listed = "\n  ".join(str(p) for p in chosen)
                print(
                    f"[ERROR] Issue #{input_ref} matches multiple Plans; "
                    f"use the Plan name instead:\n  {listed}",
                    file=sys.stderr,
                )
                raise AmbiguousPlanError(f"Ambiguous plan for: {input_ref}")
            return resolve_plan_location(chosen[0], workspace_root)
    else:
        target = f"{input_ref}.md"
        for d in dirs:
            candidate = d / target
            if candidate.is_file():
                return resolve_plan_location(candidate, workspace_root)

    raise FileNotFoundError(f"No plan found for: {input_ref}")


def resolve_plan_location(
    plan_path: Path, workspace_root: Path,
) -> PlanLocation:
    plan_path = Path(plan_path).resolve()
    workspace_root = Path(workspace_root).resolve()

    repo_root = plan_path.parent
    while repo_root != repo_root.parent:
        if (repo_root / ".git").exists():
            break
        repo_root = repo_root.parent
    else:
        repo_root = workspace_root

    repo_relative_path = str(plan_path.relative_to(repo_root))
    is_archived = "/done/" in str(plan_path) and "/plans/" in str(plan_path)

    github_repo = get_repo_slug(repo_root)
    dot_git = repo_root / ".git"
    if dot_git.is_file():
        branch = get_current_branch(str(repo_root)) or "main"
    else:
        branch = get_default_branch(repo_root)

    return PlanLocation(
        path=plan_path,
        repo_root=repo_root,
        repo_relative_path=repo_relative_path,
        github_repo=github_repo,
        branch=branch,
        is_archived=is_archived,
    )


def build_plan_blob_url(plan_location: PlanLocation, branch: str | None = None) -> str:
    if plan_location.github_repo is None:
        return ""
    ref = branch if branch else plan_location.branch
    return (
        f"https://github.com/{plan_location.github_repo}"
        f"/blob/{ref}/{plan_location.repo_relative_path}"
    )
