#!/usr/bin/env python3
# test_plan_link_contract.py - Test build_repo_blob_url and find_plan_by_issue functions
#
# Test Case: Plan link contract (blob URL format)
#
# Scenarios:
#   1. build_repo_blob_url creates GitHub blob links
#   2. build_issue_body_from_plan uses blob URL for plan link
#   3. find_plan_by_issue resolves archived plans in done directory

import unittest
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.domain.issue.link import build_repo_blob_url
from dev_flow.domain.plan.find import find_plan_by_issue


class TestBuildRepoBlobUrl(unittest.TestCase):
    """Test build_repo_blob_url function"""

    def test_creates_github_blob_links(self):
        """build_repo_blob_url creates GitHub blob links"""
        url = build_repo_blob_url('sampx/wopal-space', 'docs/projects/ontology/plans/120-demo.md')
        self.assertEqual(url, 'https://github.com/sampx/wopal-space/blob/main/docs/projects/ontology/plans/120-demo.md')

    def test_with_different_repo(self):
        """build_repo_blob_url with different repo"""
        url = build_repo_blob_url('wopal-cn/ontology', 'docs/projects/plans/121-test.md')
        self.assertEqual(url, 'https://github.com/wopal-cn/ontology/blob/main/docs/projects/plans/121-test.md')


class TestFindPlanByIssue(unittest.TestCase):
    """Test find_plan_by_issue function"""

    def test_resolves_archived_plans_in_done_directory(self):
        """find_plan_by_issue resolves archived plans in done directory"""
        import tempfile
        import shutil
        tmp_dir = tempfile.mkdtemp()
        try:
            archived_dir = os.path.join(tmp_dir, 'docs', 'projects', 'ontology', 'plans', 'done')
            os.makedirs(archived_dir)
            archived_plan = os.path.join(archived_dir, '20260422-120-refactor-dev-flow-optimize-new-issue-flow.md')
            with open(archived_plan, 'w') as f:
                f.write("""# 120-refactor-dev-flow-optimize-new-issue-flow

## Metadata

- **Issue**: #120
- **Type**: refactor
- **Target Project**: ontology
- **Created**: 2026-04-21
- **Status**: done
""")
            
            # Mock find_workspace_root
            resolved = find_plan_by_issue(120, workspace_root=tmp_dir)
            self.assertEqual(resolved, archived_plan)
        finally:
            shutil.rmtree(tmp_dir)


if __name__ == '__main__':
    unittest.main()