#!/usr/bin/env python3
# test_sync_preserves_context.py - Manual sync path (commands.sync) contract
#
# The manual command delegates to issue.sync_plan_to_issue_body (the single
# body-sync implementation); these tests pin the adapter behavior: exit codes
# and the resulting Issue body (three mapped sections + Plan row, with
# non-mapped content preserved).
#
# Fixtures are recorded real samples; see tests/fixtures/sync-sample/SOURCES.md.
#
# Scenarios:
#   1. Sync applies the three-section sync + Plan row via the unified
#      implementation, preserving non-mapped content
#   2. Plan file missing -> exit code 1
#   3. gh CLI unavailable -> exit code 0, no Issue write
#   4. Editing sync preserves the stored body's trailing newlines (the
#      `gh --jq .body` trailing newline must not be written back)

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from commands.sync import sync_plan_to_issue
from lib.project import PlanLocation


FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "sync-sample"
SAMPLE_PLAN = FIXTURES / "plan-240.md"
LEGACY_ISSUE = FIXTURES / "issue-123-legacy.md"


def test_sync_applies_sections_and_row_through_unified_implementation(tmp_path):
    plan_file = tmp_path / "plan-240.md"
    plan_file.write_text(SAMPLE_PLAN.read_text())

    full_body = LEGACY_ISSUE.read_text()
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

    with patch("subprocess.run", side_effect=fake_gh), \
         patch("commands.sync.shutil.which", return_value=True), \
         patch("commands.sync.find_workspace_root", return_value=str(tmp_path)), \
         patch("plan.resolve_plan_location") as mock_loc:
        mock_loc.return_value = PlanLocation(
            path=plan_file.resolve(),
            repo_root=tmp_path.resolve(),
            repo_relative_path=".wopal-space/plans/wopal-cli/done/plan-240.md",
            github_repo="sampx/wopal-space",
            branch="main",
            is_archived=True,
        )
        rc = sync_plan_to_issue("123", str(plan_file), "sampx/wopal-space")

    assert rc == 0
    assert len(edited_bodies) == 1
    body = edited_bodies[0]

    # Goal / Acceptance Criteria synced from the Plan
    assert "另放宽 `archive` 预检" in body
    assert "### Agent Verification" in body
    # Legacy top-level In/Out sections updated in place from the Plan
    assert "## In Scope\n\n- 记录保全：" in body
    assert "## Out of Scope\n\n- ontology-evolution 技能正文" in body
    # Plan row updated from the pending placeholder
    assert "| Plan | _待关联_ |" not in body
    assert (
        "| Plan | [plan-240](https://github.com/sampx/wopal-space/blob/main/"
        ".wopal-space/plans/wopal-cli/done/plan-240.md) |"
    ) in body
    # Non-mapped content preserved
    assert "## Background" in body
    assert "当前 WSF 模板中的说明文字是英文" in body


def test_edit_preserves_trailing_newlines_of_the_stored_body(tmp_path):
    """A real `gh --jq .body` read appends one trailing newline; the sync must
    not write it back — a stored body ending with N newlines stays at N after
    an editing sync (previously each real edit grew the tail by one)."""
    plan_file = tmp_path / "plan-240.md"
    plan_file.write_text(SAMPLE_PLAN.read_text())

    stored = LEGACY_ISSUE.read_text()  # sync edits it: legacy In/Out get updated
    stored_trailing = len(stored) - len(stored.rstrip("\n"))
    assert stored_trailing > 0  # the recorded sample ends with newline(s)

    edited_bodies = []

    def fake_gh(cmd, **kwargs):
        if cmd[:2] == ["gh", "--version"]:
            return MagicMock(returncode=0)
        if cmd[:3] == ["gh", "issue", "view"]:
            # real `gh --jq .body` output = stored body + one trailing newline
            return MagicMock(returncode=0, stdout=stored + "\n")
        if cmd[:3] == ["gh", "issue", "edit"]:
            edited_bodies.append(cmd[cmd.index("--body") + 1])
            return MagicMock(returncode=0)
        raise AssertionError(f"unexpected command: {cmd}")

    with patch("subprocess.run", side_effect=fake_gh), \
         patch("commands.sync.shutil.which", return_value=True), \
         patch("commands.sync.find_workspace_root", return_value=str(tmp_path)), \
         patch("plan.resolve_plan_location") as mock_loc:
        mock_loc.return_value = PlanLocation(
            path=plan_file.resolve(),
            repo_root=tmp_path.resolve(),
            repo_relative_path=".wopal-space/plans/wopal-cli/done/plan-240.md",
            github_repo="sampx/wopal-space",
            branch="main",
            is_archived=True,
        )
        rc = sync_plan_to_issue("123", str(plan_file), "sampx/wopal-space")

    assert rc == 0
    assert len(edited_bodies) == 1
    edited = edited_bodies[0]
    # an edit actually happened (legacy In updated from the Plan)
    assert "## In Scope\n\n- 记录保全：" in edited
    edited_trailing = len(edited) - len(edited.rstrip("\n"))
    assert edited_trailing == stored_trailing


def test_plan_missing_returns_failure(tmp_path):
    rc = sync_plan_to_issue("42", str(tmp_path / "missing.md"), "sampx/wopal-space")
    assert rc == 1


def test_gh_unavailable_skips_without_writing():
    with patch("commands.sync.shutil.which", return_value=False), \
         patch("subprocess.run", side_effect=AssertionError("gh must not be invoked")):
        rc = sync_plan_to_issue("42", str(SAMPLE_PLAN), "sampx/wopal-space")
    assert rc == 0
