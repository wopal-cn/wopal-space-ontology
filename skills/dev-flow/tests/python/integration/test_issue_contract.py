#!/usr/bin/env python3
# test_issue_contract.py - Test Issue renderer contract consistency
#
# Test Case I1: Issue renderer three-way output shares same contract
#
# Scenarios:
#   1. build_structured_issue_body (unified layout) -> has Goal + Related Resources
#   2. Non-fix type has no audit sections
#   3. Section order is consistent (Goal -> Scope -> AC -> Related Resources)
#   4. Type-specific params are ignored (API compat, not rendered)
#   5. Empty optional sections are suppressed

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from issue import build_structured_issue_body


def extract_sections(content):
    """Extract section headings from body"""
    lines = content.split('\n')
    sections = []
    for line in lines:
        if line.startswith('## '):
            sections.append(line[3:])
    return sections


class TestIssueContract(unittest.TestCase):
    """Test Issue renderer contract"""

    def test_basic_layout_has_required_sections(self):
        """Issue body has Goal, Acceptance Criteria, Related Resources"""
        body = build_structured_issue_body(
            goal='Fix push detection bug',
            scope='Fix push detection',
            out_of_scope='No state machine change',
            reference='docs/xxx.md'
        )
        sections = extract_sections(body)

        self.assertIn('Goal', sections)
        self.assertIn('Scope', sections)
        self.assertIn('Acceptance Criteria', sections)
        self.assertIn('Related Resources', sections)

    def test_context_section_rendered(self):
        """Context section is rendered when provided"""
        body = build_structured_issue_body(
            goal='Add new feature',
            context='Background context for the feature',
            scope='In scope items',
            out_of_scope='Out of scope items',
        )
        sections = extract_sections(body)

        self.assertIn('Goal', sections)
        self.assertIn('Context', sections)
        self.assertIn('Scope', sections)

        # Type-specific params no longer rendered
        self.assertNotIn('Background', sections)
        self.assertNotIn('Confirmed Bugs', sections)

    def test_section_order_is_consistent(self):
        """Section order is consistent: Goal -> Context -> Scope -> AC -> Related Resources"""
        body = build_structured_issue_body(
            goal='Fix push detection bug',
            context='Some context here',
            scope='Fix push detection',
            reference='docs/xxx.md'
        )

        lines = body.split('\n')
        positions = {}
        for i, line in enumerate(lines):
            if line.startswith('## '):
                positions[line[3:]] = i

        # Assert order: Goal < Context < Scope < Acceptance Criteria < Related Resources
        self.assertLess(positions['Goal'], positions['Context'])
        self.assertLess(positions['Context'], positions['Scope'])
        self.assertLess(positions['Scope'], positions['Acceptance Criteria'])
        self.assertLess(positions['Acceptance Criteria'], positions['Related Resources'])

    def test_type_specific_params_ignored(self):
        """Type-specific params (baseline, target, etc.) are ignored for API compat"""
        perf_body = build_structured_issue_body(goal='Speed up', baseline='200ms', target='120ms')
        sections = extract_sections(perf_body)
        self.assertNotIn('Baseline', sections)
        self.assertNotIn('Target', sections)

        refactor_body = build_structured_issue_body(goal='Refactor', affected_components='a,b', refactor_strategy='extract modules')
        sections = extract_sections(refactor_body)
        self.assertNotIn('Affected Components', sections)

        docs_body = build_structured_issue_body(goal='Docs', target_documents='README', audience='contributors')
        sections = extract_sections(docs_body)
        self.assertNotIn('Target Documents', sections)

        test_body = build_structured_issue_body(goal='Tests', test_scope='CLI', test_strategy='integration')
        sections = extract_sections(test_body)
        self.assertNotIn('Test Strategy', sections)

    def test_all_five_sections_always_present(self):
        """All five sections are always present (even when empty)."""
        body = build_structured_issue_body(goal='Only goal')
        sections = extract_sections(body)
        self.assertIn('Goal', sections)
        self.assertIn('Context', sections)
        self.assertIn('Scope', sections)
        self.assertIn('Acceptance Criteria', sections)
        self.assertIn('Related Resources', sections)


if __name__ == '__main__':
    unittest.main()
