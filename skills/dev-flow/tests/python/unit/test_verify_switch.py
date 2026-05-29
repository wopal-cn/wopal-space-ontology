#!/usr/bin/env python3
# test_verify_switch.py - TDD tests for verify_switch using WorktreeContext

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.worktree import WorktreeContext


# -- Fixtures -----------------------------------------------------------------

PLAN_STANDARD_DIRECT = """\
- **Status**: executing
- **Type**: feature
- **Target Project**: gesp
- **Project Type**: standard
- **Issue**: #42
- **Worktree**:
  - enabled: true
  - project_type: standard
  - branch: feature/test-1-slug
  - path: .worktrees/gesp-issue-1-slug
  - repo_root: /workspace/projects/gesp
  - base_branch: main
  - merge_target: main
  - verify_mode: direct
  - cleanup_policy: archive
"""

PLAN_ONTOLOGY_SWITCH = """\
- **Status**: executing
- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Type**: ontology-worktree
- **Issue**: #10
- **Worktree**:
  - enabled: true
  - project_type: ontology-worktree
  - branch: issue-10-slug
  - path: .worktrees/ontology-issue-10-slug
  - repo_root: /home/.wopal/ontologies/wopal-space-ontology
  - base_branch: space/main
  - merge_target: space/main
  - verify_mode: switch-runtime
  - cleanup_policy: archive
"""

PLAN_LEGACY = """\
- **Status**: executing
- **Type**: feature
- **Target Project**: gesp
- **Issue**: #42
- **Worktree**: feature/test-1-slug | .worktrees/gesp-feature-test-1-slug
"""

PLAN_NO_WORKTREE = """\
- **Status**: planning
- **Type**: feature
- **Target Project**: gesp
- **Issue**: #42
"""


def _write_plan(tmp_path, content: str, name: str = "42-feature-dev-flow-test.md") -> Path:
    """Write a Plan file with given content and return its path."""
    plan_dir = tmp_path / "plans"
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plan_dir / name
    plan_file.write_text(content)
    return plan_file


def _make_ontology_ctx():
    """Create an ontology-worktree WorktreeContext for testing."""
    return WorktreeContext(
        enabled=True,
        project_type="ontology-worktree",
        branch="issue-10-slug",
        path=Path(".worktrees/ontology-issue-10-slug"),
        repo_root=Path("/home/.wopal/ontologies/wopal-space-ontology"),
        base_branch="space/main",
        merge_target="space/main",
        verify_mode="switch-runtime",
        cleanup_policy="archive",
    )


def _make_standard_ctx():
    """Create a standard project WorktreeContext for testing."""
    return WorktreeContext(
        enabled=True,
        project_type="standard",
        branch="feature/test-1-slug",
        path=Path(".worktrees/gesp-issue-1-slug"),
        repo_root=Path("/workspace/projects/gesp"),
        base_branch="main",
        merge_target="main",
        verify_mode="direct",
        cleanup_policy="archive",
    )


# -- Test: switch-runtime mode (ontology) Phase 1 ----------------------------

class TestSwitchRuntimePhase1:
    """Test verify-switch Phase 1 for ontology-worktree (verify_mode=switch-runtime)."""

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_current_branch", return_value="space/main")
    @patch("commands.verify_switch.set_plan_field", return_value=True)
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_removes_worktree_and_checkouts_feature(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_set_field, mock_get_branch, mock_subprocess,
        tmp_path
    ):
        """Phase 1: remove issue worktree, checkout .wopal/ to feature branch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        # subprocess.run is used for both worktree remove and git checkout
        mock_subprocess.return_value = MagicMock(returncode=0)

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        # Create the worktree path so _remove_worktree actually calls subprocess
        wt_dir = ws_root / ".worktrees" / "ontology-issue-10-slug"
        wt_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("10", merge=False)

        assert result is True

        # Verify subprocess was called for worktree remove and git checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 2

        # First call: worktree remove
        worktree_remove_call = calls[0]
        assert worktree_remove_call[0][0][0] == "git"
        assert "worktree" in worktree_remove_call[0][0]
        assert "remove" in worktree_remove_call[0][0]

        # Second call: git checkout
        checkout_call = calls[1]
        assert checkout_call[0][0] == ["git", "checkout", "issue-10-slug"]

        # Verify main branch was recorded
        mock_set_field.assert_called_once_with(
            str(plan_path), "MainBranch", "space/main"
        )

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_current_branch", return_value="space/main")
    @patch("commands.verify_switch.set_plan_field", return_value=True)
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_uses_repo_root_for_worktree_removal(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_set_field, mock_get_branch, mock_subprocess,
        tmp_path
    ):
        """Phase 1: uses wt_ctx.repo_root as cwd for worktree remove, not get_ontology_main_repo()."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        mock_subprocess.return_value = MagicMock(returncode=0)

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        # Create the worktree path so _remove_worktree actually calls subprocess
        wt_dir = ws_root / ".worktrees" / "ontology-issue-10-slug"
        wt_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("10", merge=False)
        assert result is True

        # The worktree remove call should use repo_root as cwd
        first_call = mock_subprocess.call_args_list[0]
        assert "worktree" in first_call[0][0]
        # cwd should be repo_root from WorktreeContext
        assert first_call[1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_current_branch", return_value="space/main")
    @patch("commands.verify_switch.set_plan_field", return_value=True)
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_set_field, mock_get_branch, mock_subprocess,
        tmp_path
    ):
        """Phase 1: returns False when git checkout fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        # Only checkout subprocess runs (worktree path doesn't exist)
        mock_subprocess.return_value = MagicMock(returncode=1, stderr="checkout error")

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("10", merge=False)
        assert result is False


# -- Test: switch-runtime mode (ontology) Phase 2 ----------------------------

class TestSwitchRuntimePhase2:
    """Test verify-switch Phase 2 for ontology-worktree (verify_mode=switch-runtime)."""

    @patch("commands.verify_switch._run_verify", return_value=True)
    @patch("commands.verify_switch.merge_branch", return_value=(True, []))
    @patch("commands.verify_switch.get_plan_field", return_value="space/main")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_merges_feature_into_base_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_merge, mock_run_verify,
        tmp_path
    ):
        """Phase 2: merges feature branch into base_branch, then runs verify --confirm."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("10", merge=True)
        assert result is True

        # Verify merge was called with correct branches
        mock_merge.assert_called_once()
        merge_args = mock_merge.call_args
        # target should be merge_target (space/main), not hardcoded
        assert merge_args[1].get("target") == "space/main" or \
               (len(merge_args[0]) >= 3 and merge_args[0][2] == "space/main")

    @patch("commands.verify_switch._run_verify", return_value=True)
    @patch("commands.verify_switch.merge_branch", return_value=(True, []))
    @patch("commands.verify_switch.get_plan_field", return_value="space/main")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_uses_wopal_dir_for_merge(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_merge, mock_run_verify,
        tmp_path
    ):
        """Phase 2: merge runs in .wopal/ directory."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("10", merge=True)
        assert result is True

        # Verify merge was called with wopal_dir
        merge_args = mock_merge.call_args
        assert str(wopal_dir) in merge_args[0][0] or str(wopal_dir) == merge_args[0][0]

    @patch("commands.verify_switch.merge_branch", return_value=(False, ["file1.py"]))
    @patch("commands.verify_switch.get_plan_field", return_value="space/main")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_merge_conflict_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_merge,
        tmp_path
    ):
        """Phase 2: returns False when merge has conflicts."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY_SWITCH)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        result = run_verify_switch("10", merge=True)
        assert result is False


# -- Test: direct mode (standard) Phase 1 ------------------------------------

class TestDirectModePhase1:
    """Test verify-switch Phase 1 for standard projects (verify_mode=direct)."""

    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_direct_mode_returns_true_no_switch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        tmp_path
    ):
        """Phase 1 direct: code is already in worktree, no runtime switch needed."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD_DIRECT)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        result = run_verify_switch("42", merge=False)
        assert result is True

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_direct_mode_does_not_call_git_operations(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_subprocess,
        tmp_path
    ):
        """Phase 1 direct: should not run any git commands."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD_DIRECT)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        result = run_verify_switch("42", merge=False)
        assert result is True

        # No git subprocess calls for direct mode
        mock_subprocess.assert_not_called()


# -- Test: direct mode (standard) Phase 2 ------------------------------------

class TestDirectModePhase2:
    """Test verify-switch Phase 2 for standard projects (verify_mode=direct)."""

    @patch("commands.verify_switch._run_verify", return_value=True)
    @patch("commands.verify_switch.merge_branch", return_value=(True, []))
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_direct_phase2_merges_worktree_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_merge, mock_run_verify,
        tmp_path
    ):
        """Phase 2 direct: merge worktree branch to main, then verify --confirm."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD_DIRECT)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        result = run_verify_switch("42", merge=True)
        assert result is True

        # Verify merge was called with correct target (base_branch)
        mock_merge.assert_called_once()

    @patch("commands.verify_switch._run_verify", return_value=True)
    @patch("commands.verify_switch.merge_branch", return_value=(True, []))
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_direct_phase2_uses_project_repo(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_merge, mock_run_verify,
        tmp_path
    ):
        """Phase 2 direct: merge runs in project repo_root, not .wopal/."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD_DIRECT)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        result = run_verify_switch("42", merge=True)
        assert result is True

        # Merge should use repo_root for standard projects
        merge_args = mock_merge.call_args
        assert str(Path("/workspace/projects/gesp")) == merge_args[0][0]


# -- Test: legacy fallback ---------------------------------------------------

class TestLegacyFallback:
    """Test that legacy Plan format still works via get_plan_worktree fallback."""

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_current_branch", return_value="space/main")
    @patch("commands.verify_switch.set_plan_field", return_value=True)
    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.parse_worktree_context", return_value=None)
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_format_uses_get_plan_worktree(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_wt, mock_set_field, mock_get_branch, mock_subprocess,
        tmp_path
    ):
        """When WorktreeContext is None, falls back to legacy get_plan_worktree()."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None  # No WorktreeContext
        mock_get_wt.return_value = {
            "branch": "feature/test-1-slug",
            "path": ".worktrees/gesp-feature-test-1-slug",
        }

        mock_subprocess.return_value = MagicMock(returncode=0)

        wopal_dir = ws_root / ".wopal"
        wopal_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("42", merge=False)
        assert result is True

        # Legacy path was invoked
        mock_get_wt.assert_called_once_with(str(plan_path))


# -- Test: error cases -------------------------------------------------------

class TestErrorCases:
    """Test error handling in verify-switch."""

    @patch("commands.verify_switch.find_plan", return_value=None)
    @patch("commands.verify_switch.find_workspace_root")
    def test_plan_not_found(self, mock_ws_root, mock_find_plan, tmp_path):
        """Returns False when plan is not found."""
        from commands.verify_switch import run_verify_switch

        mock_ws_root.return_value = tmp_path
        result = run_verify_switch("999")
        assert result is False

    @patch("commands.verify_switch.parse_worktree_context", return_value=None)
    @patch("commands.verify_switch.get_plan_worktree", return_value=None)
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_no_worktree_metadata_at_all(
        self, mock_ws_root, mock_find_plan, mock_get_wt, mock_parse_ctx,
        tmp_path
    ):
        """Returns False when neither WorktreeContext nor legacy worktree exists."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_NO_WORKTREE)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None
        mock_get_wt.return_value = None

        result = run_verify_switch("42")
        assert result is False

    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.parse_worktree_context", return_value=None)
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_incomplete_metadata(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_get_wt,
        tmp_path
    ):
        """Returns False when legacy worktree has incomplete data."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None
        mock_get_wt.return_value = {"branch": "", "path": ""}

        result = run_verify_switch("42")
        assert result is False
