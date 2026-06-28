#!/usr/bin/env python3
# test_verify_switch.py - TDD tests for verify_switch (unified switching)

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.worktree import WorktreeContext, parse_worktree_context


# -- Fixtures -----------------------------------------------------------------

PLAN_STANDARD = """\
- **Status**: verifying
- **Type**: feature
- **Target Project**: gesp
- **Project Type**: standard
- **Project Path**: projects/gesp
- **Issue**: #42
- **Worktree**:
  - branch: feature/test-1-slug
  - path: .worktrees/gesp-issue-1-slug
"""

PLAN_ONTOLOGY = """\
- **Status**: verifying
- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Type**: ontology-worktree
- **Project Path**: .wopal
- **Issue**: #10
- **Worktree**:
  - branch: issue-10-slug
  - path: .worktrees/ontology-issue-10-slug
"""



def _write_plan(tmp_path, content: str, name: str = "42-feature-dev-flow-test.md") -> Path:
    """Write a Plan file with given content and return its path."""
    plan_dir = tmp_path / "plans"
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plan_dir / name
    plan_file.write_text(content)
    return plan_file


def _setup_ontology_worktree(tmp_path):
    """Create ontology worktree directory on disk so _remove_worktree calls subprocess."""
    wt_dir = tmp_path / ".worktrees" / "ontology-issue-10-slug"
    wt_dir.mkdir(parents=True, exist_ok=True)
    return wt_dir


def _make_ontology_ctx():
    """Create an ontology-worktree WorktreeContext for testing."""
    return WorktreeContext(
        branch="issue-10-slug",
        path=Path(".worktrees/ontology-issue-10-slug"),
        project_type="ontology-worktree",
    )


def _make_standard_ctx():
    """Create a standard project WorktreeContext for testing."""
    return WorktreeContext(
        branch="feature/test-1-slug",
        path=Path(".worktrees/gesp-issue-1-slug"),
        project_type="standard",
    )


# -- Test: ontology-worktree unified switch -----------------------------------

class TestOntologySwitch:
    """Test verify-switch for ontology-worktree: checkout .wopal/ to feature branch."""

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_wopal_to_feature_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path
    ):
        """Ontology: checkouts .wopal/ to feature branch after confirmation."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_ontology_worktree(tmp_path)

        result = run_verify_switch("10")

        assert result is True

        # subprocess.run should have been called: dirty check + worktree remove + prune + git fetch + git checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 5

        # First call: git status --porcelain (dirty check)
        assert calls[0][0][0][0] == "git"
        assert "status" in calls[0][0][0]

        # Second call: git worktree remove (from main repo)
        assert "worktree" in calls[1][0][0]
        assert "remove" in calls[1][0][0]
        assert calls[1][1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"

        # Third call: git worktree prune
        assert "worktree" in calls[2][0][0]
        assert "prune" in calls[2][0][0]

        # Fourth call: git fetch
        assert "fetch" in calls[3][0][0]

        # Fifth call: git checkout
        checkout_call = calls[4]
        assert checkout_call[0][0] == ["git", "checkout", "issue-10-slug"]
        assert checkout_call[1]["cwd"] == str(ws_root / ".wopal")

        # commit_paths should have been called
        mock_commit_paths.assert_called_once()

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_runs_in_wopal_directory(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path
    ):
        """Ontology: fetch and checkout run in .wopal/ directory.
        Dirty check and worktree remove run elsewhere."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_ontology_worktree(tmp_path)

        result = run_verify_switch("10")
        assert result is True

        calls = mock_subprocess.call_args_list
        # dirty check in .wopal/
        assert calls[0][1]["cwd"] == str(ws_root / ".wopal")
        # worktree remove in main repo (NOT .wopal/)
        assert calls[1][1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"
        # prune in main repo
        assert calls[2][1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"
        # fetch in .wopal/
        assert calls[3][1]["cwd"] == str(ws_root / ".wopal")
        # checkout in .wopal/
        assert calls[4][1]["cwd"] == str(ws_root / ".wopal")

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path
    ):
        """Ontology: returns False when git checkout fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        _setup_ontology_worktree(tmp_path)

        # dirty check ok, worktree remove ok, prune ok, fetch ok, checkout fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0, stdout=""),  # dirty check
            MagicMock(returncode=0),  # worktree remove
            MagicMock(returncode=0),  # prune
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=1, stderr="checkout error"),  # checkout
        ]

        result = run_verify_switch("10")
        assert result is False

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_fetch_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path
    ):
        """Ontology: returns False when git fetch fails."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        _setup_ontology_worktree(tmp_path)

        # dirty check ok, worktree remove ok, prune ok, fetch fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0, stdout=""),  # dirty check
            MagicMock(returncode=0),  # worktree remove
            MagicMock(returncode=0),  # prune
            MagicMock(returncode=1, stderr="fetch error"),  # fetch
        ]

        result = run_verify_switch("10")
        assert result is False


def _setup_standard_with_worktree(tmp_path):
    """Create worktree directory on disk so _remove_worktree calls subprocess."""
    wt_dir = tmp_path / ".worktrees" / "gesp-issue-1-slug"
    wt_dir.mkdir(parents=True, exist_ok=True)
    return wt_dir


def _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path):
    """Set up common mocks for standard project tests."""
    plan_path = _write_plan(tmp_path, PLAN_STANDARD)
    ws_root = tmp_path
    mock_ws_root.return_value = ws_root
    mock_find_plan.return_value = str(plan_path)
    mock_parse_ctx.return_value = _make_standard_ctx()
    mock_resolve_project.return_value = Path("/workspace/projects/gesp")
    mock_subprocess.return_value = MagicMock(returncode=0)
    return plan_path


# -- Test: standard project unified switch ------------------------------------

class TestStandardSwitch:
    """Test verify-switch for standard project: checkout project repo + worktree cleanup."""

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_checkout_project_repo_to_feature_branch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: checkouts project repo to feature branch after confirmation.
        New order: fetch → dirty check → remove worktree → checkout → commit."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_standard_with_worktree(tmp_path)

        result = run_verify_switch("42")

        assert result is True

        # subprocess.run should have been called: fetch + dirty check + remove + prune + checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 5

        # First call: git fetch (in project repo)
        assert "fetch" in calls[0][0][0]
        assert calls[0][1]["cwd"] == "/workspace/projects/gesp"

        # Second call: git status --porcelain (dirty check)
        assert "status" in calls[1][0][0]
        assert calls[1][1]["cwd"] == "/workspace/projects/gesp"

        # Third call: git worktree remove
        assert "worktree" in calls[2][0][0]
        assert "remove" in calls[2][0][0]
        assert calls[2][1]["cwd"] == "/workspace/projects/gesp"

        # Fourth call: git worktree prune
        assert "worktree" in calls[3][0][0]
        assert "prune" in calls[3][0][0]

        # Fifth call: git checkout (in project repo)
        assert calls[4][0][0] == ["git", "checkout", "feature/test-1-slug"]
        assert calls[4][1]["cwd"] == "/workspace/projects/gesp"

        # commit_paths should have been called
        mock_commit_paths.assert_called_once()

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_removes_worktree_after_checkout(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: removes worktree after successful checkout."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)
        _setup_standard_with_worktree(tmp_path)

        result = run_verify_switch("42")
        assert result is True

        calls = mock_subprocess.call_args_list
        # Third call: git worktree remove
        wt_remove_call = calls[2]
        assert "worktree" in wt_remove_call[0][0]
        assert "remove" in wt_remove_call[0][0]
        # cwd should be repo_root from resolve_project_path
        assert wt_remove_call[1]["cwd"] == "/workspace/projects/gesp"

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_worktree_cleanup_skipped_on_checkout_failure(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: worktree remove happens before checkout, so remove still
        runs even when checkout fails. 5 subprocess calls: fetch, dirty check, remove, prune, checkout."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)
        _setup_standard_with_worktree(tmp_path)

        # fetch ok, dirty check clean, worktree remove ok, prune, checkout fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=0, stdout=""),  # git status --porcelain (clean)
            MagicMock(returncode=0),  # worktree remove
            MagicMock(returncode=0),  # worktree prune
            MagicMock(returncode=1, stderr="checkout error"),  # checkout
        ]

        result = run_verify_switch("42")
        assert result is False

        # 5 calls: fetch + dirty check + worktree remove + prune + checkout
        assert len(mock_subprocess.call_args_list) == 5

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_worktree_cleanup_failure_returns_false(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path, capsys
    ):
        """Standard: worktree remove failure returns False immediately."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)
        _setup_standard_with_worktree(tmp_path)

        # fetch ok, dirty check clean, worktree remove fails
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=0, stdout=""),  # git status --porcelain (clean)
            MagicMock(returncode=1, stderr="worktree remove error"),  # worktree remove --force
        ]

        result = run_verify_switch("42")
        assert result is False

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_git_commands_run_in_project_repo(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: git fetch, dirty check, worktree remove, and checkout run in project repo root."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)

        result = run_verify_switch("42")
        assert result is True

        # All subprocess calls use project repo cwd
        for call in mock_subprocess.call_args_list:
            assert call[1]["cwd"] == "/workspace/projects/gesp"


# -- Test: verification guidance output ---------------------------------------

class TestVerificationGuidance:
    """Test that verification guidance is printed after successful switch."""

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_prints_guidance(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path, capsys
    ):
        """Ontology: prints verification guidance after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        run_verify_switch("10")

        output = capsys.readouterr().out
        # Verify correct verify command (issue ref, not branch name)
        assert "flow.sh verify 10 --confirm" in output
        # Verify correct merge guidance (checkout current space branch, dynamically detected)
        assert "git checkout space/wopal-workspace" in output
        assert "git merge issue-10-slug" in output
        # Verify merge is in the correct repo
        assert "/home/.wopal/ontologies/wopal-space-ontology" in output

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_prints_merge_guidance(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path, capsys
    ):
        """Standard: prints merge guidance after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)

        run_verify_switch("42")

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
        result = run_verify_switch("999")
        assert result is False

    @patch("commands.verify_switch.parse_worktree_context", return_value=None)
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_no_worktree_metadata_at_all(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        tmp_path
    ):
        """Returns False when Plan has no structured Worktree metadata."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = None

        result = run_verify_switch("42")
        assert result is False

    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_empty_branch_errors_out(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx,
        mock_subprocess, tmp_path
    ):
        """Returns False when WorktreeContext has empty branch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        # WorktreeContext with empty branch — git checkout "" fails
        ctx = WorktreeContext(
            branch="",
            path=Path(".worktrees/empty-branch"),
        )
        mock_parse_ctx.return_value = ctx
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42")
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


# -- Test: real Plan parsing + dispatch (no parse_worktree_context mock) --------

class TestDispatchFromRealPlan:
    """Verify that real Plan files dispatch to correct project type path.

    These tests deliberately do NOT mock parse_worktree_context — they verify
    the full parse→dispatch chain: Plan metadata → WorktreeContext → switch function.
    """

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_plan_dispatches_via_metadata_project_type(
        self, mock_ws_root, mock_find_plan, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path
    ):
        """PLAN_ONTOLOGY has Project Type in Metadata, NOT in Worktree block.
        verify_switch must read it from Metadata and dispatch to ontology path."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_ontology_worktree(tmp_path)

        result = run_verify_switch("10")
        assert result is True

        # Ontology path: dirty check + worktree remove + prune + fetch + checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 5
        # fetch and checkout in .wopal/
        assert calls[3][1]["cwd"] == str(ws_root / ".wopal")
        assert calls[4][1]["cwd"] == str(ws_root / ".wopal")
        # worktree remove in main repo
        assert calls[1][1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_plan_dispatches_with_worktree_cleanup(
        self, mock_ws_root, mock_find_plan, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """PLAN_STANDARD dispatches to standard path with worktree removal before checkout."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_subprocess.return_value = MagicMock(returncode=0)

        # Create worktree dir so _remove_worktree triggers
        wt_dir = tmp_path / ".worktrees" / "gesp-issue-1-slug"
        wt_dir.mkdir(parents=True, exist_ok=True)

        result = run_verify_switch("42")
        assert result is True

        # Standard path: fetch + dirty check + worktree remove + prune + checkout
        calls = mock_subprocess.call_args_list
        assert len(calls) == 5
        # fetch + dirty check + worktree remove + prune + checkout all in project repo
        for call in calls:
            assert call[1]["cwd"] == "/workspace/projects/gesp"
        # worktree remove before checkout
        assert "worktree" in calls[2][0][0]
        assert "prune" in calls[3][0][0]
        assert "checkout" in calls[4][0][0]


# -- Test: dirty check on verify-switch --------------------------------------

class TestDirtyCheckOnVerifySwitch:
    """Test that _check_dirty is called and warns when repo is dirty."""

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_dirty_warns_but_proceeds(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path, capsys
    ):
        """Standard: dirty canonical path warns but switch still succeeds."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()

        # Create worktree dir so _remove_worktree triggers
        wt_dir = tmp_path / ".worktrees" / "gesp-issue-1-slug"
        wt_dir.mkdir(parents=True, exist_ok=True)

        # fetch ok, dirty check returns dirty files, worktree remove ok, prune ok, checkout ok
        mock_subprocess.side_effect = [
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=0, stdout=" M src/foo.py\n?? src/bar.py"),  # dirty
            MagicMock(returncode=0),  # worktree remove
            MagicMock(returncode=0),  # prune
            MagicMock(returncode=0),  # checkout
        ]

        result = run_verify_switch("42")
        assert result is True

        output = capsys.readouterr().out
        assert "WARN" in output
        assert "uncommitted" in output

    @patch("commands.verify_switch.get_current_branch", return_value="space/wopal-workspace")
    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_dirty_warns_but_proceeds(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, mock_get_branch, tmp_path, capsys
    ):
        """Ontology: dirty .wopal/ warns but switch still succeeds."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()

        _setup_ontology_worktree(tmp_path)

        # dirty check returns dirty, worktree remove ok, prune ok, fetch ok, checkout ok
        mock_subprocess.side_effect = [
            MagicMock(returncode=0, stdout=" M rules/foo.md"),  # dirty
            MagicMock(returncode=0),  # worktree remove
            MagicMock(returncode=0),  # prune
            MagicMock(returncode=0),  # fetch
            MagicMock(returncode=0),  # checkout
        ]

        result = run_verify_switch("10")
        assert result is True

        output = capsys.readouterr().out
        assert "WARN" in output
        assert "uncommitted" in output


# -- Test: Plan metadata update after switch ----------------------------------

class TestUpdatePlanMetadata:
    """Test that _update_plan_after_switch updates Plan metadata correctly."""

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_updates_path_to_removed(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: Plan Worktree path is updated to '(removed)' after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)

        result = run_verify_switch("42")
        assert result is True

        plan_content = plan_path.read_text()
        assert "path: (removed)" in plan_content
        # Original path should no longer be present
        assert "path: .worktrees/gesp-issue-1-slug" not in plan_content

        # Structural assertion: WorktreeContext still parses correctly
        # (Verification Dir is NOT inside the Worktree block)
        ctx = parse_worktree_context(str(plan_path))
        assert ctx is not None, "WorktreeContext should parse after metadata update"
        # path is intentionally "(removed)" — worktree has been cleaned up
        assert ctx.branch == "feature/test-1-slug", "branch preserved"

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_adds_verification_dir(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: Plan gets Verification Dir metadata field after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)

        result = run_verify_switch("42")
        assert result is True

        plan_content = plan_path.read_text()
        assert "Verification Dir" in plan_content
        assert "/workspace/projects/gesp" in plan_content

        # Structural assertion: Verification Dir is a top-level field (0-indent),
        # NOT accidentally inserted inside the Worktree block (2-indent).
        for line in plan_content.splitlines():
            if "Verification Dir" in line:
                assert not line.startswith(" "), (
                    f"Verification Dir should be top-level, got: {line!r}"
                )
                break
        else:
            pytest.fail("Verification Dir not found in plan")

        # Verify WorktreeContext still parses correctly
        ctx = parse_worktree_context(str(plan_path))
        assert ctx is not None, "WorktreeContext should parse after metadata update"

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_updates_path_to_removed(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, tmp_path
    ):
        """Ontology: Plan Worktree path is updated to '(removed)' after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_ontology_worktree(tmp_path)

        result = run_verify_switch("10")
        assert result is True

        plan_content = plan_path.read_text()
        assert "path: (removed)" in plan_content
        assert "path: .worktrees/ontology-issue-10-slug" not in plan_content

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_plan_committed_after_switch(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: commit_paths called with correct args after switch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)

        result = run_verify_switch("42")
        assert result is True

        mock_commit_paths.assert_called_once()
        call_args = mock_commit_paths.call_args
        # First arg: repo_root
        assert call_args[0][0] == "/workspace/projects/gesp"
        # Second arg: list of paths (plan file relative)
        paths = call_args[0][1]
        assert len(paths) == 1
        assert plan_path.name in paths[0]
        # Third arg: commit message
        msg = call_args[0][2]
        assert "verify-switch" in msg

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_eof_plan_no_trailing_newline(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Worktree block at EOF without trailing newline: Verification Dir
        is still placed after the block, not inside it (R-01 regression)."""
        from commands.verify_switch import run_verify_switch

        # Remove trailing newline from PLAN_STANDARD
        plan_content = PLAN_STANDARD.rstrip("\n")
        plan_path = _write_plan(tmp_path, plan_content)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_standard_ctx()
        mock_resolve_project.return_value = Path("/workspace/projects/gesp")
        mock_subprocess.return_value = MagicMock(returncode=0)

        result = run_verify_switch("42")
        assert result is True

        updated = plan_path.read_text()
        # Verification Dir must appear after the Worktree block
        assert "Verification Dir" in updated
        # WorktreeContext must still parse correctly
        ctx = parse_worktree_context(str(plan_path))
        assert ctx is not None


# -- Test: remove before checkout ordering -------------------------------------

class TestRemoveBeforeCheckout:
    """Test the fixed ordering: remove worktree BEFORE checkout."""

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.resolve_project_path", return_value=Path("/workspace/projects/gesp"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_standard_remove_before_checkout(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_resolve_project, mock_commit_paths, tmp_path
    ):
        """Standard: worktree remove subprocess call happens before checkout."""
        from commands.verify_switch import run_verify_switch

        plan_path = _setup_standard_mocks(mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess, mock_resolve_project, tmp_path)
        _setup_standard_with_worktree(tmp_path)

        result = run_verify_switch("42")
        assert result is True

        calls = mock_subprocess.call_args_list
        # Order: fetch(0) → dirty_check(1) → worktree_remove(2) → checkout(3)
        remove_indices = [
            i for i, c in enumerate(calls)
            if "worktree" in c[0][0] and "remove" in c[0][0]
        ]
        checkout_indices = [
            i for i, c in enumerate(calls)
            if c[0][0] == ["git", "checkout", "feature/test-1-slug"]
        ]
        assert len(remove_indices) == 1
        assert len(checkout_indices) == 1
        assert remove_indices[0] < checkout_indices[0], (
            "worktree remove must happen before checkout"
        )

    @patch("commands.verify_switch.commit_paths", return_value=True)
    @patch("commands.verify_switch.get_ontology_main_repo", return_value=Path("/home/.wopal/ontologies/wopal-space-ontology"))
    @patch("commands.verify_switch.subprocess.run")
    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_ontology_remove_worktree_from_main_repo(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, mock_subprocess,
        mock_get_main_repo, mock_commit_paths, tmp_path
    ):
        """Ontology: worktree is removed from main repo before checkout in .wopal/."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_ONTOLOGY)
        ws_root = tmp_path
        mock_ws_root.return_value = ws_root
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = _make_ontology_ctx()
        mock_subprocess.return_value = MagicMock(returncode=0)

        _setup_ontology_worktree(tmp_path)

        result = run_verify_switch("10")
        assert result is True

        calls = mock_subprocess.call_args_list
        # Find worktree remove call
        remove_calls = [
            c for c in calls
            if "worktree" in c[0][0] and "remove" in c[0][0]
        ]
        assert len(remove_calls) == 1
        # Must run in main repo, not .wopal/
        assert remove_calls[0][1]["cwd"] == "/home/.wopal/ontologies/wopal-space-ontology"

        # Find checkout call
        checkout_calls = [
            c for c in calls
            if c[0][0] == ["git", "checkout", "issue-10-slug"]
        ]
        assert len(checkout_calls) == 1
        # Checkout runs in .wopal/
        assert checkout_calls[0][1]["cwd"] == str(ws_root / ".wopal")

        # Remove must be before checkout
        remove_idx = calls.index(remove_calls[0])
        checkout_idx = calls.index(checkout_calls[0])
        assert remove_idx < checkout_idx, (
            "worktree remove must happen before checkout"
        )
