#!/usr/bin/env python3
# test_archive.py - Unit tests for archive command helpers
#
# Task 4 (Issue #155): Phase doc Related Plans table update on archive.

import unittest
import sys
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
from archive import _update_phase_doc_plan_status, _PHASE_TABLE_HEADER, _PHASE_TABLE_SEP

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


if __name__ == "__main__":
    unittest.main()
