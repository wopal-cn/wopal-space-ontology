#!/usr/bin/env python3
# test_approve.py - Test approve command (--confirm-only mode)
#
# Test Cases:
#   - No --confirm: error with "Use: flow.sh submit <plan>"
#   - --confirm from planning/reviewing status: proceeds
#   - --confirm from executing/verifying/done status: blocked
#   - No target: error message
#   - Parser registration

import unittest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from argparse import Namespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.plan_commit import RESULT_OK


def _make_approve_mocks(status="planning"):
    """Common mock dict for approve --confirm tests.
    
    Returns dict of {attribute: MagicMock(return_value=value)}.
    """
    values = {
        "find_workspace_root": Path("/ws"),
        "find_plan": "/ws/.wopal-space/plans/space-ontology/42-fix-test.md",
        "parse_plan_status": status,
        "check_doc_plan": None,
        "get_plan_issue": 42,
        "get_plan_project": "space-ontology",
        "get_plan_field": "ontology-worktree",
        "resolve_project_path": Path("/ws/.wopal"),
        "detect_space_repo": "wopal-space-ontology",
        "is_repo_dirty": False,
        "write_worktree_context": True,
        "commit_and_push_plan": RESULT_OK,
        "update_plan_status": True,
        "sync_status_label": None,
        "sync_plan_to_issue_body": None,
        "ensure_issue_labels": None,
    }
    return {k: MagicMock(return_value=v) for k, v in values.items()}


class TestApproveNoConfirm(unittest.TestCase):
    """Test approve without --confirm errors with redirect to submit."""

    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    def test_approve_no_target_returns_error(self, mock_ws):
        from commands.approve import cmd_approve
        args = Namespace(target=None, confirm=False, no_worktree=False)
        result = cmd_approve(args)
        self.assertEqual(result, 1)

    @patch("commands.approve.find_plan", return_value="/ws/.wopal-space/plans/space-ontology/42-fix-test.md")
    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    def test_approve_no_confirm_errors(self, mock_ws, mock_find):
        from commands.approve import cmd_approve
        args = Namespace(target="42", confirm=False, no_worktree=False)
        result = cmd_approve(args)
        self.assertEqual(result, 1)

    @patch("commands.approve.find_plan", return_value="/ws/.wopal-space/plans/space-ontology/42-fix-test.md")
    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.approve.log_error")
    def test_approve_no_confirm_shows_submit_message(self, mock_log_error, mock_ws, mock_find):
        from commands.approve import cmd_approve
        args = Namespace(target="42", confirm=False, no_worktree=False)
        cmd_approve(args)
        calls = [str(c) for c in mock_log_error.call_args_list]
        self.assertTrue(
            any("flow.sh submit" in c for c in calls),
            f"Expected 'flow.sh submit' in error messages: {calls}"
        )


class TestApproveConfirmFromPlanning(unittest.TestCase):
    """Test approve --confirm from planning status proceeds."""

    def test_approve_confirm_from_planning_proceeds(self):
        from commands.approve import cmd_approve
        mocks = _make_approve_mocks(status="planning")
        with patch.multiple("commands.approve", **mocks):
            args = Namespace(target="42", confirm=True, no_worktree=True)
            result = cmd_approve(args)
            self.assertEqual(result, 0)


class TestApproveConfirmFromReviewing(unittest.TestCase):
    """Test approve --confirm from reviewing status proceeds."""

    def test_approve_confirm_from_reviewing_proceeds(self):
        from commands.approve import cmd_approve
        mocks = _make_approve_mocks(status="reviewing")
        with patch.multiple("commands.approve", **mocks):
            args = Namespace(target="42", confirm=True, no_worktree=True)
            result = cmd_approve(args)
            self.assertEqual(result, 0)


class TestApproveBlockedStatus(unittest.TestCase):
    """Test approve --confirm blocked by wrong status."""

    @patch("commands.approve.find_plan", return_value="/ws/.wopal-space/plans/space-ontology/42-fix-test.md")
    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.approve.parse_plan_status", return_value="executing")
    def test_approve_confirm_rejects_executing(self, mock_parse, mock_ws, mock_find):
        from commands.approve import cmd_approve
        args = Namespace(target="42", confirm=True, no_worktree=False)
        result = cmd_approve(args)
        self.assertEqual(result, 1)

    @patch("commands.approve.find_plan", return_value="/ws/.wopal-space/plans/space-ontology/42-fix-test.md")
    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.approve.parse_plan_status", return_value="done")
    def test_approve_confirm_rejects_done(self, mock_parse, mock_ws, mock_find):
        from commands.approve import cmd_approve
        args = Namespace(target="42", confirm=True, no_worktree=False)
        result = cmd_approve(args)
        self.assertEqual(result, 1)

    @patch("commands.approve.find_plan", return_value="/ws/.wopal-space/plans/space-ontology/42-fix-test.md")
    @patch("commands.approve.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.approve.parse_plan_status", return_value="verifying")
    def test_approve_confirm_rejects_verifying(self, mock_parse, mock_ws, mock_find):
        from commands.approve import cmd_approve
        args = Namespace(target="42", confirm=True, no_worktree=False)
        result = cmd_approve(args)
        self.assertEqual(result, 1)


class TestRegisterApproveParser(unittest.TestCase):
    """Test approve parser registration."""

    def test_approve_parser_has_confirm(self):
        import argparse
        from commands.approve import register_approve_parser
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest="command")
        register_approve_parser(subparsers)
        args = parser.parse_args(["approve", "42", "--confirm"])
        self.assertEqual(args.command, "approve")
        self.assertEqual(args.target, "42")
        self.assertTrue(args.confirm)

    def test_approve_parser_no_confirm_by_default(self):
        import argparse
        from commands.approve import register_approve_parser
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest="command")
        register_approve_parser(subparsers)
        args = parser.parse_args(["approve", "42"])
        self.assertEqual(args.command, "approve")
        self.assertFalse(args.confirm)


if __name__ == "__main__":
    unittest.main()
