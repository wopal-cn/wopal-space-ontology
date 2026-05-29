#!/usr/bin/env python3
# test_worktree_context.py - TDD tests for WorktreeContext model and helpers

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.worktree import WorktreeContext, parse_worktree_context, write_worktree_context


# -- Fixtures -----------------------------------------------------------------

PLAN_TEMPLATE = """\
- **Status**: planning
- **Type**: feature
- **Target Project**: gesp
- **Issue**: #42
"""

PLAN_TEMPLATE_ONTOLOGY = """\
- **Status**: planning
- **Type**: feature
- **Target Project**: wopal-space-ontology
- **Project Type**: ontology-worktree
- **Issue**: #10
"""


def _write_plan(tmp_path, content: str, name: str = "42-feature-dev-flow-test.md") -> Path:
    """Write a Plan file with given content and return its path."""
    plan_dir = tmp_path / "plans"
    plan_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plan_dir / name
    plan_file.write_text(content)
    return plan_file


# -- Parse tests --------------------------------------------------------------

class TestParseStructuredWorktree:
    """Test parsing new structured Worktree format from Plan metadata."""

    def test_parse_full_structured(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: true
  - project_type: standard
  - branch: feature/test-1-slug
  - path: .worktrees/project-issue-1-slug
  - repo_root: /tmp/workspace/projects/project
  - base_branch: main
  - merge_target: main
  - verify_mode: direct
  - cleanup_policy: archive
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.enabled is True
        assert ctx.project_type == "standard"
        assert ctx.branch == "feature/test-1-slug"
        assert ctx.path == Path(".worktrees/project-issue-1-slug")
        assert ctx.repo_root == Path("/tmp/workspace/projects/project")
        assert ctx.base_branch == "main"
        assert ctx.merge_target == "main"
        assert ctx.verify_mode == "direct"
        assert ctx.cleanup_policy == "archive"

    def test_parse_partial_fields_get_defaults(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: true
  - branch: issue-42-slug
  - path: .worktrees/gesp-issue-42-slug
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.enabled is True
        assert ctx.branch == "issue-42-slug"
        assert ctx.project_type == "standard"  # default
        assert ctx.base_branch == "main"  # default
        assert ctx.verify_mode == "direct"  # default
        assert ctx.cleanup_policy == "archive"  # default

    def test_parse_enabled_false(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: false
  - branch: ""
  - path: ""
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.enabled is False

    def test_no_worktree_returns_none(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_nonexistent_file_returns_none(self, tmp_path):
        ctx = parse_worktree_context(str(tmp_path / "nonexistent.md"))
        assert ctx is None


class TestParseLegacyWorktree:
    """Test parsing legacy '- **Worktree**: branch | path' format."""

    def test_parse_legacy_format(self, tmp_path):
        content = PLAN_TEMPLATE + "- **Worktree**: feature/test-1-slug | .worktrees/gesp-feature-test-1-slug\n"
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.enabled is True
        assert ctx.branch == "feature/test-1-slug"
        assert ctx.path == Path(".worktrees/gesp-feature-test-1-slug")
        # Legacy format fills defaults
        assert ctx.project_type == "standard"
        assert ctx.verify_mode == "direct"
        assert ctx.cleanup_policy == "archive"

    def test_parse_legacy_invalid_no_pipe(self, tmp_path):
        content = PLAN_TEMPLATE + "- **Worktree**: just-a-branch-no-path\n"
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_parse_legacy_empty_parts(self, tmp_path):
        content = PLAN_TEMPLATE + "- **Worktree**:  | \n"
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_structured_takes_precedence_over_legacy(self, tmp_path):
        """If both formats exist (shouldn't happen), structured wins."""
        content = PLAN_TEMPLATE + """\
- **Worktree**: legacy-branch | /legacy/path
- **Worktree**:
  - enabled: true
  - branch: structured-branch
  - path: .worktrees/structured
  - verify_mode: switch-runtime
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.branch == "structured-branch"
        assert ctx.verify_mode == "switch-runtime"


# -- Write tests --------------------------------------------------------------

class TestWriteWorktreeContext:
    """Test writing WorktreeContext to Plan metadata."""

    def test_write_to_new_plan(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        ctx = WorktreeContext(
            enabled=True,
            project_type="standard",
            branch="issue-42-slug",
            path=Path(".worktrees/gesp-issue-42-slug"),
            repo_root=Path("/workspace/projects/gesp"),
            base_branch="main",
            merge_target="main",
            verify_mode="direct",
            cleanup_policy="archive",
        )

        result = write_worktree_context(str(plan), ctx)
        assert result is True

        # Verify round-trip
        parsed = parse_worktree_context(str(plan))
        assert parsed is not None
        assert parsed.enabled == ctx.enabled
        assert parsed.branch == ctx.branch
        assert parsed.path == ctx.path
        assert parsed.verify_mode == ctx.verify_mode

    def test_write_replaces_structured_format(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: true
  - branch: old-branch
  - path: .worktrees/old
  - repo_root: /old
  - base_branch: main
  - merge_target: main
  - verify_mode: direct
  - cleanup_policy: archive
"""
        plan = _write_plan(tmp_path, content)

        new_ctx = WorktreeContext(
            enabled=True,
            project_type="standard",
            branch="new-branch",
            path=Path(".worktrees/new"),
            repo_root=Path("/new"),
            base_branch="main",
            merge_target="main",
            verify_mode="direct",
            cleanup_policy="archive",
        )

        result = write_worktree_context(str(plan), new_ctx)
        assert result is True

        parsed = parse_worktree_context(str(plan))
        assert parsed is not None
        assert parsed.branch == "new-branch"
        assert parsed.path == Path(".worktrees/new")

    def test_write_replaces_legacy_format(self, tmp_path):
        content = PLAN_TEMPLATE + "- **Worktree**: old-branch | /old/path\n"
        plan = _write_plan(tmp_path, content)

        ctx = WorktreeContext(
            enabled=True,
            project_type="standard",
            branch="new-branch",
            path=Path(".worktrees/new"),
            repo_root=Path("/workspace/projects/gesp"),
            base_branch="main",
            merge_target="main",
            verify_mode="direct",
            cleanup_policy="archive",
        )

        result = write_worktree_context(str(plan), ctx)
        assert result is True

        parsed = parse_worktree_context(str(plan))
        assert parsed is not None
        assert parsed.branch == "new-branch"

    def test_write_nonexistent_file_returns_false(self, tmp_path):
        ctx = WorktreeContext(
            enabled=False, project_type="standard", branch="",
            path=Path(""), repo_root=Path(""), base_branch="main",
            merge_target="main", verify_mode="direct", cleanup_policy="manual",
        )
        result = write_worktree_context(str(tmp_path / "nope.md"), ctx)
        assert result is False


# -- Verify mode tests --------------------------------------------------------

class TestVerifyMode:
    """Test verify_mode selection based on project type."""

    def test_standard_project_uses_direct(self):
        ctx = WorktreeContext(
            enabled=True, project_type="standard", branch="feature/test",
            path=Path(".worktrees/gesp-feature-test"),
            repo_root=Path("/workspace/projects/gesp"),
            base_branch="main", merge_target="main",
            verify_mode="direct", cleanup_policy="archive",
        )
        assert ctx.verify_mode == "direct"
        assert ctx.project_type == "standard"

    def test_ontology_project_uses_switch_runtime(self):
        ctx = WorktreeContext(
            enabled=True, project_type="ontology-worktree",
            branch="issue-10-slug",
            path=Path(".worktrees/ontology-issue-10-slug"),
            repo_root=Path("/home/.wopal/ontologies/wopal-space-ontology"),
            base_branch="space/main", merge_target="space/main",
            verify_mode="switch-runtime", cleanup_policy="archive",
        )
        assert ctx.verify_mode == "switch-runtime"
        assert ctx.project_type == "ontology-worktree"


# -- Disabled worktree tests --------------------------------------------------

class TestDisabledWorktree:
    """Test --no-worktree (disabled) scenarios."""

    def test_disabled_context(self):
        ctx = WorktreeContext(
            enabled=False, project_type="standard", branch="",
            path=Path(""), repo_root=Path(""), base_branch="main",
            merge_target="main", verify_mode="direct", cleanup_policy="manual",
        )
        assert ctx.enabled is False

    def test_plan_without_worktree_is_none(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_write_disabled_context_roundtrip(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        ctx = WorktreeContext(
            enabled=False, project_type="standard", branch="",
            path=Path(""), repo_root=Path(""), base_branch="main",
            merge_target="main", verify_mode="direct", cleanup_policy="manual",
        )
        assert write_worktree_context(str(plan), ctx) is True

        parsed = parse_worktree_context(str(plan))
        assert parsed is not None
        assert parsed.enabled is False
        assert parsed.cleanup_policy == "manual"
