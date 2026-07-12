#!/usr/bin/env python3
# test_plan_link_contract.py - Tests for Plan Issue link URL generation
#
# With plans unified under .wopal-space/plans/<project>/, all Plan blob URLs
# point to the space repo. The distinction between project repos is gone.

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.project import PlanLocation
from plan import build_plan_link_for_issue, update_issue_plan_link


@pytest.fixture
def workspace(tmp_path):
    """Create a workspace with space repo and unified plan directories."""
    ws = tmp_path / "workspace"
    ws.mkdir(parents=True)
    (ws / ".git").mkdir()  # Space repo

    (ws / ".wopal-space" / "plans" / "gesp").mkdir(parents=True)
    (ws / ".wopal-space" / "plans" / "space-ontology").mkdir(parents=True)

    return ws


def _slug_by_path(path):
    """Mock: all paths resolve to the space repo."""
    return "sampx/wopal-space"


def _write_plan(path, status="executing", project="gesp"):
    """Write a minimal Plan file with metadata."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"- **Status**: {status}\n"
        f"- **Target Project**: {project}\n"
        f"- **Type**: feature\n"
        f"- **Issue**: #42\n"
    )


# =============================================================================
# Scenario 1: Active plan → URL uses space repo
# =============================================================================

class TestBuildPlanLinkActive:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_url_uses_space_repo(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "sampx/wopal-space" in result
        assert "blob/main/.wopal-space/plans/gesp/42-feature-gesp-resolver.md" in result

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_table_row_format(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result.startswith("| Plan |")
        assert result.endswith(" |")
        assert "[42-feature-gesp-resolver]" in result


# =============================================================================
# Scenario 2: Archived plan → URL uses space repo
# =============================================================================

class TestBuildPlanLinkArchived:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_archived_url_uses_space_repo(self, mock_slug, mock_branch, workspace):
        done_dir = workspace / ".wopal-space" / "plans" / "gesp" / "done"
        done_dir.mkdir(parents=True)
        plan_file = done_dir / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="done", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "sampx/wopal-space" in result
        assert "blob/main/.wopal-space/plans/gesp/done/42-feature-gesp-resolver.md" in result


# =============================================================================
# Scenario 3: Ontology plan → same unified URL (no special treatment)
# =============================================================================

class TestBuildPlanLinkOntology:
    @patch("lib.project._get_default_branch", return_value="space/main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_uses_space_repo(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "space-ontology" / "feature-dev-flow-resolver.md"
        _write_plan(plan_file, status="executing", project="space-ontology")

        result = build_plan_link_for_issue(
            str(plan_file), "feature-dev-flow-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "sampx/wopal-space" in result
        assert "blob/space/main/.wopal-space/plans/space-ontology/feature-dev-flow-resolver.md" in result


# =============================================================================
# Scenario 4: Plan with no github_repo → empty URL
# =============================================================================

class TestBuildPlanLinkNoRepo:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", return_value=None)
    def test_no_repo_returns_placeholder(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "| Plan | [42-feature-gesp-resolver]() |" == result


# =============================================================================
# Scenario 5: Planning/draft status → placeholder
# =============================================================================

class TestBuildPlanLinkDraftStatus:
    def test_planning_status_returns_placeholder(self, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="planning", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result == "| Plan | _待关联_ |"

    def test_draft_status_returns_placeholder(self, workspace):
        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="draft", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result == "| Plan | _待关联_ |"


# =============================================================================
# Scenario 6: update_issue_plan_link uses space repo
# =============================================================================

class TestUpdateIssuePlanLink:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    @patch("subprocess.run")
    def test_archive_link_uses_space_repo(self, mock_run, mock_slug, mock_branch, workspace):
        done_dir = workspace / ".wopal-space" / "plans" / "gesp" / "done"
        done_dir.mkdir(parents=True)
        plan_file = done_dir / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="done", project="gesp")

        view_result = MagicMock()
        view_result.returncode = 0
        view_result.stdout = (
            "## Related Resources\n\n"
            "| Resource | Link |\n"
            "|----------|------|\n"
            "| Plan | [42-feature-gesp-resolver](https://github.com/sampx/wopal-space/blob/main/old/path.md) |\n"
        )
        edit_result = MagicMock()
        edit_result.returncode = 0

        mock_run.side_effect = [view_result, edit_result]

        update_issue_plan_link(
            issue_number=42,
            plan_file=str(plan_file),
            repo="sampx/wopal-space",
            workspace_root=str(workspace),
        )

        assert mock_run.call_count == 2
        edit_call = mock_run.call_args_list[1]
        edit_cmd = edit_call[0][0]

        body_arg_idx = edit_cmd.index("--body") + 1
        new_body = edit_cmd[body_arg_idx]

        assert "sampx/wopal-space" in new_body
        assert ".wopal-space/plans/gesp/done/42-feature-gesp-resolver.md" in new_body


class TestSyncPlanToIssueBody:
    """Verify sync_plan_to_issue_body only replaces Plan row, not entire body."""

    def test_preserves_other_sections(self, workspace):
        from issue import sync_plan_to_issue_body

        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "feature-resolver.md"
        plan_file.write_text("# Plan\n\n- **Status**: executing\n- **Target Project**: gesp\n")

        full_body = (
            "## Goal\n\nSome goal text\n\n"
            "## Related Resources\n\n"
            "| Resource | Link |\n|------|------|\n"
            "| Plan | _待关联_ |\n\n"
            "## Acceptance Criteria\n\n- [ ] AC1\n- [ ] AC2\n"
        )

        view_result = MagicMock()
        view_result.stdout = full_body
        version_result = MagicMock()
        version_result.returncode = 0
        edit_result = MagicMock()
        edit_result.returncode = 0

        with patch("issue.subprocess.run") as mock_run, \
             patch("plan.resolve_plan_location") as mock_loc:
            loc = PlanLocation(
                path=plan_file.resolve(),
                repo_root=workspace.resolve(),
                repo_relative_path=".wopal-space/plans/gesp/feature-resolver.md",
                github_repo="sampx/wopal-space",
                branch="main",
                is_archived=False,
            )
            mock_loc.return_value = loc
            mock_run.side_effect = [version_result, view_result, edit_result]

            sync_plan_to_issue_body(42, str(plan_file), "sampx/wopal-space", str(workspace))

            edit_call = mock_run.call_args_list[2]
            edit_cmd = edit_call[0][0]
            body_arg_idx = edit_cmd.index("--body") + 1
            new_body = edit_cmd[body_arg_idx]

            assert "## Goal" in new_body
            assert "Some goal text" in new_body
            assert "## Acceptance Criteria" in new_body
            assert "AC1" in new_body
            assert "sampx/wopal-space" in new_body
            assert "待关联" not in new_body
