#!/usr/bin/env python3
# test_submit.py - Test submit command
#
# Test Cases:
#   - Happy path: planning → reviewing with commit/push
#   - Wrong status guard: non-planning status rejected
#   - Validation failure: check_doc blocks submit
#   - No target: error message
#   - Output message: "Next: flow.sh approve <plan> --confirm"

import unittest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, call
from argparse import Namespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from commands.submit import cmd_submit, register_submit_parser


class TestSubmitHappyPath(unittest.TestCase):
    """Test submit happy path: planning → reviewing."""

    @patch("commands.submit.commit_and_push_plan", return_value=True)
    @patch("commands.submit.update_plan_status", return_value=True)
    @patch("commands.submit.check_doc_plan")
    @patch("commands.submit.get_plan_issue", return_value=42)
    @patch("commands.submit.get_plan_status", return_value="planning")
    @patch("commands.submit.parse_plan_status", return_value="planning")
    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    def test_submit_transitions_planning_to_reviewing(
        self, mock_ws, mock_find, mock_parse, mock_get_status,
        mock_get_issue, mock_check_doc, mock_update, mock_commit
    ):
        args = Namespace(target="42")
        result = cmd_submit(args)
        self.assertEqual(result, 0)
        mock_update.assert_called_once_with("/ws/.wopal/docs/plans/42-fix-test.md", "reviewing")

    @patch("commands.submit.commit_and_push_plan", return_value=True)
    @patch("commands.submit.update_plan_status", return_value=True)
    @patch("commands.submit.check_doc_plan")
    @patch("commands.submit.get_plan_issue", return_value=42)
    @patch("commands.submit.get_plan_status", return_value="planning")
    @patch("commands.submit.parse_plan_status", return_value="planning")
    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    def test_submit_outputs_next_approve_confirm(
        self, mock_ws, mock_find, mock_parse, mock_get_status,
        mock_get_issue, mock_check_doc, mock_update, mock_commit
    ):
        import io
        import sys as _sys
        old_stdout = _sys.stdout
        _sys.stdout = io.StringIO()
        try:
            args = Namespace(target="42")
            result = cmd_submit(args)
            output = _sys.stdout.getvalue()
            self.assertIn("Next: flow.sh approve 42 --confirm", output)
            self.assertIn("Status: reviewing", output)
        finally:
            _sys.stdout = old_stdout


class TestSubmitWrongStatus(unittest.TestCase):
    """Test submit rejects non-planning status."""

    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.submit.parse_plan_status", return_value="executing")
    def test_submit_rejects_executing(self, mock_parse, mock_ws, mock_find):
        args = Namespace(target="42")
        result = cmd_submit(args)
        self.assertEqual(result, 1)

    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.submit.parse_plan_status", return_value="reviewing")
    def test_submit_rejects_reviewing(self, mock_parse, mock_ws, mock_find):
        args = Namespace(target="42")
        result = cmd_submit(args)
        self.assertEqual(result, 1)

    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    @patch("commands.submit.parse_plan_status", return_value="done")
    def test_submit_rejects_done(self, mock_parse, mock_ws, mock_find):
        args = Namespace(target="42")
        result = cmd_submit(args)
        self.assertEqual(result, 1)


class TestSubmitValidationFailure(unittest.TestCase):
    """Test submit blocked by check_doc validation failure."""

    @patch("commands.submit.check_doc_plan", side_effect=Exception("Validation failed"))
    @patch("commands.submit.get_plan_issue", return_value=42)
    @patch("commands.submit.get_plan_status", return_value="planning")
    @patch("commands.submit.parse_plan_status", return_value="planning")
    @patch("commands.submit.find_plan", return_value="/ws/.wopal/docs/plans/42-fix-test.md")
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    def test_submit_blocks_on_validation_error(
        self, mock_ws, mock_find, mock_parse, mock_get_status,
        mock_get_issue, mock_check_doc
    ):
        # Patch ValidationError at the module level
        from validation import ValidationError
        mock_check_doc.side_effect = ValidationError("missing field")
        args = Namespace(target="42")
        result = cmd_submit(args)
        self.assertEqual(result, 1)


class TestSubmitNoTarget(unittest.TestCase):
    """Test submit with no target."""

    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    def test_submit_no_target_returns_error(self, mock_ws):
        args = Namespace(target=None)
        result = cmd_submit(args)
        self.assertEqual(result, 1)


class TestSubmitPlanNotFound(unittest.TestCase):
    """Test submit with plan not found."""

    @patch("commands.submit.find_plan", side_effect=FileNotFoundError("not found"))
    @patch("commands.submit.find_workspace_root", return_value=Path("/ws"))
    def test_submit_plan_not_found(self, mock_ws, mock_find):
        args = Namespace(target="999")
        result = cmd_submit(args)
        self.assertEqual(result, 1)


class TestRegisterSubmitParser(unittest.TestCase):
    """Test submit parser registration."""

    def test_submit_parser_registered(self):
        import argparse
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest="command")
        register_submit_parser(subparsers)
        # Parse submit command
        args = parser.parse_args(["submit", "42"])
        self.assertEqual(args.command, "submit")
        self.assertEqual(args.target, "42")


if __name__ == "__main__":
    unittest.main()
