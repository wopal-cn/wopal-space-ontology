#!/usr/bin/env python3
# test_git_semantics.py - TDD tests for repo-aware Git commit/push semantics
#
# Tests for Task 2 of phase2-worktree-git-lifecycle:
# - commit_paths / push_repo in lib/git.py
# - approve: repo-aware Plan commit
# - complete: same-repo merge commit vs different-repo separate commits
# - verify: Plan status=done committed to Plan's repo
# - archive: repo-aware git mv/commit/push

import subprocess
import sys
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.git import commit_paths, push_repo, commit_all, get_current_branch
from lib.project import resolve_plan_location
from workflow import update_plan_status


# ============================================
# Git fixture helpers
# ============================================

def _git_init(path: Path, branch: str = "main") -> None:
    """Initialize a bare-ish git repo with an initial commit."""
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-b", branch, str(path)],
                   capture_output=True, check=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"],
                   cwd=str(path), capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test"],
                   cwd=str(path), capture_output=True, check=True)
    # Create an initial commit so HEAD exists
    readme = path / "README.md"
    readme.write_text("# test repo\n")
    subprocess.run(["git", "add", "README.md"], cwd=str(path),
                   capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=str(path),
                   capture_output=True, check=True)


def _make_plan_file(plan_path: Path, status: str = "executing") -> Path:
    """Create a minimal Plan file with given status."""
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    plan_path.write_text(
        f"# Test Plan\n\n## Metadata\n\n- **Status**: {status}\n"
        f"- **Type**: chore\n- **Target Project**: test-project\n"
    )
    return plan_path


def _get_commit_count(repo_path: Path) -> int:
    """Get number of commits in repo."""
    result = subprocess.run(
        ["git", "rev-list", "--count", "HEAD"],
        cwd=str(repo_path), capture_output=True, text=True,
    )
    return int(result.stdout.strip())


def _get_last_commit_files(repo_path: Path) -> list[str]:
    """Get files changed in last commit."""
    result = subprocess.run(
        ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
        cwd=str(repo_path), capture_output=True, text=True,
    )
    return [f for f in result.stdout.strip().split('\n') if f]


def _get_last_commit_message(repo_path: Path) -> str:
    """Get last commit message (subject line)."""
    result = subprocess.run(
        ["git", "log", "-1", "--format=%s"],
        cwd=str(repo_path), capture_output=True, text=True,
    )
    return result.stdout.strip()


# ============================================
# Test: commit_paths / push_repo (lib/git.py)
# ============================================

class TestCommitPaths:
    """Tests for commit_paths() in lib/git.py."""

    def test_commit_specific_paths(self, tmp_path):
        """commit_paths stages and commits only the specified paths."""
        repo = tmp_path / "repo"
        _git_init(repo)

        # Create two files
        (repo / "a.txt").write_text("aaa")
        (repo / "b.txt").write_text("bbb")

        # Stage and commit only a.txt
        result = commit_paths(str(repo), ["a.txt"], "test: add a")
        assert result is True

        # b.txt should not be in the commit
        files = _get_last_commit_files(repo)
        assert "a.txt" in files
        assert "b.txt" not in files

        # b.txt should still be uncommitted
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(repo), capture_output=True, text=True,
        )
        assert "b.txt" in status.stdout

    def test_commit_paths_empty_list(self, tmp_path):
        """commit_paths with empty paths returns True (no-op)."""
        repo = tmp_path / "repo"
        _git_init(repo)
        assert commit_paths(str(repo), [], "noop") is True

    def test_commit_paths_nothing_to_commit(self, tmp_path):
        """commit_paths returns True when nothing to commit."""
        repo = tmp_path / "repo"
        _git_init(repo)
        # Already committed init, no changes
        assert commit_paths(str(repo), ["README.md"], "noop") is True


class TestPushRepo:
    """Tests for push_repo() in lib/git.py."""

    def test_push_repo_no_remote_returns_false(self, tmp_path):
        """push_repo returns False when there's no remote."""
        repo = tmp_path / "repo"
        _git_init(repo)
        # No remote configured — push should fail gracefully
        assert push_repo(str(repo), "main") is False

    def test_push_repo_no_branch_returns_false(self, tmp_path):
        """push_repo with None branch and no current branch returns False."""
        repo = tmp_path / "repo"
        _git_init(repo)
        # Detach HEAD to simulate no branch
        subprocess.run(["git", "checkout", "--detach", "HEAD"],
                       cwd=str(repo), capture_output=True)
        assert push_repo(str(repo)) is False


# ============================================
# Test: approve _commit_and_push_plan (repo-aware)
# ============================================

class TestApproveRepoAware:
    """Tests that approve commits Plan to Plan's repo, not workspace_root."""

    def test_commit_plan_to_project_repo(self, tmp_path):
        """Plan file is committed to the project repo it belongs to."""
        # Create a project repo with plans dir
        project_repo = tmp_path / "projects" / "myproject"
        _git_init(project_repo)
        plans_dir = project_repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)

        plan_file = plans_dir / "test-plan.md"
        _make_plan_file(plan_file, status="planning")

        # Add and commit plan file first (so it's tracked)
        subprocess.run(["git", "add", "docs/plans/test-plan.md"],
                       cwd=str(project_repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "add plan"],
                       cwd=str(project_repo), capture_output=True)

        # Now update status (simulating approve's status transition planning -> executing)
        update_plan_status(str(plan_file), "executing")

        # Resolve plan location
        plan_location = resolve_plan_location(plan_file, tmp_path)

        # Commit using commit_paths in Plan's repo
        commit_paths(
            str(plan_location.repo_root),
            [plan_location.repo_relative_path],
            "docs(plan): approve plan test-plan",
        )

        # Verify commit is in project repo, not workspace root
        files = _get_last_commit_files(project_repo)
        assert "docs/plans/test-plan.md" in files
        msg = _get_last_commit_message(project_repo)
        assert "approve plan" in msg


# ============================================
# Test: complete same-repo merge commit
# ============================================

class TestCompleteSameRepo:
    """Tests for same-repo complete: single commit with code + Plan status."""

    def test_same_repo_single_commit(self, tmp_path):
        """Code + Plan status=verifying in one commit when same repo."""
        repo = tmp_path / "projects" / "myproject"
        _git_init(repo)

        # Create plan dir and plan file
        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        _make_plan_file(plan_file, status="executing")

        # Track the plan file
        subprocess.run(["git", "add", "docs/plans/test-plan.md"],
                       cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "add plan"],
                       cwd=str(repo), capture_output=True)

        initial_commits = _get_commit_count(repo)

        # Simulate: code changes
        (repo / "src").mkdir()
        (repo / "src" / "main.py").write_text("print('hello')")

        # Simulate: update Plan status to verifying
        update_plan_status(str(plan_file), "verifying")

        # Same-repo merge commit: commit_all
        commit_all(str(repo), "feat: implement feature")

        # Should be exactly one new commit
        assert _get_commit_count(repo) == initial_commits + 1

        # The commit should contain BOTH code and Plan file
        files = _get_last_commit_files(repo)
        assert "src/main.py" in files
        assert "docs/plans/test-plan.md" in files

        # Plan file should have verifying status
        assert "verifying" in plan_file.read_text()

    def test_ontology_worktree_same_repo(self, tmp_path):
        """Ontology worktree: skills + plan in one commit (D-07)."""
        # Simulate .wopal repo
        wopal = tmp_path / ".wopal"
        _git_init(wopal)

        # Create skills and plans dirs
        skills_dir = wopal / "skills" / "dev-flow" / "scripts"
        skills_dir.mkdir(parents=True)
        plans_dir = wopal / "docs" / "plans"
        plans_dir.mkdir(parents=True)

        # Create plan file
        plan_file = plans_dir / "phase2-test.md"
        _make_plan_file(plan_file, status="executing")

        # Track plan
        subprocess.run(["git", "add", "."], cwd=str(wopal), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init plan"],
                       cwd=str(wopal), capture_output=True)

        initial_commits = _get_commit_count(wopal)

        # Code changes in skills
        (skills_dir / "new_module.py").write_text("# new module")

        # Update Plan status
        update_plan_status(str(plan_file), "verifying")

        # Same-repo merge commit
        commit_all(str(wopal), "feat: add new module")

        # One commit with both code + Plan
        assert _get_commit_count(wopal) == initial_commits + 1
        files = _get_last_commit_files(wopal)
        has_code = any("new_module.py" in f for f in files)
        has_plan = any("phase2-test.md" in f for f in files)
        assert has_code, f"Expected new_module.py in commit, got: {files}"
        assert has_plan, f"Expected phase2-test.md in commit, got: {files}"


class TestCompleteDifferentRepo:
    """Tests for different-repo complete: separate commits in each repo."""

    def test_different_repo_separate_commits(self, tmp_path):
        """Code in project repo, Plan status in Plan repo."""
        # Plan repo (e.g., .wopal)
        plan_repo = tmp_path / "plan-repo"
        _git_init(plan_repo)
        plans_dir = plan_repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        _make_plan_file(plan_file, status="executing")
        subprocess.run(["git", "add", "."], cwd=str(plan_repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init plan"],
                       cwd=str(plan_repo), capture_output=True)

        # Code repo
        code_repo = tmp_path / "projects" / "myproject"
        _git_init(code_repo)
        (code_repo / "src").mkdir()
        (code_repo / "src" / "main.py").write_text("print('hello')")
        subprocess.run(["git", "add", "."], cwd=str(code_repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init code"],
                       cwd=str(code_repo), capture_output=True)

        plan_initial = _get_commit_count(plan_repo)
        code_initial = _get_commit_count(code_repo)

        # Step 1: Commit code in code repo
        (code_repo / "src" / "main.py").write_text("print('updated')")
        commit_all(str(code_repo), "feat: update code")

        # Step 2: Update Plan status + commit in plan repo
        update_plan_status(str(plan_file), "verifying")
        plan_location = resolve_plan_location(plan_file, tmp_path)
        commit_paths(
            str(plan_location.repo_root),
            [plan_location.repo_relative_path],
            "docs(plan): complete plan test-plan",
        )

        # Code repo has one new commit
        assert _get_commit_count(code_repo) == code_initial + 1
        code_files = _get_last_commit_files(code_repo)
        assert "src/main.py" in code_files

        # Plan repo has one new commit
        assert _get_commit_count(plan_repo) == plan_initial + 1
        plan_files = _get_last_commit_files(plan_repo)
        assert "docs/plans/test-plan.md" in plan_files


# ============================================
# Test: verify commits done status to Plan's repo
# ============================================

class TestVerifyRepoAware:
    """Tests that verify commits Plan status=done to Plan's repo (D-05)."""

    def test_done_status_committed_to_plan_repo(self, tmp_path):
        """Plan status=done is committed to the repo where Plan lives."""
        repo = tmp_path / "projects" / "myproject"
        _git_init(repo)
        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        _make_plan_file(plan_file, status="verifying")

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init plan"],
                       cwd=str(repo), capture_output=True)

        initial_commits = _get_commit_count(repo)

        # Update status to done (simulating verify --confirm)
        update_plan_status(str(plan_file), "done")

        # Resolve and commit
        plan_location = resolve_plan_location(plan_file, tmp_path)
        commit_paths(
            str(plan_location.repo_root),
            [plan_location.repo_relative_path],
            "docs(plan): verify plan test-plan",
        )

        # One new commit in Plan's repo
        assert _get_commit_count(repo) == initial_commits + 1

        # Commit contains Plan file
        files = _get_last_commit_files(repo)
        assert "docs/plans/test-plan.md" in files

        # Plan status is done
        assert "done" in plan_file.read_text()

    def test_done_status_committed_to_ontology_repo(self, tmp_path):
        """Plan status=done committed to ontology repo (not workspace)."""
        wopal = tmp_path / ".wopal"
        _git_init(wopal)
        plans_dir = wopal / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "phase2-test.md"
        _make_plan_file(plan_file, status="verifying")

        subprocess.run(["git", "add", "."], cwd=str(wopal), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"],
                       cwd=str(wopal), capture_output=True)

        initial = _get_commit_count(wopal)

        update_plan_status(str(plan_file), "done")
        plan_location = resolve_plan_location(plan_file, tmp_path)
        commit_paths(
            str(plan_location.repo_root),
            [plan_location.repo_relative_path],
            "docs(plan): verify plan phase2-test",
        )

        assert _get_commit_count(wopal) == initial + 1


# ============================================
# Test: archive repo-aware git mv/commit
# ============================================

class TestArchiveRepoAware:
    """Tests that archive performs git mv/commit in Plan's repo (D-06)."""

    def test_archive_git_mv_in_plan_repo(self, tmp_path):
        """git mv and commit happen in Plan's repo, not workspace."""
        repo = tmp_path / "projects" / "myproject"
        _git_init(repo)
        plans_dir = repo / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "test-plan.md"
        _make_plan_file(plan_file, status="done")

        subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init plan"],
                       cwd=str(repo), capture_output=True)

        initial_commits = _get_commit_count(repo)

        # Resolve Plan location
        plan_location = resolve_plan_location(plan_file, tmp_path)
        repo_root = str(plan_location.repo_root)

        # Simulate archive: git mv
        done_dir = plans_dir / "done"
        done_dir.mkdir(parents=True)
        archive_date = date.today().strftime("%Y%m%d")
        archived_name = f"{archive_date}-test-plan.md"
        archived_file = done_dir / archived_name

        plan_rel = str(plan_file.relative_to(repo))
        archived_rel = str(archived_file.relative_to(repo))

        subprocess.run(
            ["git", "mv", plan_rel, archived_rel],
            cwd=repo_root, capture_output=True, check=True,
        )

        # Commit in Plan's repo
        commit_paths(repo_root, [archived_rel], "chore: archive plan test-plan")

        # One new commit in the project repo
        assert _get_commit_count(repo) == initial_commits + 1

        # Commit should show rename
        files = _get_last_commit_files(repo)
        assert any("test-plan.md" in f for f in files)

        # Original file should be gone
        assert not plan_file.exists()
        # Archived file should exist
        assert archived_file.exists()

    def test_archive_ontology_repo(self, tmp_path):
        """Archive in ontology repo (D-06)."""
        wopal = tmp_path / ".wopal"
        _git_init(wopal)
        plans_dir = wopal / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        plan_file = plans_dir / "phase2-test.md"
        _make_plan_file(plan_file, status="done")

        subprocess.run(["git", "add", "."], cwd=str(wopal), capture_output=True)
        subprocess.run(["git", "commit", "-m", "init"],
                       cwd=str(wopal), capture_output=True)

        initial = _get_commit_count(wopal)

        # Archive
        done_dir = plans_dir / "done"
        done_dir.mkdir(parents=True)
        archive_date = date.today().strftime("%Y%m%d")
        archived_name = f"{archive_date}-phase2-test.md"
        archived_file = done_dir / archived_name

        plan_rel = str(plan_file.relative_to(wopal))
        archived_rel = str(archived_file.relative_to(wopal))

        subprocess.run(
            ["git", "mv", plan_rel, archived_rel],
            cwd=str(wopal), capture_output=True, check=True,
        )
        commit_paths(str(wopal), [archived_rel], "chore: archive plan phase2-test")

        assert _get_commit_count(wopal) == initial + 1
        assert not plan_file.exists()
        assert archived_file.exists()
