#!/usr/bin/env python3
# test_archive_project_repo_gate.py - Test archive command behavior on project repo state
#
# Test Case: Archive handles project repo with uncommitted changes
#
# Current behavior:
#   - Auto-commit project changes (if no worktree)
#   - Attempt push to origin/main
#   - If push fails, archive fails
#
# Scenarios:
#   1. dirty project repo + push succeeds -> archive succeeds
#   2. dirty project repo + push fails -> archive fails
#   3. clean project repo -> archive succeeds normally

import unittest
import subprocess
import os
import tempfile
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()


class TestArchiveProjectRepoGate(unittest.TestCase):
    """Test archive command behavior on project repo state"""

    def setUp(self):
        # Get skill dir (tests/python/integration -> skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        # Use FLOW_BIN env var or default to scripts/flow.sh
        flow_bin_rel = os.environ.get('FLOW_BIN', 'scripts/flow.sh')
        self.flow_bin = os.path.join(self.skill_dir, flow_bin_rel)

        # Create temp directory for fake workspace structure
        self.tmp_dir = tempfile.mkdtemp()
        self.bin_dir = os.path.join(self.tmp_dir, 'bin')
        self.state_dir = os.path.join(self.tmp_dir, 'state')
        os.makedirs(self.bin_dir)
        os.makedirs(self.state_dir)

        # Create fake workspace structure
        self._create_workspace_structure()

        # Create fake gh stub
        self._create_fake_gh()

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def _create_workspace_structure(self):
        """Create minimal workspace structure for archive test"""
        # Create .wopal/.git worktree file (workspace root signature)
        wopal_dir = os.path.join(self.tmp_dir, '.wopal')
        os.makedirs(wopal_dir)
        wopal_git = os.path.join(wopal_dir, '.git')
        with open(wopal_git, 'w') as f:
            f.write('gitdir: ../.git/worktrees/wopal-space-main\n')

        # docs/products/ontology/plans/ - for active plans (create first)
        plans_dir = os.path.join(
            self.tmp_dir, 'docs', 'products', 'ontology', 'plans')
        os.makedirs(plans_dir)

        # docs/products/ontology/plans/done/ - for archived plans (subdirectory)
        plans_done_dir = os.path.join(plans_dir, 'done')
        os.makedirs(plans_done_dir)

        # Create a plan in done state (archive requires done status)
        # Format matches plan.sh parser expectations
        self.plan_file = os.path.join(
            plans_dir, '121-dev-flow-clean-up-issue-scripts.md')
        with open(self.plan_file, 'w') as f:
            f.write('# 121-dev-flow-clean-up-issue-scripts\n')
            f.write('\n')
            f.write('## Metadata\n')
            f.write('\n')
            f.write('- **Issue**: #121\n')
            f.write('- **Type**: refactor\n')
            f.write('- **Target Project**: ontology\n')
            f.write('- **Created**: 2026-04-22\n')
            f.write('- **Status**: done\n')

        # Create projects directory
        self.projects_dir = os.path.join(self.tmp_dir, 'projects')
        os.makedirs(self.projects_dir)

        # Create target project directory (ontology)
        self.project_dir = os.path.join(self.projects_dir, 'ontology')
        os.makedirs(self.project_dir)

        # Initialize git repo in project directory
        subprocess.run(['git', 'init'], cwd=self.project_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.email', 'test@test.com'],
                       cwd=self.project_dir, capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Test'],
                       cwd=self.project_dir, capture_output=True, check=True)

        # Initialize git repo in workspace root (for plan archival)
        subprocess.run(['git', 'init'], cwd=self.tmp_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.email', 'test@test.com'],
                       cwd=self.tmp_dir, capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Test'],
                       cwd=self.tmp_dir, capture_output=True, check=True)
        # Add origin remote (required by detect_space_repo)
        subprocess.run(['git', 'remote', 'add', 'origin',
                        'https://github.com/sampx/wopal-space.git'],
                       cwd=self.tmp_dir, capture_output=True, check=True)

        # Add docs to root git and commit (so git mv works)
        subprocess.run(['git', 'add', 'docs'], cwd=self.tmp_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-m', 'init: add plan'],
                       cwd=self.tmp_dir, capture_output=True, check=True)

    def _create_fake_gh(self):
        """Create fake gh stub for archive operations"""
        gh_path = os.path.join(self.bin_dir, 'gh')

        gh_script = r'''#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
state_dir = os.environ.get('GH_STATE_DIR', '/tmp/state')

if args[0] == 'repo' and args[1] == 'view':
    print('sampx/wopal-space')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'view':
    # Return minimal issue body with plan link
    print('## Related Resources\n')
    print('| Resource | Link |')
    print('|----------|------|')
    print('| Plan | [121-dev-flow-clean-up-issue-scripts](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/121-dev-flow-clean-up-issue-scripts.md) |')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'edit':
    # Capture edit args
    with open(os.path.join(state_dir, 'edit-args.txt'), 'w') as f:
        for arg in args:
            f.write(arg + '\n')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'close':
    # Capture close args
    with open(os.path.join(state_dir, 'close-args.txt'), 'w') as f:
        for arg in args:
            f.write(arg + '\n')
    sys.exit(0)
elif args[0] == 'label' and args[1] == 'create':
    # Accept label creation
    sys.exit(0)
elif args[0] == 'label' and args[1] == 'list':
    sys.exit(0)
else:
    print('fake gh: ' + str(args), file=sys.stderr)
    sys.exit(0)  # Accept other calls for now
'''

        with open(gh_path, 'w') as f:
            f.write(gh_script)
        os.chmod(gh_path, 0o755)

    def test_archive_succeeds_with_auto_commit_and_mocked_push(self):
        """archive succeeds when auto-commit works and push succeeds"""
        # Create a file in project (dirty state)
        dirty_file = os.path.join(self.project_dir, 'dirty_file.txt')
        with open(dirty_file, 'w') as f:
            f.write('uncommitted changes')

        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        # Mock push by creating fake git that succeeds on push
        fake_git_path = os.path.join(self.bin_dir, 'git')
        fake_git_script = '''#!/usr/bin/env python3
import sys
import os
args = sys.argv[1:]
# Intercept git push and return success
if args[0] == 'push':
    sys.exit(0)
# Intercept git remote check
if args[0] == 'remote':
    if 'get-url' in args:
        print('https://github.com/sampx/wopal-space.git')
        sys.exit(0)
# All other git commands: pass through to real git
import subprocess
result = subprocess.run(['/usr/bin/git'] + args, capture_output=True, text=True)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
sys.exit(result.returncode)
'''
        with open(fake_git_path, 'w') as f:
            f.write(fake_git_script)
        os.chmod(fake_git_path, 0o755)

        result = subprocess.run(
            [self.flow_bin, 'archive', '121'],
            cwd=self.tmp_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Archive should succeed with auto-commit + mocked push
        self.assertEqual(result.returncode, 0,
                         f'archive should succeed: {result.stdout + result.stderr}')

        # Output should show auto-commit
        output = result.stdout + result.stderr
        self.assertIn('Auto-committing', output,
                      'output should show auto-commit step')
        self.assertIn('archived', output.lower(),
                      'output should mention archived status')

    def test_archive_fails_when_push_fails(self):
        """archive fails when auto-commit succeeds but push fails"""
        # Create a file in project (dirty state)
        dirty_file = os.path.join(self.project_dir, 'dirty_file.txt')
        with open(dirty_file, 'w') as f:
            f.write('uncommitted changes')

        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        # Create fake git that fails on push
        fake_git_path = os.path.join(self.bin_dir, 'git')
        fake_git_script = '''#!/usr/bin/env python3
import sys
import subprocess
args = sys.argv[1:]
# Intercept git push and return failure
if args[0] == 'push':
    print('error: push failed (mocked)', file=sys.stderr)
    sys.exit(1)
# Intercept git remote check
if args[0] == 'remote':
    if 'get-url' in args:
        print('https://github.com/sampx/wopal-space.git')
        sys.exit(0)
# All other git commands: pass through to real git
result = subprocess.run(['/usr/bin/git'] + args, capture_output=True, text=True)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
sys.exit(result.returncode)
'''
        with open(fake_git_path, 'w') as f:
            f.write(fake_git_script)
        os.chmod(fake_git_path, 0o755)

        result = subprocess.run(
            [self.flow_bin, 'archive', '121'],
            cwd=self.tmp_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Archive should fail due to push failure
        self.assertNotEqual(result.returncode, 0,
                            f'archive should fail when push fails: {result.stdout + result.stderr}')

        # Output should show push failure
        output = result.stdout + result.stderr
        self.assertIn('push', output.lower(),
                      'output should mention push failure')

    def test_archive_passes_on_clean_project_repo(self):
        """archive succeeds when project repo is clean"""
        # Create a file and commit it (clean state)
        clean_file = os.path.join(self.project_dir, 'clean_file.txt')
        with open(clean_file, 'w') as f:
            f.write('committed changes')

        subprocess.run(['git', 'add', 'clean_file.txt'],
                       cwd=self.project_dir, capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-m', 'add clean file'],
                       cwd=self.project_dir, capture_output=True, check=True)

        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        result = subprocess.run(
            [self.flow_bin, 'archive', '121'],
            cwd=self.tmp_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Archive should succeed with clean repo (no auto-commit needed)
        self.assertEqual(result.returncode, 0,
                         f'archive should succeed on clean project repo: {result.stderr}')

        # Output should show archived status
        output = result.stdout + result.stderr
        self.assertIn('archived', output.lower(),
                      'output should mention archived status')


if __name__ == '__main__':
    unittest.main()