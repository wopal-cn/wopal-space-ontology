#!/usr/bin/env python3
# test_archive.py - Unit tests for archive command helpers
#
# Task 4 (Issue #155): Phase doc Related Plans table update on archive.
# Bug fix: _detect_worktree must return metadata even when worktree path
# has been cleaned up by verify-switch.

import unittest
import sys
import tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

# archive.py has heavy imports (plan, workflow, issue, lib.*).
# Mock them before importing to avoid circular imports / side effects.
for mod in [
    "lib.logging", "lib.workspace", "lib.git", "lib.worktree", "lib.project",
    "workflow", "plan", "issue",
]:
    sys.modules.setdefault(mod, MagicMock())

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "commands"))
from archive import (
    _update_phase_doc_plan_status,
    _detect_worktree,
    _PHASE_TABLE_HEADER,
    _PHASE_TABLE_SEP,
)

# Restore real logging for the function (used internally)
from lib.logging import log_info, log_warn, log_success
archive_mod = sys.modules["archive"]
archive_mod.log_info = log_info
archive_mod.log_warn = log_warn
archive_mod.log_success = log_success


def _make_phase_doc(path: Path, rows: list[tuple[str, str, str]]) -> None:
    """Write a minimal phase doc with a Related Plans table.

    Args:
        path: File path to write.
        rows: List of (project, plan, status) tuples.
    """
    lines = [
        "# Phase Title\n\n",
        "Some intro text.\n\n",
        "## Related Plans\n\n",
        _PHASE_TABLE_HEADER + "\n",
        _PHASE_TABLE_SEP + "\n",
    ]
    for proj, plan, status in rows:
        lines.append(f"| {proj} | {plan} | {status} |\n")
    lines.append("\nOther content.\n")
    path.write_text("".join(lines))


class TestUpdatePhaseDocPlanStatus(unittest.TestCase):
    """Tests for _update_phase_doc_plan_status."""

    def setUp(self):
        import tempfile
        self.tmpdir = Path(tempfile.mkdtemp())
        self.ws_root = self.tmpdir

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir)

    def _create_phase_dir(self, product: str = "wopal-space"):
        phases = self.ws_root / "docs" / "products" / product / "phases"
        phases.mkdir(parents=True)
        return phases

    # ---- happy path: update status to done ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_updates_status_to_done(self, mock_ok, mock_warn, mock_info):
        phases = self._create_phase_dir()
        doc = phases / "wopal-space-p1-one-click.md"
        _make_phase_doc(doc, [
            ("wopal-cli", "feat-cli-publish-p1", "planning"),
            ("wopal-site", "feat-site-blog", "executing"),
        ])

        result = _update_phase_doc_plan_status(
            self.ws_root, "feat-cli-publish-p1", "wopal-space", "p1",
        )

        self.assertIsNotNone(result)
        mock_ok.assert_called_once()
        content = doc.read_text()
        self.assertIn("| wopal-cli | feat-cli-publish-p1 | done |", content)
        self.assertIn("| wopal-site | feat-site-blog | executing |", content)
        mock_info.assert_not_called()
        mock_warn.assert_not_called()

    # ---- skip: Product missing ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_skip_when_product_missing(self, mock_ok, mock_warn, mock_info):
        result = _update_phase_doc_plan_status(
            self.ws_root, "some-plan", "", "p1",
        )
        self.assertIsNone(result)
        mock_info.assert_called_once_with(
            "No Product/Phase metadata, skipping phase doc update"
        )
        mock_warn.assert_not_called()
        mock_ok.assert_not_called()

    # ---- skip: Phase missing ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_skip_when_phase_missing(self, mock_ok, mock_warn, mock_info):
        result = _update_phase_doc_plan_status(
            self.ws_root, "some-plan", "wopal-space", "",
        )
        self.assertIsNone(result)
        mock_info.assert_called_once_with(
            "No Product/Phase metadata, skipping phase doc update"
        )
        mock_warn.assert_not_called()
        mock_ok.assert_not_called()

    # ---- warn: phase doc not found ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_warn_when_phase_doc_not_found(self, mock_ok, mock_warn, mock_info):
        self._create_phase_dir()  # empty phases dir
        result = _update_phase_doc_plan_status(
            self.ws_root, "some-plan", "wopal-space", "p99",
        )
        self.assertIsNone(result)
        mock_warn.assert_called_once()
        warn_msg = str(mock_warn.call_args[0][0])
        self.assertIn("p99", warn_msg)
        mock_ok.assert_not_called()

    # ---- warn: plan row not found in table ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_warn_when_plan_not_in_table(self, mock_ok, mock_warn, mock_info):
        phases = self._create_phase_dir()
        doc = phases / "wopal-space-p1-one-click.md"
        _make_phase_doc(doc, [
            ("wopal-cli", "other-plan", "planning"),
        ])

        result = _update_phase_doc_plan_status(
            self.ws_root, "missing-plan", "wopal-space", "p1",
        )

        self.assertIsNone(result)
        mock_warn.assert_called_once()
        warn_msg = str(mock_warn.call_args[0][0])
        self.assertIn("missing-plan", warn_msg)
        content = doc.read_text()
        self.assertNotIn("done", content)
        mock_ok.assert_not_called()

    # ---- warn: phases directory does not exist ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_warn_when_phases_dir_missing(self, mock_ok, mock_warn, mock_info):
        result = _update_phase_doc_plan_status(
            self.ws_root, "some-plan", "nonexistent-product", "p1",
        )
        self.assertIsNone(result)
        mock_warn.assert_called_once()
        warn_msg = str(mock_warn.call_args[0][0])
        self.assertIn("Phases directory not found", warn_msg)
        mock_ok.assert_not_called()

    # ---- no table in doc ----

    @patch("archive.log_info")
    @patch("archive.log_warn")
    @patch("archive.log_success")
    def test_warn_when_no_table_in_doc(self, mock_ok, mock_warn, mock_info):
        phases = self._create_phase_dir()
        doc = phases / "wopal-space-p1.md"
        doc.write_text("# Phase\n\nNo table here.\n")

        result = _update_phase_doc_plan_status(
            self.ws_root, "some-plan", "wopal-space", "p1",
        )

        self.assertIsNone(result)
        mock_warn.assert_called_once()
        warn_msg = str(mock_warn.call_args[0][0])
        self.assertIn("No Related Plans table found", warn_msg)
        mock_ok.assert_not_called()


class TestDetectWorktree(unittest.TestCase):
    """Tests for _detect_worktree.

    Regression: after verify-switch cleans up the worktree directory,
    the Plan metadata still records the branch that needs cleanup.
    _detect_worktree must return the metadata so archive can delete
    the feature branch.
    """

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.ws_root = self.tmpdir
        # Plan file location (mirror real layout)
        self.plans_dir = self.tmpdir / "plans"
        self.plans_dir.mkdir(parents=True)
        self.plan_path = self.plans_dir / "test-plan.md"

    def tearDown(self):
        shutil.rmtree(self.tmpdir)

    def _write_plan_with_worktree(self, branch: str, wt_path: str) -> None:
        self.plan_path.write_text(
            f"# test-plan\n\n"
            f"## Metadata\n\n"
            f"- **Type**: feature\n"
            f"- **Target Project**: wopal-cli\n"
            f"- **Status**: done\n"
            f"- **Worktree**:\n"
            f"  - branch: {branch}\n"
            f"  - path: {wt_path}\n"
        )

    @patch("archive.get_plan_worktree")
    def test_returns_metadata_when_worktree_path_exists(self, mock_gpw):
        """Sanity: when path exists, metadata is returned as-is."""
        wt_dir = self.tmpdir / ".worktrees" / "wopal-cli-my-feature"
        wt_dir.mkdir(parents=True)
        mock_gpw.return_value = {
            "branch": "my-feature",
            "path": str(wt_dir.relative_to(self.ws_root)),
        }

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result)
        self.assertEqual(result["branch"], "my-feature")

    @patch("archive.get_plan_worktree")
    def test_returns_metadata_when_worktree_path_missing(self, mock_gpw):
        """Regression: path cleaned up by verify-switch must not erase
        branch metadata — the feature branch still needs deletion."""
        missing_path = self.tmpdir / ".worktrees" / "wopal-cli-my-feature"
        self.assertFalse(missing_path.exists())

        mock_gpw.return_value = {
            "branch": "my-feature",
            "path": str(missing_path.relative_to(self.ws_root)),
        }

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNotNone(result, "must return metadata even when path is gone")
        self.assertEqual(result["branch"], "my-feature")

    @patch("archive.get_plan_worktree")
    def test_returns_none_when_no_metadata_and_no_glob_match(self, mock_gpw):
        mock_gpw.return_value = None

        result = _detect_worktree(str(self.plan_path), "wopal-cli", self.ws_root)

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()