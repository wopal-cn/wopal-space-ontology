#!/usr/bin/env python3
# test_plan_path_migration.py - Tests for unified Plan path under .wopal-space/plans/

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from plan import find_plan, find_plan_by_name, find_plan_by_issue


@pytest.fixture
def workspace(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir(parents=True)
    (ws / ".git").mkdir(parents=True)
    (ws / ".wopal-space" / "plans" / "gesp").mkdir(parents=True)
    (ws / ".wopal-space" / "plans" / "space-ontology").mkdir(parents=True)
    return ws


def _slug_by_path(path):
    return "sampx/wopal-space"


# -- plan.py: find_plan delegation ----------------------------------------------

class TestPlanFindPlanDelegation:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_str_path_by_name(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan("feat-x", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_str_path_by_issue(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan("42", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_path(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "space-ontology" / "refactor-skills.md"
        plan_file.write_text("# Plan")
        result = find_plan("refactor-skills", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan("nonexistent", workspace)


class TestPlanFindPlanByNameDelegation:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_name("feat-x", workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan_by_name("nonexistent", workspace)


class TestPlanFindPlanByIssueDelegation:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_standard_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feat-x.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_issue(42, workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_project(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "space-ontology" / "99-fix-bug.md"
        plan_file.write_text("# Plan")
        result = find_plan_by_issue(99, workspace)
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    def test_not_found_raises(self, workspace):
        with pytest.raises(FileNotFoundError, match="No plan found"):
            find_plan_by_issue(999, workspace)


# -- commands/plan.py: _resolve_plan_dir delegation -----------------------------

class TestResolvePlanDirDelegation:
    def test_standard_project(self, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("gesp", workspace)
        assert result == workspace / ".wopal-space" / "plans" / "gesp"

    def test_ontology_project(self, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("space-ontology", workspace)
        assert result == workspace / ".wopal-space" / "plans" / "space-ontology"


# -- commands/plan.py: _scan_local_plans delegation ----------------------------

class TestScanLocalPlansDelegation:
    def test_scans_new_paths(self, workspace):
        from commands.plan import _scan_local_plans

        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "feat-x.md"
        plan_file.write_text("- **Status**: planning\n- **Issue**: #42\n")

        results = _scan_local_plans(str(workspace))
        assert len(results) == 1
        assert results[0]["name"] == "feat-x"
        assert results[0]["project"] == "gesp"
        assert results[0]["has_issue"] is True
        assert results[0]["issue_number"] == 42

    def test_scans_ontology_plans(self, workspace):
        from commands.plan import _scan_local_plans

        plan_file = workspace / ".wopal-space" / "plans" / "space-ontology" / "refactor-skills.md"
        plan_file.write_text("- **Status**: planning\n")

        results = _scan_local_plans(str(workspace))
        assert len(results) == 1
        assert results[0]["name"] == "refactor-skills"
        assert results[0]["project"] == "space-ontology"

    def test_empty_workspace(self, workspace):
        from commands.plan import _scan_local_plans
        results = _scan_local_plans(str(workspace))
        assert results == []

    def test_excludes_done_dirs(self, workspace):
        from commands.plan import _scan_local_plans

        done_dir = workspace / ".wopal-space" / "plans" / "gesp" / "done"
        done_dir.mkdir(parents=True)
        done_file = done_dir / "old-done.md"
        done_file.write_text("- **Status**: done\n")

        active_file = workspace / ".wopal-space" / "plans" / "gesp" / "active.md"
        active_file.write_text("- **Status**: planning\n")

        results = _scan_local_plans(str(workspace))
        names = [r["name"] for r in results]
        assert "active" in names
        assert "old-done" not in names


# -- commands/sync.py: find_plan delegation -------------------------------------

class TestSyncFindPlanDelegation:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_issue_number(self, mock_slug, mock_branch, workspace):
        from commands.sync import find_plan

        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feat-x.md"
        plan_file.write_text("# Plan")

        with patch("commands.sync.find_workspace_root", return_value=workspace):
            result = find_plan("42")
        assert isinstance(result, str)
        assert Path(result) == plan_file.resolve()

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_by_name(self, mock_slug, mock_branch, workspace):
        from commands.sync import find_plan

        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "feat-x.md"
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
    def test_plan_dir_standard_uses_new_path(self, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("gesp", workspace)
        assert str(result).startswith(str(workspace / ".wopal-space" / "plans"))

    def test_plan_dir_ontology_uses_new_path(self, workspace):
        from commands.plan import _resolve_plan_dir
        result = _resolve_plan_dir("space-ontology", workspace)
        assert str(result).startswith(str(workspace / ".wopal-space" / "plans"))
