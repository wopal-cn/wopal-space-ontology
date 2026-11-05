#!/usr/bin/env python3
# test_worktree_context.py - TDD tests for WorktreeContext model and helpers

import subprocess
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
    remove_worktree,
    create_worktree,
    clean_worktree,
    delete_branch,
)


# -- Fixtures -----------------------------------------------------------------

PLAN_TEMPLATE = """\
## Metadata

- **Status**: planning
- **Type**: feature
- **Target Project**: gesp
- **Issue**: #42
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
  - branch: feature/test-1-slug
  - path: .worktrees/project-issue-1-slug
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.branch == "feature/test-1-slug"
        assert ctx.path == Path(".worktrees/project-issue-1-slug")

    def test_parse_partial_fields_get_defaults(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - branch: issue-42-slug
  - path: .worktrees/gesp-issue-42-slug
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        assert ctx.branch == "issue-42-slug"
        assert ctx.path == Path(".worktrees/gesp-issue-42-slug")

    def test_parse_enabled_false(self, tmp_path):
        content = PLAN_TEMPLATE + """\
- **Worktree**:
  - branch: ""
  - path: ""
"""
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))

        assert ctx is not None
        # Parser reads values as-is, including quotes
        assert ctx.branch == '""'

    def test_no_worktree_returns_none(self, tmp_path):
        plan = _write_plan(tmp_path, PLAN_TEMPLATE)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_nonexistent_file_returns_none(self, tmp_path):
        ctx = parse_worktree_context(str(tmp_path / "nonexistent.md"))
        assert ctx is None



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

class TestParseWorktreeScopesToMetadata:
    """Worktree parsing must only match within ## Metadata, not design sections."""

    def test_design_placeholder_not_parsed_as_metadata(self, tmp_path):
        """Plan with Worktree placeholder in design section returns None."""
        content = (
            PLAN_TEMPLATE
            + "\n## Scope Assessment\n\n"
            + "- D-01: Worktree 元数据以显式字段存储：\n\n"
            + "- **Worktree**:\n"
            + "  - branch: <feature-branch-name>\n"
            + "  - path: <workspace-relative-worktree-path>\n"
        )
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))
        assert ctx is None

    def test_metadata_worktree_still_parsed_with_design_present(self, tmp_path):
        """When both Metadata and design sections exist, only Metadata's Worktree is read."""
        content = (
            PLAN_TEMPLATE
            + "- **Worktree**:\n"
            + "  - branch: feature/real-branch\n"
            + "  - path: .worktrees/real\n"
            + "\n## Scope Assessment\n\n"
            + "- **Worktree**:\n"
            + "  - branch: <feature-branch-name>\n"
            + "  - path: <workspace-relative-worktree-path>\n"
        )
        plan = _write_plan(tmp_path, content)
        ctx = parse_worktree_context(str(plan))
        assert ctx is not None
        assert ctx.branch == "feature/real-branch"


class TestParseOldFormatCompat:
    """Old 9-field structured Worktree blocks remain readable."""

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

# -- Worktree path derivation (dir = branch, no project prefix) --------------

class TestWorktreePathDerivation:
    """Worktree directory must equal the branch name (no project prefix).

    Branch already contains the project prefix (<project>-<plan-name>), so
    the worktree directory must not repeat it.
    """

    def test_create_worktree_dir_equals_branch(self, tmp_path):
        """create_worktree uses branch as the worktree dir name."""
        from unittest.mock import patch, MagicMock

        project_dir = tmp_path / "project"
        project_dir.mkdir()
        worktree_base = tmp_path / ".worktrees"
        worktree_base.mkdir()

        ok = MagicMock()
        ok.returncode = 0

        with patch("lib.worktree.subprocess.run", return_value=ok):
            result = create_worktree(
                project_dir, "ellamaka-42-feature-cli-add-skills", worktree_base,
            )

        # Worktree dir = branch (no project prefix repeated)
        assert result == worktree_base / "ellamaka-42-feature-cli-add-skills"

    def test_remove_worktree_locates_real_path_when_dir_differs_from_branch(
        self, tmp_path
    ):
        """Legacy naming: worktree dir has a project prefix the branch lacks
        (dir 'ellamaka-implement-workbench-chat-transcript' vs branch
        'implement-workbench-chat-transcript'). remove_worktree must locate
        the real registered path via `git worktree list --porcelain` instead
        of deriving the dir from the branch name, otherwise archive silently
        skips removal and reports false success.
        """
        from unittest.mock import patch, MagicMock

        project_dir = tmp_path / "project"
        project_dir.mkdir()
        worktree_base = tmp_path / ".worktrees"
        worktree_base.mkdir()
        real_wt = worktree_base / "ellamaka-implement-workbench-chat-transcript"
        real_wt.mkdir()

        porcelain_out = (
            "worktree /main/path\n"
            "HEAD abc\n"
            "branch refs/heads/main\n"
            "\n"
            f"worktree {real_wt}\n"
            "HEAD def\n"
            "branch refs/heads/implement-workbench-chat-transcript\n"
        )

        def fake_run(cmd, *args, **kwargs):
            if cmd[0] == "git" and cmd[1] == "worktree" and cmd[2] == "list":
                return MagicMock(returncode=0, stdout=porcelain_out)
            return MagicMock(returncode=0, stdout="")

        with patch("lib.worktree.subprocess.run", side_effect=fake_run) as mock_run:
            remove_worktree(
                project_dir, "implement-workbench-chat-transcript", worktree_base,
            )

        remove_calls = [
            c.args[0] for c in mock_run.call_args_list
            if c.args and c.args[0][0] == "git" and c.args[0][1] == "worktree"
            and c.args[0][2] == "remove"
        ]
        assert remove_calls, "expected a git worktree remove call"
        assert str(real_wt) in remove_calls[0], (
            f"git worktree remove must target the registered path {real_wt}, "
            f"got {remove_calls[0]}"
        )

    def test_remove_worktree_falls_back_to_derived_path_when_not_registered(
        self, tmp_path
    ):
        """No matching branch in `git worktree list --porcelain` (e.g. the
        registration is already gone): fall back to the branch-derived dir so
        existing behavior is preserved.
        """
        from unittest.mock import patch, MagicMock

        project_dir = tmp_path / "project"
        project_dir.mkdir()
        worktree_base = tmp_path / ".worktrees"
        worktree_base.mkdir()
        derived = worktree_base / "feature-x"
        derived.mkdir()

        porcelain_out = "worktree /main/path\nHEAD abc\n\n"

        def fake_run(cmd, *args, **kwargs):
            if cmd[0] == "git" and cmd[1] == "worktree" and cmd[2] == "list":
                return MagicMock(returncode=0, stdout=porcelain_out)
            return MagicMock(returncode=0, stdout="")

        with patch("lib.worktree.subprocess.run", side_effect=fake_run) as mock_run:
            remove_worktree(project_dir, "feature-x", worktree_base)

        remove_calls = [
            c.args[0] for c in mock_run.call_args_list
            if c.args and c.args[0][0] == "git" and c.args[0][1] == "worktree"
            and c.args[0][2] == "remove"
        ]
        assert remove_calls, "expected a git worktree remove call"
        assert str(derived) in remove_calls[0], (
            f"fallback must target the branch-derived dir {derived}, "
            f"got {remove_calls[0]}"
        )


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


# -- remove_worktree failure tests --------------------------------------------

class TestRemoveWorktreeFailure:
    """remove_worktree: any tracked or untracked local file is preserved."""

    def test_local_file_is_preserved_with_actionable_message(self, tmp_path):
        repo = tmp_path / "project"
        _init_repo_with_commit(repo)

        branch = "feature/local-file"
        worktree_path = tmp_path / "checkout"
        _git(repo, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        (worktree_path / "notes.txt").write_text("keep\n")

        with pytest.raises(RuntimeError) as exc_info:
            remove_worktree(repo, branch, tmp_path / ".worktrees")

        message = str(exc_info.value)
        assert "Preserved tracked or untracked files" in message
        assert "Save or publish it, then rerun cleanup" in message
        assert worktree_path.exists()


# -- Git mutation attempt diagnostics -----------------------------------------


def _git(path: Path, *args: str) -> subprocess.CompletedProcess:
    """Run a git command in path, asserting success."""
    result = subprocess.run(
        ["git", *args], cwd=str(path), capture_output=True, text=True,
    )
    assert result.returncode == 0, f"git {args} failed: {result.stderr}"
    return result


def _init_repo_with_commit(path: Path) -> None:
    """Create a git repo with one initial commit."""
    path.mkdir(parents=True, exist_ok=True)
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.email", "test@test.com")
    _git(path, "config", "user.name", "Test")
    (path / "README.md").write_text("# test\n")
    _git(path, "add", "README.md")
    _git(path, "commit", "-m", "init")


class TestRemoveWorktreeSubmoduleSafety:
    """An initialized submodule stops cleanup instead of being force-deleted."""

    def test_initialized_submodule_is_preserved(self, tmp_path):
        child = tmp_path / "child"
        _init_repo_with_commit(child)
        parent = tmp_path / "parent"
        _init_repo_with_commit(parent)
        _git(
            parent, "-c", "protocol.file.allow=always",
            "submodule", "add", str(child), "third_party/child",
        )
        _git(
            parent, "-c", "protocol.file.allow=always",
            "submodule", "update", "--init", "--recursive",
        )
        _git(parent, "add", ".")
        _git(parent, "commit", "-m", "add child")

        branch = "feature/with-child"
        worktree_path = tmp_path / "checkout"
        _git(parent, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        _git(
            worktree_path, "-c", "protocol.file.allow=always",
            "submodule", "update", "--init", "--recursive",
        )
        child_file = worktree_path / "third_party" / "child" / "README.md"
        child_file.write_text("# local child change\n")

        with pytest.raises(RuntimeError) as exc_info:
            remove_worktree(parent, branch, tmp_path / ".worktrees")

        message = str(exc_info.value).lower()
        assert "submodule" in message
        assert worktree_path.exists()
        assert child_file.read_text() == "# local child change\n"


class TestCleanWorktreeFailure:
    """Branch deletion must not continue after worktree removal fails."""

    def test_removal_failure_preserves_branch_and_worktree(self, tmp_path):
        repo = tmp_path / "project"
        _init_repo_with_commit(repo)

        branch = "feature/remove-failure"
        worktree_path = tmp_path / "checkout"
        _git(repo, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        (worktree_path / "untracked.txt").write_text("keep\n")

        result = clean_worktree(repo, branch, tmp_path / ".worktrees")

        assert result["removed"] is False
        assert result["branch_deleted"] is False
        assert result["branch_status"] == "skipped"
        assert worktree_path.exists()
        assert (worktree_path / "untracked.txt").read_text() == "keep\n"
        _git(repo, "rev-parse", "--verify", f"refs/heads/{branch}")


class TestRemoveWorktreeIgnoredArtifacts:
    """Ignored test/build files do not block a clean worktree removal."""

    def test_ignored_artifacts_are_removed(self, tmp_path):
        parent = tmp_path / "parent"
        _init_repo_with_commit(parent)
        (parent / ".gitignore").write_text(
            ".venv/\n__pycache__/\n.pytest_cache/\ndist/\nnode_modules/\n"
        )
        _git(parent, "add", ".gitignore")
        _git(parent, "commit", "-m", "ignore generated output")

        branch = "feature/generated-output"
        worktree_path = tmp_path / "checkout"
        _git(parent, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        for name in (".venv", "__pycache__", ".pytest_cache", "dist", "node_modules"):
            generated = worktree_path / name
            generated.mkdir()
            (generated / "output").write_text("regenerable\n")

        warnings = remove_worktree(parent, branch, tmp_path / ".worktrees")

        assert warnings == []
        assert not worktree_path.exists()


class TestRemoveWorktreeTrackedChange:
    """A tracked edit is local work and must never be discarded."""

    def test_tracked_change_is_preserved(self, tmp_path):
        parent = tmp_path / "parent"
        _init_repo_with_commit(parent)

        branch = "feature/tracked-change"
        worktree_path = tmp_path / "checkout"
        _git(parent, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        (worktree_path / "README.md").write_text("# unsaved local work\n")

        with pytest.raises(RuntimeError):
            remove_worktree(parent, branch, tmp_path / ".worktrees")

        assert worktree_path.exists()
        assert (worktree_path / "README.md").read_text() == "# unsaved local work\n"


class TestCreateWorktreeAttemptDiagnostics:
    """create_worktree: a failed fallback must not overwrite the first
    attempt's evidence in the raised error."""

    def test_both_attempt_errors_preserved(self, tmp_path):
        repo = tmp_path / "project"
        _init_repo_with_commit(repo)

        branch = "feature/dual-failure"
        # Occupy the branch in another worktree: attempt 1 fails with
        # "already used by worktree" ...
        other = tmp_path / "other-checkout"
        _git(repo, "branch", branch)
        _git(repo, "worktree", "add", str(other), branch)
        # ... and attempt 2 fails because the branch name already exists.
        worktree_base = tmp_path / ".worktrees"

        with pytest.raises(RuntimeError) as exc_info:
            create_worktree(repo, branch, worktree_base)

        message = str(exc_info.value)
        assert "already used by worktree" in message  # attempt 1 evidence
        assert "already exists" in message            # attempt 2 evidence
        assert message.count("git worktree add") == 2
        assert message.count("exit code:") == 2
        assert str(repo) in message                   # cwd
        target = worktree_base / "feature-dual-failure"
        assert str(target) in message                 # attempted path


class TestRemoveWorktreeFailureDiagnostics:
    """A failed removal keeps the single normal-removal diagnostic."""

    def test_normal_failure_evidence_is_preserved(self, tmp_path):
        repo = tmp_path / "project"
        _init_repo_with_commit(repo)

        branch = "feature/remove-failure"
        worktree_path = tmp_path / "checkout"
        _git(repo, "worktree", "add", "-b", branch, str(worktree_path), "HEAD")
        (worktree_path / "untracked.txt").write_text("dirty\n")

        with pytest.raises(RuntimeError) as exc_info:
            remove_worktree(repo, branch, tmp_path / ".worktrees")

        message = str(exc_info.value)
        assert "Preserved tracked or untracked files" in message
        assert "Save or publish it, then rerun cleanup" in message
        assert str(worktree_path.resolve()) in message


class TestDeleteBranchOutcomes:
    """delete_branch must distinguish deleted / absent / skipped-current /
    failed instead of collapsing every outcome into False (B-02)."""

    def _repo_with_commit(self, tmp_path):
        repo = tmp_path / "repo"
        subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
        subprocess.run(
            ["git", "config", "user.email", "test@test.com"], cwd=repo, check=True
        )
        subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
        (repo / "f.txt").write_text("x\n")
        subprocess.run(["git", "add", "f.txt"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, check=True)
        return repo

    def test_deleted_branch_reported_deleted(self, tmp_path):
        repo = self._repo_with_commit(tmp_path)
        subprocess.run(["git", "branch", "feat"], cwd=repo, check=True)

        result = delete_branch(repo, "feat")

        assert result.status == "deleted"
        assert result.deleted is True
        assert subprocess.run(
            ["git", "rev-parse", "--verify", "refs/heads/feat"],
            cwd=repo, capture_output=True,
        ).returncode != 0

    def test_missing_branch_reported_absent(self, tmp_path):
        repo = self._repo_with_commit(tmp_path)

        result = delete_branch(repo, "does-not-exist")

        assert result.status == "absent"
        assert result.deleted is False
        assert result.attempts == []

    def test_current_branch_reported_skipped(self, tmp_path):
        repo = self._repo_with_commit(tmp_path)

        result = delete_branch(repo, "main")

        assert result.status == "skipped"
        assert result.deleted is False

    def test_real_failure_preserves_diagnostics(self, tmp_path):
        repo = self._repo_with_commit(tmp_path)
        subprocess.run(["git", "branch", "locked"], cwd=repo, check=True)
        # Real injection: a stale loose-ref lock makes both -d and -D fail.
        (repo / ".git" / "refs" / "heads" / "locked.lock").write_text("")

        result = delete_branch(repo, "locked")

        assert result.status == "failed"
        assert result.deleted is False
        assert len(result.attempts) == 2
        assert all(a.exit_code != 0 for a in result.attempts)
        assert any("lock" in (a.stderr or "").lower() for a in result.attempts)

    def test_rev_parse_read_failure_reported_failed(self, tmp_path):
        """W-02: when rev-parse itself fails (non-empty stderr), the result
        is 'failed', not silently 'absent' — an unknown state must not be
        treated as a clean idempotent skip."""
        from unittest.mock import patch
        repo = self._repo_with_commit(tmp_path)
        subprocess.run(["git", "branch", "feat"], cwd=repo, check=True)

        original_run = subprocess.run

        def fake_run(cmd, **kwargs):
            if "rev-parse" in cmd and "--verify" in cmd:
                from types import SimpleNamespace
                return SimpleNamespace(
                    returncode=128, stdout="", stderr="fatal: permission denied"
                )
            return original_run(cmd, **kwargs)

        with patch("lib.worktree.subprocess.run", side_effect=fake_run):
            result = delete_branch(repo, "feat")

        assert result.status == "failed"
        assert result.incomplete
        assert len(result.attempts) >= 1
        assert "permission denied" in str(result.attempts[0])
