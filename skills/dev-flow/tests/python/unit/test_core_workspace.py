#!/usr/bin/env python3
# test_core_workspace.py - Test find_workspace_root and detect_space_repo
#
# Test Cases:
#   U1: workspace root detection (not fooled by sub-project .wopal/)
#   U2: space repo URL parsing (HTTPS/SSH, with/without .git)
#   I1/I2: real workspace detection and repo detection

import unittest
import sys
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from lib.workspace import find_workspace_root, detect_space_repo


class TestFindWorkspaceRoot(unittest.TestCase):
    """Test find_workspace_root with fixture directories."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        # Create workspace root with .wopal/.git worktree file
        self.workspace_root = Path(self.tmp_dir) / "workspace"
        self.workspace_root.mkdir()
        wopal_dir = self.workspace_root / ".wopal"
        wopal_dir.mkdir()
        (wopal_dir / ".git").write_text("gitdir: /some/path.git/worktrees/main\n")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_finds_workspace_root_from_root(self):
        """find_workspace_root returns workspace root when starting from root."""
        result = find_workspace_root(start=self.workspace_root)
        self.assertEqual(result.resolve(), self.workspace_root.resolve())

    def test_finds_workspace_root_from_nested_dir(self):
        """find_workspace_root returns workspace root from deeply nested dir."""
        nested = self.workspace_root / ".wopal" / "skills" / "dev-flow" / "scripts"
        nested.mkdir(parents=True)
        result = find_workspace_root(start=nested)
        self.assertEqual(result.resolve(), self.workspace_root.resolve())

    def test_not_fooled_by_subproject_wopal(self):
        """find_workspace_root ignores project-level .wopal/ (no gitdir file)."""
        # Create projects/gesp/.wopal/ as regular directory (no gitdir file)
        project_wopal = self.workspace_root / "projects" / "gesp" / ".wopal"
        project_wopal.mkdir(parents=True)
        (project_wopal / "config.json").write_text("{}")

        result = find_workspace_root(start=project_wopal)
        self.assertEqual(result.resolve(), self.workspace_root.resolve())

    def test_raises_when_no_workspace_root(self):
        """find_workspace_root raises RuntimeError when no .wopal/.git worktree found."""
        orphan = Path(self.tmp_dir) / "orphan"
        orphan.mkdir()
        with self.assertRaises(RuntimeError):
            find_workspace_root(start=orphan)

    def test_real_workspace_root(self):
        """I1: find_workspace_root returns a valid workspace root with .wopal/.git."""
        result = find_workspace_root()
        wopal_git = result / ".wopal" / ".git"
        self.assertTrue(wopal_git.exists(), f"Expected .wopal/.git at {result}")
        self.assertTrue(wopal_git.is_file(), f"Expected .wopal/.git to be a worktree file")
        self.assertEqual(result.resolve(), result)


class TestDetectSpaceRepo(unittest.TestCase):
    """Test detect_space_repo URL parsing with mocked git."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.workspace_root = Path(self.tmp_dir)
        # Create minimal .wopal/.git worktree signature
        wopal_dir = self.workspace_root / ".wopal"
        wopal_dir.mkdir()
        (wopal_dir / ".git").write_text("gitdir: /some/path.git/worktrees/main\n")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    @patch("lib.workspace.get_remote_url")
    def test_https_url_with_git_suffix(self, mock_url):
        """detect_space_repo parses HTTPS URL with .git suffix."""
        mock_url.return_value = "https://github.com/sampx/wopal-space.git"
        result = detect_space_repo(self.workspace_root)
        self.assertEqual(result, "sampx/wopal-space")

    @patch("lib.workspace.get_remote_url")
    def test_https_url_without_git_suffix(self, mock_url):
        """detect_space_repo parses HTTPS URL without .git suffix."""
        mock_url.return_value = "https://github.com/sampx/wopal-space"
        result = detect_space_repo(self.workspace_root)
        self.assertEqual(result, "sampx/wopal-space")

    @patch("lib.workspace.get_remote_url")
    def test_ssh_url_with_git_suffix(self, mock_url):
        """detect_space_repo parses SSH URL with .git suffix."""
        mock_url.return_value = "git@github.com:sampx/wopal-space.git"
        result = detect_space_repo(self.workspace_root)
        self.assertEqual(result, "sampx/wopal-space")

    @patch("lib.workspace.get_remote_url")
    def test_ssh_url_without_git_suffix(self, mock_url):
        """detect_space_repo parses SSH URL without .git suffix."""
        mock_url.return_value = "git@github.com:sampx/wopal-space"
        result = detect_space_repo(self.workspace_root)
        self.assertEqual(result, "sampx/wopal-space")

    @patch("lib.workspace.get_remote_url")
    def test_raises_on_empty_url(self, mock_url):
        """detect_space_repo raises RuntimeError when no remote configured."""
        mock_url.return_value = ""
        with self.assertRaises(RuntimeError):
            detect_space_repo(self.workspace_root)

    @patch("lib.workspace.get_remote_url")
    def test_raises_on_invalid_url(self, mock_url):
        """detect_space_repo raises RuntimeError on unparseable URL."""
        mock_url.return_value = "https://gitlab.com/some/repo"
        with self.assertRaises(RuntimeError):
            detect_space_repo(self.workspace_root)

    def test_real_space_repo_detection(self):
        """I2: detect_space_repo returns sampx/wopal-space from real workspace."""
        from lib.workspace import find_workspace_root
        ws_root = find_workspace_root()
        result = detect_space_repo(ws_root)
        self.assertEqual(result, "sampx/wopal-space")


if __name__ == '__main__':
    unittest.main()
