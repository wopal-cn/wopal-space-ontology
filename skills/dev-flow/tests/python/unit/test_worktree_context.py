#!/usr/bin/env python3
# test_worktree_context.py - TDD tests for WorktreeContext model and helpers

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.worktree import (
    WorktreeContext,
    parse_worktree_context,
    parse_worktree_meta,
    write_worktree_context,
    ActivePlanInfo,
    ResolveActivePlanError,
    resolve_active_plan,
)


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

    def test_reads_project_type_from_plan_metadata(self, tmp_path):
        content = PLAN_TEMPLATE_ONTOLOGY + """\
- **Worktree**:
  - branch: feature/ont-42-slug
  - path: .worktrees/ontology-issue-42-slug
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.project_type == "ontology-worktree"

    def test_legacy_format_reads_project_type_from_metadata(self, tmp_path):
        content = PLAN_TEMPLATE_ONTOLOGY + "- **Worktree**: feature/legacy-slug | .worktrees/legacy-path\n"
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.project_type == "ontology-worktree"


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


# -- Write tests (new 2-field format) -----------------------------------------

class TestWriteWorktreeContext:
    """Test writing Worktree metadata in the new 2-field format."""

    def test_write_to_new_plan(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        result = write_worktree_context(
            str(plan), "issue-42-slug", ".worktrees/gesp-issue-42-slug",
        )
        assert result is True

        content = plan.read_text()
        assert "  - branch: issue-42-slug" in content
        assert "  - path: .worktrees/gesp-issue-42-slug" in content
        # New format should NOT write the old 9 fields
        assert "enabled:" not in content
        assert "project_type:" not in content
        assert "verify_mode:" not in content

    def test_write_and_read_roundtrip(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        write_worktree_context(
            str(plan), "feature/test-1", ".worktrees/gesp-feature-test-1",
        )

        meta = parse_worktree_meta(str(plan))
        assert meta is not None
        assert meta["branch"] == "feature/test-1"
        assert meta["path"] == ".worktrees/gesp-feature-test-1"

    def test_write_replaces_old_structured_format(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: true
  - project_type: standard
  - branch: old-branch
  - path: .worktrees/old
  - repo_root: /old
  - base_branch: main
  - merge_target: main
  - verify_mode: direct
  - cleanup_policy: archive
"""
        plan = _write_plan(tmp_path, content)
        result = write_worktree_context(
            str(plan), "new-branch", ".worktrees/new",
        )
        assert result is True

        file_content = plan.read_text()
        assert "  - branch: new-branch" in file_content
        assert "  - path: .worktrees/new" in file_content
        # Old fields should be gone
        assert "enabled:" not in file_content
        assert "repo_root:" not in file_content

    def test_write_replaces_legacy_format(self, tmp_path):
        content = PLAN_TEMPLATE + "- **Worktree**: old-branch | /old/path\n"
        plan = _write_plan(tmp_path, content)

        result = write_worktree_context(
            str(plan), "new-branch", ".worktrees/new",
        )
        assert result is True

        meta = parse_worktree_meta(str(plan))
        assert meta is not None
        assert meta["branch"] == "new-branch"
        assert meta["path"] == ".worktrees/new"

    def test_write_nonexistent_file_returns_false(self, tmp_path):
        result = write_worktree_context(
            str(tmp_path / "nope.md"), "branch", "path",
        )
        assert result is False

    def test_write_normalizes_path_to_posix(self, tmp_path):
        """Paths should always be stored with forward slashes."""
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        write_worktree_context(
            str(plan), "feature-x", ".worktrees/project-feature-x",
        )
        content = plan.read_text()
        assert "  - path: .worktrees/project-feature-x" in content


# -- Backward compatibility: old formats still readable -----------------------

class TestParseOldFormatCompat:
    """Old 9-field and legacy pipe formats must remain readable."""

    def test_read_old_9_field_format(self, tmp_path):
        """Old Plans with 9-field Worktree block still parse correctly."""
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - enabled: true
  - project_type: standard
  - branch: feature/old-1
  - path: .worktrees/gesp-old-1
  - repo_root: /workspace/projects/gesp
  - base_branch: main
  - merge_target: main
  - verify_mode: direct
  - cleanup_policy: archive
"""
        plan = _write_plan(tmp_path, content)
        meta = parse_worktree_meta(str(plan))
        assert meta is not None
        assert meta["branch"] == "feature/old-1"
        assert meta["path"] == ".worktrees/gesp-old-1"

    def test_read_legacy_pipe_format(self, tmp_path):
        """Legacy pipe format still parses."""
        content = PLAN_TEMPLATE + "- **Worktree**: legacy-branch | .worktrees/legacy\n"
        plan = _write_plan(tmp_path, content)
        meta = parse_worktree_meta(str(plan))
        assert meta is not None
        assert meta["branch"] == "legacy-branch"
        assert meta["path"] == ".worktrees/legacy"

    def test_read_new_2_field_format(self, tmp_path):
        """New 2-field format parses correctly."""
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - branch: new-branch
  - path: .worktrees/new
"""
        plan = _write_plan(tmp_path, content)
        meta = parse_worktree_meta(str(plan))
        assert meta is not None
        assert meta["branch"] == "new-branch"
        assert meta["path"] == ".worktrees/new"


# -- Verify mode tests (WorktreeContext dataclass preserved) -------------------

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


# -- resolve_active_plan tests ------------------------------------------------

class TestResolveActivePlanNoWorktree:
    """resolve_active_plan: no worktree metadata returns main Plan."""

    def test_no_worktree_returns_main_plan(self, tmp_path):
        """Plan without Worktree metadata -> main Plan on integration."""
        import subprocess

        # Create a git repo with a plan file
        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text("# Plan\n\n## Metadata\n\n- **Status**: executing\n- **Type**: feature\n")

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        info = resolve_active_plan(str(plan_file), "complete", workspace_root=tmp_path)

        assert info.active_plan_path == plan_file.resolve()
        assert info.branch_context == "integration"
        assert info.commit_repo_root == repo.resolve()


class TestResolveActivePlanWithWorktree:
    """resolve_active_plan: worktree exists -> feature branch Plan."""

    def test_complete_phase_returns_worktree_plan(self, tmp_path):
        """complete phase + worktree -> worktree's Plan copy."""
        import subprocess

        # Create main repo
        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        # Create plan in main repo
        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: executing\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-test\n  - path: .worktrees/myproject-feature-test\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        # Create feature branch
        subprocess.run(
            ["git", "branch", "feature-test", "HEAD"],
            cwd=str(repo), capture_output=True, check=True,
        )

        # Create worktree checkout
        wt_dir = tmp_path / ".worktrees" / "myproject-feature-test"
        subprocess.run(
            ["git", "worktree", "add", str(wt_dir), "feature-test"],
            cwd=str(repo), capture_output=True, check=True,
        )

        # Plan copy inside worktree (worktree inherits repo files)
        wt_plans = wt_dir / "docs" / "plans"
        wt_plans.mkdir(parents=True, exist_ok=True)
        wt_plan = wt_plans / "test-plan.md"
        wt_plan.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: executing\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-test\n  - path: .worktrees/myproject-feature-test\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(wt_dir), capture_output=True)
        subprocess.run(["git", "commit", "-m", "add plan to worktree"],
                       cwd=str(wt_dir), capture_output=True)

        info = resolve_active_plan(str(plan_file), "complete", workspace_root=tmp_path)

        assert info.branch_context == "feature"
        assert info.active_plan_path == wt_plan.resolve()

    def test_review_phase_returns_worktree_plan(self, tmp_path):
        """review phase same as complete — worktree Plan."""
        import subprocess

        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: verifying\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-x\n  - path: .worktrees/myproject-feature-x\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        subprocess.run(
            ["git", "branch", "feature-x", "HEAD"],
            cwd=str(repo), capture_output=True, check=True,
        )

        wt_dir = tmp_path / ".worktrees" / "myproject-feature-x"
        subprocess.run(
            ["git", "worktree", "add", str(wt_dir), "feature-x"],
            cwd=str(repo), capture_output=True, check=True,
        )

        wt_plans = wt_dir / "docs" / "plans"
        wt_plans.mkdir(parents=True, exist_ok=True)
        wt_plan = wt_plans / "test-plan.md"
        wt_plan.write_text("# Plan\n\n## Metadata\n\n- **Status**: verifying\n- **Type**: feature\n")

        subprocess.run(["git", "add", "."], cwd=str(wt_dir), capture_output=True)
        subprocess.run(["git", "commit", "-m", "add plan"], cwd=str(wt_dir), capture_output=True)

        info = resolve_active_plan(str(plan_file), "review", workspace_root=tmp_path)
        assert info.branch_context == "feature"
        assert info.active_plan_path == wt_plan.resolve()


class TestResolveActivePlanVerify:
    """resolve_active_plan: verify phase branch checks."""

    def test_verify_unmerged_raises_error(self, tmp_path):
        """verify on unmerged feature branch raises ResolveActivePlanError."""
        import subprocess

        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: verifying\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-unmerged\n  - path: .worktrees/myproject-feature-unmerged\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        # Checkout the feature branch to simulate "not merged"
        subprocess.run(
            ["git", "checkout", "-b", "feature-unmerged"],
            cwd=str(repo), capture_output=True, check=True,
        )

        with pytest.raises(ResolveActivePlanError, match="not been merged"):
            resolve_active_plan(str(plan_file), "verify", workspace_root=tmp_path)

    def test_verify_merged_returns_main(self, tmp_path):
        """verify after merge returns main Plan."""
        import subprocess

        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: verifying\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-merged\n  - path: .worktrees/myproject-feature-merged\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        # Create and merge the feature branch so ancestry check passes
        subprocess.run(["git", "checkout", "-b", "feature-merged"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "commit", "--allow-empty", "-m", "feature work"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "checkout", "main"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "merge", "--no-ff", "feature-merged"],
                       cwd=str(repo), capture_output=True, check=True)

        # Now on main with feature-merged actually merged via ancestry
        info = resolve_active_plan(str(plan_file), "verify", workspace_root=tmp_path)

        assert info.branch_context == "integration"
        assert info.active_plan_path == plan_file.resolve()


class TestResolveActivePlanArchive:
    """resolve_active_plan: archive always returns main Plan."""

    def test_archive_returns_main_plan(self, tmp_path):
        """archive phase always uses main Plan."""
        import subprocess

        repo = tmp_path / "projects" / "myproject"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main", str(repo)],
                       capture_output=True, check=True)
        subprocess.run(["git", "config", "user.email", "test@test.com"],
                       cwd=str(repo), capture_output=True, check=True)
        subprocess.run(["git", "config", "user.name", "Test"],
                       cwd=str(repo), capture_output=True, check=True)

        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        plan_file.write_text(
            "# Plan\n\n## Metadata\n\n- **Status**: done\n- **Type**: feature\n"
            "\n- **Worktree**:\n  - branch: feature-done\n  - path: .worktrees/myproject-feature-done\n"
        )

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"], cwd=str(repo), capture_output=True)

        info = resolve_active_plan(str(plan_file), "archive", workspace_root=tmp_path)
        assert info.branch_context == "integration"
        assert info.active_plan_path == plan_file.resolve()
