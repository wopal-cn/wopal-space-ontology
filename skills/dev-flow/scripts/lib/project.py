#!/usr/bin/env python3
# project.py - Shared project context and Plan location resolver
#
# All Plan files live under .wopal-space/plans/<project>/ in the space repo.
# resolve_plan_location() walks up from a Plan file to find its owning repo.

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from lib.git import get_current_branch, get_remote_url


class ProjectType(Enum):
    STANDARD = "standard"
    ONTOLOGY_WORKTREE = "ontology-worktree"


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


def _get_repo_slug(path: Path) -> str | None:
    url = get_remote_url(str(path))
    if not url:
        return None
    return _parse_github_url(url)


def _get_default_branch(project_path: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--symref", "origin", "HEAD"],
            cwd=str(project_path),
            capture_output=True, text=True, check=True,
        )
        first_line = result.stdout.strip().split("\n")[0]
        if first_line.startswith("ref: refs/heads/"):
            return first_line.split("/")[-1].split("\t")[0]
    except subprocess.CalledProcessError:
        pass

    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            cwd=str(project_path),
            capture_output=True, text=True, check=True,
        )
        return result.stdout.strip().split("/")[-1]
    except subprocess.CalledProcessError:
        pass

    return "main"


def resolve_plan_dir(project_name: str, workspace_root: Path) -> Path:
    return workspace_root / ".wopal-space" / "plans" / project_name


def _search_dirs(workspace_root: Path) -> list[Path]:
    dirs: list[Path] = []

    plans_root = workspace_root / ".wopal-space" / "plans"
    if plans_root.is_dir():
        for project_dir in sorted(plans_root.iterdir()):
            if project_dir.is_dir():
                dirs.append(project_dir)
                done = project_dir / "done"
                if done.is_dir():
                    dirs.append(done)

    return dirs


def find_plan(input_ref: str, workspace_root: Path) -> PlanLocation:
    workspace_root = Path(workspace_root).resolve()
    dirs = _search_dirs(workspace_root)

    if re.match(r'^\d+$', input_ref):
        prefix = f"{input_ref}-"
        for d in dirs:
            for f in sorted(d.iterdir()):
                if f.is_file() and f.name.startswith(prefix) and f.suffix == ".md":
                    return resolve_plan_location(f, workspace_root)
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

    github_repo = _get_repo_slug(repo_root)
    dot_git = repo_root / ".git"
    if dot_git.is_file():
        branch = get_current_branch(str(repo_root)) or "main"
    else:
        branch = _get_default_branch(repo_root)

    return PlanLocation(
        path=plan_path,
        repo_root=repo_root,
        repo_relative_path=repo_relative_path,
        github_repo=github_repo,
        branch=branch,
        is_archived=is_archived,
    )


def build_plan_blob_url(plan_location: PlanLocation) -> str:
    if plan_location.github_repo is None:
        return ""
    return (
        f"https://github.com/{plan_location.github_repo}"
        f"/blob/{plan_location.branch}/{plan_location.repo_relative_path}"
    )
