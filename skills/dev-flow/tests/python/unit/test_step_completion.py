#!/usr/bin/env python3
# test_step_completion.py - Test check_step_completion function
#
# Scenarios:
#   1. Done unchecked → reject
#   2. Done checked → pass
#   3. No Implementation → pass
#   4. Multiple Tasks → aggregate errors

import unittest
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from validation import check_step_completion, ValidationError


class TestStepCompletion(unittest.TestCase):

    def setUp(self):
        self.new_tmpl_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'fixtures', 'plans', 'new-template'
        )
        self.temp_dir = os.path.join('/tmp', 'dev-flow-step-tests')
        os.makedirs(self.temp_dir, exist_ok=True)

    def tearDown(self):
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_temp_plan(self, content: str, filename: str) -> str:
        path = os.path.join(self.temp_dir, filename)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return path

    def test_done_unchecked_rejected(self):
        plan_file = os.path.join(self.new_tmpl_dir, 'plan-new-valid.md')
        with self.assertRaises(ValidationError):
            check_step_completion(plan_file)

    def test_done_checked_passes(self):
        content = """# test-plan

## Metadata
- **Status**: executing

## Implementation

### Task 1: Test Task

**Design**:
Implement function.

**TDD**: false

**Changes**:
1. Implement function A.

**Verify**: `pytest tests/`

**Done**:
产出：test.py
- [x] Agent done

---

## Delegation Strategy

N/A
"""
        plan_file = self._write_temp_plan(content, 'test-done-checked.md')
        check_step_completion(plan_file)

    def test_done_no_checkbox_rejected(self):
        plan_file = os.path.join(self.new_tmpl_dir, 'plan-new-done-no-checkbox.md')
        with self.assertRaises(ValidationError) as ctx:
            check_step_completion(plan_file)
        self.assertIn('Done', str(ctx.exception))

    def test_multiple_tasks_aggregate(self):
        content = """# test-plan

## Metadata
- **Status**: executing

## Implementation

### Task 1: First Task

**Design**:
Implement A.

**TDD**: false

**Changes**:
1. Implement A.

**Done**:
产出：a.py
- [ ] Agent done unchecked

---

### Task 2: Second Task

**Design**:
Implement B.

**TDD**: false

**Changes**:
1. Implement B.

**Done**:
产出：b.py
- [ ] Agent done unchecked

---

## Delegation Strategy

N/A
"""
        plan_file = self._write_temp_plan(content, 'test-multi-done-unchecked.md')
        with self.assertRaises(ValidationError) as ctx:
            check_step_completion(plan_file)
        msg = str(ctx.exception)
        self.assertIn('First Task', msg)
        self.assertIn('Second Task', msg)

    def test_no_implementation_passes(self):
        content = """# test-plan

## Metadata
- **Status**: executing

## Goal

No implementation section.
"""
        plan_file = self._write_temp_plan(content, 'test-no-impl.md')
        check_step_completion(plan_file)


if __name__ == '__main__':
    unittest.main()
