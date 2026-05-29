#!/usr/bin/env python3
# test_project_resolver.py - TDD tests for lib.project resolver module

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.project import (
    ProjectType,
    ProjectContext,
    PlanLocation,
    resolve_project_context,
    resolve_plan_dir,
    find_plan,
    resolve_plan_location,
    build_plan_blob_url,
)


@pytest.fixture
def workspace(tmp_path):
    ws = tmp_path / "workspace"
    wopal = ws / ".wopal"
    wopal.mkdir(parents=True)
    (wopal / ".git").write_text("gitdir: /fake/repo/.git/worktrees/-wopal\n")
    (wopal / "docs" / "plans").mkdir(parents=True)

    gesp = ws / "projects" / "gesp"
    gesp.mkdir(parents=True)
    (gesp / ".git").mkdir()
    (gesp / "docs" / "plans").mkdir(parents=True)

    return ws


def _slug_by_path(path):
    p = str(path)
    if p.endswith(".wopal") or (".wopal" in p and "projects" not in p):
        return "wopal-cn/wopal-space-ontology"
    if "gesp" in p:
        return "sampx/gesp"
    return None


# -- resolve_project_context ---------------------------------------------------

class TestResolveProjectContext:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, mock_branch, workspace):
        ctx = resolve_project_context("gesp", workspace)
        assert ctx.name == "gesp"
        assert ctx.type == ProjectType.STANDARD
        assert ctx.project_path == workspace / "projects" / "gesp"
        assert ctx.docs_path == workspace / "projects" / "gesp" / "docs"
        assert ctx.repo_slug == "sampx/gesp"
        assert ctx.default_branch == "main"
        assert ctx.code_repo_path == (workspace / "projects" / "gesp").resolve()
        assert ctx.docs_repo_path == ctx.code_repo_path

    @patch("lib.project.get_current_branch", return_value="space/main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_worktree(self, mock_slug, mock_branch, workspace):
        ctx = resolve_project_context("wopal-space-ontology", workspace)
        assert ctx.name == "wopal-space-ontology"
        assert ctx.type == ProjectType.ONTOLOGY_WORKTREE
        assert ctx.project_path == workspace / ".wopal"
        assert ctx.docs_path == workspace / ".wopal" / "docs"
        assert ctx.repo_slug == "wopal-cn/wopal-space-ontology"
        assert ctx.default_branch == "space/main"
        assert ctx.code_repo_path == Path("/fake/repo")
        assert ctx.docs_repo_path == ctx.code_repo_path

    def test_empty_name_raises(self, workspace):
        with pytest.raises(ValueError, match="required"):
            resolve_project_context("", workspace)
        with pytest.raises(ValueError, match="required"):
            resolve_project_context("   ", workspace)

    def test_deprecated_wopal_space_raises(self, workspace):
        with pytest.raises(ValueError, match="deprecated"):
            resolve_project_context("wopal-space", workspace)


# -- resolve_plan_dir -----------------------------------------------------------

class TestResolvePlanDir:
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard(self, mock_slug, workspace):
        result = resolve_plan_dir("gesp", workspace)
        assert result == workspace / "projects" / "gesp" / "docs" / "plans"

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology(self, mock_slug, workspace):
        result = resolve_plan_dir("wopal-space-ontology", workspace)
        assert result == workspace / ".wopal" / "docs" / "plans"


# -- find_plan ------------------------------------------------------------------

class TestFindPlan:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_name_new_path(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feature-dev-flow-resolver.md"
        plan_file.write_text("# Plan")
        result = find_plan("feature-dev-flow-resolver", workspace)
        assert isinstance(result, PlanLocation)
        assert result.path == plan_file.resolve()
        assert result.is_archived is False

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_name_deprecated_fallback(self, mock_slug, mock_branch, workspace):
        dep_dir = workspace / "docs" / "projects" / "gesp" / "plans"
        dep_dir.mkdir(parents=True)
        plan_file = dep_dir / "old-plan.md"
        plan_file.write_text("# Old Plan")
        result = find_plan("old-plan", workspace)
        assert isinstance(result, PlanLocation)
        assert result.path == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_issue_number(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-dev-flow-resolver.md"
        plan_file.write_text("# Plan 42")
        result = find_plan("42", workspace)
        assert isinstance(result, PlanLocation)
        assert result.path == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan("nonexistent-plan", workspace)


# -- resolve_plan_location ------------------------------------------------------

class TestResolvePlanLocation:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", return_value="sampx/gesp")
    def test_active_plan(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feature-resolver.md"
        plan_file.write_text("# Plan")
        result = resolve_plan_location(plan_file, workspace)
        assert result.path == plan_file.resolve()
        assert result.repo_root == (workspace / "projects" / "gesp").resolve()
        assert result.repo_relative_path == "docs/plans/feature-resolver.md"
        assert result.github_repo == "sampx/gesp"
        assert result.branch == "main"
        assert result.is_archived is False

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", return_value="sampx/gesp")
    def test_archived_plan(self, mock_slug, mock_branch, workspace):
        done_dir = workspace / "projects" / "gesp" / "docs" / "plans" / "done"
        done_dir.mkdir(parents=True)
        plan_file = done_dir / "feature-old.md"
        plan_file.write_text("# Archived")
        result = resolve_plan_location(plan_file, workspace)
        assert result.is_archived is True


# -- build_plan_blob_url --------------------------------------------------------

class TestBuildPlanBlobUrl:
    def test_with_repo(self):
        loc = PlanLocation(
            path=Path("/repo/docs/plans/test.md"),
            repo_root=Path("/repo"),
            repo_relative_path="docs/plans/test.md",
            github_repo="sampx/gesp",
            branch="main",
            is_archived=False,
        )
        assert build_plan_blob_url(loc) == "https://github.com/sampx/gesp/blob/main/docs/plans/test.md"

    def test_no_repo(self):
        loc = PlanLocation(
            path=Path("/repo/docs/plans/test.md"),
            repo_root=Path("/repo"),
            repo_relative_path="docs/plans/test.md",
            github_repo=None,
            branch="main",
            is_archived=False,
        )
        assert build_plan_blob_url(loc) == ""
