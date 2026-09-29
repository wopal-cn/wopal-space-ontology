#!/usr/bin/env python3
# test_plan_link_contract.py - Tests for Plan Issue link URL generation
#
# With plans unified under .wopal-space/plans/<project>/, all Plan blob URLs
# point to the space repo. The distinction between project repos is gone.
#
# Also covers sync_plan_to_issue_body: the Plan row update runs together with
# the surgical three-section sync (Goal/Scope/Acceptance Criteria bodies).

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


# =============================================================================
# Scenario 7: sync_plan_to_issue_body runs the surgical three-section sync
# =============================================================================

SYNC_SAMPLES = Path(__file__).resolve().parents[2] / "fixtures" / "sync-sample"


class TestSyncPlanToIssueBody:
    """Verify sync_plan_to_issue_body syncs the three mapped sections and Plan row."""

    def test_syncs_mapped_sections_and_row_preserving_the_rest(self, workspace):
        from issue import sync_plan_to_issue_body

        plan_file = workspace / ".wopal-space" / "plans" / "gesp" / "240-enhance-wopal-cli-isolated-evo-flow.md"
        plan_file.parent.mkdir(parents=True, exist_ok=True)
        plan_file.write_text((SYNC_SAMPLES / "plan-240.md").read_text())

        full_body = (SYNC_SAMPLES / "issue-240-canonical.md").read_text()
        edited_bodies = []

        def fake_gh(cmd, **kwargs):
            if cmd[:2] == ["gh", "--version"]:
                return MagicMock(returncode=0)
            if cmd[:3] == ["gh", "issue", "view"]:
                return MagicMock(returncode=0, stdout=full_body)
            if cmd[:3] == ["gh", "issue", "edit"]:
                edited_bodies.append(cmd[cmd.index("--body") + 1])
                return MagicMock(returncode=0)
            raise AssertionError(f"unexpected command: {cmd}")

        with patch("issue.subprocess.run", side_effect=fake_gh), \
             patch("plan.resolve_plan_location") as mock_loc:
            mock_loc.return_value = PlanLocation(
                path=plan_file.resolve(),
                repo_root=workspace.resolve(),
                repo_relative_path=".wopal-space/plans/gesp/240-enhance-wopal-cli-isolated-evo-flow.md",
                github_repo="sampx/wopal-space",
                branch="main",
                is_archived=False,
            )
            sync_plan_to_issue_body(42, str(plan_file), "sampx/wopal-space", str(workspace))

        assert len(edited_bodies) == 1
        new_body = edited_bodies[0]
        # Plan Goal synced in (phrasing unique to the Plan, not the old Issue text)
        assert "让目标流程从机制上完整可走" in new_body
        # Scope rendered as canonical In/Out sub-sections
        assert "### In\n\n- 记录保全：" in new_body
        assert "### Out\n\n- ontology-evolution 技能正文" in new_body
        # Acceptance Criteria: numbered checkboxes converted, sub-sections kept
        assert "1. [x]" not in new_body
        assert "- [x] **记录不丢（commit）**" in new_body
        # Non-mapped content preserved
        assert "### 问题与原因（2026-09-27 实测，refactor-plugin-config-consumption 实施与评审）" in new_body
        # Plan row updated to the internally built URL
        assert (
            "[240-enhance-wopal-cli-isolated-evo-flow]"
            "(https://github.com/sampx/wopal-space/blob/main/"
            ".wopal-space/plans/gesp/240-enhance-wopal-cli-isolated-evo-flow.md)"
        ) in new_body
        assert "待关联" not in new_body
