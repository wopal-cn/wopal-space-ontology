#!/usr/bin/env python3
# test_two_beat_ac.py - Acceptance completion gate

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from support.plan_fixtures import write_plan_file, remove_plan_file
from validation import check_doc_plan, check_acceptance_criteria, ValidationError


META = """# test-plan

## Metadata

- **Issue**: N/A
- **Type**: test
- **Target Project**: wopal-space-ontology
- **Project Path**: .wopal
- **Product**:
- **Phase**:
- **Status**: planning

"""




class TestSubmitDoesNotJudgeAcceptanceSemantics(unittest.TestCase):

    def test_prose_or_criterion_style_does_not_block_submit_check(self):
        path = write_plan_file(META + """## Acceptance Criteria

### Agent Verification

Plain prose is a review-quality issue, not a lifecycle-parser issue.
""")
        try:
            check_doc_plan(path)
        finally:
            remove_plan_file(path)


class TestCompleteRequiresCheckedAcceptance(unittest.TestCase):

    def test_checked_criterion_passes_without_command_parsing(self):
        path = write_plan_file(META + """## Acceptance Criteria

### Agent Verification

1. [x] Observable behavior has been verified by the controller
""")
        try:
            check_acceptance_criteria(path)
        finally:
            remove_plan_file(path)

    def test_unchecked_entry_rejected(self):
        path = write_plan_file(META + """## Acceptance Criteria

### Agent Verification

1. [ ] Still pending
""")
        try:
            with self.assertRaises(ValidationError):
                check_acceptance_criteria(path)
        finally:
            remove_plan_file(path)

    def test_present_section_without_checkbox_rejected(self):
        path = write_plan_file(META + """## Acceptance Criteria

### Agent Verification

No checkbox.
""")
        try:
            with self.assertRaises(ValidationError):
                check_acceptance_criteria(path)
        finally:
            remove_plan_file(path)


if __name__ == "__main__":
    unittest.main()
