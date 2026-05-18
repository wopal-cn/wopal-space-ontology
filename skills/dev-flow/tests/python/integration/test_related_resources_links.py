#!/usr/bin/env python3
# test_related_resources_links.py - Test Related Resources link update
#
# Test Case: sync_plan_to_issue_body updates Related Resources Plan link
#
# Scenarios:
#   1. Plan with approved status -> Plan link rendered as GitHub URL
#   2. Plan with planning status -> Plan link remains "_待关联_"

import unittest
import sys
import tempfile
import os
from pathlib import Path
from unittest.mock import patch, MagicMock, call

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.domain.issue.sync import sync_plan_to_issue_body


class TestRelatedResourcesLinks(unittest.TestCase):
    """Test sync_plan_to_issue_body for Related Resources table"""

    def setUp(self):
        # Create temp plan file
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_file = os.path.join(self.tmp_dir, "120-test-plan.md")
        
    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp_dir)

    def _write_plan_file(self, status: str, project: str = "ontology") -> None:
        """Write a plan file with given metadata."""
        with open(self.plan_file, "w") as f:
            f.write("# 120-test-plan\n\n")
            f.write("## Metadata\n\n")
            f.write(f"- **Issue**: #120\n")
            f.write(f"- **Type**: feature\n")
            f.write(f"- **Target Project**: {project}\n")
            f.write(f"- **Created**: 2026-01-01\n")
            f.write(f"- **Status**: {status}\n\n")
            f.write("## Goal\n\nTest goal\n\n")
            f.write("## In Scope\n\n- Item 1\n\n")
            f.write("## Acceptance Criteria\n\n- [ ] AC 1\n")

    @patch("dev_flow.domain.issue.sync.subprocess.run")
    @patch("dev_flow.domain.plan.body.build_repo_blob_url")
    def test_approved_plan_updates_related_resources_link(self, mock_blob_url, mock_subprocess):
        """sync_plan_to_issue_body: approved plan -> Plan link is GitHub URL"""
        # Setup: approved plan
        self._write_plan_file("executing", "ontology")
        mock_blob_url.return_value = "https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120-test-plan.md"
        
        # Mock gh CLI availability check
        mock_subprocess.return_value = MagicMock(returncode=0)
        
        # Execute
        sync_plan_to_issue_body(120, self.plan_file, "sampx/wopal-space")
        
        # Verify: gh issue edit was called with body containing plan link
        calls = mock_subprocess.call_args_list
        # Find the gh issue edit call
        edit_call = None
        for c in calls:
            args = c[0][0]
            if "issue" in args and "edit" in args:
                edit_call = c
                break
        
        self.assertIsNotNone(edit_call, "gh issue edit should be called")
        args = edit_call[0][0]
        
        # Body should contain the plan link
        body_idx = args.index("--body") + 1
        body = args[body_idx]
        
        expected_link = "[120-test-plan](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120-test-plan.md)"
        self.assertIn(expected_link, body,
                      "Body should contain Plan link in Related Resources table")
        self.assertIn("## Related Resources", body,
                      "Body should contain Related Resources section")

    @patch("dev_flow.domain.issue.sync.subprocess.run")
    def test_planning_plan_keeps_placeholder_link(self, mock_subprocess):
        """sync_plan_to_issue_body: planning plan -> Plan link remains '_待关联_'"""
        # Setup: planning status
        self._write_plan_file("planning", "ontology")
        
        # Mock gh CLI availability check
        mock_subprocess.return_value = MagicMock(returncode=0)
        
        # Execute
        sync_plan_to_issue_body(120, self.plan_file, "sampx/wopal-space")
        
        # Verify: body contains placeholder
        calls = mock_subprocess.call_args_list
        edit_call = None
        for c in calls:
            args = c[0][0]
            if "issue" in args and "edit" in args:
                edit_call = c
                break
        
        self.assertIsNotNone(edit_call, "gh issue edit should be called")
        args = edit_call[0][0]
        
        body_idx = args.index("--body") + 1
        body = args[body_idx]
        
        self.assertIn("_待关联_", body,
                      "Body should contain placeholder Plan link for planning status")


if __name__ == "__main__":
    unittest.main()