#!/usr/bin/env python3
# test_check_doc.py - Mechanical submit/approve validation

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from support.plan_fixtures import write_plan_file, remove_plan_file
from validation import check_doc_plan, ValidationError


BASE = """# test-plan

## Metadata

- **Type**: test
- **Issue**: N/A
- **Target Project**: wopal-space-ontology
- **Product**:
- **Phase**:
- **Project Path**: .wopal
- **Status**: planning

## Goal

Any human-readable plan content is allowed here.
"""




class TestCheckDocPlan(unittest.TestCase):

    def test_valid_minimal_metadata_passes(self):
        path = write_plan_file(BASE)
        try:
            check_doc_plan(path)
        finally:
            remove_plan_file(path)

    def test_plan_semantics_do_not_block_mechanical_check(self):
        content = BASE + """
## Implementation

### Task 1: Example

Free-form task content without Design Source, Behavior, TDD, or special formatting.
"""
        path = write_plan_file(content)
        try:
            check_doc_plan(path)
        finally:
            remove_plan_file(path)

    def test_missing_status_rejected(self):
        path = write_plan_file(BASE.replace("- **Status**: planning\n", ""))
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("Status", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_unsupported_status_rejected(self):
        path = write_plan_file(BASE.replace("planning", "unknown-state"))
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("Status", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_target_project_requires_project_path(self):
        content = BASE.replace("- **Project Path**: .wopal\n", "- **Project Path**:\n")
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("Project Path", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_plan_requires_target_project(self):
        content = BASE.replace("- **Target Project**: wopal-space-ontology\n", "- **Target Project**:\n")
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("Target Project", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_multiple_issues_are_rejected(self):
        content = BASE.replace("- **Issue**: N/A", "- **Issue**: #41, #42")
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("Issue", str(ctx.exception))
            self.assertIn("one", str(ctx.exception).lower())
        finally:
            remove_plan_file(path)

    def test_html_comment_is_rejected(self):
        content = BASE + "\n<!-- author guidance -->\n"
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("HTML comment", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_known_author_placeholder_is_rejected(self):
        content = BASE + "\n## Goal\n\n<Describe the Plan goal in one sentence.>\n"
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("author placeholder", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_normal_template_commit_subject_placeholder_is_rejected(self):
        content = BASE + "\n- **Commit Subject**: <type(scope): delivered result>\n"
        path = write_plan_file(content)
        try:
            with self.assertRaises(ValidationError) as ctx:
                check_doc_plan(path)
            self.assertIn("author placeholder", str(ctx.exception))
        finally:
            remove_plan_file(path)

    def test_technical_angle_bracket_notation_is_allowed(self):
        content = BASE + "\nUse `<name>` and `<id>` as protocol metavariables.\n"
        path = write_plan_file(content)
        try:
            check_doc_plan(path)
        finally:
            remove_plan_file(path)


if __name__ == "__main__":
    unittest.main()
