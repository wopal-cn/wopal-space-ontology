#!/usr/bin/env python3
# test_issue_update_command.py - Test issue update command behavior
#
# Test Case: issue update command CLI behavior
#
# Scenarios:
#   1. issue update preserves unrelated sections and syncs labels

import unittest
import subprocess
import os
import tempfile
import shutil
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.domain.issue.body import build_structured_issue_body


class TestIssueUpdateCommand(unittest.TestCase):
    """Test issue update command"""

    def setUp(self):
        # Get skill dir (tests/python/integration -> skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        self.flow_bin = os.environ.get('FLOW_BIN', 'scripts/flow.sh')

        # Create temp directory for fake gh and state
        self.tmp_dir = tempfile.mkdtemp()
        self.bin_dir = os.path.join(self.tmp_dir, 'bin')
        self.state_dir = os.path.join(self.tmp_dir, 'state')
        os.makedirs(self.bin_dir)
        os.makedirs(self.state_dir)

        # Create fake gh stub
        self._create_fake_gh()

        # Create initial issue body (using Python)
        self._create_initial_state()

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def _create_fake_gh(self):
        """Create fake gh stub that simulates issue view/edit"""
        gh_path = os.path.join(self.bin_dir, 'gh')

        gh_script = '''#!/usr/bin/env python3
import os
import sys
import json

args = sys.argv[1:]
state_dir = os.environ.get('GH_STATE_DIR', '/tmp/state')

if len(args) >= 2:
    cmd = args[0] + ' ' + args[1]
else:
    cmd = args[0]

if cmd == 'repo view':
    print('sampx/wopal-space')
    sys.exit(0)

elif cmd == 'label list' or cmd == 'label create':
    sys.exit(0)

elif cmd == 'issue view':
    rest_args = args[2:]
    
    # gh issue view N --repo R --json title,body,number,state,labels
    if '--json' in rest_args:
        # Build JSON output with all requested fields
        title_file = os.path.join(state_dir, 'title.txt')
        body_file = os.path.join(state_dir, 'body.md')
        
        title = open(title_file).read().strip() if os.path.exists(title_file) else 'feat(dev-flow): test'
        body = open(body_file).read() if os.path.exists(body_file) else ''
        
        issue_json = {
            "title": title,
            "body": body,
            "number": 120,
            "state": "OPEN",
            "labels": [
                {"name": "type/feature"},
                {"name": "project/ontology"},
                {"name": "status/planning"}
            ]
        }
        
        # Handle --jq query for labels
        if '--jq' in rest_args:
            jq_idx = rest_args.index('--jq')
            jq_query = rest_args[jq_idx + 1] if jq_idx + 1 < len(rest_args) else ''
            if jq_query == '.labels[].name':
                # Return label names as newline-separated list
                for label in issue_json['labels']:
                    print(label['name'])
                sys.exit(0)
            # For other jq queries, return full JSON
            print(json.dumps(issue_json))
            sys.exit(0)
        
        print(json.dumps(issue_json))
        sys.exit(0)
    
    # Plain text body view
    body_file = os.path.join(state_dir, 'body.md')
    print(open(body_file).read() if os.path.exists(body_file) else '')
    sys.exit(0)

elif cmd == 'issue edit':
    rest_args = args[2:]
    
    # Body edit: gh issue edit N --repo R --body "..." --title "..."
    if '--body' in rest_args:
        # Capture body value separately to preserve multi-line content
        body_idx = rest_args.index('--body')
        body_value = rest_args[body_idx + 1] if body_idx + 1 < len(rest_args) else ''
        
        # Write body to separate file for verification
        body_file = os.path.join(state_dir, 'edit-body-value.txt')
        with open(body_file, 'w') as f:
            f.write(body_value)
        
        # Write all args for reference
        edit_file = os.path.join(state_dir, 'edit-body-args.txt')
        with open(edit_file, 'w') as f:
            for arg in rest_args:
                f.write(arg + '\\n')
        sys.exit(0)
    
    # Label edit: gh issue edit N --repo R --add-label / --remove-label
    label_file = os.path.join(state_dir, 'label-edits.txt')
    with open(label_file, 'a') as f:
        for arg in rest_args:
            f.write(arg + '\\n')
    sys.exit(0)

else:
    print(f'unexpected gh call: {args}', file=sys.stderr)
    sys.exit(1)
'''

        with open(gh_path, 'w') as f:
            f.write(gh_script)
        os.chmod(gh_path, 0o755)

    def _create_initial_state(self):
        """Create initial issue body using Python build_structured_issue_body"""
        # Build structured body directly (no bash dependency)
        body = build_structured_issue_body(
            type='feature',
            goal='Old goal',
            background='Old background',
            scope='one,two',
            reference='docs/original.md'
        )

        # Write state files
        with open(os.path.join(self.state_dir, 'body.md'), 'w') as f:
            f.write(body)

        with open(os.path.join(self.state_dir, 'title.txt'), 'w') as f:
            f.write('feat(dev-flow): old behavior')

    def test_issue_update_preserves_sections_and_syncs_labels(self):
        """issue update preserves unrelated sections and syncs labels"""
        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        result = subprocess.run(
            [self.flow_bin, 'issue', 'update', '120',
             '--title', 'perf(dev-flow): reduce label sync overhead',
             '--project', 'wopal-cli',
             '--goal', 'New goal'],
            cwd=self.skill_dir,
            capture_output=True,
            text=True,
            env=env
        )

        self.assertEqual(result.returncode, 0,
                         f'issue update should succeed: {result.stderr}')

        # Check body edit captured new goal and preserved old sections
        # Use edit-body-value.txt which contains the full body string
        body_file = os.path.join(self.state_dir, 'edit-body-value.txt')
        self.assertTrue(os.path.exists(body_file), 'edit-body-value.txt should exist')

        with open(body_file) as f:
            updated_body = f.read()

        self.assertIn('New goal', updated_body,
                      'body edit should contain new goal')
        self.assertIn('Old background', updated_body,
                      'body edit should preserve old background')
        self.assertIn('docs/original.md', updated_body,
                      'body edit should preserve reference')

        # Check label edits captured type and project syncs
        label_file = os.path.join(self.state_dir, 'label-edits.txt')
        self.assertTrue(os.path.exists(label_file), 'label-edits.txt should exist')

        with open(label_file) as f:
            label_edits = f.read()

        # Type label sync: add perf, remove feature
        self.assertIn('type/perf', label_edits,
                      'label edit should add type/perf')
        self.assertIn('type/feature', label_edits,
                      'label edit should remove type/feature')

        # Project label sync: add wopal-cli, remove ontology
        self.assertIn('project/wopal-cli', label_edits,
                      'label edit should add project/wopal-cli')
        self.assertIn('project/ontology', label_edits,
                      'label edit should remove project/ontology')


if __name__ == '__main__':
    unittest.main()