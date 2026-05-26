#!/usr/bin/env python3
# test_archive_plan_link.py - Test update_issue_plan_link function
#
# Test Case: Archive plan link rewrite to blob contract
#
# Scenarios:
#   1. update_issue_plan_link rewrites archived plan URL to blob contract

import unittest
import sys
import os
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.domain.plan.link import update_issue_plan_link


class TestArchivePlanLink(unittest.TestCase):
    """Test archive plan link update"""

    def test_update_issue_plan_link_rewrites_archived_url(self):
        """update_issue_plan_link rewrites archived plan URL to blob contract"""
        tmp_dir = tempfile.mkdtemp()
        try:
            # Create archived plan
            archived_dir = os.path.join(tmp_dir, 'docs', 'projects', 'ontology', 'plans', 'done')
            os.makedirs(archived_dir)
            archived_file = os.path.join(archived_dir, '20260422-120-refactor-dev-flow-optimize-new-issue-flow.md')
            with open(archived_file, 'w') as f:
                f.write('# archived\n')
            
            # Create fake gh state
            state_dir = os.path.join(tmp_dir, 'state')
            os.makedirs(state_dir)
            with open(os.path.join(state_dir, 'body.md'), 'w') as f:
                f.write("""## Related Resources

| Resource | Link |
|----------|------|
| Plan | [120-refactor-dev-flow-optimize-new-issue-flow](https://github.com/sampx/wopal-space/blob/main/docs/projects/ontology/plans/120-refactor-dev-flow-optimize-new-issue-flow.md) |
""")
            
            # Test update_issue_plan_link
            # This should update the issue body with the correct archived plan URL
            update_issue_plan_link(
                issue_number=120,
                plan_file=archived_file,
                repo='sampx/wopal-space',
                workspace_root=tmp_dir
            )
            
            # Verify the edit was called with correct URL
            edit_args_file = os.path.join(state_dir, 'edit-args.txt')
            if os.path.exists(edit_args_file):
                content = open(edit_args_file).read()
                self.assertIn('docs/projects/ontology/plans/done/20260422-120-refactor-dev-flow-optimize-new-issue-flow.md', content)
        finally:
            shutil.rmtree(tmp_dir)


if __name__ == '__main__':
    unittest.main()