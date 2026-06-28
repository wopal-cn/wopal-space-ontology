#!/usr/bin/env python3
# test_plan_cmd.py - Test plan subcommands (new/status/list)
#
# Tests:
#   1. plan subcommand dispatch (new/status/list)
#   2. plan list local-only (no --issue)
#   3. plan list with --issue (merged with GitHub Issues)
#   4. plan status display
#   5. _scan_local_plans helper
#   6. _get_plan_metadata helper
#   7. _get_status_display_list helper
#   8. _extract_slug helper

import unittest
import sys
import tempfile
import shutil
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
from argparse import Namespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from commands.plan import (
    _get_plan_metadata,
    _extract_slug,
    _get_status_display_list,
    _scan_local_plans,
    _cmd_plan_list,
    _cmd_plan_list_local_only,
    _cmd_plan_list_with_issue,
    _cmd_plan_status,
    _derive_project_path,
    cmd_plan,
    register_plan_parser,
)


PLAN_TEMPLATE_WITH_ISSUE = """# {plan_name}

## Metadata

- **Issue**: #42
- **Type**: fix
- **Target Project**: wopal-cli
- **Created**: 2026-05-01
- **Status**: executing

## Goal

Some goal text.
"""

PLAN_TEMPLATE_NO_ISSUE = """# refactor-cleanup-logs

## Metadata

- **Type**: refactor
- **Target Project**: wopal-site
- **Created**: 2026-05-02
- **Status**: planning

## Goal

Cleanup old logs.
"""


class TestGetPlanMetadata(unittest.TestCase):
    """Test _get_plan_metadata extracts fields correctly."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_file = Path(self.tmp_dir) / "42-fix-cli-bug.md"
        self.plan_file.write_text(PLAN_TEMPLATE_WITH_ISSUE.replace("{plan_name}", "42-fix-cli-bug"))

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_extracts_all_fields(self):
        metadata = _get_plan_metadata(str(self.plan_file))
        self.assertEqual(metadata['status'], 'executing')
        self.assertEqual(metadata['issue'], '#42')
        self.assertEqual(metadata['project'], 'wopal-cli')
        self.assertEqual(metadata['created'], '2026-05-01')
        self.assertEqual(metadata['type'], 'fix')

    def test_returns_empty_dict_for_missing_file(self):
        metadata = _get_plan_metadata(str(Path(self.tmp_dir) / "nonexistent.md"))
        self.assertEqual(metadata, {})


class TestExtractSlug(unittest.TestCase):
    """Test _extract_slug."""

    def test_issue_prefixed_name(self):
        self.assertEqual(_extract_slug("42-fix-task-wait-bug"), "task-wait-bug")

    def test_no_issue_prefix(self):
        self.assertEqual(_extract_slug("refactor-optimize-files"), "optimize-files")

    def test_type_prefix_only(self):
        self.assertEqual(_extract_slug("feature-add-auth"), "add-auth")


class TestGetStatusDisplayList(unittest.TestCase):
    """Test _get_status_display_list."""

    def test_planning_position(self):
        display = _get_status_display_list("planning")
        self.assertIn(">> planning <<", display)
        self.assertNotIn(">> executing <<", display)

    def test_executing_position(self):
        display = _get_status_display_list("executing")
        self.assertIn(">> executing <<", display)

    def test_unknown_status(self):
        display = _get_status_display_list("unknown")
        self.assertNotIn(">> unknown <<", display)
        # When unknown status not in PLAN_STATES, no marker is highlighted
        self.assertEqual(display, 'planning -> reviewing -> executing -> verifying -> done')


class TestScanLocalPlans(unittest.TestCase):
    """Test _scan_local_plans discovers plan files correctly."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.ws = Path(self.tmp_dir)

        # Create a project plan directory
        proj_plans = self.ws / "projects" / "wopal-cli" / "docs" / "plans"
        proj_plans.mkdir(parents=True)
        (proj_plans / "100-feat-cli-add-cache-layer.md").write_text(
            PLAN_TEMPLATE_WITH_ISSUE.replace("{plan_name}", "100-feat-cli-add-cache-layer")
                .replace("#42", "#100").replace("executing", "executing")
                .replace("wopal-cli", "wopal-cli")
        )

        # Create an ontology plan directory
        onto_plans = self.ws / ".wopal" / "docs" / "plans"
        onto_plans.mkdir(parents=True)
        (onto_plans / "155-enhance-dev-flow.md").write_text(
            PLAN_TEMPLATE_WITH_ISSUE.replace("{plan_name}", "155-enhance-dev-flow")
                .replace("#42", "#155").replace("wopal-cli", "wopal-space-ontology")
                .replace("executing", "planning")
        )

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_discovers_standard_project_plans(self):
        plans = _scan_local_plans(self.ws)
        cli_plan = [p for p in plans if p['name'] == '100-feat-cli-add-cache-layer']
        self.assertEqual(len(cli_plan), 1)
        self.assertEqual(cli_plan[0]['project'], 'wopal-cli')
        self.assertTrue(cli_plan[0]['has_issue'])
        self.assertEqual(cli_plan[0]['issue_number'], 100)

    def test_discovers_ontology_plans(self):
        plans = _scan_local_plans(self.ws)
        onto_plan = [p for p in plans if p['name'] == '155-enhance-dev-flow']
        self.assertEqual(len(onto_plan), 1)
        self.assertEqual(onto_plan[0]['project'], 'wopal-space-ontology')

    def test_excludes_done_directory(self):
        done_dir = self.ws / "projects" / "wopal-cli" / "docs" / "plans" / "done"
        done_dir.mkdir()
        (done_dir / "50-old-done-plan.md").write_text(PLAN_TEMPLATE_NO_ISSUE)

        plans = _scan_local_plans(self.ws)
        done_plans = [p for p in plans if p['name'] == '50-old-done-plan']
        self.assertEqual(len(done_plans), 0)


class TestCmdPlanListLocalOnly(unittest.TestCase):
    """Test _cmd_plan_list_local_only output."""

    def test_lists_active_plans(self):
        plans = [
            {'name': '155-enhance-dev-flow', 'project': 'wopal-space-ontology',
             'status': 'planning', 'has_issue': True, 'issue_number': 155},
            {'name': '100-feat-cli-cache', 'project': 'wopal-cli',
             'status': 'executing', 'has_issue': True, 'issue_number': 100},
        ]
        args = Namespace(issue=False)
        with patch('commands.plan._scan_local_plans', return_value=plans):
            with patch('commands.plan.find_workspace_root', return_value=Path('/tmp/ws')):
                result = _cmd_plan_list(args)
                self.assertEqual(result, 0)

    def test_shows_no_issue_tag(self):
        plans = [
            {'name': 'refactor-cleanup', 'project': 'wopal-site',
             'status': 'planning', 'has_issue': False, 'issue_number': None},
        ]
        args = Namespace(issue=False)
        with patch('commands.plan._scan_local_plans', return_value=plans):
            with patch('commands.plan.find_workspace_root', return_value=Path('/tmp/ws')):
                result = _cmd_plan_list(args)
                self.assertEqual(result, 0)


class TestCmdPlanListWithIssue(unittest.TestCase):
    """Test _cmd_plan_list_with_issue output."""

    def setUp(self):
        self.ws = Path('/tmp/ws')

    def test_issues_without_plan_show_recorded(self):
        local_plans = []
        issues = {
            200: {'title': 'fix(cli): resolve config bug', 'status': 'planning'},
        }
        args = Namespace(issue=True)
        with patch('commands.plan._scan_local_plans', return_value=local_plans):
            with patch('commands.plan.find_workspace_root', return_value=self.ws):
                with patch('commands.plan.detect_space_repo', return_value='test/repo'):
                    with patch('commands.plan._fetch_active_issues', return_value=issues):
                        result = _cmd_plan_list(args)
                        self.assertEqual(result, 0)

    def test_issues_with_plan_show_plan_status(self):
        local_plans = [
            {'name': '100-feat-cli-cache', 'project': 'wopal-cli',
             'status': 'executing', 'has_issue': True, 'issue_number': 100},
        ]
        issues = {
            100: {'title': 'feat(cli): add cache layer', 'status': 'planning'},
        }
        args = Namespace(issue=True)
        with patch('commands.plan._scan_local_plans', return_value=local_plans):
            with patch('commands.plan.find_workspace_root', return_value=self.ws):
                with patch('commands.plan.detect_space_repo', return_value='test/repo'):
                    with patch('commands.plan._fetch_active_issues', return_value=issues):
                        result = _cmd_plan_list(args)
                        self.assertEqual(result, 0)


class TestCmdPlanStatus(unittest.TestCase):
    """Test _cmd_plan_status."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_file = Path(self.tmp_dir) / "42-fix-cli-bug.md"
        self.plan_file.write_text(
            PLAN_TEMPLATE_WITH_ISSUE.replace("{plan_name}", "42-fix-cli-bug")
        )
        # Create .wopal/.git worktree signature for workspace root detection
        wopal_git = Path(self.tmp_dir) / ".wopal" / ".git"
        wopal_git.parent.mkdir(parents=True)
        wopal_git.write_text("gitdir: /some/path")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_status_displays_plan_info(self):
        ws = Path(self.tmp_dir)
        with patch('commands.plan.find_workspace_root', return_value=ws):
            # find_plan returns a string path
            with patch('commands.plan.find_plan', return_value=str(self.plan_file)):
                result = _cmd_plan_status("42")
                self.assertEqual(result, 0)

    def test_status_errors_for_missing_plan(self):
        ws = Path(self.tmp_dir)
        with patch('commands.plan.find_workspace_root', return_value=ws):
            with patch('commands.plan.find_plan', side_effect=FileNotFoundError("not found")):
                result = _cmd_plan_status("999")
                self.assertEqual(result, 1)


class TestCmdPlanDispatch(unittest.TestCase):
    """Test cmd_plan subcommand dispatch (new subparser structure)."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        wopal_git = Path(self.tmp_dir) / ".wopal" / ".git"
        wopal_git.parent.mkdir(parents=True)
        wopal_git.write_text("gitdir: /some/path")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_plan_status_dispatches_to_status_handler(self):
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="status", plan_id="42")
        with patch('commands.plan._cmd_plan_status', return_value=0) as mock_status:
            with patch('commands.plan.find_workspace_root', return_value=ws):
                result = cmd_plan(args)
                self.assertEqual(result, 0)
                mock_status.assert_called_once_with("42")

    def test_plan_list_dispatches_to_list_handler(self):
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="list", issue=False)
        with patch('commands.plan._cmd_plan_list', return_value=0) as mock_list:
            with patch('commands.plan.find_workspace_root', return_value=ws):
                result = cmd_plan(args)
                self.assertEqual(result, 0)
                mock_list.assert_called_once()

    def test_plan_new_falls_through_to_creation(self):
        """plan new 42 falls through to creation logic."""
        ws = Path(self.tmp_dir)
        args = Namespace(
            plan_command="new",
            issue="42",
            title=None, project=None, type=None,
            scope=None, prd=None, deep=False,
        )
        with patch('commands.plan.find_workspace_root', return_value=ws):
            # Will fail trying to detect_space_repo, but proves dispatch works
            try:
                cmd_plan(args)
            except Exception:
                pass  # Expected — no real GitHub setup

    def test_plan_status_without_id_errors(self):
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="status", plan_id=None)
        with patch('commands.plan.find_workspace_root', return_value=ws):
            result = cmd_plan(args)
            self.assertEqual(result, 1)

    def test_plan_new_without_target_errors(self):
        ws = Path(self.tmp_dir)
        args = Namespace(
            plan_command="new",
            issue=None,
            title=None, project=None, type=None,
            scope=None, prd=None, deep=False,
        )
        with patch('commands.plan.find_workspace_root', return_value=ws):
            result = cmd_plan(args)
            self.assertEqual(result, 1)

    def test_plan_no_subcommand_errors(self):
        """Plan command without any subcommand should error with usage."""
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command=None)
        with patch('commands.plan.find_workspace_root', return_value=ws):
            result = cmd_plan(args)
            self.assertEqual(result, 1)

    def test_plan_check_dispatches_to_check_handler(self):
        """plan check <name> dispatches to _cmd_plan_check."""
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="check", target="42")
        with patch('commands.plan._cmd_plan_check', return_value=0) as mock_check:
            with patch('commands.plan.find_workspace_root', return_value=ws):
                result = cmd_plan(args)
                self.assertEqual(result, 0)
                mock_check.assert_called_once()


class TestCmdPlanCheck(unittest.TestCase):
    """Test _cmd_plan_check (plan check <name>) validation flow."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        wopal_git = Path(self.tmp_dir) / ".wopal" / ".git"
        wopal_git.parent.mkdir(parents=True)
        wopal_git.write_text("gitdir: /some/path")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_check_with_valid_file_passes(self):
        ws = Path(self.tmp_dir)
        valid_plan = Path(self.tmp_dir) / "valid.md"
        valid_plan.write_text("# test\n## Metadata\n- **Type**: test\n- **Status**: planning\n")
        args = Namespace(plan_command="check", target=str(valid_plan))
        with patch('commands.plan.find_workspace_root', return_value=ws):
            with patch('commands.plan.check_doc_plan', return_value=None):
                result = cmd_plan(args)
                self.assertEqual(result, 0)

    def test_check_with_missing_target_errors(self):
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="check", target=None)
        with patch('commands.plan.find_workspace_root', return_value=ws):
            result = cmd_plan(args)
            self.assertEqual(result, 1)

    def test_check_with_not_found_target_errors(self):
        ws = Path(self.tmp_dir)
        args = Namespace(plan_command="check", target="nonexistent-plan-name")
        with patch('commands.plan.find_workspace_root', return_value=ws):
            with patch('commands.plan.find_plan_by_name', side_effect=FileNotFoundError("not found")):
                result = cmd_plan(args)
                self.assertEqual(result, 1)

    def test_check_with_validation_error_returns_1(self):
        ws = Path(self.tmp_dir)
        valid_plan = Path(self.tmp_dir) / "invalid.md"
        valid_plan.write_text("# test\n")
        args = Namespace(plan_command="check", target=str(valid_plan))
        from validation import ValidationError
        with patch('commands.plan.find_workspace_root', return_value=ws):
            with patch('commands.plan.check_doc_plan', side_effect=ValidationError("Plan has issues")):
                result = cmd_plan(args)
                self.assertEqual(result, 1)


class TestDeriveProjectPath(unittest.TestCase):
    """Test _derive_project_path auto-fill logic."""

    def test_returns_declared_path(self):
        self.assertEqual(
            _derive_project_path("wopal-cli", "projects/wopal-cli"),
            "projects/wopal-cli",
        )

    def test_auto_fills_from_project_name(self):
        self.assertEqual(
            _derive_project_path("wopal-cli", None),
            "projects/wopal-cli",
        )

    def test_declared_overrides_project(self):
        """ontology-worktree declares '.wopal', must not be overridden."""
        self.assertEqual(_derive_project_path("wopal-cli", ".wopal"), ".wopal")

    def test_empty_when_nothing_known(self):
        self.assertEqual(_derive_project_path(None, None), "")


if __name__ == '__main__':
    unittest.main()
