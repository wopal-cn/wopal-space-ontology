#!/usr/bin/env python3
# test_verify_switch.py - TDD tests for verify_switch (unified switching)

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.worktree import WorktreeContext


# -- Fixtures -----------------------------------------------------------------

PLAN_STANDARD = """\
- **Status**: verifying
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

PLAN_ONTOLOGY = """\
- **Status**: verifying
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
- **Status**: verifying
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

PLAN_NO_PROJECT_INFO = """\
- **Status**: verifying
- **Type**: feature
- **Issue**: #42
- **Worktree**: feature/test-1-slug | .worktrees/test-1-slug
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


# -- Test: ontology-worktree unified switch -----------------------------------

class TestOntologySwitch:
    """Test verify-switch for ontology-worktree: checkout .wopal/ to feature branch."""

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_wopal_to_feature_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Ontology: checkouts .wopal/ to feature branch after confirmation."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("10", yes=True)

        assert result is True

        # subprocess.run should have been called: git fetch + git checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 2

        # First call: git fetch
        assert calls[0][0][0][0] == "git"
        assert "fetch" in calls[0][0][0]

        # Second call: git checkout
        checkout_call = calls[1]
        assert checkout_call[0][0] == ["git", "checkout", "issue-10-slug"]
        assert checkout_call[1]["cwd"] == str(ws_root / ".wopal")

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_runs_in_wopal_directory(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Ontology: git commands run in .wopal/ directory."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("10", yes=True)
        assert result is True

        # All subprocess calls should have cwd = .wopal/
        for call in mock_subprocess.call_args_list:
            assert call[1]["cwd"] == str(ws_root / ".wopal")

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Ontology: returns False when git checkout fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        # fetch succeeds, checkout fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=1, stderr="checkout error"),  # checkout
        ]

        result = run_verify_switch("10", yes=True)
        assert result is False

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_fetch_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Ontology: returns False when git fetch fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=1, stderr="fetch error")

        result = run_verify_switch("10", yes=True)
        assert result is False


# -- Test: standard project unified switch ------------------------------------

class TestStandardSwitch:
    """Test verify-switch for standard project: checkout project repo + worktree cleanup."""

    def _setup_standard_with_worktree(self, tmp_path):
        """Create worktree directory on disk so _remove_worktree calls subprocess."""
        wt_dir = tmp_path / ".worktrees" / "gesp-issue-1-slug"
        wt_dir.mkdir(parents=True, exist_ok=True)
        return wt_dir

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_project_repo_to_feature_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Standard: checkouts project repo to feature branch after confirmation."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        self._setup_standard_with_worktree(tmp_path)

        result = run_verify_switch("42", yes=True)

        assert result is True

        # subprocess.run should have been called: git fetch + git checkout + git worktree remove
        calls = mock_subprocess.call_args_list
        assert len(calls) == 3

        # First call: git fetch (in project repo)
        assert "fetch" in calls[0][0][0]
        assert calls[0][1]["cwd"] == "/workspace/projects/gesp"

        # Second call: git checkout (in project repo)
        assert calls[1][0][0] == ["git", "checkout", "feature/test-1-slug"]
        assert calls[1][1]["cwd"] == "/workspace/projects/gesp"

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_removes_worktree_after_checkout(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Standard: removes worktree after successful checkout."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        self._setup_standard_with_worktree(tmp_path)

        result = run_verify_switch("42", yes=True)
        assert result is True

        calls = mock_subprocess.call_args_list
        # Third call: git worktree remove
        wt_remove_call = calls[2]
        assert "worktree" in wt_remove_call[0][0]
        assert "remove" in wt_remove_call[0][0]
        # cwd should be repo_root from WorktreeContext
        assert wt_remove_call[1]["cwd"] == "/workspace/projects/gesp"

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_worktree_cleanup_skipped_on_checkout_failure(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Standard: skips worktree cleanup when checkout fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        # fetch succeeds, checkout fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=1, stderr="checkout error"),  # checkout
        ]

        result = run_verify_switch("42", yes=True)
        assert result is False

        # Only 2 calls (fetch + checkout), no worktree remove
        assert len(mock_subprocess.call_args_list) == 2

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_worktree_cleanup_failure_warns_but_succeeds(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path, capsys
    ):
        """Standard: worktree remove failure warns but returns True."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        self._setup_standard_with_worktree(tmp_path)

        # fetch ok, checkout ok, worktree remove fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=0),  # checkout
            MagicMock(returncode=1, stderr="worktree remove error"),  # worktree remove
        ]

        result = run_verify_switch("42", yes=True)
        assert result is True
        output = capsys.readouterr().out
        assert "WARN" in output

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_git_commands_run_in_project_repo(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path
    ):
        """Standard: git fetch and checkout run in project repo root."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42", yes=True)
        assert result is True

        # fetch and checkout both use project repo cwd
        for call in mock_subprocess.call_args_list[:2]:
            assert call[1]["cwd"] == "/workspace/projects/gesp"


# -- Test: user confirmation --------------------------------------------------

class TestUserConfirmation:
    """Test user confirmation prompt in verify-switch."""

    @patch("builtins.input", return_value="y")
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_confirmation_prompt_shown_without_yes_flag(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_input, tmp_path
    ):
        """Without --yes: shows confirmation prompt and proceeds on 'y'."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("10")

        assert result is True
        mock_input.assert_called_once()
        prompt_arg = mock_input.call_args[0][0]
        assert "issue-10-slug" in prompt_arg

    @patch("builtins.input", return_value="n")
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_confirmation_rejected_aborts(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_input, tmp_path
    ):
        """User enters 'n': aborts without git operations."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        result = run_verify_switch("10")

        assert result is False
        mock_subprocess.assert_not_called()

    @patch("builtins.input", return_value="y")
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_yes_flag_skips_confirmation_prompt(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_input, tmp_path
    ):
        """With --yes: skips confirmation prompt entirely."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("10", yes=True)

        assert result is True
        mock_input.assert_not_called()


# -- Test: verification guidance output ---------------------------------------

class TestVerificationGuidance:
    """Test that verification guidance is printed after successful switch."""

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_prints_guidance(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path, capsys
    ):
        """Ontology: prints verification guidance after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        run_verify_switch("10", yes=True)

        output = capsys.readouterr().out
        # Verify correct verify command (issue ref, not branch name)
        assert "flow.sh verify 10 --confirm" in output
        # Verify correct merge guidance (checkout integration branch first)
        assert "git checkout space/main" in output
        assert "git merge issue-10-slug" in output
        # Verify merge is in the correct repo
        assert "/home/.wopal/ontologies/wopal-space-ontology" in output

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_prints_merge_guidance(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        tmp_path, capsys
    ):
        """Standard: prints merge guidance after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        run_verify_switch("42", yes=True)

        output = capsys.readouterr().out
        # Verify correct verify command (issue ref, not branch name)
        assert "flow.sh verify 42 --confirm" in output
        # Verify correct merge guidance (checkout integration branch first)
        assert "git checkout main" in output
        assert "git merge feature/test-1-slug" in output
        # Verify merge is in the correct repo
        assert "/workspace/projects/gesp" in output


# -- Test: error cases -------------------------------------------------------

class TestErrorCases:
    """Test error handling in verify-switch."""

    @patch("commands.verify_switch.find_plan", return_value=None)
    @patch("commands.verify_switch.find_workspace_root")
    def test_plan_not_found(self, mock_ws_root, mock_find_plan, tmp_path):
        """Returns False when plan is not found."""
        from commands.verify_switch import run_verify_switch

        mock_ws_root.return_value = tmp_path
        result = run_verify_switch("999", yes=True)
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

        result = run_verify_switch("42", yes=True)
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

        result = run_verify_switch("42", yes=True)
        assert result is False


# -- Test: legacy fallback (structured WorktreeContext unavailable) -----------

class TestLegacyFallback:
    """Test that legacy Plan format works via get_plan_worktree fallback."""

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.get_plan_field")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_standard_resolves_target_from_project(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_get_wt, mock_subprocess, tmp_path
    ):
        """Legacy standard Plan resolves target via Project Path / Target Project."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None
        mock_get_wt.return_value = {
            "branch": "feature/test-1-slug",
            "path": ".worktrees/gesp-feature-test-1-slug",
        }
        mock_get_field.side_effect = lambda _path, field: {
            "Project Type": "standard",
            "Project Path": None,
            "Target Project": "gesp",
        }.get(field)

        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42", yes=True)
        assert result is True

        # Legacy path was invoked
        mock_get_wt.assert_called_once_with(str(plan_path))

        # git fetch + checkout run in resolved project repo
        calls = mock_subprocess.call_args_list
        assert len(calls) == 2
        expected_cwd = str(ws_root / "projects" / "gesp")
        assert calls[0][1]["cwd"] == expected_cwd
        assert calls[1][1]["cwd"] == expected_cwd

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.get_plan_field")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_pipe_format_detected_and_handled(
        self, mock_ws_root, mock_find_plan,
        mock_get_field, mock_get_wt, mock_subprocess, tmp_path
    ):
        """Real legacy pipe-format plan: parse returns empty repo_root, falls through to legacy."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        # NOT mocking parse_worktree_context — let it parse the real pipe format
        # _parse_legacy_worktree returns WorktreeContext with repo_root=Path('')
        # which becomes Path('.') and triggers the legacy guard
        mock_get_wt.return_value = {
            "branch": "feature/test-1-slug",
            "path": ".worktrees/gesp-feature-test-1-slug",
        }
        mock_get_field.side_effect = lambda _path, field: {
            "Project Type": "standard",
            "Project Path": None,
            "Target Project": "gesp",
        }.get(field)

        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42", yes=True)
        assert result is True

        # Should have fallen through to legacy path (get_plan_worktree called)
        mock_get_wt.assert_called_once_with(str(plan_path))

        # git commands run in resolved repo, not workspace root
        calls = mock_subprocess.call_args_list
        assert len(calls) == 2
        expected_cwd = str(ws_root / "projects" / "gesp")
        assert calls[0][1]["cwd"] == expected_cwd
        assert calls[1][1]["cwd"] == expected_cwd

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.get_plan_field")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_ontology_uses_wopal_dir(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_get_wt, mock_subprocess, tmp_path
    ):
        """Legacy ontology Plan targets .wopal/ directory."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None
        mock_get_wt.return_value = {
            "branch": "feature/test-1-slug",
            "path": ".worktrees/ontology-issue-1-slug",
        }
        mock_get_field.side_effect = lambda _path, field: {
            "Project Type": "ontology-worktree",
            "Project Path": ".wopal",
        }.get(field)

        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42", yes=True)
        assert result is True

        calls = mock_subprocess.call_args_list
        assert len(calls) == 2
        expected_cwd = str(ws_root / ".wopal")
        assert calls[0][1]["cwd"] == expected_cwd
        assert calls[1][1]["cwd"] == expected_cwd

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.get_plan_worktree")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_pipe_format_real_resolves_via_target_project(
        self, mock_ws_root, mock_find_plan,
        mock_get_wt, mock_subprocess, tmp_path
    ):
        """Real legacy pipe-format without Project Type resolves via Target Project."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_LEGACY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        # NOT mocking parse_worktree_context — real pipe format parsed
        # NOT mocking get_plan_field — reads Project Type (None) and Target Project (gesp)
        mock_get_wt.return_value = {
            "branch": "feature/test-1-slug",
            "path": ".worktrees/gesp-feature-test-1-slug",
        }

        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42", yes=True)
        assert result is True

        # git commands run in resolved repo from Target Project
        calls = mock_subprocess.call_args_list
        assert len(calls) == 2
        expected_cwd = str(ws_root / "projects" / "gesp")
        assert calls[0][1]["cwd"] == expected_cwd
        assert calls[1][1]["cwd"] == expected_cwd

    @patch("commands.verify_switch.get_plan_worktree", return_value={"branch": "x", "path": "y"})
    @patch("commands.verify_switch.get_plan_field")
    @patch("commands.verify_switch.parse_worktree_context", return_value=None)
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_legacy_no_metadata_errors_out(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_get_field, mock_get_wt, tmp_path
    ):
        """Legacy Plan without Project Path or Target Project errors out."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_NO_PROJECT_INFO)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        mock_get_field.return_value = None

        result = run_verify_switch("42", yes=True)
        assert result is False


# -- Test: no --merge references ----------------------------------------------

class TestNoMergeArgument:
    """Verify --merge argument has been completely removed."""

    def test_run_verify_switch_signature_no_merge(self):
        """run_verify_switch does not accept 'merge' parameter."""
        from commands.verify_switch import run_verify_switch
        import inspect

        sig = inspect.signature(run_verify_switch)
        params = list(sig.parameters.keys())
        assert "merge" not in params

    def test_verify_switch_module_no_merge_string(self):
        """Module source has no --merge references."""
        from commands import verify_switch
        import inspect

        source = inspect.getsource(verify_switch)
        assert "--merge" not in source


# -- Test: verify --confirm integration tests ---------------------------------

PLAN_VERIFYING = """\
- **Status**: verifying
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

PLAN_VERIFYING_NO_ISSUE = """\
- **Status**: verifying
- **Type**: refactor
- **Target Project**: wopal-space
- **Created**: 2026-05-13
"""


class TestVerifyConfirmDirectMerge:
    """Test verify --confirm after verify-switch succeeded."""

    @patch("commands.verify.get_plan_worktree", return_value=None)
    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_direct_merge_verify_uses_resolve_active_plan(
        self, mock_find_plan, mock_ws_root, mock_resolve, mock_check_uv,
        mock_update_status, mock_commit, mock_sync_label, mock_sync_body,
        mock_no_wt,
        tmp_path
    ):
        """verify --confirm uses resolve_active_plan to enforce merged state."""
        from commands.verify import cmd_verify
        from lib.worktree import ActivePlanInfo

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(plan_path),
            commit_repo_root=tmp_path,
            repo_relative_plan_path=f"plans/{Path(plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 0

        mock_resolve.assert_called_once_with(str(plan_path), "verify", tmp_path)

    @patch("commands.verify.get_plan_worktree", return_value=None)
    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_direct_merge_commits_on_integration_branch(
        self, mock_find_plan, mock_ws_root, mock_resolve, mock_check_uv,
        mock_update_status, mock_commit, mock_sync_label, mock_sync_body,
        mock_no_wt,
        tmp_path
    ):
        """verify --confirm commits Plan-only on the integration branch repo root."""
        from commands.verify import cmd_verify
        from lib.worktree import ActivePlanInfo

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(plan_path),
            commit_repo_root=tmp_path,
            repo_relative_plan_path=f"plans/{Path(plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 0

        mock_commit.assert_called_once()
        call_args = mock_commit.call_args
        assert call_args[0][0] == str(tmp_path)

    @patch("commands.verify.get_plan_worktree", return_value=None)
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_unmerged_worktree_blocks_verify(
        self, mock_find_plan, mock_ws_root, mock_resolve,
        mock_no_wt,
        tmp_path
    ):
        """verify --confirm raises when feature branch not merged."""
        from commands.verify import cmd_verify
        from lib.worktree import ResolveActivePlanError

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        mock_resolve.side_effect = ResolveActivePlanError(
            "Feature branch 'feature/test-1-slug' has not been merged. "
            "Run verify-switch and merge manually before verify."
        )

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 1


class TestVerifyConfirmPRMerge:
    """Test verify --confirm for PR-based flow (PR already merged)."""

    @patch("commands.verify.get_plan_worktree", return_value=None)
    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify._is_pr_merged", return_value=True)
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_pr_merged_verify_succeeds(
        self, mock_find_plan, mock_ws_root, mock_pr_merged,
        mock_resolve, mock_check_uv, mock_update_status,
        mock_commit, mock_sync_label, mock_sync_body,
        mock_no_wt,
        tmp_path
    ):
        """PR already merged: verify --confirm succeeds on integration branch."""
        from commands.verify import cmd_verify
        from lib.worktree import ActivePlanInfo

        plan_content = PLAN_VERIFYING + "\n- **PR**: https://github.com/owner/repo/pull/99\n"
        plan_path = _write_plan(tmp_path, plan_content)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(plan_path),
            commit_repo_root=tmp_path,
            repo_relative_plan_path=f"plans/{Path(plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 0

    @patch("commands.verify._is_pr_merged", return_value=False)
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_pr_not_merged_blocks_verify(
        self, mock_find_plan, mock_ws_root, mock_pr_merged,
        tmp_path
    ):
        """PR not yet merged: verify --confirm returns error."""
        from commands.verify import cmd_verify

        plan_content = PLAN_VERIFYING + "\n- **PR**: https://github.com/owner/repo/pull/99\n"
        plan_path = _write_plan(tmp_path, plan_content)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 1


class TestVerifyNoIssuePlan:
    """Test verify --confirm for plans without Issue numbers."""

    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_no_issue_verify_uses_resolve_active_plan(
        self, mock_find_plan, mock_ws_root, mock_resolve, mock_check_uv,
        mock_update_status, mock_commit, mock_sync_label, mock_sync_body,
        tmp_path
    ):
        """No-issue plan: verify --confirm still uses resolve_active_plan."""
        from commands.verify import cmd_verify
        from lib.worktree import ActivePlanInfo

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_NO_ISSUE)
        mock_find_plan.return_value = str(plan_path)
        mock_ws_root.return_value = tmp_path

        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(plan_path),
            commit_repo_root=tmp_path,
            repo_relative_plan_path=f"plans/{Path(plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = "test-no-issue-plan"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 0

        mock_sync_label.assert_not_called()
        mock_sync_body.assert_not_called()
