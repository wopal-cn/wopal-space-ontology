#!/usr/bin/env python3
# project.py - Shared project context and Plan location resolver
#
# Canonical source for project path model and Plan location resolution.
# All dev-flow commands should route through this module instead of
# hardcoding path patterns.

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from lib.git import get_current_branch, get_remote_url
from lib.workspace import get_ontology_main_repo


class ProjectType(Enum):
    STANDARD = "standard"
    ONTOLOGY_WORKTREE = "ontology-worktree"


@dataclass
class ProjectContext:
    name: str
    type: ProjectType
    project_path: Path
    docs_path: Path
    docs_repo_path: Path
    code_repo_path: Path
    repo_slug: str | None
    default_branch: str


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


def _is_ontology_project(project_name: str, workspace_root: Path) -> bool:
    dot_git = workspace_root / ".wopal" / ".git"
    if not dot_git.exists() or not dot_git.is_file():
        return False
    slug = _get_repo_slug(workspace_root / ".wopal")
    if slug is None:
        return False
    return slug.split("/")[-1] == project_name


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


def _resolve_code_repo_path(
    project_type: ProjectType, project_path: Path, workspace_root: Path,
) -> Path:
    if project_type == ProjectType.STANDARD:
        return project_path.resolve()

    main_repo = get_ontology_main_repo(workspace_root)
    return main_repo if main_repo else project_path.resolve()


def resolve_project_context(
    project_name: str, workspace_root: Path,
) -> ProjectContext:
    if not project_name or not project_name.strip():
        raise ValueError("Project name is required (empty or missing)")

    if project_name == "wopal-space":
        raise ValueError(
            '"wopal-space" is deprecated. '
            "Cross-project work should be split into per-project Plans."
        )

    workspace_root = Path(workspace_root).resolve()

    if _is_ontology_project(project_name, workspace_root):
        ptype = ProjectType.ONTOLOGY_WORKTREE
        project_path = workspace_root / ".wopal"
        docs_path = workspace_root / ".wopal" / "docs"
    else:
        ptype = ProjectType.STANDARD
        project_path = workspace_root / "projects" / project_name
        docs_path = project_path / "docs"

    code_repo_path = _resolve_code_repo_path(ptype, project_path, workspace_root)
    repo_slug = _get_repo_slug(project_path)

    if ptype == ProjectType.ONTOLOGY_WORKTREE:
        default_branch = get_current_branch(str(project_path)) or "main"
    else:
        default_branch = _get_default_branch(project_path)

    return ProjectContext(
        name=project_name,
        type=ptype,
        project_path=project_path,
        docs_path=docs_path,
        docs_repo_path=code_repo_path,
        code_repo_path=code_repo_path,
        repo_slug=repo_slug,
        default_branch=default_branch,
    )


def resolve_plan_dir(project_name: str, workspace_root: Path) -> Path:
    workspace_root = Path(workspace_root).resolve()
    if _is_ontology_project(project_name, workspace_root):
        return workspace_root / ".wopal" / "docs" / "plans"
    return workspace_root / "projects" / project_name / "docs" / "plans"


def _search_dirs(workspace_root: Path) -> list[Path]:
    dirs: list[Path] = []

    projects_dir = workspace_root / "projects"
    if projects_dir.is_dir():
        for project_dir in sorted(projects_dir.iterdir()):
            plan_dir = project_dir / "docs" / "plans"
            if plan_dir.is_dir():
                dirs.append(plan_dir)
                done = plan_dir / "done"
                if done.is_dir():
                    dirs.append(done)

    ontology_plans = workspace_root / ".wopal" / "docs" / "plans"
    if ontology_plans.is_dir():
        dirs.append(ontology_plans)
        done = ontology_plans / "done"
        if done.is_dir():
            dirs.append(done)

    # DEPRECATED: legacy read-only compatibility — remove after all Plans migrated
    legacy_base = workspace_root / "docs" / "projects"
    if legacy_base.is_dir():
        for legacy_project in sorted(legacy_base.iterdir()):
            legacy_plans = legacy_project / "plans"
            if legacy_plans.is_dir():
                dirs.append(legacy_plans)
                done = legacy_plans / "done"
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
    is_archived = "/plans/done/" in str(plan_path)

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
