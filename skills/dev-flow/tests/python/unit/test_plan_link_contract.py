#!/usr/bin/env python3
# test_plan_link_contract.py - TDD tests for Task 4: fix Issue Plan links
#
# Verifies that Plan blob URLs point to the Plan's project repo,
# not always the space repo.

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
    """Create a workspace with a standard project and ontology worktree."""
    ws = tmp_path / "workspace"
    wopal = ws / ".wopal"
    wopal.mkdir(parents=True)
    (wopal / ".git").write_text("gitdir: /fake/ontology-main/.git/worktrees/-wopal\n")
    (wopal / "docs" / "plans").mkdir(parents=True)

    gesp = ws / "projects" / "gesp"
    gesp.mkdir(parents=True)
    (gesp / ".git").mkdir()
    (gesp / "docs" / "plans").mkdir(parents=True)

    return ws


def _slug_by_path(path):
    p = str(path)
    if p.endswith(".wopal") or (".wopal" in p and "projects" not in p):
        return "wopal-cn/wopal-space-ontology"
    if "gesp" in p:
        return "sampx/gesp"
    return None


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
# Scenario 1: Active standard project Plan link -> URL uses project repo
# =============================================================================

class TestBuildPlanLinkActiveStandard:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_url_uses_project_repo(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        # URL must use gesp's repo, NOT the space repo
        assert "sampx/gesp" in result
        assert "blob/main/docs/plans/42-feature-gesp-resolver.md" in result
        assert "sampx/wopal-space" not in result

    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_returns_table_row_format(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result.startswith("| Plan |")
        assert result.endswith(" |")
        assert "[42-feature-gesp-resolver]" in result


# =============================================================================
# Scenario 2: Archived standard project Plan link -> URL uses project repo
# =============================================================================

class TestBuildPlanLinkArchivedStandard:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_archived_url_uses_project_repo(self, mock_slug, mock_branch, workspace):
        done_dir = workspace / "projects" / "gesp" / "docs" / "plans" / "done"
        done_dir.mkdir(parents=True)
        plan_file = done_dir / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="done", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "sampx/gesp" in result
        assert "blob/main/docs/plans/done/42-feature-gesp-resolver.md" in result
        assert "sampx/wopal-space" not in result


# =============================================================================
# Scenario 3: Ontology Plan link -> URL uses ontology repo + current branch
# =============================================================================

class TestBuildPlanLinkOntology:
    @patch("lib.project.get_current_branch", return_value="space/main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_uses_current_branch(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal" / "docs" / "plans" / "feature-dev-flow-resolver.md"
        _write_plan(plan_file, status="executing", project="wopal-space-ontology")

        result = build_plan_link_for_issue(
            str(plan_file), "feature-dev-flow-resolver",
            "sampx/wopal-space", str(workspace),
        )

        # URL must use ontology repo and current branch (space/main), NOT "main"
        assert "wopal-cn/wopal-space-ontology" in result
        assert "blob/space/main/docs/plans/feature-dev-flow-resolver.md" in result

    @patch("lib.project.get_current_branch", return_value="feature/some-branch")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    def test_ontology_feature_branch(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / ".wopal" / "docs" / "plans" / "feature-dev-flow-resolver.md"
        _write_plan(plan_file, status="executing", project="wopal-space-ontology")

        result = build_plan_link_for_issue(
            str(plan_file), "feature-dev-flow-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert "wopal-cn/wopal-space-ontology" in result
        assert "blob/feature/some-branch/" in result


# =============================================================================
# Scenario 4: Plan with no github_repo -> empty string / placeholder
# =============================================================================

class TestBuildPlanLinkNoRepo:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", return_value=None)
    def test_no_repo_returns_placeholder(self, mock_slug, mock_branch, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="executing", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        # When no github_repo, URL is empty — link text only
        assert "| Plan | [42-feature-gesp-resolver]() |" == result


# =============================================================================
# Scenario 5: Planning/draft status -> placeholder (unchanged behavior)
# =============================================================================

class TestBuildPlanLinkDraftStatus:
    def test_planning_status_returns_placeholder(self, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="planning", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result == "| Plan | _待关联_ |"

    def test_draft_status_returns_placeholder(self, workspace):
        plan_file = workspace / "projects" / "gesp" / "docs" / "plans" / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="draft", project="gesp")

        result = build_plan_link_for_issue(
            str(plan_file), "42-feature-gesp-resolver",
            "sampx/wopal-space", str(workspace),
        )

        assert result == "| Plan | _待关联_ |"


# =============================================================================
# Scenario 6: update_issue_plan_link uses Plan's project repo
# =============================================================================

class TestUpdateIssuePlanLink:
    @patch("lib.project._get_default_branch", return_value="main")
    @patch("lib.project._get_repo_slug", side_effect=_slug_by_path)
    @patch("subprocess.run")
    def test_archive_link_uses_project_repo(self, mock_run, mock_slug, mock_branch, workspace):
        # Setup: create an archived plan
        done_dir = workspace / "projects" / "gesp" / "docs" / "plans" / "done"
        done_dir.mkdir(parents=True)
        plan_file = done_dir / "42-feature-gesp-resolver.md"
        _write_plan(plan_file, status="done", project="gesp")

        # Do NOT create state_dir — force the gh CLI path
        # (when state_dir exists, code writes to edit-args.txt instead of gh)

        # Mock: first gh call = issue view (returns body with old link)
        #       second gh call = issue edit
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

        # Verify: second call is gh issue edit with the correct repo URL
        assert mock_run.call_count == 2
        edit_call = mock_run.call_args_list[1]
        edit_cmd = edit_call[0][0]

        assert edit_cmd[0] == "gh"
        assert "edit" in edit_cmd

        # Find --body argument
        body_arg_idx = edit_cmd.index("--body") + 1
        new_body = edit_cmd[body_arg_idx]

        assert "sampx/gesp" in new_body
        assert "docs/plans/done/42-feature-gesp-resolver.md" in new_body
        # Space repo should NOT appear in the blob URL part
        assert "sampx/wopal-space/blob" not in new_body
