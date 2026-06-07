#!/usr/bin/env python3
# test_core_workflow.py - Test shared workflow helpers
#
# Test Cases U1 + U2: status guard + repo resolution

import unittest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from workflow import (
    guard_status,
    format_suggestion,
    resolve_space_repo,
    PLAN_STATES,
    is_valid_state,
    is_valid_transition,
    get_next_state,
    get_state_order,
    get_status_display,
    plan_status_to_issue_label,
    STATUS_REVIEWING,
)


class TestGuardStatus(unittest.TestCase):
    """Test guard_status function."""

    @patch("workflow.log_error")
    def test_returns_true_when_status_matches(self, mock_log_error):
        result = guard_status("executing", "executing", "42")
        self.assertTrue(result)
        mock_log_error.assert_not_called()

    @patch("workflow.log_error")
    def test_returns_false_when_status_mismatch(self, mock_log_error):
        result = guard_status("planning", "executing", "42")
        self.assertFalse(result)
        self.assertTrue(mock_log_error.called)

    @patch("workflow.log_error")
    def test_prints_error_with_expected_and_current(self, mock_log_error):
        guard_status("planning", "executing", "42")
        calls = [str(c) for c in mock_log_error.call_args_list]
        self.assertTrue(any("executing" in c and "planning" in c for c in calls))

    @patch("workflow.log_error")
    def test_includes_suggestion_in_output(self, mock_log_error):
        guard_status("planning", "executing", "42")
        calls = [str(c) for c in mock_log_error.call_args_list]
        self.assertTrue(any("approve --confirm 42" in c for c in calls))


class TestFormatSuggestion(unittest.TestCase):
    """Test format_suggestion function."""

    def test_executing_planning_suggests_approve(self):
        result = format_suggestion("planning", "executing", "42")
        self.assertEqual(result, "Run: flow.sh approve --confirm 42")

    def test_executing_verifying_suggests_verify(self):
        result = format_suggestion("verifying", "executing", "42")
        self.assertEqual(result, "Run: flow.sh verify --confirm 42")

    def test_executing_done_suggests_archive(self):
        result = format_suggestion("done", "executing", "42")
        self.assertEqual(result, "Run: flow.sh archive 42")

    def test_verifying_planning_suggests_approve(self):
        result = format_suggestion("planning", "verifying", "test-plan")
        self.assertEqual(result, "Run: flow.sh approve --confirm test-plan")

    def test_verifying_executing_suggests_complete(self):
        result = format_suggestion("executing", "verifying", "test-plan")
        self.assertEqual(result, "Run: flow.sh complete test-plan")

    def test_done_planning_suggests_approve(self):
        result = format_suggestion("planning", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh approve --confirm my-plan")

    def test_done_executing_suggests_complete(self):
        result = format_suggestion("executing", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh complete my-plan")

    def test_done_verifying_suggests_verify(self):
        result = format_suggestion("verifying", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh verify --confirm my-plan")

    def test_unknown_status_returns_fallback(self):
        result = format_suggestion("unknown_status", "executing", "42")
        self.assertEqual(result, "Check plan status")

    def test_unknown_expected_returns_fallback(self):
        result = format_suggestion("executing", "unknown_expected", "42")
        self.assertEqual(result, "Check plan status")

    def test_works_with_plan_name_ref(self):
        result = format_suggestion("planning", "executing", "refactor-dev-flow-foo")
        self.assertIn("refactor-dev-flow-foo", result)


class TestReviewingState(unittest.TestCase):
    """Test reviewing state additions to the state machine."""

    def test_reviewing_in_plan_states(self):
        self.assertIn("reviewing", PLAN_STATES)

    def test_plan_states_order(self):
        self.assertEqual(
            PLAN_STATES,
            ["planning", "reviewing", "executing", "verifying", "done"],
        )

    def test_status_reviewing_constant(self):
        self.assertEqual(STATUS_REVIEWING, "reviewing")

    def test_is_valid_state_reviewing(self):
        self.assertTrue(is_valid_state("reviewing"))

    def test_valid_transition_planning_to_reviewing(self):
        self.assertTrue(is_valid_transition("planning", "reviewing"))

    def test_valid_transition_reviewing_to_executing(self):
        self.assertTrue(is_valid_transition("reviewing", "executing"))

    def test_valid_transition_planning_to_executing_shortcut(self):
        """planning -> executing shortcut path must still be valid."""
        self.assertTrue(is_valid_transition("planning", "executing"))

    def test_invalid_transition_reviewing_to_planning_direct(self):
        """reviewing -> planning is only valid as a reset (handled by to_state==planning rule)."""
        self.assertTrue(is_valid_transition("reviewing", "planning"))

    def test_invalid_transition_reviewing_to_verifying(self):
        self.assertFalse(is_valid_transition("reviewing", "verifying"))

    def test_invalid_transition_reviewing_to_done(self):
        self.assertFalse(is_valid_transition("reviewing", "done"))

    def test_same_state_reviewing_allowed(self):
        self.assertTrue(is_valid_transition("reviewing", "reviewing"))

    def test_get_state_order_reviewing(self):
        self.assertEqual(get_state_order("reviewing"), 2)

    def test_get_state_order_executing_shifted(self):
        """executing order shifts from 2 to 3 after reviewing insertion."""
        self.assertEqual(get_state_order("executing"), 3)

    def test_get_state_order_verifying_shifted(self):
        self.assertEqual(get_state_order("verifying"), 4)

    def test_get_state_order_done_shifted(self):
        self.assertEqual(get_state_order("done"), 5)


class TestGetStatusDisplayReviewing(unittest.TestCase):
    """Test get_status_display for reviewing state."""

    def test_reviewing_display(self):
        result = get_status_display("reviewing")
        self.assertEqual(result["order"], 2)
        self.assertEqual(result["name"], "reviewing")
        self.assertEqual(result["emoji"], "R")


class TestPlanStatusToIssueLabelReviewing(unittest.TestCase):
    """Test plan_status_to_issue_label for reviewing state."""

    def test_reviewing_maps_to_planning_label(self):
        """reviewing reuses status/planning Issue label."""
        self.assertEqual(plan_status_to_issue_label("reviewing"), "status/planning")


class TestGetNextStateSubmit(unittest.TestCase):
    """Test get_next_state for submit command."""

    def test_submit_maps_to_reviewing(self):
        self.assertEqual(get_next_state("submit"), "reviewing")


class TestFormatSuggestionReviewing(unittest.TestCase):
    """Test format_suggestion for reviewing-related scenarios."""

    def test_reviewing_planning_suggests_submit(self):
        result = format_suggestion("planning", "reviewing", "42")
        self.assertEqual(result, "Run: flow.sh submit 42")

    def test_executing_reviewing_suggests_approve(self):
        result = format_suggestion("reviewing", "executing", "test-plan")
        self.assertEqual(result, "Run: flow.sh approve --confirm test-plan")


class TestResolveSpaceRepo(unittest.TestCase):
    """Test resolve_space_repo function."""

    def test_returns_empty_when_no_issue(self):
        result = resolve_space_repo(None, Path("/tmp"))
        self.assertEqual(result, "")

    def test_returns_empty_when_issue_zero(self):
        result = resolve_space_repo(0, Path("/tmp"))
        self.assertEqual(result, "")

    def test_returns_empty_when_issue_empty_string(self):
        result = resolve_space_repo("", Path("/tmp"))
        self.assertEqual(result, "")

    @patch("workflow.detect_space_repo")
    def test_returns_repo_when_issue_and_repo_resolvable(self, mock_detect):
        mock_detect.return_value = "sampx/wopal-space"
        result = resolve_space_repo(42, Path("/workspace"))
        self.assertEqual(result, "sampx/wopal-space")
        mock_detect.assert_called_once_with(Path("/workspace"))

    @patch("workflow.detect_space_repo")
    def test_returns_repo_with_string_issue(self, mock_detect):
        mock_detect.return_value = "owner/repo"
        result = resolve_space_repo("42", Path("/workspace"))
        self.assertEqual(result, "owner/repo")

    @patch("workflow.log_warn")
    @patch("workflow.detect_space_repo")
    def test_returns_empty_on_repo_error(self, mock_detect, mock_log_warn):
        mock_detect.side_effect = RuntimeError("No origin remote configured")
        result = resolve_space_repo(42, Path("/tmp"))
        self.assertEqual(result, "")
        mock_log_warn.assert_called_once()

    @patch("workflow.log_warn")
    @patch("workflow.detect_space_repo")
    def test_warns_on_repo_error(self, mock_detect, mock_log_warn):
        mock_detect.side_effect = RuntimeError("No origin remote configured")
        resolve_space_repo(42, Path("/tmp"))
        self.assertIn("Cannot determine space repo", str(mock_log_warn.call_args))

    @patch("workflow.detect_space_repo")
    def test_does_not_call_detect_when_no_issue(self, mock_detect):
        resolve_space_repo(None, Path("/tmp"))
        mock_detect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
