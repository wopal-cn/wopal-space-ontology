#!/usr/bin/env python3
# test_verify_switch.py - TDD tests for verify_switch (unified switching)
#
# Behavior-assertion tests: the switch is exercised on a real workspace repo
# plus a project repo with a real registered worktree, so worktree removal,
# checkout and the Plan metadata commit are verified by their actual results
# (HEAD branch, git registry, final file content), not by call sequences.
# A small set of gate tests keeps mocked boundaries where no local
# construction exists (gh merge queries, user validation).

import json
import os
import shutil
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from support.git_fixtures import (
    init_repo as _vs_init_repo,
    install_failing_hook as _vs_failing_hook,
    shell_git as _vs_shell_git,
)

from lib.worktree import WorktreeContext, parse_worktree_context


# -- Shared recorded samples (R2) ---------------------------------------------

PR_SAMPLE = (
    Path(__file__).resolve().parents[2]
    / "fixtures" / "github" / "pr-merged-recorded.json"
)
RECORDED_PR_URL = json.loads(PR_SAMPLE.read_text())[0]["url"]


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


def _write_plan(tmp_path, content: str, name: str = "42-feature-dev-flow-test.md") -> Path:
    """Write a Plan file with given content and return its path."""
    plan_dir = tmp_path / "plans"
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plan_dir / name
    plan_file.write_text(content)
    return plan_file


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

    @patch("commands.verify_switch.parse_worktree_context")
    @patch("commands.verify_switch.find_plan")
    @patch("commands.verify_switch.find_workspace_root")
    def test_empty_branch_errors_out(
        self, mock_ws_root, mock_find_plan, mock_parse_ctx, tmp_path
    ):
        """Returns False when WorktreeContext has empty branch."""
        from commands.verify_switch import run_verify_switch

        plan_path = _write_plan(tmp_path, PLAN_STANDARD)
        mock_ws_root.return_value = tmp_path
        mock_find_plan.return_value = str(plan_path)
        mock_parse_ctx.return_value = WorktreeContext(
            branch="",
            path=Path(".worktrees/empty-branch"),
        )

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


# -- Test: verify --confirm gates ---------------------------------------------

class TestVerifyConfirmDirectMerge:
    """Test verify --confirm after verify-switch succeeded."""

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
            "Run verify-switch, validate, then use flow.sh integrate before verify."
        )

        args = MagicMock()
        args.target = "42"
        args.confirm = True

        result = cmd_verify(args)
        assert result == 1


class TestVerifyConfirmPRMerge:
    """Test verify --confirm for PR-based flow (PR already merged)."""

    @patch("plan.get_plan_worktree", return_value=None)
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
        mock_no_wt, mock_plan_wt,
        tmp_path
    ):
        """PR already merged: verify --confirm succeeds on integration branch."""
        from commands.verify import cmd_verify
        from lib.worktree import ActivePlanInfo

        plan_content = PLAN_VERIFYING + f"\n- **PR**: {RECORDED_PR_URL}\n"
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

        plan_content = PLAN_VERIFYING + f"\n- **PR**: {RECORDED_PR_URL}\n"
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


# ============================================
# Real construction: space repo + project repo with a registered worktree
# ============================================
#
# A workspace repo holds the Plan (space repo); an independent project repo
# carries the feature branch really checked out in a registered worktree at
# the Plan-declared path (as after approve). fetch / worktree removal /
# checkout and the Plan metadata commit all run for real; only workspace and
# Plan lookup are injected.

VS_BRANCH = "feature/test-1-slug"
VS_PLAN_REL = ".wopal-space/plans/gesp/42-feature-dev-flow-test.md"
VS_WT_REL = ".worktrees/gesp-issue-1-slug"

VS_PLAN_TEMPLATE = """\
# 42-feature-dev-flow-test

## Metadata

- **Status**: verifying
- **Type**: feature
- **Target Project**: gesp
- **Project Type**: standard
- **Project Path**: projects/gesp
- **Issue**: #42
- **Worktree**:
  - branch: {branch}
  - path: .worktrees/gesp-issue-1-slug
"""


def _make_switch_workspace(tmp_path):
    ws = tmp_path / "ws"
    _vs_init_repo(ws)

    project = ws / "projects" / "gesp"
    _vs_init_repo(project)
    origin = tmp_path / "gesp-origin.git"
    _vs_shell_git("init", "--bare", "-b", "main", str(origin), cwd=tmp_path)
    _vs_shell_git("remote", "add", "origin", str(origin), cwd=project)
    _vs_shell_git("push", "-u", "origin", "main", cwd=project)
    _vs_shell_git("remote", "set-head", "origin", "main", cwd=project)
    # The feature branch is really checked out in a registered worktree at
    # the Plan-declared path, so removal and checkout are exercised for real.
    wt_dir = ws / VS_WT_REL
    wt_dir.parent.mkdir(parents=True, exist_ok=True)
    _vs_shell_git("worktree", "add", "-q", str(wt_dir), "-b", VS_BRANCH, cwd=project)

    plan = ws / VS_PLAN_REL
    plan.parent.mkdir(parents=True)
    plan.write_text(VS_PLAN_TEMPLATE.format(branch=VS_BRANCH))
    _vs_shell_git("add", VS_PLAN_REL, cwd=ws)
    _vs_shell_git("commit", "-m", "add plan", cwd=ws)
    return ws, project, plan


def _run_switch(ws, project, target="42"):
    """Run the switch with workspace/Plan lookup mocked; the real Plan file
    drives parsing and every git step runs for real."""
    from commands.verify_switch import run_verify_switch

    with patch.multiple(
        "commands.verify_switch",
        find_workspace_root=MagicMock(return_value=ws),
        find_plan=MagicMock(return_value=str(ws / VS_PLAN_REL)),
        resolve_project_path=MagicMock(return_value=project),
    ):
        return run_verify_switch(target)


class TestPlanMetadataCommitsToSpaceRepo:
    """The switch result is verified by real state: the worktree is gone from
    disk and from git's registry, HEAD sits on the feature branch, the Plan
    file reached its final shape and the metadata commit lands in the space
    repo (never in the project repo)."""

    def test_switch_removes_worktree_and_checks_out_feature_branch(
        self, tmp_path, capsys
    ):
        ws, project, plan = _make_switch_workspace(tmp_path)
        wt_dir = ws / VS_WT_REL
        assert wt_dir.exists()

        result = _run_switch(ws, project)

        assert result is True
        # The real registered worktree is gone from disk and from git.
        assert not wt_dir.exists()
        listed = _vs_shell_git(
            "worktree", "list", "--porcelain", cwd=project
        ).stdout
        assert "gesp-issue-1-slug" not in listed
        # The canonical checkout now sits on the feature branch — only
        # possible after the worktree was released first.
        assert _vs_shell_git(
            "branch", "--show-current", cwd=project
        ).stdout.strip() == VS_BRANCH
        # Final Plan content and commit target.
        content = plan.read_text()
        assert "path: (removed)" in content
        assert f"- **Verification Dir**: {project}" in content
        show = _vs_shell_git(
            "show", "HEAD", "--name-only", "--format=%s", cwd=ws
        ).stdout
        assert "verify-switch" in show
        assert VS_PLAN_REL in show
        assert _vs_shell_git(
            "log", "-1", "--format=%s", cwd=project
        ).stdout.strip() == "init"
        # Merge/verify guidance reaches the user.
        out = capsys.readouterr().out
        assert "flow.sh verify 42 --confirm" in out
        assert "return to the integration branch" in out
        assert "flow.sh integrate" in out
        assert "git merge" not in out

    def test_dirty_canonical_warns_but_switches(self, tmp_path, capsys):
        ws, project, plan = _make_switch_workspace(tmp_path)
        (project / "untracked.txt").write_text("dirty\n")

        result = _run_switch(ws, project)

        assert result is True
        assert _vs_shell_git(
            "branch", "--show-current", cwd=project
        ).stdout.strip() == VS_BRANCH
        out = capsys.readouterr().out
        assert "uncommitted" in out

    def test_eof_plan_no_trailing_newline(self, tmp_path):
        """Worktree block at EOF without trailing newline: Verification Dir
        is still placed after the block, not inside it (R-01 regression).

        The real parser requires the block's trailing newline (pre-existing
        limitation, out of this change's scope), so the parsed context is
        pinned here; the switch and the metadata update run for real.
        """
        ws, project, plan = _make_switch_workspace(tmp_path)
        plan.write_text(VS_PLAN_TEMPLATE.format(branch=VS_BRANCH).rstrip("\n"))
        _vs_shell_git("add", VS_PLAN_REL, cwd=ws)
        _vs_shell_git("commit", "-qm", "no trailing newline", cwd=ws)

        with patch(
            "commands.verify_switch.parse_worktree_context",
            return_value=WorktreeContext(
                branch=VS_BRANCH, path=Path(VS_WT_REL), project_type="standard"
            ),
        ):
            result = _run_switch(ws, project)

        assert result is True
        content = plan.read_text()
        for line in content.splitlines():
            if "Verification Dir" in line:
                assert not line.startswith(" "), (
                    f"Verification Dir should be top-level, got: {line!r}"
                )
                break
        else:
            pytest.fail("Verification Dir not found in plan")
        assert parse_worktree_context(str(plan)) is not None

    def test_commit_failure_is_loud_and_actionable(self, tmp_path, capsys):
        ws, project, plan = _make_switch_workspace(tmp_path)
        _vs_failing_hook(ws, "injected verify-switch failure")

        result = _run_switch(ws, project)

        assert result is False
        out, err = capsys.readouterr()
        combined = out + err
        # Full mutation diagnostics reach the surface.
        assert "injected verify-switch failure" in combined
        # The edit is on disk but not committed; guidance names the repo and
        # the manual command.
        assert "path: (removed)" in plan.read_text()
        assert "verify-switch" not in _vs_shell_git(
            "log", "-1", "--format=%s", cwd=ws
        ).stdout
        assert str(ws) in combined
        assert f"git -C {ws}" in combined
        assert VS_PLAN_REL in combined


# ============================================
# Failure diagnostics on the switch mutation chain (B-04)
# ============================================

class TestSwitchMutationDiagnostics:
    """fetch / worktree remove / checkout failures keep full diagnostics
    (command / cwd / exit / stderr); a prune failure is reported, not
    silently ignored."""

    def test_fetch_failure_keeps_full_diagnostics(self, tmp_path, capsys):
        ws, project, plan = _make_switch_workspace(tmp_path)
        # Unreachable origin URL: fetch fails with real git diagnostics.
        _vs_shell_git(
            "remote", "set-url", "origin", str(tmp_path / "gone.git"),
            cwd=project,
        )

        result = _run_switch(ws, project)

        assert result is False
        combined = "".join(capsys.readouterr())
        assert "command: git fetch" in combined
        assert "exit code" in combined

    def test_worktree_remove_failure_keeps_full_diagnostics(self, tmp_path, capsys):
        ws, project, plan = _make_switch_workspace(tmp_path)
        wt_dir = ws / VS_WT_REL
        _vs_shell_git("worktree", "lock", str(wt_dir), cwd=project)

        result = _run_switch(ws, project)

        assert result is False
        combined = "".join(capsys.readouterr())
        assert "command: git worktree remove" in combined
        assert "locked" in combined.lower()
        assert str(wt_dir) in combined
        assert "locked" in combined.lower()

    def test_checkout_failure_keeps_full_diagnostics(self, tmp_path, capsys):
        ws, project, plan = _make_switch_workspace(tmp_path)
        wt_dir = ws / VS_WT_REL
        (wt_dir / "README.md").write_text("# feature\n")
        _vs_shell_git("commit", "-qam", "feature change", cwd=wt_dir)
        # Canonical checkout has a conflicting uncommitted change.
        (project / "README.md").write_text("# local dirty\n")

        result = _run_switch(ws, project)

        assert result is False
        combined = "".join(capsys.readouterr())
        assert "command: git checkout" in combined
        assert "exit code" in combined

    def test_prune_failure_reported_not_ignored(self, tmp_path):
        from commands.verify_switch import _prune_worktrees

        repo = tmp_path / "project"
        _vs_init_repo(repo)
        wt_dir = tmp_path / "stale-wt"
        _vs_shell_git("worktree", "add", "-q", "-b", "stale", str(wt_dir), cwd=repo)
        shutil.rmtree(wt_dir)  # leave a stale registration behind
        worktrees_meta = repo / ".git" / "worktrees"
        os.chmod(worktrees_meta, 0o555)
        try:
            problems = _prune_worktrees(str(repo))
        finally:
            os.chmod(worktrees_meta, 0o755)

        assert problems, "prune failure must be reported, not ignored"
        assert any("prune" in p for p in problems)
        assert any("Permission denied" in p for p in problems)
