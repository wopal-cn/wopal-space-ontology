#!/usr/bin/env python3
# test_sync_consolidation.py - Test sync helper consolidation
#
# Verify that domain.issue.sync provides unified wrappers that command layer
# can import, replacing duplicate implementations.

import unittest
import sys
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock, call

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.domain.issue.sync import (
    sync_status_label_group,
    sync_type_label_group,
    sync_project_label_group,
    ensure_label_exists,
    plan_status_to_issue_label,
    plan_project_to_issue_label,
    ensure_issue_labels,
    STATUS_LABELS,
    TYPE_LABELS,
)


# ============================================
# sync_status_label_group tests
# ============================================


class TestSyncStatusLabelGroup(unittest.TestCase):
    """Test domain.issue.sync.sync_status_label_group wrapper."""

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_removes_old_status_and_adds_new(self, mock_subprocess, mock_get_labels):
        """sync_status_label_group: removes old status labels, adds new."""
        mock_get_labels.return_value = ["status/planning", "type/feature"]
        sync_status_label_group("42", "status/in-progress", "owner/repo")
        # Should have called gh with remove status/planning and add status/in-progress
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("--remove-label", args)
        self.assertIn("status/planning", args)
        self.assertIn("--add-label", args)
        self.assertIn("status/in-progress", args)

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_accepts_int_issue_number(self, mock_subprocess, mock_get_labels):
        """sync_status_label_group: accepts int issue_number."""
        mock_get_labels.return_value = []
        sync_status_label_group(42, "status/planning", "owner/repo")
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("42", args)

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_accepts_str_issue_number(self, mock_subprocess, mock_get_labels):
        """sync_status_label_group: accepts str issue_number."""
        mock_get_labels.return_value = []
        sync_status_label_group("42", "status/planning", "owner/repo")
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("42", args)

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_noop_when_label_already_set(self, mock_subprocess, mock_get_labels):
        """sync_status_label_group: no-op when desired label already present."""
        mock_get_labels.return_value = ["status/in-progress"]
        sync_status_label_group("42", "status/in-progress", "owner/repo")
        # subprocess.run should not be called for label edit
        for c in mock_subprocess.run.call_args_list:
            if c[0] and "issue" in str(c[0][0]):
                self.fail("Should not call gh when label already set")

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_removes_all_conflicting_status_labels(self, mock_subprocess, mock_get_labels):
        """sync_status_label_group: removes multiple conflicting status labels."""
        mock_get_labels.return_value = ["status/planning", "status/in-progress", "type/feature"]
        sync_status_label_group("42", "status/done", "owner/repo")
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("status/planning", args)
        self.assertIn("status/in-progress", args)
        self.assertIn("status/done", args)


# ============================================
# ensure_label_exists tests
# ============================================


class TestEnsureLabelExists(unittest.TestCase):
    """Test domain.issue.sync.ensure_label_exists."""

    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_creates_status_label_with_correct_color(self, mock_subprocess):
        """ensure_label_exists: status/planning gets color fbca04."""
        ensure_label_exists("status/planning", "owner/repo")
        create_call = mock_subprocess.run.call_args
        args = create_call[0][0]
        self.assertIn("--color", args)
        color_idx = args.index("--color")
        self.assertEqual(args[color_idx + 1], "fbca04")

    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_creates_type_label_with_correct_color(self, mock_subprocess):
        """ensure_label_exists: type/feature gets color 1d76db."""
        ensure_label_exists("type/feature", "owner/repo")
        create_call = mock_subprocess.run.call_args
        args = create_call[0][0]
        self.assertIn("--color", args)
        color_idx = args.index("--color")
        self.assertEqual(args[color_idx + 1], "1d76db")

    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_unknown_label_gets_default_color(self, mock_subprocess):
        """ensure_label_exists: unknown label gets color dddddd."""
        ensure_label_exists("custom/label", "owner/repo")
        create_call = mock_subprocess.run.call_args
        args = create_call[0][0]
        self.assertIn("--color", args)
        color_idx = args.index("--color")
        self.assertEqual(args[color_idx + 1], "dddddd")


# ============================================
# plan_status_to_issue_label tests
# ============================================


class TestPlanStatusToIssueLabel(unittest.TestCase):
    """Test plan_status_to_issue_label mapping."""

    def test_planning_maps_to_status_planning(self):
        self.assertEqual(plan_status_to_issue_label("planning"), "status/planning")

    def test_executing_maps_to_status_in_progress(self):
        self.assertEqual(plan_status_to_issue_label("executing"), "status/in-progress")

    def test_verifying_maps_to_status_verifying(self):
        self.assertEqual(plan_status_to_issue_label("verifying"), "status/verifying")

    def test_done_maps_to_status_done(self):
        self.assertEqual(plan_status_to_issue_label("done"), "status/done")

    def test_unknown_returns_empty(self):
        self.assertEqual(plan_status_to_issue_label("unknown"), "")


# ============================================
# plan_project_to_issue_label tests
# ============================================


class TestPlanProjectToIssueLabel(unittest.TestCase):
    """Test plan_project_to_issue_label mapping."""

    def test_project_name_to_label(self):
        self.assertEqual(plan_project_to_issue_label("ontology"), "project/ontology")

    def test_empty_project_returns_empty(self):
        self.assertEqual(plan_project_to_issue_label(""), "")


# ============================================
# sync_type_label_group tests
# ============================================


class TestSyncTypeLabelGroup(unittest.TestCase):
    """Test sync_type_label_group wrapper."""

    @patch("dev_flow.domain.issue.sync.ensure_label_exists")
    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_removes_old_type_and_adds_new(self, mock_subprocess, mock_get_labels, mock_ensure):
        """sync_type_label_group: removes old type labels, adds new."""
        mock_get_labels.return_value = ["type/bug", "status/planning"]
        sync_type_label_group("42", "type/feature", "owner/repo")
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("--remove-label", args)
        self.assertIn("type/bug", args)
        self.assertIn("--add-label", args)
        self.assertIn("type/feature", args)

    @patch("dev_flow.domain.issue.sync.ensure_label_exists")
    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_ensures_label_exists_before_adding(self, mock_subprocess, mock_get_labels, mock_ensure):
        """sync_type_label_group: ensures target label exists."""
        mock_get_labels.return_value = []
        sync_type_label_group("42", "type/feature", "owner/repo")
        mock_ensure.assert_called_once_with("type/feature", "owner/repo")


# ============================================
# sync_project_label_group tests
# ============================================


class TestSyncProjectLabelGroup(unittest.TestCase):
    """Test sync_project_label_group wrapper."""

    @patch("dev_flow.domain.issue.sync._get_issue_labels")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_removes_old_project_labels(self, mock_subprocess, mock_get_labels):
        """sync_project_label_group: removes old project/* labels."""
        mock_get_labels.return_value = ["project/old-project", "status/planning"]
        sync_project_label_group("42", "project/new-project", "owner/repo")
        run_call = mock_subprocess.run.call_args_list[-1]
        args = run_call[0][0]
        self.assertIn("--remove-label", args)
        self.assertIn("project/old-project", args)
        self.assertIn("--add-label", args)
        self.assertIn("project/new-project", args)


# ============================================
# ensure_issue_labels tests (domain layer)
# ============================================


class TestEnsureIssueLabels(unittest.TestCase):
    """Test ensure_issue_labels from domain layer."""

    @patch("dev_flow.domain.issue.sync.sync_project_label_group")
    @patch("dev_flow.domain.issue.sync.sync_type_label_group")
    @patch("dev_flow.domain.issue.sync.get_plan_type")
    @patch("dev_flow.domain.issue.sync.get_plan_project")
    @patch("dev_flow.domain.issue.sync.subprocess")
    def test_calls_sync_functions_with_plan_metadata(
        self, mock_subprocess, mock_get_project, mock_get_type,
        mock_sync_type, mock_sync_project
    ):
        """ensure_issue_labels: reads plan metadata and syncs label groups."""
        mock_get_type.return_value = "feature"
        mock_get_project.return_value = "ontology"

        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False) as f:
            f.write("# test plan\n")
            f.flush()
            ensure_issue_labels(42, f.name, "owner/repo")

        mock_sync_type.assert_called_once_with(42, "type/feature", "owner/repo")
        mock_sync_project.assert_called_once_with(42, "project/ontology", "owner/repo")


# ============================================
# Command layer import verification
# ============================================


class TestCommandLayerImports(unittest.TestCase):
    """Verify command layer modules can import from domain.issue.sync."""

    def test_sync_command_imports_sync_status_label_group(self):
        """commands/sync: imports sync_status_label_group from domain."""
        from dev_flow.commands import sync as sync_mod
        self.assertTrue(
            hasattr(sync_mod, "sync_status_label_group") or
            _imports_from_domain(sync_mod, "sync_status_label_group", "dev_flow.domain.issue.sync")
        )

    def test_sync_command_imports_ensure_label_exists(self):
        """commands/sync: imports ensure_label_exists from domain."""
        from dev_flow.commands import sync as sync_mod
        self.assertTrue(
            hasattr(sync_mod, "ensure_label_exists") or
            _imports_from_domain(sync_mod, "ensure_label_exists", "dev_flow.domain.issue.sync")
        )

    def test_issue_command_imports_ensure_label_exists(self):
        """commands/issue: imports ensure_label_exists from domain."""
        from dev_flow.commands import issue as issue_mod
        self.assertTrue(
            hasattr(issue_mod, "ensure_label_exists") or
            _imports_from_domain(issue_mod, "ensure_label_exists", "dev_flow.domain.issue.sync")
        )

    def test_issue_command_imports_sync_type_label_group(self):
        """commands/issue: imports sync_type_label_group from domain."""
        from dev_flow.commands import issue as issue_mod
        self.assertTrue(
            hasattr(issue_mod, "sync_type_label_group") or
            _imports_from_domain(issue_mod, "sync_type_label_group", "dev_flow.domain.issue.sync")
        )

    def test_issue_command_imports_sync_project_label_group(self):
        """commands/issue: imports sync_project_label_group from domain."""
        from dev_flow.commands import issue as issue_mod
        self.assertTrue(
            hasattr(issue_mod, "sync_project_label_group") or
            _imports_from_domain(issue_mod, "sync_project_label_group", "dev_flow.domain.issue.sync")
        )

    def test_reset_command_imports_sync_status_label_group(self):
        """commands/reset: imports sync_status_label_group from domain."""
        from dev_flow.commands import reset as reset_mod
        self.assertTrue(
            hasattr(reset_mod, "sync_status_label_group") or
            _imports_from_domain(reset_mod, "sync_status_label_group", "dev_flow.domain.issue.sync")
        )

    def test_plan_command_imports_ensure_label_exists(self):
        """commands/plan: imports ensure_label_exists from domain."""
        from dev_flow.commands import plan as plan_mod
        self.assertTrue(
            hasattr(plan_mod, "ensure_label_exists") or
            _imports_from_domain(plan_mod, "ensure_label_exists", "dev_flow.domain.issue.sync")
        )


def _imports_from_domain(module, func_name: str, domain_module: str) -> bool:
    """Check if module has an import from domain layer for the given function."""
    import inspect
    source = inspect.getsource(module)
    return f"from {domain_module} import" in source and func_name in source


if __name__ == "__main__":
    unittest.main()
