#!/usr/bin/env python3
# test_verify.py - Unit tests for verify command (merge status check)

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()


# -- Fixtures -----------------------------------------------------------------

PLAN_VERIFYING_STANDARD = """\
- **Status**: verifying
- **Type**: feature
- **Target Project**: gesp
- **Project Type**: standard
- **Project Path**: projects/gesp
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

PLAN_VERIFYING_ONTOLOGY = """\
- **Status**: verifying
- **Type**: refactor
- **Target Project**: wopal-space-ontology
- **Project Type**: ontology-worktree
- **Project Path**: .wopal
- **Issue**: #10
- **Worktree**:
  - enabled: true
  - branch: issue-10-slug
  - path: .worktrees/ontology-issue-10-slug
  - repo_root: /home/.wopal/ontologies/wopal-space-ontology
  - base_branch: space/main
  - merge_target: space/main
  - verify_mode: switch-runtime
  - cleanup_policy: archive
"""

PLAN_VERIFYING_NO_WORKTREE = """\
- **Status**: verifying
- **Type**: feature
- **Target Project**: gesp
- **Project Type**: standard
- **Project Path**: projects/gesp
- **Issue**: #42
"""


def _write_plan(tmp_path, content: str, name: str = "42-feature-dev-flow-test.md") -> Path:
    """Write a Plan file with given content and return its path."""
    plan_dir = tmp_path / "plans"
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plan_dir / name
    plan_file.write_text(content)
    return plan_file


# -- Test: _check_feature_branch_merged function -------------------------------

class TestCheckFeatureBranchMerged:
    """Test _check_feature_branch_merged helper function."""

    def test_standard_branch_merged_returns_zero(self, tmp_path):
        """Standard project: feature branch is in merged list, returns 0."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_STANDARD)
        # Create project dir with .git so repo_root resolves
        proj_dir = tmp_path / "projects" / "gesp"
        proj_dir.mkdir(parents=True)
        (proj_dir / ".git").mkdir()

        merged_output = "  main\n* feature/test-1-slug\n"

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout=merged_output,
            )
            result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 0

    def test_standard_branch_not_merged_returns_one(self, tmp_path):
        """Standard project: feature branch NOT in merged list, returns 1."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_STANDARD)
        proj_dir = tmp_path / "projects" / "gesp"
        proj_dir.mkdir(parents=True)
        (proj_dir / ".git").mkdir()

        # Three subprocess.run calls: local merged, remote merged, git log --grep
        not_merged_result = MagicMock(returncode=0, stdout="  main\n")
        empty_result = MagicMock(returncode=0, stdout="")

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.side_effect = [not_merged_result, empty_result, empty_result]
            with patch("commands.verify.log_error") as mock_log:
                result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 1
        mock_log.assert_any_call(
            "Feature branch 'feature/test-1-slug' not yet merged to main. "
            "Please merge first."
        )

    def test_ontology_branch_merged_returns_zero(self, tmp_path):
        """Ontology-worktree: feature branch is in merged list, returns 0."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_ONTOLOGY)
        wopal_dir = tmp_path / ".wopal"
        wopal_dir.mkdir(parents=True)
        (wopal_dir / ".git").mkdir()

        merged_output = "  space/wopal-workspace\n* issue-10-slug\n"

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout=merged_output,
            )
            with patch("commands.verify.get_current_branch", return_value="space/wopal-workspace"):
                result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 0

    def test_ontology_branch_not_merged_returns_one(self, tmp_path):
        """Ontology-worktree: feature branch NOT in merged list, returns 1."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_ONTOLOGY)
        wopal_dir = tmp_path / ".wopal"
        wopal_dir.mkdir(parents=True)
        (wopal_dir / ".git").mkdir()

        # Three subprocess.run calls: local merged, remote merged, git log --grep
        not_merged_result = MagicMock(returncode=0, stdout="  space/wopal-workspace\n")
        empty_result = MagicMock(returncode=0, stdout="")

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.side_effect = [not_merged_result, empty_result, empty_result]
            with patch("commands.verify.get_current_branch", return_value="space/wopal-workspace"):
                with patch("commands.verify.log_error") as mock_log:
                    result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 1
        mock_log.assert_any_call(
            "Feature branch 'issue-10-slug' not yet merged to space/wopal-workspace. "
            "Please merge first."
        )

    def test_no_worktree_metadata_returns_zero(self, tmp_path):
        """Plan without worktree metadata: skip check, returns 0."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_NO_WORKTREE)

        result = _check_feature_branch_merged(tmp_path, str(plan_path))
        assert result == 0

    def test_no_branch_in_worktree_returns_zero(self, tmp_path):
        """Worktree metadata without branch: skip check, returns 0."""
        from commands.verify import _check_feature_branch_merged

        plan_content = PLAN_VERIFYING_NO_WORKTREE + "\n- **Worktree**:  | .worktrees/some-path\n"
        plan_path = _write_plan(tmp_path, plan_content)

        with patch("commands.verify.get_plan_worktree", return_value={"branch": "", "path": ""}):
            result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 0

    def test_git_command_failure_returns_one(self, tmp_path):
        """git branch --merged fails: returns 1."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_STANDARD)
        proj_dir = tmp_path / "projects" / "gesp"
        proj_dir.mkdir(parents=True)
        (proj_dir / ".git").mkdir()

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=128,
                stderr="fatal: bad revision 'unknown'",
            )
            with patch("commands.verify.log_error") as mock_log:
                result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 1
        mock_log.assert_any_call(
            "Failed to check merge status for branch 'feature/test-1-slug'"
        )

    def test_uses_correct_integration_branch(self, tmp_path):
        """Verify git branch --merged is called with correct integration branch."""
        from commands.verify import _check_feature_branch_merged

        # Standard → main (branch in merged list → fallback not triggered)
        plan_path_std = _write_plan(
            tmp_path, PLAN_VERIFYING_STANDARD, name="42-std.md"
        )
        proj_dir = tmp_path / "projects" / "gesp"
        proj_dir.mkdir(parents=True)
        (proj_dir / ".git").mkdir()

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0, stdout="  main\n* feature/test-1-slug\n"
            )
            _check_feature_branch_merged(tmp_path, str(plan_path_std))

        cmd = mock_run.call_args[0][0]
        assert "--merged" in cmd
        assert "main" in cmd

        # Ontology → current .wopal/ branch (dynamically detected)
        mock_run.reset_mock()
        plan_path_ont = _write_plan(
            tmp_path, PLAN_VERIFYING_ONTOLOGY, name="10-ont.md"
        )
        wopal_dir = tmp_path / ".wopal"
        wopal_dir.mkdir(parents=True)
        (wopal_dir / ".git").mkdir()

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0, stdout="  space/wopal-workspace\n* issue-10-slug\n"
            )
            with patch("commands.verify.get_current_branch", return_value="space/wopal-workspace"):
                _check_feature_branch_merged(tmp_path, str(plan_path_ont))

        cmd = mock_run.call_args[0][0]
        assert "--merged" in cmd
        assert "space/wopal-workspace" in cmd

    def test_ontology_integration_branch_is_dynamic_current_branch(self, tmp_path):
        """Ontology integration branch is the current .wopal/ branch, detected
        at runtime — not a hardcoded value.

        Regression: previously hardcoded 'space/main', which broke non-main
        spaces (e.g. space/wopal-workspace, space/gesp-space)."""
        from commands.verify import _check_feature_branch_merged

        plan_path = _write_plan(tmp_path, PLAN_VERIFYING_ONTOLOGY, name="10-dyn.md")
        wopal_dir = tmp_path / ".wopal"
        wopal_dir.mkdir(parents=True)
        (wopal_dir / ".git").mkdir()

        # Simulate a different space name to prove the value is dynamic
        current_space_branch = "space/gesp-space"

        with patch("commands.verify.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout=f"  {current_space_branch}\n* issue-10-slug\n",
            )
            with patch("commands.verify.get_current_branch", return_value=current_space_branch) as mock_branch:
                result = _check_feature_branch_merged(tmp_path, str(plan_path))

        assert result == 0
        # get_current_branch must have been called with .wopal/ repo root
        mock_branch.assert_called_once_with(str(wopal_dir))
        # git branch --merged must use the dynamically detected branch
        cmd = mock_run.call_args[0][0]
        assert current_space_branch in cmd
