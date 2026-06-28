#!/usr/bin/env python3
# test_check_doc.py - Test check_doc_plan function
#
# Scenarios:
#   1. New template valid plan → pass
#   2. Old template plan → fail (no longer exempt)
#   3. Missing Design → reject
#   4. Changes with Step checkbox → reject
#   5. Template comments → pass (check removed)

import unittest
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from validation import check_doc_plan, ValidationError
from validation import check_task_structure, check_agent_verification, check_user_validation_new

CHECK_DOC_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "check-doc"


class TestCheckDocPlan(unittest.TestCase):
    """Test check_doc_plan function"""

    def test_new_template_valid_passes(self):
        plan_file = str(CHECK_DOC_DIR / "plan-new-valid.md")
        check_doc_plan(plan_file)

    def test_old_template_rejected(self):
        """Old template plans fail new-format checks (no backward compat)."""
        plan_file = str(CHECK_DOC_DIR / "plan-old-valid.md")
        with self.assertRaises(ValidationError):
            check_doc_plan(plan_file)

    def test_missing_design_rejected(self):
        plan_file = str(CHECK_DOC_DIR / "plan-new-missing-design.md")
        with self.assertRaises(ValidationError):
            check_doc_plan(plan_file)

    def test_changes_step_checkbox_rejected(self):
        plan_file = str(CHECK_DOC_DIR / "plan-new-changes-step-checkbox.md")
        with self.assertRaises(ValidationError):
            check_doc_plan(plan_file)

    def test_template_comments_pass(self):
        """Template guidance comments no longer block validation."""
        plan_file = str(CHECK_DOC_DIR / "plan-new-has-template-comments.md")
        check_doc_plan(plan_file)

    def test_ac_no_commands_rejected(self):
        plan_file = str(CHECK_DOC_DIR / "plan-new-ac-no-commands.md")
        with self.assertRaises(ValidationError):
            check_doc_plan(plan_file)

    def test_missing_project_path_with_target_rejected(self):
        """Plan with Target Project but no Project Path must be rejected."""
        plan_file = str(CHECK_DOC_DIR / "plan-new-missing-project-path.md")
        with self.assertRaises(ValidationError) as ctx:
            check_doc_plan(plan_file)
        self.assertIn("Project Path", str(ctx.exception))

    def test_missing_project_path_without_target_passes(self):
        """Plan without Target Project does not require Project Path."""
        plan_file = str(CHECK_DOC_DIR / "plan-new-valid.md")
        check_doc_plan(plan_file)


class TestCheckTaskStructure(unittest.TestCase):

    def _fixture(self, name):
        return (CHECK_DOC_DIR / name).read_text(encoding='utf-8')

    def test_valid_passes(self):
        errors = check_task_structure(self._fixture("plan-new-valid.md"))
        self.assertEqual(errors, [])

    def test_missing_design(self):
        errors = check_task_structure(self._fixture("plan-new-missing-design.md"))
        self.assertTrue(any("Design" in e for e in errors), f"Expected Design error: {errors}")

    def test_tdd_true_no_behavior(self):
        errors = check_task_structure(self._fixture("plan-new-tdd-no-behavior.md"))
        self.assertTrue(any("Behavior" in e and "TDD" in e for e in errors), f"{errors}")

    def test_done_no_checkbox(self):
        errors = check_task_structure(self._fixture("plan-new-done-no-checkbox.md"))
        self.assertTrue(any("Done" in e and "checkbox" in e for e in errors), f"{errors}")

    def test_changes_has_step_checkbox(self):
        errors = check_task_structure(self._fixture("plan-new-changes-step-checkbox.md"))
        self.assertTrue(any("Changes" in e for e in errors), f"{errors}")


class TestCheckAgentVerification(unittest.TestCase):

    def _fixture(self, name):
        return (CHECK_DOC_DIR / name).read_text(encoding='utf-8')

    def test_ac_no_commands(self):
        errors = check_agent_verification(self._fixture("plan-new-ac-no-commands.md"))
        self.assertTrue(any("command" in e.lower() for e in errors), f"{errors}")

    def test_ac_after_impl(self):
        errors = check_agent_verification(self._fixture("plan-new-ac-after-impl.md"))
        self.assertTrue(len(errors) > 0, f"Expected position error: {errors}")


class TestCheckUserValidationNew(unittest.TestCase):

    def _fixture(self, name):
        return (CHECK_DOC_DIR / name).read_text(encoding='utf-8')

    def test_user_val_contains_npm_test(self):
        errors = check_user_validation_new(self._fixture("plan-new-user-val-has-commands.md"))
        self.assertTrue(any("automated" in e.lower() for e in errors), f"{errors}")


if __name__ == '__main__':
    unittest.main()
