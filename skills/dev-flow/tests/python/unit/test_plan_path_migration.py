#!/usr/bin/env python3
# test_plan_path_migration.py - Tests for Task 3: Plan path migration
#
# Validates that plan.py, commands/plan.py, commands/query.py, and
# commands/sync.py delegate to lib.project for path resolution.

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from plan import find_plan, find_plan_by_name, find_plan_by_issue


# -- Fixtures -------------------------------------------------------------------

@pytest.fixture
def workspace(tmp_path):
    """Create a minimal workspace with standard + ontology project."""
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


# -- plan.py: find_plan delegation ----------------------------------------------

class TestPlanFindPlanDelegation:
    """plan.find_plan() delegates to lib.project.find_plan() and returns str."""

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_str_path_by_name(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan("feat-x", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_str_path_by_issue(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan("42", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_path(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal" / "docs" / "plans" / "refactor-skills.md"
        plan_file.write_text("# Plan")
        result = find_plan("refactor-skills", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan("nonexistent", workspace)


class TestPlanFindPlanByNameDelegation:
    """plan.find_plan_by_name() delegates to lib.project.find_plan()."""

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_name("feat-x", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_deprecated_fallback(self, mock_slug, mock_branch, workspace):
        """Old docs/projects/<name>/plans/ still readable (read-only fallback)."""
        dep_dir = workspace / "docs" / "projects" / "gesp" / "plans"
        dep_dir.mkdir(parents=True)
        plan_file = dep_dir / "old-plan.md"
        plan_file.write_text("# Legacy")
        result = find_plan_by_name("old-plan", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan_by_name("nonexistent", workspace)


class TestPlanFindPlanByIssueDelegation:
    """plan.find_plan_by_issue() delegates to lib.project.find_plan()."""

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_issue(42, workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal" / "docs" / "plans" / "99-fix-bug.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_issue(99, workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan_by_issue(999, workspace)


# -- commands/plan.py: _resolve_plan_dir delegation -----------------------------

class TestResolvePlanDirDelegation:
    """commands/plan._resolve_plan_dir() delegates to lib.project.resolve_plan_dir()."""

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("gesp", workspace)
        assert result == workspace / "projects" / "gesp" / "docs" / "plans"

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_project(self, mock_slug, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("wopal-space-ontology", workspace)
        assert result == workspace / ".wopal" / "docs" / "plans"

    def test_invalid_project_raises(self, workspace):
        from commands.plan import _resolve_plan_dir
        with pytest.raises(ValueError, match="not found"):
            _resolve_plan_dir("nonexistent-project", workspace)

    def test_deprecated_name_raises(self, workspace):
        from commands.plan import _resolve_plan_dir
        with pytest.raises(ValueError, match="deprecated"):
            _resolve_plan_dir("wopal-space", workspace)


# -- commands/query.py: _scan_local_plans delegation ----------------------------

class TestScanLocalPlansDelegation:
    """commands/query._scan_local_plans() uses lib.project._search_dirs()."""

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_scans_new_paths(self, mock_slug, workspace):
        from commands.query import _scan_local_plans

        # Create plan in new path
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feat-x.md"
        plan_file.write_text("- **Status**: planning\n- **Issue**: #42\n")

        results = _scan_local_plans(str(workspace))
        assert len(results) == 1
        assert results[0]["name"] == "feat-x"
        assert results[0]["project"] == "gesp"
        assert results[0]["has_issue"] is True
        assert results[0]["issue_number"] == 42

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_scans_ontology_plans(self, mock_slug, workspace):
        from commands.query import _scan_local_plans

        plan_file = workspace / ".wopal" / "docs" / "plans" / "refactor-skills.md"
        plan_file.write_text("- **Status**: planning\n")

        results = _scan_local_plans(str(workspace))
        assert len(results) == 1
        assert results[0]["name"] == "refactor-skills"
        assert results[0]["project"] == "wopal-space-ontology"

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_deprecated_fallback_read(self, mock_slug, mock_branch, workspace):
        """DEPRECATED legacy read-only compatibility: old paths still readable."""
        from commands.query import _scan_local_plans

        dep_dir = workspace / "docs" / "projects" / "gesp" / "plans"
        dep_dir.mkdir(parents=True)
        plan_file = dep_dir / "old-plan.md"
        plan_file.write_text("- **Status**: done\n")

        results = _scan_local_plans(str(workspace))
        names = [r["name"] for r in results]
        assert "old-plan" in names

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_empty_workspace(self, mock_slug, workspace):
        from commands.query import _scan_local_plans
        results = _scan_local_plans(str(workspace))
        assert results == []

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_excludes_done_dirs(self, mock_slug, workspace):
        """Plans in done/ subdirectories are excluded from active listing."""
        from commands.query import _scan_local_plans

        done_dir = workspace / "projects" / "gesp" / "docs" / "plans" / "done"
        done_dir.mkdir(parents=True)
        done_file = done_dir / "old-done.md"
        done_file.write_text("- **Status**: done\n")

        active_file = workspace / "projects" / "gesp" / "docs" / "plans" / "active.md"
        active_file.write_text("- **Status**: planning\n")

        results = _scan_local_plans(str(workspace))
        names = [r["name"] for r in results]
        assert "active" in names
        assert "old-done" not in names


# -- commands/sync.py: find_plan delegation -------------------------------------

class TestSyncFindPlanDelegation:
    """commands/sync.find_plan() delegates to lib.project.find_plan()."""

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_issue_number(self, mock_slug, mock_branch, workspace):
        from commands.sync import find_plan

        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feat-x.md"
        plan_file.write_text("# Plan")

        # find_plan needs workspace_root; mock find_workspace_root
        with patch("commands.sync.find_workspace_root", return_value=workspace):
            result = find_plan("42")
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_name(self, mock_slug, mock_branch, workspace):
        from commands.sync import find_plan

        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "feat-x.md"
        plan_file.write_text("# Plan")

        with patch("commands.sync.find_workspace_root", return_value=workspace):
            result = find_plan("feat-x")
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_empty_input_raises(self, workspace):
        from commands.sync import find_plan
        with pytest.raises(ValueError, match="input required"):
            find_plan("")

    def test_not_found_raises(self, workspace):
        from commands.sync import find_plan
        with patch("commands.sync.find_workspace_root", return_value=workspace):
            with pytest.raises(FileNotFoundError, match="No plan found"):
                find_plan("nonexistent")


# -- Write path enforcement: new paths only ------------------------------------

class TestWritePathEnforcement:
    """Verify that plan creation writes to new paths only."""

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_plan_dir_standard_uses_new_path(self, mock_slug, workspace):
        """_resolve_plan_dir for standard project → projects/<name>/docs/plans/."""
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("gesp", workspace)
        assert str(result).startswith(str(workspace / "projects" / "gesp" / "docs"))
        # Must NOT be in deprecated docs/projects/<name>/plans
        assert "docs/projects" not in str(result) or str(result).startswith(str(workspace / "projects"))

    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_plan_dir_ontology_uses_new_path(self, mock_slug, workspace):
        """_resolve_plan_dir for ontology → .wopal/docs/plans/."""
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("wopal-space-ontology", workspace)
        assert str(result).startswith(str(workspace / ".wopal" / "docs"))
