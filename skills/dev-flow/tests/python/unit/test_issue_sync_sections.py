#!/usr/bin/env python3
# test_issue_sync_sections.py - Surgical three-section Plan -> Issue sync
#
# Pipeline under test: extract (fence-aware) -> render -> replace.
# Fixtures are recorded real samples; see tests/fixtures/sync-sample/SOURCES.md.
#
# Scenarios:
#   1. Canonical sync: three mapped sections replaced, everything else byte-identical
#   2. Idempotency: a second sync is byte-identical
#   3. Extraction: fenced code content preserved, '## ' inside a fence is not a boundary
#   4. Rendering: Scope sub-sections, AC numbered checkboxes converted
#   5. Missing Plan section -> target skipped, others synced
#   6. Missing Issue target -> skipped without insertion
#   7. Legacy '## In Scope'/'## Out of Scope' updated in place
#   8. planning status -> '_待关联_' row, sections still synced
#   9. Missing '## Related Resources' -> existing append fallback keeps the row

import re
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from issue import (
    build_synced_issue_body,
    extract_acceptance_criteria,
    extract_plan_section,
)


FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "sync-sample"
CANONICAL_ISSUE = FIXTURES / "issue-240-canonical.md"
LEGACY_ISSUE = FIXTURES / "issue-123-legacy.md"
SAMPLE_PLAN = FIXTURES / "plan-240.md"
PLAN_NAME = "20260929-240-enhance-wopal-cli-isolated-evo-flow"


def _fixture(path: Path) -> str:
    return path.read_text()


def _sections(text: str) -> dict[str, str]:
    """Split a body into top-level '## ' sections: heading -> stripped body.

    The fixtures used here hold no '## ' line inside a fence, so a plain scan
    is a valid independent oracle for what the pipeline must produce.
    """
    parts: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        match = re.match(r'^## (.+)$', line)
        if match:
            current = match.group(1).strip()
            parts[current] = []
        elif current is not None:
            parts[current].append(line)
    return {heading: "\n".join(lines).strip() for heading, lines in parts.items()}


def _real_plan_row() -> str:
    """The | Plan | row recorded in the issue-240 sample (real link row)."""
    match = re.search(r'^\| Plan \| .+ \|$', _fixture(CANONICAL_ISSUE), re.MULTILINE)
    return match.group(0)


def _mask(body: str) -> str:
    """Mask the intended changes: three mapped section bodies and the Plan row.

    What remains must be byte-identical between a body and its synced version.
    """
    out: list[str] = []
    skipping = False
    for line in body.splitlines():
        if re.match(r'^## (Goal|Scope|Acceptance Criteria)$', line):
            skipping = True
            out.append(line)
            continue
        if skipping and line.startswith("## "):
            skipping = False
        if not skipping:
            out.append(re.sub(r'^\| Plan \| .+ \|$', '| Plan | <row> |', line))
    return "\n".join(out)


def _drop_section(text: str, heading: str) -> str:
    """Remove a top-level section (heading line through the line before the next heading)."""
    out: list[str] = []
    skipping = False
    for line in text.splitlines():
        if line.strip() == heading:
            skipping = True
            continue
        if skipping and line.startswith("## "):
            skipping = False
        if not skipping:
            out.append(line)
    return "\n".join(out) + "\n"


def _sync_with_linked_row(issue_body: str, plan_file: Path = SAMPLE_PLAN,
                          plan_name: str = PLAN_NAME) -> str:
    """Run the sync pipeline with the real Plan row recorded in issue-240."""
    with patch("plan.build_plan_link_for_issue", return_value=_real_plan_row()):
        return build_synced_issue_body(
            issue_body, str(plan_file), plan_name, "sampx/wopal-space", None)


class TestCanonicalSync:
    def test_replaces_three_sections_and_row_preserving_the_rest(self):
        original = _fixture(CANONICAL_ISSUE)
        new = _sync_with_linked_row(original)

        plan = _sections(_fixture(SAMPLE_PLAN))
        orig_sections = _sections(original)
        new_sections = _sections(new)

        assert new_sections["Goal"] == plan["Goal"]
        assert new_sections["Scope"] == (
            f"### In\n\n{plan['In Scope']}\n\n### Out\n\n{plan['Out of Scope']}"
        )
        assert "### Agent Verification" in new_sections["Acceptance Criteria"]
        assert "### User Validation" in new_sections["Acceptance Criteria"]
        assert re.search(r'^\d+\. \[', new_sections["Acceptance Criteria"], re.MULTILINE) is None
        assert new_sections["Context"] == orig_sections["Context"]
        assert _real_plan_row() in new_sections["Related Resources"]
        assert _mask(original) == _mask(new)

    def test_second_sync_is_byte_identical(self):
        once = _sync_with_linked_row(_fixture(CANONICAL_ISSUE))
        twice = _sync_with_linked_row(once)
        assert twice == once


class TestExtractionFenceAwareness:
    def test_fenced_code_content_is_preserved(self):
        goal = extract_plan_section(str(SAMPLE_PLAN), "Goal")
        assert "```" in goal
        assert "→ 用户明确确认 → 集成（integrate）→ 归档" in goal

    def test_heading_inside_plan_fence_does_not_terminate_section(self, tmp_path):
        # Derived from plan-240: a '## Not A Section' line inserted inside the Goal fence.
        text = _fixture(SAMPLE_PLAN).replace(
            "→ 用户明确确认 → 集成（integrate）→ 归档",
            "## Not A Section\n→ 用户明确确认 → 集成（integrate）→ 归档", 1)
        plan_path = tmp_path / "plan-fence-heading.md"
        plan_path.write_text(text)

        goal = extract_plan_section(str(plan_path), "Goal")

        assert "## Not A Section" in goal
        assert "另放宽" in goal

    def test_heading_inside_issue_fence_is_not_a_section_boundary(self):
        # Derived from issue-240: a fenced '## Fake Heading' inserted into ## Scope.
        body = _fixture(CANONICAL_ISSUE).replace(
            "### In（解决方案）\n",
            "### In（解决方案）\n\n```\n## Fake Heading\n```\n", 1)

        new = _sync_with_linked_row(body)

        assert "## Fake Heading" not in new
        assert "### In\n\n" in new
        assert _real_plan_row() in new


class TestAcceptanceCriteriaRendering:
    def test_numbered_checkboxes_converted_and_subsections_kept(self):
        raw = _sections(_fixture(SAMPLE_PLAN))["Acceptance Criteria"]
        converted = extract_acceptance_criteria(str(SAMPLE_PLAN))

        assert "### Agent Verification" in converted
        assert "### User Validation" in converted
        assert re.search(r'^\d+\. \[', converted, re.MULTILINE) is None
        expected_boxes = len(re.findall(r'^\d+\. \[x\]', raw, re.MULTILINE)) \
            + len(re.findall(r'^- \[x\]', raw, re.MULTILINE))
        assert converted.count("- [x]") == expected_boxes

    def test_unchecked_numbered_checkbox_converted(self, tmp_path):
        # Derived from plan-240: first AC checkbox flipped to unchecked.
        text = _fixture(SAMPLE_PLAN).replace(
            "1. [x] **记录不丢（commit）**", "1. [ ] **记录不丢（commit）**", 1)
        plan_path = tmp_path / "plan-unchecked.md"
        plan_path.write_text(text)

        converted = extract_acceptance_criteria(str(plan_path))

        assert "- [ ] **记录不丢（commit）**" in converted
        assert "1. [ ]" not in converted


class TestMissingSections:
    def test_missing_plan_section_skips_target_and_syncs_others(self, tmp_path):
        # Derived from plan-240: '## Out of Scope' removed from the Plan.
        plan_path = tmp_path / "plan-no-out.md"
        plan_path.write_text(_drop_section(_fixture(SAMPLE_PLAN), "## Out of Scope"))
        original = _fixture(CANONICAL_ISSUE)

        new = _sync_with_linked_row(original, plan_file=plan_path)

        plan = _sections(_fixture(SAMPLE_PLAN))
        orig_sections = _sections(original)
        new_sections = _sections(new)
        assert new_sections["Scope"] == orig_sections["Scope"]
        assert new_sections["Goal"] == plan["Goal"]
        assert "- [x] **记录不丢（commit）**" in new_sections["Acceptance Criteria"]

    def test_missing_issue_target_is_skipped_without_insertion(self):
        # Derived from issue-240: '## Goal' section removed from the Issue body.
        original = _drop_section(_fixture(CANONICAL_ISSUE), "## Goal")

        new = _sync_with_linked_row(original)

        assert "## Goal" not in new
        assert "### In\n\n" in new
        assert _sections(new)["Context"] == _sections(original)["Context"]


class TestLegacyFallback:
    def test_legacy_in_out_updated_in_place(self):
        original = _fixture(LEGACY_ISSUE)
        plan = _sections(_fixture(SAMPLE_PLAN))
        orig_sections = _sections(original)

        new = _sync_with_linked_row(original)

        new_sections = _sections(new)
        assert new_sections["In Scope"] == plan["In Scope"]
        assert new_sections["Out of Scope"] == plan["Out of Scope"]
        assert new_sections["Goal"] == plan["Goal"]
        assert new_sections["Background"] == orig_sections["Background"]
        assert "### In" not in new
        assert "| Plan | _待关联_ |" not in new
        assert _real_plan_row() in new_sections["Related Resources"]


class TestStatusSemantics:
    def test_planning_plan_writes_pending_row_and_syncs_sections(self, tmp_path):
        # Derived from plan-240: Status flipped to 'planning' so the link row is _待关联_.
        plan_path = tmp_path / "plan-planning.md"
        plan_path.write_text(_fixture(SAMPLE_PLAN).replace(
            "- **Status**: done", "- **Status**: planning", 1))

        new = build_synced_issue_body(
            _fixture(CANONICAL_ISSUE), str(plan_path), PLAN_NAME, "sampx/wopal-space", None)

        assert "| Plan | _待关联_ |" in new
        assert "### In\n\n" in new
        assert "### In（解决方案）" not in new


class TestRelatedResourcesFallback:
    def test_missing_related_resources_section_appended_with_row(self):
        # Derived from issue-240: '## Related Resources' removed from the Issue body.
        original = _drop_section(_fixture(CANONICAL_ISSUE), "## Related Resources")

        new = _sync_with_linked_row(original)

        assert "## Related Resources" in new
        assert _real_plan_row() in new
        assert _sections(new)["Context"] == _sections(original)["Context"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
