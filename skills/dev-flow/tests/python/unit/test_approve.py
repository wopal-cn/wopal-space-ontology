#!/usr/bin/env python3
# test_approve.py - Test approve command (--confirm-only mode)
#
# Test Cases:
#   - No --confirm: error with "Use: flow.sh submit <plan>"
#   - --confirm from planning/reviewing status: proceeds
#   - --confirm from executing/verifying/done status: blocked
#   - No target: error message
#   - Parser registration
#   - Transaction artifacts (real Plan file + real git repos): field rollback
#     on worktree/commit failure, rollback commit, retry, and the approval
#     commit carrying the real Base Commit with no uncommitted residue

import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from argparse import Namespace

import pytest

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
        "resolve_project_path": Path("/ws/.wopal"),
        "detect_space_repo": "wopal-space-ontology",
        "is_repo_dirty": False,
        "write_worktree_context": True,
        "commit_and_push_plan": RESULT_OK,
        "update_plan_status": True,
        "sync_status_label": None,
        "sync_plan_to_issue_body": None,
        "ensure_issue_labels": None,
        "get_current_branch": "space/wopal-workspace",
        "get_branch_head": "abc123def",
        "set_plan_field": True,
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


class TestApproveBranchDerivation(unittest.TestCase):
    """Test branch derivation from Plan name: <project>-<plan-name>."""

    def test_branch_derives_from_plan_name(self):
        """Branch = <project>-<plan-name> for issue plans."""
        from commands.approve import _derive_branch
        self.assertEqual(
            _derive_branch("ellamaka", "42-feature-cli-add-skills-remove-command"),
            "ellamaka-42-feature-cli-add-skills-remove-command",
        )

    def test_branch_derives_for_no_issue_plan(self):
        """Branch = <project>-<plan-name> for no-issue plans."""
        from commands.approve import _derive_branch
        self.assertEqual(
            _derive_branch("wopal-site", "refactor-cli-optimize-commands"),
            "wopal-site-refactor-cli-optimize-commands",
        )

    def test_branch_derives_for_hyphenated_scope(self):
        """Branch handles hyphenated scope (no split ambiguity)."""
        from commands.approve import _derive_branch
        self.assertEqual(
            _derive_branch("wopal-space-ontology", "42-feature-dev-flow-decouple-naming"),
            "wopal-space-ontology-42-feature-dev-flow-decouple-naming",
        )


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

    def test_approve_parser_has_existing_worktree(self):
        import argparse
        from commands.approve import register_approve_parser
        parser = argparse.ArgumentParser()
        subparsers = parser.add_subparsers(dest="command")
        register_approve_parser(subparsers)
        args = parser.parse_args(["approve", "42", "--confirm", "--existing-worktree", ".worktrees/my-wt"])
        self.assertEqual(args.command, "approve")
        self.assertEqual(args.target, "42")
        self.assertTrue(args.confirm)
        self.assertEqual(args.existing_worktree, ".worktrees/my-wt")


class TestApproveExistingWorktree(unittest.TestCase):
    """Test approve with --existing-worktree option (evolution mode)."""

    def test_existing_worktree_rejects_unrelated_repo(self):
        """--existing-worktree 传入不属于本项目的其他 Git 仓库时报错拒绝。"""
        from commands.approve import cmd_approve
        mocks = _make_approve_mocks(status="reviewing")
        mocks["get_current_branch"] = MagicMock(return_value="feature/other-branch")
        mocks["get_common_git_dir"] = MagicMock(side_effect=lambda p: "/ws/target-project/.git" if "target-project" in str(p) or str(p) == str(mocks["resolve_project_path"].return_value) else "/ws/unrelated-repo/.git")
        with patch.multiple("commands.approve", **mocks):
            with patch("commands.approve.Path.exists", return_value=True), \
                 patch("commands.approve.Path.is_dir", return_value=True):
                args = Namespace(
                    target="42",
                    confirm=True,
                    no_worktree=False,
                    existing_worktree=".worktrees/unrelated-repo-b",
                )
                result = cmd_approve(args)
        self.assertEqual(result, 1)

    def test_existing_worktree_rejects_non_directory_file(self):
        """--existing-worktree 传入文件时报错退出。"""
        from commands.approve import cmd_approve
        mocks = _make_approve_mocks(status="reviewing")
        with patch.multiple("commands.approve", **mocks):
            with patch("commands.approve.Path.exists", return_value=True), \
                 patch("commands.approve.Path.is_dir", return_value=False):
                args = Namespace(
                    target="42",
                    confirm=True,
                    no_worktree=False,
                    existing_worktree=".worktrees/some-file.txt",
                )
                result = cmd_approve(args)
        self.assertEqual(result, 1)

    def test_existing_worktree_rejects_integration_branch(self):
        """--existing-worktree 绑定的 worktree 在 main 分支时报错拒绝。"""
        from commands.approve import cmd_approve
        mocks = _make_approve_mocks(status="reviewing")
        mocks["get_common_git_dir"] = MagicMock(return_value="/ws/.git")
        mocks["get_current_branch"] = MagicMock(return_value="main")
        with patch.multiple("commands.approve", **mocks):
            with patch("commands.approve.Path.exists", return_value=True), \
                 patch("commands.approve.Path.is_dir", return_value=True):
                args = Namespace(
                    target="42",
                    confirm=True,
                    no_worktree=False,
                    existing_worktree=".worktrees/primary-main",
                )
                result = cmd_approve(args)
        self.assertEqual(result, 1)


# ============================================
# Transaction artifact tests (real Plan file + real git repos)
# ============================================
#
# approve writes Plan fields (Status, Worktree metadata, Base Commit), commits
# them, then creates the worktree. These tests run the real command against a
# temp workspace — a git space repo holding a recorded Plan fixture, a temp
# project repo and a bare origin — and assert at the file/commit artifact
# level. Only workspace/repo detection, the check-doc gate (fixture 106
# predates the current checker) and Issue sync (network) are mocked.

FIXTURE_PLAN = (
    Path(__file__).resolve().parents[2]
    / "fixtures" / "plans" / "106-fix-dev-flow-valid-issue-plan.md"
)

# templates/plan.md metadata line; fixture 106 predates it, so the derived
# input inserts it verbatim after Status (documented derivation — the rest of
# the recorded sample stays untouched).
BASE_COMMIT_PLACEHOLDER = (
    "- **Base Commit**: (approve 时自动记录实施基线,集成分支 HEAD)"
)

PLAN_NAME = "106-fix-dev-flow-valid-issue-plan"
PLAN_REL = f".wopal-space/plans/ontology/{PLAN_NAME}.md"
WORKTREE_BRANCH = f"ontology-{PLAN_NAME}"


def _git(*args, cwd, check=True):
    result = subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True
    )
    if check:
        assert result.returncode == 0, f"git {args} failed: {result.stderr}"
    return result


def _init_repo(path):
    path.mkdir(parents=True, exist_ok=True)
    _git("init", "-b", "main", cwd=path)
    _git("config", "user.email", "test@test.com", cwd=path)
    _git("config", "user.name", "Test", cwd=path)
    (path / "README.md").write_text("# init\n")
    _git("add", "README.md", cwd=path)
    _git("commit", "-m", "init", cwd=path)


def _make_workspace(tmp_path, status="reviewing", create_project=True):
    """Temp space workspace: ws repo + bare origin + project repo + Plan.

    Plan content derives from the recorded fixture
    tests/fixtures/plans/106-fix-dev-flow-valid-issue-plan.md: Status is set
    to the requested value and the template's Base Commit placeholder line is
    inserted after it.
    """
    ws = tmp_path / "ws"
    _init_repo(ws)
    origin = tmp_path / "ws-origin.git"
    _git("init", "--bare", "-b", "main", str(origin), cwd=tmp_path)
    _git("remote", "add", "origin", str(origin), cwd=ws)

    if create_project:
        _init_repo(ws / "projects" / "ontology")

    plan_text = FIXTURE_PLAN.read_text().replace(
        "- **Status**: planning",
        f"- **Status**: {status}\n{BASE_COMMIT_PLACEHOLDER}",
    )
    plan = ws / PLAN_REL
    plan.parent.mkdir(parents=True)
    plan.write_text(plan_text)
    _git("add", PLAN_REL, cwd=ws)
    _git("commit", "-m", "add plan", cwd=ws)
    _git("push", "-u", "origin", "main", cwd=ws)
    _git("remote", "set-head", "origin", "main", cwd=ws)
    return ws, plan


def _run_approve(ws, *, no_worktree=False, existing_worktree=None):
    """Run cmd_approve with only the I/O boundary mocked.

    Returns (exit_code, log_error mock) so callers can assert the
    user-visible messaging.
    """
    from commands.approve import cmd_approve

    log_error = MagicMock()
    with patch.multiple(
        "commands.approve",
        find_workspace_root=MagicMock(return_value=ws),
        detect_space_repo=MagicMock(return_value="test/space"),
        check_doc_plan=MagicMock(return_value=None),
        sync_status_label=MagicMock(),
        sync_plan_to_issue_body=MagicMock(),
        ensure_issue_labels=MagicMock(),
        log_error=log_error,
    ):
        args = Namespace(
            target="106",
            confirm=True,
            no_worktree=no_worktree,
            existing_worktree=existing_worktree,
        )
        result = cmd_approve(args)
    return result, log_error


def _error_log_text(log_error):
    return "\n".join(str(call.args[0]) for call in log_error.call_args_list)


class TestApproveRollback:
    """Failure after state fields are written rolls the Plan back to the
    pre-approval field shape (proposal D-07)."""

    @pytest.mark.parametrize("failure", ["blocking-file", "missing-project"])
    def test_worktree_failure_rolls_back_plan_fields(self, tmp_path, failure):
        ws, plan = _make_workspace(
            tmp_path, create_project=(failure != "missing-project")
        )
        original = plan.read_text()

        if failure == "blocking-file":
            # A file on the worktree path makes `git worktree add` fail (the
            # approve-probe failure shape).
            blocked = ws / ".worktrees" / WORKTREE_BRANCH
            blocked.parent.mkdir(parents=True)
            blocked.write_text("")

        result, log_error = _run_approve(ws)

        assert result == 1
        # Status / Worktree / Base Commit rolled back to the prior values.
        assert plan.read_text() == original
        # The approval commit landed first; a rollback commit reverses it.
        subjects = _git("log", "--format=%s", cwd=ws).stdout.splitlines()
        assert "rollback" in subjects[0]
        assert "approve" in subjects[1]
        assert _git("show", f"HEAD:{PLAN_REL}", cwd=ws).stdout == original
        assert "executing" in _git("show", f"HEAD~1:{PLAN_REL}", cwd=ws).stdout
        assert _git("status", "--porcelain", "--", PLAN_REL, cwd=ws).stdout == ""
        # Truthful messaging: rolled back, not executing, real state value.
        text = _error_log_text(log_error)
        assert "已回滚" in text
        assert "未进入 executing" in text
        assert "reviewing" in text

    def test_retry_after_worktree_failure_succeeds(self, tmp_path):
        """A failed approve leaves the Plan retryable (exit 1 + rollback)."""
        ws, plan = _make_workspace(tmp_path)
        blocked = ws / ".worktrees" / WORKTREE_BRANCH
        blocked.parent.mkdir(parents=True)
        blocked.write_text("")

        first, _ = _run_approve(ws)
        assert first == 1

        blocked.unlink()
        second, _ = _run_approve(ws)

        assert second == 0
        assert "- **Status**: executing" in plan.read_text()
        assert (ws / ".worktrees" / WORKTREE_BRANCH).is_dir()
        subjects = _git("log", "--format=%s", cwd=ws).stdout.splitlines()
        assert subjects[0].startswith("docs(plan): approve plan #106")

    def test_commit_failure_rolls_back_plan_fields(self, tmp_path):
        """Approval-commit failure restores the pre-approval field shape —
        worktree and index — and leaves no half-committed lifecycle behind
        (proposal D-07)."""
        ws, plan = _make_workspace(tmp_path)
        original = plan.read_text()
        head_before = _git("rev-parse", "HEAD", cwd=ws).stdout.strip()

        hook = ws / ".git" / "hooks" / "pre-commit"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)

        result, log_error = _run_approve(ws, no_worktree=True)

        assert result == 1
        assert plan.read_text() == original
        assert BASE_COMMIT_PLACEHOLDER in plan.read_text()
        # No commit was created: nothing half-committed.
        assert _git("rev-parse", "HEAD", cwd=ws).stdout.strip() == head_before
        # Index and worktree both back to the pre-approval shape: the failed
        # approval's staging is reset as well (no half-committed residue).
        assert _git("status", "--porcelain", "--", PLAN_REL, cwd=ws).stdout == ""
        assert "已回滚" in _error_log_text(log_error)


class TestApproveSuccessArtifacts:
    """Successful approve: the state-transition commit carries the real Base
    Commit and no uncommitted residue remains (proposal D-08)."""

    @pytest.mark.parametrize(
        "status,no_worktree",
        [("planning", True), ("reviewing", True), ("reviewing", False)],
    )
    def test_commit_contains_real_base_commit(self, tmp_path, status, no_worktree):
        ws, plan = _make_workspace(tmp_path, status=status)

        result, _ = _run_approve(ws, no_worktree=no_worktree)

        assert result == 0
        main_head = _git(
            "rev-parse", "main", cwd=ws / "projects" / "ontology"
        ).stdout.strip()
        committed = _git("show", f"HEAD:{PLAN_REL}", cwd=ws).stdout
        assert f"- **Base Commit**: {main_head}" in committed
        assert "- **Status**: executing" in committed
        assert _git("status", "--porcelain", "--", PLAN_REL, cwd=ws).stdout == ""
        if no_worktree:
            assert "- **Worktree**" not in committed
        else:
            assert f"  - branch: {WORKTREE_BRANCH}" in committed
            assert (ws / ".worktrees" / WORKTREE_BRANCH).is_dir()

    def test_existing_worktree_commit_contains_worktree_branch_head(self, tmp_path):
        """--existing-worktree: Base Commit = that worktree's branch HEAD."""
        ws, plan = _make_workspace(tmp_path)
        project = ws / "projects" / "ontology"

        wt = ws / ".worktrees" / "ontology-existing-evo"
        wt.parent.mkdir(parents=True)
        _git("worktree", "add", "-b", "ontology-existing-evo", str(wt), cwd=project)
        (wt / "work.txt").write_text("evolved\n")
        _git("add", "work.txt", cwd=wt)
        _git("commit", "-m", "existing evolution work", cwd=wt)
        wt_head = _git("rev-parse", "HEAD", cwd=wt).stdout.strip()

        result, _ = _run_approve(
            ws, existing_worktree=".worktrees/ontology-existing-evo"
        )

        assert result == 0
        committed = _git("show", f"HEAD:{PLAN_REL}", cwd=ws).stdout
        assert f"- **Base Commit**: {wt_head}" in committed
        assert "  - branch: ontology-existing-evo" in committed
        assert "- **Status**: executing" in committed
        assert _git("status", "--porcelain", "--", PLAN_REL, cwd=ws).stdout == ""


if __name__ == "__main__":
    unittest.main()
