#!/usr/bin/env python3
# test_no_issue_lifecycle.py - Test no-issue plan lifecycle
#
# Test Cases I1 + I2: no-issue complete/verify paths
#
# Verifies that no-issue plans can complete and verify without
# depending on GitHub repo resolution.

import unittest
import sys
import os
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from commands.complete import cmd_complete
from commands.verify import cmd_verify
from lib.worktree import ActivePlanInfo


def _create_no_issue_plan(tmp_dir: str, status: str = "executing") -> str:
    """Create a minimal plan file with no Issue number."""
    plan_dir = os.path.join(tmp_dir, "plans")
    os.makedirs(plan_dir, exist_ok=True)
    plan_path = os.path.join(plan_dir, "test-no-issue-plan.md")

    content = f"""# test-no-issue-plan

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space
- **Created**: 2026-05-13
- **Status**: {status}

## Implementation

### Task 1: Test task

**Changes**:
- [x] Step 1: Do something

**Verification**:
- [x] Step 1: Verify something

## Acceptance Criteria

### Agent Verification
- [x] AC 1 verified

### User Validation
- [x] test confirmed
"""
    with open(plan_path, "w") as f:
        f.write(content)

    return plan_path


class TestNoIssueComplete(unittest.TestCase):
    """Test Case I1: no-issue complete path."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_path = _create_no_issue_plan(self.tmp_dir, "executing")
        self.plan_name = "test-no-issue-plan"

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    @patch("commands.complete.sync_plan_to_issue_body")
    @patch("commands.complete.sync_status_label")
    @patch("commands.complete.update_plan_status", return_value=True)
    @patch("commands.complete.check_acceptance_criteria")
    @patch("commands.complete.check_step_completion")
    @patch("commands.complete.find_workspace_root")
    @patch("commands.complete.find_plan")
    def test_complete_no_issue_succeeds(
        self, mock_find_plan, mock_workspace, mock_check_step,
        mock_check_ac, mock_update_status, mock_sync_label, mock_sync_body
    ):
        """complete on no-issue plan should succeed without repo resolution."""
        mock_find_plan.return_value = self.plan_path
        mock_workspace.return_value = Path(self.tmp_dir)

        args = MagicMock()
        args.target = self.plan_name
        args.pr = False

        result = cmd_complete(args)

        self.assertEqual(result, 0, "complete should succeed for no-issue plan")

    @patch("commands.complete.sync_plan_to_issue_body")
    @patch("commands.complete.sync_status_label")
    @patch("commands.complete.update_plan_status", return_value=True)
    @patch("commands.complete.check_acceptance_criteria")
    @patch("commands.complete.check_step_completion")
    @patch("commands.complete.find_workspace_root")
    @patch("commands.complete.find_plan")
    def test_complete_no_issue_skips_issue_sync(
        self, mock_find_plan, mock_workspace, mock_check_step,
        mock_check_ac, mock_update_status, mock_sync_label, mock_sync_body
    ):
        """complete should skip Issue sync when there's no issue."""
        mock_find_plan.return_value = self.plan_path
        mock_workspace.return_value = Path(self.tmp_dir)

        args = MagicMock()
        args.target = self.plan_name
        args.pr = False

        cmd_complete(args)

        mock_sync_label.assert_not_called()
        mock_sync_body.assert_not_called()


class TestNoIssueVerify(unittest.TestCase):
    """Test Case I2: no-issue verify path."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_path = _create_no_issue_plan(self.tmp_dir, "verifying")
        self.plan_name = "test-no-issue-plan"

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_verify_no_issue_succeeds(
        self, mock_find_plan, mock_workspace, mock_resolve, mock_check_uv,
        mock_update_status, mock_commit, mock_sync_label, mock_sync_body
    ):
        """verify on no-issue plan should succeed without repo resolution."""
        mock_find_plan.return_value = self.plan_path
        mock_workspace.return_value = Path(self.tmp_dir)
        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(self.plan_path),
            commit_repo_root=Path(self.tmp_dir),
            repo_relative_plan_path=f"plans/{Path(self.plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = self.plan_name
        args.confirm = True

        result = cmd_verify(args)

        self.assertEqual(result, 0, "verify should succeed for no-issue plan")

    @patch("commands.verify.sync_plan_to_issue_body")
    @patch("commands.verify.sync_status_label")
    @patch("commands.verify.commit_paths", return_value=True)
    @patch("commands.verify.update_plan_status", return_value=True)
    @patch("commands.verify.check_user_validation")
    @patch("commands.verify.resolve_active_plan")
    @patch("commands.verify.find_workspace_root")
    @patch("commands.verify.find_plan")
    def test_verify_no_issue_skips_issue_sync(
        self, mock_find_plan, mock_workspace, mock_resolve, mock_check_uv,
        mock_update_status, mock_commit, mock_sync_label, mock_sync_body
    ):
        """verify should skip Issue sync when there's no issue."""
        mock_find_plan.return_value = self.plan_path
        mock_workspace.return_value = Path(self.tmp_dir)
        mock_resolve.return_value = ActivePlanInfo(
            active_plan_path=Path(self.plan_path),
            commit_repo_root=Path(self.tmp_dir),
            repo_relative_plan_path=f"plans/{Path(self.plan_path).name}",
            branch_context="integration",
        )

        args = MagicMock()
        args.target = self.plan_name
        args.confirm = True

        cmd_verify(args)

        mock_sync_label.assert_not_called()
        mock_sync_body.assert_not_called()


if __name__ == "__main__":
    unittest.main()
