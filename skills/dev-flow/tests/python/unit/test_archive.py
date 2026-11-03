#!/usr/bin/env python3
# test_archive.py - Unit tests for archive command helpers
#
# Bug fix: _detect_worktree must return metadata even when worktree path
# has been cleaned up by verify-switch.

import unittest
import sys
import os
import subprocess
import tempfile
import shutil
import argparse
from datetime import date
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from support.git_fixtures import (
    init_repo as _shell_init_repo,
    shell_git as _shell_git,
)

from commands.archive import (
    _detect_worktree,
    cmd_archive,
)


class TestDetectWorktree(unittest.TestCase):
    """Tests for _detect_worktree.

    Regression: after verify-switch cleans up the worktree directory,
    the Plan metadata still records the branch that needs cleanup.
    _detect_worktree must return the metadata so archive can delete
    the feature branch.
    """

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.ws_root = self.tmpdir
        # Plan file location (mirror real layout)
        self.plans_dir = self.tmpdir / "plans"
        self.plans_dir.mkdir(parents=True)
        self.plan_path = self.plans_dir / "test-plan.md"

    def tearDown(self):
        shutil.rmtree(self.tmpdir)

    def _write_plan_with_worktree(self, branch: str, wt_path: str) -> None:
        self.plan_path.write_text(
            f"# test-plan\n\n"
            f"## Metadata\n\n"
            f"- **Type**: feature\n"
            f"- **Target Project**: wopal-cli\n"
            f"- **Status**: done\n"
            f"- **Worktree**:\n"
            f"  - branch: {branch}\n"
            f"  - path: {wt_path}\n"
        )

    @patch("commands.archive.get_plan_worktree")
    def test_returns_metadata_when_worktree_path_exists(self, mock_gpw):
        """Sanity: when path exists, metadata is returned as-is."""
        wt_dir = self.tmpdir / ".worktrees" / "wopal-cli-my-feature"
        wt_dir.mkdir(parents=True)
        mock_gpw.return_value = {
            "branch": "my-feature",
            "path": str(wt_dir.relative_to(self.ws_root)),
        }

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result)
        self.assertEqual(result["branch"], "my-feature")

    @patch("commands.archive.get_plan_worktree")
    def test_returns_metadata_when_worktree_path_missing(self, mock_gpw):
        """Regression: path cleaned up by verify-switch must not erase
        branch metadata — the feature branch still needs deletion."""
        missing_path = self.tmpdir / ".worktrees" / "wopal-cli-my-feature"
        self.assertFalse(missing_path.exists())

        mock_gpw.return_value = {
            "branch": "my-feature",
            "path": str(missing_path.relative_to(self.ws_root)),
        }

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result, "must return metadata even when path is gone")
        self.assertEqual(result["branch"], "my-feature")

    @patch("commands.archive.get_plan_worktree")
    def test_returns_none_when_no_metadata_and_no_glob_match(self, mock_gpw):
        mock_gpw.return_value = None

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNone(result)

    @patch("commands.archive.get_plan_worktree")
    def test_fallback_derives_from_full_plan_name(self, mock_gpw):
        """Fallback derives worktree from full Plan name, not Issue number.

        Branch = <project>-<plan-name>; worktree dir = branch. No Issue
        number is required, so no-Issue plans can also be located.
        """
        mock_gpw.return_value = None
        # Plan name: 42-feature-cli-add-skills-remove-command
        plan_name = "42-feature-cli-add-skills-remove-command"
        self.plan_path = self.plans_dir / f"{plan_name}.md"
        self.plan_path.write_text(
            f"# {plan_name}\n\n## Metadata\n\n- **Type**: feature\n"
            f"- **Target Project**: wopal-cli\n- **Status**: done\n"
        )

        # Create the worktree dir: .worktrees/wopal-cli-42-feature-cli-add-skills-remove-command
        wt_dir = self.tmpdir / ".worktrees" / "wopal-cli-42-feature-cli-add-skills-remove-command"
        wt_dir.mkdir(parents=True)

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result)
        self.assertEqual(result["branch"], "wopal-cli-42-feature-cli-add-skills-remove-command")
        self.assertEqual(result["path"], str(wt_dir))

    @patch("commands.archive.get_plan_worktree")
    def test_fallback_derives_for_no_issue_plan(self, mock_gpw):
        """No-Issue plan fallback derives worktree from full Plan name."""
        mock_gpw.return_value = None
        plan_name = "refactor-cli-optimize-commands"
        self.plan_path = self.plans_dir / f"{plan_name}.md"
        self.plan_path.write_text(
            f"# {plan_name}\n\n## Metadata\n\n- **Type**: refactor\n"
            f"- **Target Project**: wopal-cli\n- **Status**: done\n"
        )

        wt_dir = self.tmpdir / ".worktrees" / "wopal-cli-refactor-cli-optimize-commands"
        wt_dir.mkdir(parents=True)

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result)
        self.assertEqual(result["branch"], "wopal-cli-refactor-cli-optimize-commands")
        self.assertEqual(result["path"], str(wt_dir))


class TestArchiveMergeDetection(unittest.TestCase):
    """Tests for archive merge detection (Task 2, Issue #171).

    Four scenarios:
    1. worktree exists + merged → skip merge, proceed to cleanup
    2. worktree exists + unmerged → error exit
    3. worktree doesn't exist → skip merge, cleanup branch
    4. PR path → skip merge, cleanup worktree
    """

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.ws_root = self.tmpdir
        self.plans_dir = self.tmpdir / "plans"
        self.plans_dir.mkdir(parents=True)
        self.plan_path = self.plans_dir / "42-test-plan.md"
        self.plan_path.write_text("# test-plan\n")
        # Real repo: the archive record's checked `git mv` / `git add` /
        # commit steps must be able to run (a non-repo would abort them).
        subprocess.run(
            ["git", "init", "-q", "-b", "main", str(self.tmpdir)], check=True
        )
        subprocess.run(
            ["git", "config", "user.email", "test@test.com"],
            cwd=str(self.tmpdir), check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test"],
            cwd=str(self.tmpdir), check=True,
        )
        subprocess.run(
            ["git", "add", "plans/42-test-plan.md"],
            cwd=str(self.tmpdir), check=True,
        )
        subprocess.run(
            ["git", "commit", "-q", "-m", "add plan"],
            cwd=str(self.tmpdir), check=True,
        )
        self.proj_dir = self.tmpdir / "projects" / "test-project"
        self.proj_dir.mkdir(parents=True)
        (self.proj_dir / ".git").mkdir()
        self.wt_dir = self.tmpdir / ".worktrees" / "test-project-issue-42"
        self.wt_dir.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmpdir)

    def _make_args(self, target="42"):
        return argparse.Namespace(target=target)

    def _setup_common_mocks(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_get_field,
        mock_resolve_path,
        mock_commit,
        mock_close,
    ):
        """Configure mocks common to all scenarios."""
        mock_find_ws.return_value = self.ws_root
        mock_find_plan.return_value = str(self.plan_path)
        mock_parse_status.return_value = "done"
        mock_guard.return_value = True
        mock_get_project.return_value = "test-project"
        mock_get_type.return_value = "feature"
        mock_get_issue.return_value = 42
        mock_resolve_repo.return_value = "owner/repo"
        mock_get_field.side_effect = lambda plan_path, field: {
            "Project Type": "standard",
            "Product": "",
            "Phase": "",
        }.get(field, "")
        mock_resolve_path.return_value = str(self.proj_dir)
        mock_commit.return_value = True
        mock_close.return_value = True

    @patch("commands.archive.close_issue")
    @patch("commands.archive.update_issue_plan_link")
    @patch("commands.archive.commit_archived_plan")
    @patch("commands.archive._cleanup_worktree")
    @patch("commands.archive.check_branch_merged")
    @patch("commands.archive.has_uncommitted_changes")
    @patch("commands.archive._is_pr_path")
    @patch("commands.archive._detect_worktree")
    @patch("commands.archive.resolve_project_path")
    @patch("commands.archive.get_plan_field")
    @patch("commands.archive.ensure_issue_labels")
    @patch("commands.archive.sync_status_label")
    @patch("commands.archive.sync_plan_to_issue_body")
    @patch("commands.archive.resolve_space_repo")
    @patch("commands.archive.get_plan_issue")
    @patch("commands.archive.get_plan_type")
    @patch("commands.archive.get_plan_project")
    @patch("commands.archive.guard_status")
    @patch("commands.archive.parse_plan_status")
    @patch("commands.archive.find_plan")
    @patch("commands.archive.find_workspace_root")
    def test_worktree_exists_merged_skip_merge(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_sync_body,
        mock_sync_label,
        mock_ensure_labels,
        mock_get_field,
        mock_resolve_path,
        mock_detect_wt,
        mock_is_pr,
        mock_has_uncommitted,
        mock_check_merged,
        mock_cleanup,
        mock_commit,
        mock_update_link,
        mock_close,
    ):
        """Scenario 1: worktree exists + merged → skip merge, proceed to cleanup."""
        self._setup_common_mocks(
            mock_find_ws, mock_find_plan, mock_parse_status, mock_guard,
            mock_get_project, mock_get_type, mock_get_issue, mock_resolve_repo,
            mock_get_field, mock_resolve_path,
            mock_commit, mock_close,
        )
        mock_detect_wt.return_value = {
            "branch": "feature/test-1",
            "path": ".worktrees/test-project-issue-42",
        }
        mock_is_pr.return_value = False
        mock_has_uncommitted.return_value = False
        mock_check_merged.return_value = 0
        mock_cleanup.return_value = True

        result = cmd_archive(self._make_args())

        self.assertEqual(result, 0)
        mock_check_merged.assert_called_once_with(self.ws_root, str(self.plan_path))
        mock_cleanup.assert_called_once()

    @patch("commands.archive.close_issue")
    @patch("commands.archive.update_issue_plan_link")
    @patch("commands.archive.commit_archived_plan")
    @patch("commands.archive._cleanup_worktree")
    @patch("commands.archive.check_branch_merged")
    @patch("commands.archive.has_uncommitted_changes")
    @patch("commands.archive._is_pr_path")
    @patch("commands.archive._detect_worktree")
    @patch("commands.archive.resolve_project_path")
    @patch("commands.archive.get_plan_field")
    @patch("commands.archive.ensure_issue_labels")
    @patch("commands.archive.sync_status_label")
    @patch("commands.archive.sync_plan_to_issue_body")
    @patch("commands.archive.resolve_space_repo")
    @patch("commands.archive.get_plan_issue")
    @patch("commands.archive.get_plan_type")
    @patch("commands.archive.get_plan_project")
    @patch("commands.archive.guard_status")
    @patch("commands.archive.parse_plan_status")
    @patch("commands.archive.find_plan")
    @patch("commands.archive.find_workspace_root")
    def test_archive_keep_worktree_skips_cleanup(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_sync_body,
        mock_sync_label,
        mock_ensure_labels,
        mock_get_field,
        mock_resolve_path,
        mock_detect_wt,
        mock_is_pr,
        mock_has_uncommitted,
        mock_check_merged,
        mock_cleanup,
        mock_commit,
        mock_update_link,
        mock_close,
    ):
        """--keep-worktree 应跳过 _cleanup_worktree 并跳过 merge 检测，保留工作树与分支。"""
        self._setup_common_mocks(
            mock_find_ws, mock_find_plan, mock_parse_status, mock_guard,
            mock_get_project, mock_get_type, mock_get_issue, mock_resolve_repo,
            mock_get_field, mock_resolve_path,
            mock_commit, mock_close,
        )
        mock_detect_wt.return_value = {
            "branch": "feature/test-1",
            "path": ".worktrees/test-project-issue-42",
        }
        mock_is_pr.return_value = False
        mock_has_uncommitted.return_value = False
        mock_check_merged.return_value = 1  # 即使未合并

        args = argparse.Namespace(target="42", force=False, keep_worktree=True)
        result = cmd_archive(args)

        self.assertEqual(result, 0)
        # 验证 Plan 归档成功，状态已归档
        self.assertTrue(Path(self.ws_root / "plans" / "done").exists())

    @patch("commands.archive.close_issue")
    @patch("commands.archive.update_issue_plan_link")
    @patch("commands.archive.commit_archived_plan")
    @patch("commands.archive._cleanup_worktree")
    @patch("commands.archive.check_branch_merged")
    @patch("commands.archive.has_uncommitted_changes")
    @patch("commands.archive._is_pr_path")
    @patch("commands.archive._detect_worktree")
    @patch("commands.archive.resolve_project_path")
    @patch("commands.archive.get_plan_field")
    @patch("commands.archive.ensure_issue_labels")
    @patch("commands.archive.sync_status_label")
    @patch("commands.archive.sync_plan_to_issue_body")
    @patch("commands.archive.resolve_space_repo")
    @patch("commands.archive.get_plan_issue")
    @patch("commands.archive.get_plan_type")
    @patch("commands.archive.get_plan_project")
    @patch("commands.archive.guard_status")
    @patch("commands.archive.parse_plan_status")
    @patch("commands.archive.find_plan")
    @patch("commands.archive.find_workspace_root")
    def test_worktree_exists_unmerged_error_exit(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_sync_body,
        mock_sync_label,
        mock_ensure_labels,
        mock_get_field,
        mock_resolve_path,
        mock_detect_wt,
        mock_is_pr,
        mock_has_uncommitted,
        mock_check_merged,
        mock_cleanup,
        mock_commit,
        mock_update_link,
        mock_close,
    ):
        """Scenario 2: worktree exists + unmerged → error exit."""
        self._setup_common_mocks(
            mock_find_ws, mock_find_plan, mock_parse_status, mock_guard,
            mock_get_project, mock_get_type, mock_get_issue, mock_resolve_repo,
            mock_get_field, mock_resolve_path,
            mock_commit, mock_close,
        )
        mock_detect_wt.return_value = {
            "branch": "feature/test-1",
            "path": ".worktrees/test-project-issue-42",
        }
        mock_is_pr.return_value = False
        mock_has_uncommitted.return_value = False
        mock_check_merged.return_value = 1  # NOT merged

        result = cmd_archive(self._make_args())

        self.assertEqual(result, 1)
        mock_check_merged.assert_called_once_with(self.ws_root, str(self.plan_path))
        mock_cleanup.assert_not_called()

    @patch("commands.archive.close_issue")
    @patch("commands.archive.update_issue_plan_link")
    @patch("commands.archive.commit_archived_plan")
    @patch("commands.archive._cleanup_worktree")
    @patch("commands.archive.check_branch_merged")
    @patch("commands.archive.has_uncommitted_changes")
    @patch("commands.archive._is_pr_path")
    @patch("commands.archive._detect_worktree")
    @patch("commands.archive.resolve_project_path")
    @patch("commands.archive.get_plan_field")
    @patch("commands.archive.ensure_issue_labels")
    @patch("commands.archive.sync_status_label")
    @patch("commands.archive.sync_plan_to_issue_body")
    @patch("commands.archive.resolve_space_repo")
    @patch("commands.archive.get_plan_issue")
    @patch("commands.archive.get_plan_type")
    @patch("commands.archive.get_plan_project")
    @patch("commands.archive.guard_status")
    @patch("commands.archive.parse_plan_status")
    @patch("commands.archive.find_plan")
    @patch("commands.archive.find_workspace_root")
    def test_worktree_not_exists_skip_merge(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_sync_body,
        mock_sync_label,
        mock_ensure_labels,
        mock_get_field,
        mock_resolve_path,
        mock_detect_wt,
        mock_is_pr,
        mock_has_uncommitted,
        mock_check_merged,
        mock_cleanup,
        mock_commit,
        mock_update_link,
        mock_close,
    ):
        """Scenario 3: worktree doesn't exist → skip merge, cleanup branch."""
        self._setup_common_mocks(
            mock_find_ws, mock_find_plan, mock_parse_status, mock_guard,
            mock_get_project, mock_get_type, mock_get_issue, mock_resolve_repo,
            mock_get_field, mock_resolve_path,
            mock_commit, mock_close,
        )
        # Worktree metadata exists but directory won't exist on disk
        mock_detect_wt.return_value = {
            "branch": "feature/test-1",
            "path": ".worktrees/nonexistent",
        }
        mock_is_pr.return_value = False
        mock_cleanup.return_value = True

        result = cmd_archive(self._make_args())

        self.assertEqual(result, 0)
        mock_check_merged.assert_not_called()
        mock_cleanup.assert_called_once()

    @patch("commands.archive.close_issue")
    @patch("commands.archive.update_issue_plan_link")
    @patch("commands.archive.commit_archived_plan")
    @patch("commands.archive._cleanup_worktree")
    @patch("commands.archive.check_branch_merged")
    @patch("commands.archive.has_uncommitted_changes")
    @patch("commands.archive._is_pr_path")
    @patch("commands.archive._detect_worktree")
    @patch("commands.archive.resolve_project_path")
    @patch("commands.archive.get_plan_field")
    @patch("commands.archive.ensure_issue_labels")
    @patch("commands.archive.sync_status_label")
    @patch("commands.archive.sync_plan_to_issue_body")
    @patch("commands.archive.resolve_space_repo")
    @patch("commands.archive.get_plan_issue")
    @patch("commands.archive.get_plan_type")
    @patch("commands.archive.get_plan_project")
    @patch("commands.archive.guard_status")
    @patch("commands.archive.parse_plan_status")
    @patch("commands.archive.find_plan")
    @patch("commands.archive.find_workspace_root")
    def test_pr_path_skip_merge(
        self,
        mock_find_ws,
        mock_find_plan,
        mock_parse_status,
        mock_guard,
        mock_get_project,
        mock_get_type,
        mock_get_issue,
        mock_resolve_repo,
        mock_sync_body,
        mock_sync_label,
        mock_ensure_labels,
        mock_get_field,
        mock_resolve_path,
        mock_detect_wt,
        mock_is_pr,
        mock_has_uncommitted,
        mock_check_merged,
        mock_cleanup,
        mock_commit,
        mock_update_link,
        mock_close,
    ):
        """Scenario 4: PR path → skip merge, cleanup worktree."""
        self._setup_common_mocks(
            mock_find_ws, mock_find_plan, mock_parse_status, mock_guard,
            mock_get_project, mock_get_type, mock_get_issue, mock_resolve_repo,
            mock_get_field, mock_resolve_path,
            mock_commit, mock_close,
        )
        mock_detect_wt.return_value = {
            "branch": "feature/test-1",
            "path": ".worktrees/test-project-issue-42",
        }
        mock_is_pr.return_value = True  # PR path
        mock_cleanup.return_value = True

        result = cmd_archive(self._make_args())

        self.assertEqual(result, 0)
        mock_check_merged.assert_not_called()
        mock_cleanup.assert_called_once()

# ============================================
# cmd_archive durability ordering (Task 3, AC#4)
# ============================================
#
# Real construction: a temp workspace repo (+ bare origin) holding a Plan
# under .wopal-space/plans/, and a project repo carrying a real registered
# feature worktree. Network side effects (Issue sync / close / link) and the
# merge check are mocked; the archive record move/commit/push and the
# worktree cleanup run for real.
#
# Supersedes the former mock-only "cleanup failure aborts archive" case:
# destructive cleanup now runs only after the durable archive record, and
# its failure is reported as partial cleanup instead of aborting the archive.

ARCHIVE_BRANCH = "test-project-42-test-plan"
ARCHIVE_PLAN_REL = ".wopal-space/plans/test-project/42-test-plan.md"

_ARCHIVE_PLAN_TEMPLATE = """\
# 42-test-plan

## Metadata

- **Issue**: #42
- **Type**: feature
- **Target Project**: test-project
- **Status**: done
- **Worktree**:
  - branch: {branch}
  - path: .worktrees/{branch}
"""


def _make_archive_workspace(tmp_path):
    """Temp workspace + bare origin + project repo with a registered worktree."""
    ws = tmp_path / "ws"
    _shell_init_repo(ws)
    origin = tmp_path / "ws-origin.git"
    _shell_git("init", "--bare", "-b", "main", str(origin), cwd=tmp_path)
    _shell_git("remote", "add", "origin", str(origin), cwd=ws)

    project = ws / "projects" / "test-project"
    _shell_init_repo(project)
    wt_dir = ws / ".worktrees" / ARCHIVE_BRANCH
    wt_dir.parent.mkdir(parents=True, exist_ok=True)
    _shell_git("worktree", "add", str(wt_dir), "-b", ARCHIVE_BRANCH, cwd=project)

    plan = ws / ARCHIVE_PLAN_REL
    plan.parent.mkdir(parents=True)
    plan.write_text(_ARCHIVE_PLAN_TEMPLATE.format(branch=ARCHIVE_BRANCH))
    _shell_git("add", ARCHIVE_PLAN_REL, cwd=ws)
    _shell_git("commit", "-m", "add plan", cwd=ws)
    _shell_git("push", "-u", "origin", "main", cwd=ws)
    _shell_git("remote", "set-head", "origin", "main", cwd=ws)
    return ws, project, wt_dir, plan


def _run_archive(ws, target="42"):
    """Run cmd_archive with network side effects and merge check mocked.

    Returns:
        (exit_code, mocks) — mocks exposes each mocked external side effect:
        close_issue, sync_body, sync_label, ensure_labels, update_link.
    """
    from types import SimpleNamespace
    from commands.archive import cmd_archive

    mocks = SimpleNamespace(
        close_issue=MagicMock(return_value=True),
        sync_body=MagicMock(),
        sync_label=MagicMock(),
        ensure_labels=MagicMock(),
        update_link=MagicMock(),
    )
    with patch.multiple(
        "commands.archive",
        find_workspace_root=MagicMock(return_value=ws),
        resolve_space_repo=MagicMock(return_value="test/space"),
        sync_plan_to_issue_body=mocks.sync_body,
        sync_status_label=mocks.sync_label,
        ensure_issue_labels=mocks.ensure_labels,
        update_issue_plan_link=mocks.update_link,
        _is_pr_path=MagicMock(return_value=False),
        check_branch_merged=MagicMock(return_value=0),
        close_issue=mocks.close_issue,
    ):
        args = argparse.Namespace(target=target, force=False, keep_worktree=False)
        result = cmd_archive(args)
    return result, mocks


class TestArchiveDurabilityOrdering:
    """D-07: destructive cleanup and Issue close follow the durable archive
    record; a cleanup failure is reported as partial cleanup, never as a
    missing archive."""

    @pytest.mark.parametrize("failure_mode", ["commit", "push"])
    def test_durability_failure_blocks_cleanup_and_issue_close(
        self, tmp_path, capsys, failure_mode
    ):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        if failure_mode == "commit":
            hook = ws / ".git" / "hooks" / "pre-commit"
            hook.write_text(
                "#!/bin/sh\necho 'injected archive-commit failure' >&2\nexit 1\n"
            )
            hook.chmod(0o755)
        else:
            _shell_git("remote", "remove", "origin", cwd=ws)

        result, mocks = _run_archive(ws)

        assert result == 1
        # Destructive cleanup did not run.
        assert wt_dir.exists()
        branch = _shell_git(
            "rev-parse", "--verify", f"refs/heads/{ARCHIVE_BRANCH}",
            cwd=project, check=False,
        )
        assert branch.returncode == 0, (
            "feature branch must survive a durability failure"
        )
        # No externally visible Issue update ran before durability: body
        # sync, status label, type/project labels, Plan link and close.
        mocks.sync_body.assert_not_called()
        mocks.sync_label.assert_not_called()
        mocks.ensure_labels.assert_not_called()
        mocks.update_link.assert_not_called()
        mocks.close_issue.assert_not_called()
        out, err = capsys.readouterr()
        combined = out + err
        assert "Archive completed" not in combined
        # Actionable guidance: the moved file's real path and the
        # archived-name re-run command (the original ref cannot locate it).
        archived_file = (
            ws / ".wopal-space" / "plans" / "test-project" / "done"
            / f"{date.today():%Y%m%d}-42-test-plan.md"
        )
        assert str(archived_file) in combined
        assert "flow.sh archive" in combined

    @pytest.mark.parametrize("failure_mode", ["commit", "push"])
    def test_rerun_after_durability_failure_completes_archive(
        self, tmp_path, failure_mode
    ):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        origin = tmp_path / "ws-origin.git"
        hook = None
        if failure_mode == "commit":
            hook = ws / ".git" / "hooks" / "pre-commit"
            hook.write_text(
                "#!/bin/sh\necho 'injected archive-commit failure' >&2\nexit 1\n"
            )
            hook.chmod(0o755)
        else:
            _shell_git("remote", "remove", "origin", cwd=ws)

        first, _ = _run_archive(ws)
        assert first == 1

        # Fix the cause, then re-run by the archived name — the original ref
        # no longer locates the moved Plan.
        if hook is not None:
            hook.unlink()
        else:
            _shell_git("remote", "add", "origin", str(origin), cwd=ws)

        archived_name = f"{date.today():%Y%m%d}-42-test-plan"
        result, mocks = _run_archive(ws, target=archived_name)

        assert result == 0
        # The bare origin really received the archive commit.
        origin_log = _shell_git(
            "--git-dir", str(origin), "log", "-1", "--format=%s%n",
            "--name-only", cwd=tmp_path,
        ).stdout
        assert "chore: archive plan #42" in origin_log
        assert "42-test-plan.md" in origin_log
        # Destructive cleanup ran only after the durable record.
        assert not wt_dir.exists()
        branch = _shell_git(
            "rev-parse", "--verify", f"refs/heads/{ARCHIVE_BRANCH}",
            cwd=project, check=False,
        )
        assert branch.returncode != 0, "feature branch must be deleted"
        # Issue side effects ran after durability, against the durable
        # archived path (the source of the synced Plan content).
        archived_file = str(
            ws / ".wopal-space" / "plans" / "test-project" / "done"
            / f"{date.today():%Y%m%d}-42-test-plan.md"
        )
        mocks.sync_body.assert_called_once()
        assert mocks.sync_body.call_args.kwargs["plan_file"] == archived_file
        mocks.sync_label.assert_called_once()
        mocks.ensure_labels.assert_called_once()
        mocks.update_link.assert_called_once()
        mocks.close_issue.assert_called_once()

    def test_cleanup_failure_after_durability_reports_partial_cleanup(
        self, tmp_path, capsys
    ):
        ws, _, wt_dir, _ = _make_archive_workspace(tmp_path)
        # Real cleanup failure: a read-only worktree directory can be read
        # (status check still works) but not removed or pruned.
        os.chmod(wt_dir, 0o555)
        try:
            result, mocks = _run_archive(ws)
        finally:
            os.chmod(wt_dir, 0o755)

        assert result == 1
        out, err = capsys.readouterr()
        combined = out + err
        # Partial cleanup is reported explicitly; the archive is not denied.
        assert "partial cleanup" in combined.lower()
        assert "Archive completed" not in combined
        # The archive record itself is durable (committed in the Plan's repo).
        assert "chore: archive plan #42" in _shell_git(
            "log", "--format=%s", "-1", cwd=ws
        ).stdout
        archived = (
            ws / ".wopal-space" / "plans" / "test-project" / "done"
            / f"{date.today():%Y%m%d}-42-test-plan.md"
        )
        assert archived.exists()
        # The terminal Issue side effect follows the durable record.
        mocks.close_issue.assert_called_once()

    def test_commit_does_not_sweep_foreign_staged_files(self, tmp_path):
        """The archive commit carries only the Plan rename; a foreign staged
        file in the same repo keeps its index state (B-05)."""
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        (ws / "foreign.txt").write_text("foreign\n")
        _shell_git("add", "foreign.txt", cwd=ws)

        result, mocks = _run_archive(ws)

        assert result == 0
        changed = _shell_git(
            "show", "HEAD", "--name-status", "--format=", cwd=ws
        ).stdout
        assert "foreign.txt" not in changed
        assert "42-test-plan.md" in changed
        # The rename landed in full: no leftover staged change on either side.
        archived_rel = (
            ".wopal-space/plans/test-project/done/"
            f"{date.today():%Y%m%d}-42-test-plan.md"
        )
        leftover = _shell_git(
            "status", "--porcelain", "--", ARCHIVE_PLAN_REL, archived_rel,
            cwd=ws,
        ).stdout
        assert leftover == ""
        # The foreign file is still staged and uncommitted.
        assert "A  foreign.txt" in _shell_git(
            "status", "--porcelain", cwd=ws
        ).stdout

    def test_commit_fallback_preserves_both_attempts(self, tmp_path, capsys):
        """A failed primary commit and its fallback must both be reported
        with their own raw git evidence — the second never overwrites the
        first (B-04)."""
        ws, _, _, _ = _make_archive_workspace(tmp_path)
        hook = ws / ".git" / "hooks" / "pre-commit"
        hook.write_text(
            "#!/bin/sh\necho 'injected archive-commit failure' >&2\nexit 1\n"
        )
        hook.chmod(0o755)

        result, _ = _run_archive(ws)

        assert result == 1
        combined = "".join(capsys.readouterr())
        assert "primary attempt" in combined.lower()
        assert "fallback attempt" in combined.lower()
        assert combined.count("injected archive-commit failure") >= 2

    def test_branch_delete_failure_reports_partial_cleanup(self, tmp_path, capsys):
        """Worktree removed but branch ref undeletable → partial cleanup,
        never a silent 'cleaned up' success (B-02)."""
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        # Real failure injection: a stale loose-ref lock makes `git branch -d`
        # and `-D` fail while the worktree removal itself succeeds.
        lock = project / ".git" / "refs" / "heads" / f"{ARCHIVE_BRANCH}.lock"
        lock.write_text("")

        result, mocks = _run_archive(ws)

        assert result == 1
        out, err = capsys.readouterr()
        combined = out + err
        assert "partial cleanup" in combined.lower()
        assert "Archive completed" not in combined
        # The worktree was really removed...
        assert not wt_dir.exists()
        # ...but the branch ref is still there and the failure is reported.
        branch = _shell_git(
            "rev-parse", "--verify", f"refs/heads/{ARCHIVE_BRANCH}",
            cwd=project, check=False,
        )
        assert branch.returncode == 0, "locked branch delete must leave the ref"
        assert "lock" in combined.lower()
        # The record is durable and the terminal Issue side effect still ran.
        assert "chore: archive plan #42" in _shell_git(
            "log", "--format=%s", "-1", cwd=ws
        ).stdout
        mocks.close_issue.assert_called_once()


class TestArchivePushRefBinding:
    """The archive commit must be pushed to the ref that actually carries it
    (the checked-out branch), and a detached HEAD must refuse durability."""

    def test_archive_commit_lands_on_checked_out_branch(self, tmp_path):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        origin = tmp_path / "ws-origin.git"
        # Plain checkout on a non-default branch: resolve_plan_location()
        # would resolve the default branch (main), but the commit lands on
        # the checked-out branch.
        _shell_git("checkout", "-q", "-b", "work", cwd=ws)

        result, mocks = _run_archive(ws)

        assert result == 0
        # The bare origin really received the archive content on 'work'.
        work_log = _shell_git(
            "--git-dir", str(origin), "log", "--format=%s", "-1", "work",
            cwd=tmp_path, check=False,
        )
        assert work_log.returncode == 0, "origin/work must exist"
        assert "chore: archive plan #42" in work_log.stdout
        # ...and main did not receive it.
        main_log = _shell_git(
            "--git-dir", str(origin), "log", "--format=%s", "-1", "main",
            cwd=tmp_path,
        ).stdout
        assert "chore: archive plan #42" not in main_log
        mocks.close_issue.assert_called_once()

    def test_detached_head_refuses_durability(self, tmp_path):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        origin = tmp_path / "ws-origin.git"
        _shell_git("checkout", "--detach", cwd=ws)

        result, mocks = _run_archive(ws)

        assert result == 1
        # No destructive cleanup and no Issue side effect without a durable ref.
        assert wt_dir.exists()
        mocks.close_issue.assert_not_called()
        mocks.sync_body.assert_not_called()
        # The bare origin has no archive commit on any ref.
        all_log = _shell_git(
            "--git-dir", str(origin), "log", "--all", "--format=%s",
            cwd=tmp_path,
        ).stdout
        assert "chore: archive plan #42" not in all_log


if __name__ == "__main__":
    unittest.main()

class TestArchiveMoveDiagnostics:
    """A failed `git mv` must keep full mutation diagnostics
    (command / cwd / exit code / stderr) — Task 4, AC#6."""

    def test_git_mv_failure_keeps_command_and_stderr(self, tmp_path):
        from commands.archive import archive_plan_file

        ws = tmp_path / "ws"
        _shell_init_repo(ws)
        plan_rel = ".wopal-space/plans/test-project/42-test-plan.md"
        plan = ws / plan_rel
        plan.parent.mkdir(parents=True)
        plan.write_text("# 42-test-plan\n")
        _shell_git("add", plan_rel, cwd=ws)
        _shell_git("commit", "-m", "add plan", cwd=ws)

        # Destination collision: the dated archive name already exists, so
        # `git mv` fails with a real stderr.
        done = plan.parent / "done"
        done.mkdir()
        (done / f"{date.today():%Y%m%d}-42-test-plan.md").write_text(
            "# occupied\n"
        )

        with pytest.raises(Exception) as excinfo:
            archive_plan_file(str(plan), ws)

        message = str(excinfo.value)
        assert "git mv" in message
        assert "destination exists" in message
        assert str(ws.resolve()) in message


class TestArchiveStageDiagnostics:
    """A failed `git add` for the archived plan must keep full mutation
    diagnostics (command / cwd / exit code / stderr) — B-04."""

    def test_stage_failure_keeps_full_diagnostics(self, tmp_path):
        from commands.archive import _stage_archived_plan

        repo = tmp_path / "ws"
        _shell_init_repo(repo)
        (repo / ".gitignore").write_text("ignored/\n")
        _shell_git("add", ".gitignore", cwd=repo)
        _shell_git("commit", "-m", "ignore dir", cwd=repo)

        # Real injection: an ignored path makes `git add` fail.
        target = repo / "ignored" / "plan.md"
        target.parent.mkdir()
        target.write_text("# plan\n")

        failure = _stage_archived_plan(str(target), str(repo))

        assert failure is not None
        assert failure.command[:2] == ["git", "add"]
        assert failure.cwd == str(repo)
        assert failure.exit_code != 0
        assert "ignored" in failure.stderr


class TestArchiveRerunOldPathDeletion:
    """B-01: a re-run after a commit failure must carry the old Plan path's
    staged deletion, not just the new archived path — the pathspec commit
    must land the full rename."""

    def test_rerun_commits_old_path_deletion(self, tmp_path):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        # A foreign staged file that must neither ride the archive commit
        # nor be cleared from the index.
        (ws / "foreign.txt").write_text("unrelated")
        _shell_git("add", "foreign.txt", cwd=ws)

        # First run: inject a commit failure so git mv stages the rename
        # (old path deletion + new path addition) but the commit fails.
        hook = ws / ".git" / "hooks" / "pre-commit"
        hook.write_text("#!/bin/sh\necho 'injected' >&2\nexit 1\n")
        hook.chmod(0o755)
        first, _ = _run_archive(ws)
        assert first == 1

        # Remove the hook; re-run by the archived name.
        hook.unlink()
        archived_name = f"{date.today():%Y%m%d}-42-test-plan"
        second, _ = _run_archive(ws, target=archived_name)
        assert second == 0

        # The bare origin received the full rename: old path gone, new present.
        origin_tree = _shell_git(
            "ls-tree", "-r", "--name-only", "origin/main", cwd=ws,
        ).stdout
        assert "test-project/42-test-plan.md" not in origin_tree, (
            "old path must be removed from origin"
        )
        archived_rel = (
            f"test-project/done/{date.today():%Y%m%d}-42-test-plan.md"
        )
        assert archived_rel in origin_tree, "new path must be in origin"

        # Index is clean of the archive rename (both paths).
        porcelain = _shell_git("status", "--porcelain", cwd=ws).stdout
        archive_residue = [
            l for l in porcelain.splitlines() if "42-test-plan" in l
        ]
        assert not archive_residue, (
            f"archive rename residue in index: {archive_residue}"
        )
        # The foreign staged file is still staged, untouched.
        assert "A  foreign.txt" in porcelain, (
            f"foreign staged file lost: {porcelain}"
        )


class TestArchiveNonDefaultBranchLink:
    """B-02: when archiving on a non-default branch, the Issue link must
    point at the branch that actually carries the archive commit, not
    resolve_plan_location's default branch."""

    def test_link_uses_actual_push_branch(self, tmp_path):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        _shell_git("checkout", "-q", "-b", "work", cwd=ws)

        result, mocks = _run_archive(ws)
        assert result == 0

        # update_issue_plan_link must receive branch="work", the branch
        # that actually carries the archive commit (B-02).
        mocks.update_link.assert_called_once()
        assert mocks.update_link.call_args.kwargs.get("branch") == "work", (
            f"link branch must be 'work', got: "
            f"{mocks.update_link.call_args.kwargs.get('branch')}"
        )


class TestArchiveSyncFailureHonesty:
    """B-03: when sync_plan_to_issue_body fails, the command must not
    report unconditional success."""

    def test_sync_failure_not_reported_as_success(self, tmp_path, capsys):
        ws, project, wt_dir, _ = _make_archive_workspace(tmp_path)
        # Make sync_plan_to_issue_body return False (sync failure).
        from types import SimpleNamespace
        from commands.archive import cmd_archive

        mocks = SimpleNamespace(
            close_issue=MagicMock(return_value=True),
            sync_body=MagicMock(return_value=False),
            sync_label=MagicMock(),
            ensure_labels=MagicMock(),
            update_link=MagicMock(),
        )
        with patch.multiple(
            "commands.archive",
            find_workspace_root=MagicMock(return_value=ws),
            resolve_space_repo=MagicMock(return_value="test/space"),
            sync_plan_to_issue_body=mocks.sync_body,
            sync_status_label=mocks.sync_label,
            ensure_issue_labels=mocks.ensure_labels,
            update_issue_plan_link=mocks.update_link,
            _is_pr_path=MagicMock(return_value=False),
            check_branch_merged=MagicMock(return_value=0),
            close_issue=mocks.close_issue,
        ):
            args = argparse.Namespace(target="42", force=False, keep_worktree=False)
            result = cmd_archive(args)

        assert result == 0  # archive itself succeeded
        combined = "".join(capsys.readouterr())
        # Must NOT report unconditional success for the sync step.
        assert "Plan synced to Issue #42" not in combined, (
            "sync failure must not be reported as success"
        )
        # Must report the sync failure honestly.
        assert "body sync failed" in combined.lower()
        # Labels and link must not run after a failed body sync.
        mocks.sync_label.assert_not_called()
        mocks.update_link.assert_not_called()
