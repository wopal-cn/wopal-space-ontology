#!/usr/bin/env python3
# validation.py - Plan Document Quality Check
#
# Migrated from domain/validation/check_doc.py
#
# Provides:
#   - check_doc_plan: Plan document completeness validation
#   - check_user_validation: User Validation section gate check
#   - check_acceptance_criteria: Agent Verification AC completion check
#   - check_step_completion: Implementation/Test Plan step completion check
#   - ValidationError: Exception for validation failures

import re
from pathlib import Path

from lib.workspace import find_workspace_root


# ============================================
# Module-level Regex Patterns
# ============================================

# Task field patterns
DESIGN_PATTERN = r'\*\*Design\*\*:\s*\n(.*?)(?:\*\*TDD\*\*:|^###|^##|\Z)'
BEHAVIOR_PATTERN = r'\*\*Behavior\*\*:\s*(.*?)(?:\n\*\*Files\*\*:|\Z)'
TDD_PATTERN = r'\*\*TDD\*\*:\s*(true|false)'
DONE_PATTERN = r'\*\*Done\*\*:\s*\n(.*?)(?=^###|^##|\Z)'
CHANGES_PATTERN = r'\*\*Changes\*\*:\s*\n(.*?)(?:\*\*Verify\*\*:|^###|^##|\Z)'

# Checkbox patterns
CHECKBOX_PATTERN = r'-\s+\[\s*\]'
CHECKBOX_CHECKED_PATTERN = r'-\s+\[x\]'
ANY_CHECKBOX_PATTERN = r'-\s+\[[ x]]'
STEP_CHECKBOX_PATTERN = r'-\s+\[\s*\]\s+Step\s+\d+:'

# Numbered checkbox patterns
NUM_CHECKBOX_PATTERN = r'\d+\.\s+\[\s*\]'
NUM_CHECKBOX_CHECKED_PATTERN = r'\d+\.\s+\[x\]'

# Unified AC checkbox pattern
AC_CHECKBOX_UNCHECKED = r'(?:\d+\.\s*|-\s+)\[\s*\]'
AC_CHECKBOX_CHECKED = r'(?:\d+\.\s*|-\s+)\[x\]'

# Section patterns
ARCH_CONTEXT_PATTERN = r'^###\s+Architecture\s+Context\s*\n'
TASK_PATTERN = r'^### Task \d+: (.+?)\n(.*?)(?=^### Task|^##[^#]|\Z)'

# Executable command patterns
COMMAND_PATTERNS = [
    r'rg\s+-', r'python\s+-m', r'python\s+-c', r'pytest', r'npm\s+',
    r'bun\s+', r'cargo\s+', r'curl\s+', r'bash\s+', r'sh\s+',
    r'git\s+', r'gh\s+', r'grep', r'cat\s+', r'ls\s+', r'mkdir',
    r'echo\s+', r'cd\s+', r'chmod', r'rm\s+', r'cp\s+', r'mv\s+',
]

# Forbidden automated test/build patterns (User Validation)
FORBIDDEN_TEST_PATTERNS = [
    r'npm\s+test', r'npm\s+run', r'npm\s+build',
    r'pytest', r'python\s+-m\s+pytest', r'bun\s+test',
    r'cargo\s+test', r'cargo\s+build', r'tsc',
    r'go\s+test', r'go\s+build', r'make\s+test',
]


class ValidationError(Exception):
    """Raised when plan validation fails"""
    pass


def check_doc_plan(plan_file: str) -> None:
    """Check Plan document completeness (execution-grade quality gate).

    All issues include line number + fix hint + why. Aggregated into a single
    ValidationError so Wopal sees the full picture in one pass.
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    issues: list[str] = []
    version = detect_template_version(content)
    content_no_codeblocks = _remove_code_blocks(content)
    
    # 1. Unfilled placeholders (TODO/FIXME/待补/path-to/REQ-xxx)
    issues.extend(_check_placeholders(content_no_codeblocks))
    
    # 2. Template guidance comments (<!-- ... -->) not removed
    issues.extend(_check_template_guidance_comments(content_no_codeblocks))
    
    if version == 'new':
        task_issues = check_task_structure(content)
        issues.extend(task_issues)
        
        ac_issues = check_agent_verification(content)
        issues.extend(ac_issues)
        
        uv_issues = check_user_validation_new(content)
        issues.extend(uv_issues)
    else:
        changes_issues = _check_changes_format(content)
        if changes_issues:
            issues.extend(changes_issues)
        
        testplan_issues = _check_test_plan_structure(content)
        if testplan_issues:
            issues.extend(testplan_issues)
        
        uv_issues = _check_user_validation_structure(content)
        if uv_issues:
            issues.extend(uv_issues)
    
    # Common checks: Project Path / Project Type
    pp_issue = _check_project_path(content)
    if pp_issue:
        issues.append(pp_issue)

    pt_issue = _check_project_type(content)
    if pt_issue:
        issues.append(pt_issue)
    
    if issues:
        summary = _format_issues_summary(issues, plan_file)
        raise ValidationError(summary)


# ============================================
# Issue formatting helpers
# ============================================


def _format_issue(
    problem: str,
    fix: str,
    line_no: int | None = None,
    why: str | None = None,
) -> str:
    """Format a single issue with line number, fix hint, and why.

    Format:
        [Line 12] Problem description
          Fix: How to fix
          Why: Why this matters
    """
    prefix = f"[Line {line_no}] " if line_no is not None else ""
    parts = [f"{prefix}{problem}"]
    if fix:
        parts.append(f"  Fix: {fix}")
    if why:
        parts.append(f"  Why: {why}")
    return "\n".join(parts)


def _format_issues_summary(issues: list[str], plan_file: str) -> str:
    """Format aggregated issues into a single error message."""
    if not issues:
        return ""
    n = len(issues)
    header = f"Plan validation failed: {n} issue(s) in {plan_file}"
    body = "\n\n".join(issues)
    return f"{header}\n\n{body}"


# ============================================
# Placeholder & template guidance checks
# ============================================


PLACEHOLDER_PATTERNS: list[tuple[str, str]] = [
    (r'<!--\s*(TODO|FIXME)', 'HTML comment with TODO/FIXME'),
    (r'\-\s+\[\s*\]\s*(TODO|FIXME)', 'checkbox with TODO/FIXME'),
    (r'\*\*(TODO|FIXME)\*\*', 'bold TODO/FIXME marker'),
    (r'(TODO|FIXME)\s*[:：]', 'TODO/FIXME with colon'),
    (r'待补充|待补|占位|TBD|TBC', 'unfilled placeholder marker'),
    (r'REQ-xxx|\bXXX\b', 'unfilled requirement code'),
    (r'path/to/|/path/to/', 'unfilled path'),
]


def _check_placeholders(content_no_codeblocks: str) -> list[str]:
    """Detect unfilled placeholders with line numbers and fix hints.

    Code blocks are removed by the caller (see _remove_code_blocks).
    """
    issues: list[str] = []
    for pattern, description in PLACEHOLDER_PATTERNS:
        for match in re.finditer(pattern, content_no_codeblocks):
            line_no = content_no_codeblocks[:match.start()].count("\n") + 1
            issues.append(
                _format_issue(
                    problem=f"Placeholder detected: '{match.group()}' ({description})",
                    fix=f"Replace '{match.group()}' with the actual value",
                    line_no=line_no,
                    why="Plan files should not contain TODO/FIXME/path-to markers — these signal incomplete work.",
                )
            )
    return issues


# Keywords that identify template guidance comments (vs author-written comments).
# These match the scaffolding comments in templates/plan.md and reference docs.
TEMPLATE_GUIDANCE_KEYWORDS: list[str] = [
    r"⚠️",
    r"自动注入",
    r"TDD\s*标记说明",
    r"委派策略规范",
    r"WorktreeContext",
    r"必填",
    r"任务产出说明",
    r"使用编号列表",
    r"前期研究结论",
    r"Agent\s*可自动验证",
    r"Plan\s*编写时检查",
    r"Acceptance\s*Criteria\s*位于",
    r"完整实施设计",
]


def _check_template_guidance_comments(content_no_codeblocks: str) -> list[str]:
    """Detect template guidance comments (<!-- ... -->) that should be removed.

    Author-written comments (those that don't match template guidance patterns)
    are allowed and won't trigger this check. This avoids false positives on
    legitimate explanatory comments.
    """
    issues: list[str] = []
    comment_pattern = re.compile(r"<!--(.*?)-->", re.DOTALL)

    for match in comment_pattern.finditer(content_no_codeblocks):
        comment_text = match.group(1).strip()
        line_no = content_no_codeblocks[:match.start()].count("\n") + 1

        for keyword in TEMPLATE_GUIDANCE_KEYWORDS:
            if re.search(keyword, comment_text):
                preview = comment_text[:80] + ("..." if len(comment_text) > 80 else "")
                issues.append(
                    _format_issue(
                        problem=f"Template guidance comment not removed: '<!-- {preview} -->'",
                        fix="Delete this line — it is template scaffolding, not plan content",
                        line_no=line_no,
                        why="Template guidance helps authors during writing. "
                            "Plan files should contain only task description, not template hints.",
                    )
                )
                break

    return issues


def check_user_validation(plan_file: str) -> None:
    """Check User Validation section passes the hard gate."""
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    uv_section = _extract_level3_section(content, "### User Validation")
    
    if not uv_section:
        return
    
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        raise ValidationError("User Validation must contain at least one named user scenario (#### Scenario N:)")
    
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        raise ValidationError("User Validation must contain a final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    checked_match = re.search(r'^\s*-\s+\[x\]\s+用户已完成', uv_section, re.MULTILINE)
    if not checked_match:
        raise ValidationError("User Validation final confirmation checkbox is NOT checked\n  The final checkbox must be checked by the user before verify --confirm")


def _remove_code_blocks(content: str) -> str:
    """Remove fenced code blocks from content"""
    return re.sub(r'^```.*?^```', '', content, flags=re.MULTILINE | re.DOTALL)


def _extract_level2_section(content: str, heading: str) -> str:
    """Extract level-2 section content (##) until next ## heading"""
    pattern = rf'^{heading}\s*\n(.*?)(?=^##[^#]|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _extract_level3_section(content: str, heading: str) -> str:
    """Extract level-3 section content (###) until next ## or ### heading"""
    pattern = rf'^{heading}\s*\n(.*?)(?=^##[^#]|^###[^#]|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _check_changes_format(content: str) -> list:
    """Check Changes blocks use checkbox format (legacy template only)."""
    issues = []
    
    tasks = re.findall(TASK_PATTERN, content, re.MULTILINE | re.DOTALL)
    
    for task_title, task_content in tasks:
        changes_match = re.search(r'\*\*Changes\*\*:\s*\n(.*?)(?:\*\*Verification\*\*:|^###|^##|\Z)', 
                                   task_content, re.MULTILINE | re.DOTALL)
        if not changes_match:
            continue
        
        changes_block = changes_match.group(1).strip()
        if not changes_block:
            continue
        
        numbered_lines = re.findall(r'^\s*[0-9]+[\.\)]\s', changes_block, re.MULTILINE)
        if numbered_lines:
            issues.append(f"Task '{task_title}': **Changes** uses numbered list instead of '- [ ] Step N:' format")
    
    return issues


def _check_test_plan_structure(content: str) -> list:
    """Check Test Plan has proper Case structure"""
    issues = []
    
    testplan_section = _extract_level2_section(content, "## Test Plan")
    if not testplan_section:
        issues.append("Missing ## Test Plan (mandatory for execution-grade plans)")
        return issues
    
    has_na_markers = bool(re.search(r'N/A\s*—', testplan_section))
    
    case_count = len(re.findall(r'^#{4,5}\s+Case\s+', testplan_section, re.MULTILINE))
    
    if case_count >= 1:
        case_pattern = r'^#{4,5}\s*Case\s*([^#\n]+)\n(.*?)(?=^#{4,5}[^#]|\Z)'
        cases = re.findall(case_pattern, testplan_section, re.MULTILINE | re.DOTALL)
        
        for case_name, case_content in cases:
            case_content = case_content.strip()
            
            has_goal = bool(re.search(r'-\s*Goal:', case_content, re.IGNORECASE))
            has_fixture = bool(re.search(r'-\s*Fixture:', case_content, re.IGNORECASE))
            has_execution = bool(re.search(r'-\s*Execution:', case_content, re.IGNORECASE))
            has_evidence = bool(re.search(r'-\s*Expected\s*Evidence:', case_content, re.IGNORECASE) or 
                                re.search(r'-\s*Expected\s*Result:', case_content, re.IGNORECASE))
            has_step = bool(re.search(r'^\s*-\s+\[[ x]]', case_content, re.MULTILINE))
            
            if not has_goal:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Goal:'")
            if not has_fixture:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Fixture:'")
            if not has_execution:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Execution:' with step checkboxes")
            if not has_evidence:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Expected Evidence:' or '- Expected Result:'")
            if not has_step:
                issues.append(f"Test Case '{case_name.strip()}': missing '- [ ] Step N:' in Execution")
    elif has_na_markers:
        pass
    else:
        test_item_lines = re.findall(r'^\s*-', testplan_section, re.MULTILINE)
        if test_item_lines:
            issues.append("## Test Plan has test items but no '##### Case' structure (use Case skeleton format)")
        else:
            issues.append("## Test Plan has no test cases or N/A markers")
    
    return issues


def _check_user_validation_structure(content: str) -> list:
    """Check User Validation structure for check_doc_plan (warning level)"""
    issues = []
    
    uv_section = _extract_level3_section(content, "### User Validation")
    
    if not uv_section:
        return issues
    
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        issues.append("### User Validation: must have at least one named user scenario (#### Scenario N:)")
    
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        issues.append("### User Validation: must contain final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    return issues


def _check_project_path(content: str) -> str | None:
    """Validate Project Path if declared in plan metadata."""
    match = re.search(r'^\-\s+\*\*Project Path\*\*:\s*(.+)$', content, re.MULTILINE)
    if not match:
        return None

    declared = match.group(1).strip()
    ws_root = find_workspace_root()
    resolved = ws_root / declared
    line_no = content[:match.start()].count("\n") + 1

    if not resolved.exists():
        return _format_issue(
            problem=f"Project Path: declared path does not exist: '{declared}' (resolved: {resolved})",
            fix=(
                "Project Path must be relative to the space root "
                "(e.g. 'projects/ellamaka/' or '.wopal/'). "
                f"Run flow.sh from the space root, not from a project subdirectory. "
                f"Current ws_root: {ws_root}"
            ),
            line_no=line_no,
            why="Paths are resolved relative to the space root, so 'projects/ellamaka/' only works "
                "when flow.sh runs from the space root (where .wopal-space/ lives).",
        )

    git_path = resolved / ".git"
    if not git_path.exists():
        return _format_issue(
            problem=f"Project Path: not a git repository (no .git): '{declared}'",
            fix="Ensure the path points to a git repo (standard projects) or a worktree (ontology-worktree)",
            line_no=line_no,
        )

    project_type = _read_project_type(content)
    if project_type == "ontology-worktree":
        if not git_path.is_file():
            return _format_issue(
                problem=f"Project Path: expected worktree pointer file at '{declared}/.git' but found directory",
                fix="For ontology-worktree, .git must be a file (worktree pointer), not a directory",
                line_no=line_no,
            )
        try:
            content_git = git_path.read_text().strip()
            if not content_git.startswith("gitdir: "):
                return _format_issue(
                    problem=f"Project Path: '{declared}/.git' is not a valid worktree pointer (missing 'gitdir:' prefix)",
                    fix="Check that .git is a proper worktree pointer file",
                    line_no=line_no,
                )
            main_repo_part = content_git[len("gitdir: "):]
            if "/.git/worktrees/" not in main_repo_part:
                return _format_issue(
                    problem=f"Project Path: '{declared}/.git' does not reference a valid worktree",
                    fix="The worktree pointer must point to a path containing '/.git/worktrees/'",
                    line_no=line_no,
                )
        except Exception as e:
            return _format_issue(
                problem=f"Project Path: cannot read '{declared}/.git' worktree pointer: {e}",
                fix="Check file permissions and that .git is a valid worktree pointer file",
                line_no=line_no,
            )

    return None


def _check_project_type(content: str) -> str | None:
    """Validate Project Type if declared in plan metadata."""
    project_type = _read_project_type(content)
    if not project_type:
        return None

    valid_types = {"standard", "ontology-worktree"}
    if project_type not in valid_types:
        return f"Project Type: unknown value '{project_type}' (valid: {', '.join(sorted(valid_types))})"

    if project_type == "ontology-worktree":
        path_match = re.search(r'^\-\s+\*\*Project Path\*\*:\s*(.+)$', content, re.MULTILINE)
        if not path_match:
            return "Project Type: 'ontology-worktree' declared but no Project Path found"

    return None


def _read_project_type(content: str) -> str | None:
    """Read Project Type value from plan metadata."""
    match = re.search(r'^\-\s+\*\*Project Type\*\*:\s*(.+)$', content, re.MULTILINE)
    return match.group(1).strip() if match else None


def check_acceptance_criteria(plan_file: str) -> None:
    """Check if all Agent Verification Acceptance Criteria are completed.
    
    Hard gate for complete command.
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    agent_ac_section = _extract_level3_section(content, "### Agent Verification")
    
    ac_section = ""
    section_name = ""
    
    if agent_ac_section and re.search(r'^\s*(?:\d+\.\s*|-\s+)\[', agent_ac_section, re.MULTILINE):
        ac_section = agent_ac_section
        section_name = "Agent Verification"
    else:
        ac_section = _extract_level2_section(content, "## Acceptance Criteria")
        section_name = "Acceptance Criteria"
    
    if not ac_section or not re.search(r'(?:\d+\.|-)\s', ac_section):
        return
    
    unchecked = re.findall(r'^\s*(?:\d+\.\s*|-\s+)\[\s*\].*$', ac_section, re.MULTILINE)
    
    if unchecked:
        unchecked_str = "\n".join(unchecked)
        raise ValidationError(f"{section_name} not completed:\n\n{unchecked_str}\n\nPlease complete the remaining items and update the Plan file.")
    
    checked = re.findall(r'^\s*(?:\d+\.\s*|-\s+)\[x\].*$', ac_section, re.MULTILINE)
    
    if not checked:
        return


def check_step_completion(plan_file: str) -> None:
    """Check if all done/step checkboxes in Implementation are completed.
    
    Hard gate for complete command.
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    version = detect_template_version(content)
    
    if version == 'new':
        _check_done_completion(content, plan_file)
    else:
        _check_legacy_step_completion(content, plan_file)


def _check_done_completion(content: str, plan_file: str) -> None:
    """Check all Task Done checkboxes are checked in new template."""
    issues = []
    impl_section = _extract_level2_section(content, "## Implementation")
    
    if impl_section:
        tasks = re.findall(TASK_PATTERN, impl_section, re.MULTILINE | re.DOTALL)
        for task_title, task_content in tasks:
            done_match = re.search(
                r'\*\*Done\*\*:.*?\n(.*?)(?=^###|\Z)',
                task_content, re.MULTILINE | re.DOTALL
            )
            if done_match:
                done_block = done_match.group(1).strip()
                has_any_checkbox = bool(re.search(r'-\s+\[[ xX]\]', done_block, re.MULTILINE))
                if not has_any_checkbox:
                    issues.append(f"Task '{task_title}' Done: no checkbox found — must have a '- [ ]' checkbox")
                else:
                    unchecked_in_done = re.findall(
                        r'^\s*-\s+\[\s*\]\s+',
                        done_block,
                        re.MULTILINE
                    )
                    for _ in unchecked_in_done:
                        issues.append(f"Task '{task_title}' Done: checkbox not completed")
    
    if issues:
        issues_str = "\n".join(issues)
        raise ValidationError(
            f"Task Done checkboxes not completed:\n\n{issues_str}\n\n"
            f"Please check the completed tasks in the Plan file:\n  {plan_file}\n\n"
            f"After completing, run: flow.sh complete"
        )


def _check_legacy_step_completion(content: str, plan_file: str) -> None:
    """Check all step checkboxes in legacy template are completed."""
    unchecked_steps = []
    
    impl_section = _extract_level2_section(content, "## Implementation")
    
    if impl_section:
        tasks = re.findall(TASK_PATTERN, impl_section, re.MULTILINE | re.DOTALL)
        
        for task_title, task_content in tasks:
            changes_match = re.search(
                CHANGES_PATTERN.replace(r'\*\*Verify\*\*:', r'\*\*Verification\*\*:'),
                task_content, re.MULTILINE | re.DOTALL
            )
            if changes_match:
                changes_block = changes_match.group(1).strip()
                unchecked_in_changes = re.findall(
                    r'^\s*' + STEP_CHECKBOX_PATTERN + r'.*$',
                    changes_block,
                    re.MULTILINE
                )
                for step in unchecked_in_changes:
                    unchecked_steps.append(f"Task '{task_title}' Changes: {step.strip()}")
            
            verification_match = re.search(
                r'\*\*Verification\*\*:\s*\n(.*?)(?=^###|^##|\Z)',
                task_content, re.MULTILINE | re.DOTALL
            )
            if verification_match:
                verification_block = verification_match.group(1).strip()
                unchecked_in_verification = re.findall(
                    r'^\s*-\s+\[\s*\]\s+Step\s+\d+:.*$',
                    verification_block,
                    re.MULTILINE
                )
                for step in unchecked_in_verification:
                    unchecked_steps.append(f"Task '{task_title}' Verification: {step.strip()}")
    
    testplan_section = _extract_level2_section(content, "## Test Plan")
    
    if testplan_section:
        case_pattern = r'^#{4,5}\s*Case\s*([^#\n]+)\n(.*?)(?=^#{4,5}[^#]|\Z)'
        cases = re.findall(case_pattern, testplan_section, re.MULTILINE | re.DOTALL)
        
        for case_name, case_content in cases:
            execution_match = re.search(
                r'-\s*Execution:\s*\n(.*?)(?=-\s*Expected|\Z)',
                case_content,
                re.MULTILINE | re.DOTALL
            )
            if execution_match:
                execution_block = execution_match.group(1).strip()
                unchecked_in_execution = re.findall(
                    r'^\s*-\s+\[\s*\]\s+Step\s+\d+:.*$',
                    execution_block,
                    re.MULTILINE
                )
                for step in unchecked_in_execution:
                    unchecked_steps.append(f"Test Case '{case_name.strip()}': {step.strip()}")
    
    if unchecked_steps:
        unchecked_str = "\n".join(unchecked_steps)
        raise ValidationError(
            f"Implementation/Test Plan steps not completed:\n\n{unchecked_str}\n\n"
            f"Please check the completed steps in the Plan file:\n  {plan_file}\n\n"
            f"After completing, run: flow.sh complete"
        )


# ============================================
# New Template Validation Functions
# ============================================

def detect_template_version(content: str) -> str:
    """Detect Plan template version (new vs old)."""
    if re.search(ARCH_CONTEXT_PATTERN, content, re.MULTILINE):
        return 'new'
    return 'old'


def check_task_structure(content: str) -> list[str]:
    """Check Task structure validation for new template."""
    errors = []
    
    impl_section = _extract_level2_section(content, "## Implementation")
    if not impl_section:
        return errors
    
    tasks = re.findall(TASK_PATTERN, impl_section, re.MULTILINE | re.DOTALL)
    
    for task_title, task_content in tasks:
        task_errors = _check_single_task(task_title.strip(), task_content)
        errors.extend(task_errors)
    
    return errors


def check_agent_verification(content: str) -> list[str]:
    """Check Agent Verification validation for new template."""
    errors = []
    
    ac_pos = content.find("### Agent Verification")
    impl_pos = content.find("## Implementation")
    
    if ac_pos != -1 and impl_pos != -1 and ac_pos > impl_pos:
        errors.append("FAIL: Agent Verification must appear before Implementation")
    
    agent_ac_section = _extract_level3_section(content, "### Agent Verification")
    if not agent_ac_section:
        return errors
    
    has_command = False
    for pattern in COMMAND_PATTERNS:
        if re.search(pattern, agent_ac_section):
            has_command = True
            break
    
    if not has_command:
        if re.search(r'\`[^\`]+\`', agent_ac_section):
            has_command = True
    
    if not has_command:
        errors.append("FAIL: At least one AC item must contain executable command")
    
    return errors


def check_user_validation_new(content: str) -> list[str]:
    """Check User Validation validation for new template."""
    errors = []
    
    uv_section = _extract_level3_section(content, "### User Validation")
    if not uv_section:
        return errors
    
    for pattern in FORBIDDEN_TEST_PATTERNS:
        match = re.search(pattern, uv_section, re.IGNORECASE)
        if match:
            errors.append(
                "FAIL: User Validation must not contain automated test commands "
                f"(found: '{match.group()}')"
            )
            break
    
    return errors


def _check_single_task(task_title: str, task_content: str) -> list[str]:
    """Check single Task structure validation."""
    errors = []
    
    # 1. Check Design field exists and non-empty
    design_match = re.search(
        DESIGN_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    if not design_match:
        errors.append(f"MISSING: Design (Task '{task_title}')")
    else:
        design_content = design_match.group(1).strip()
        design_clean = re.sub(r'<!--.*?-->', '', design_content, flags=re.DOTALL)
        if not design_clean or re.match(r'^\s*$', design_clean):
            errors.append(f"MISSING: Design (Task '{task_title}')")
    
    # 2. Check TDD field
    tdd_match = re.search(TDD_PATTERN, task_content, re.IGNORECASE)
    tdd_value = tdd_match.group(1).lower() if tdd_match else 'false'
    
    # 3. Check Behavior field exists when TDD=true
    behavior_match = re.search(
        BEHAVIOR_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    
    if tdd_value == 'true':
        if not behavior_match:
            errors.append(
                f"MISSING: Behavior (TDD=true requires Behavior) "
                f"(Task '{task_title}')"
            )
        else:
            behavior_content = behavior_match.group(1).strip()
            behavior_clean = re.sub(r'<!--.*?-->', '', behavior_content, flags=re.DOTALL)
            if not behavior_clean or re.match(r'^\s*$', behavior_clean):
                errors.append(
                    f"MISSING: Behavior (TDD=true requires Behavior) "
                    f"(Task '{task_title}')"
                )
    
    # 4. Check Behavior precedes Design (order validation)
    if behavior_match and design_match:
        behavior_pos = task_content.find("**Behavior**:")
        design_pos = task_content.find("**Design**:")
        if behavior_pos > design_pos:
            errors.append(
                f"ORDER: Behavior must precede Design "
                f"(Task '{task_title}')"
            )
    
    # 5. Check Done contains checkbox
    done_match = re.search(
        DONE_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    if done_match:
        done_content = done_match.group(1)
        checkbox_match = re.search(ANY_CHECKBOX_PATTERN, done_content, re.MULTILINE)
        if not checkbox_match:
            errors.append(
                f"MISSING: Done must contain at least one checkbox "
                f"(Task '{task_title}')"
            )
    
    # 6. Check Changes does NOT contain Step checkbox format
    changes_match = re.search(
        CHANGES_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    if changes_match:
        changes_content = changes_match.group(1)
        step_checkbox_match = re.search(
            STEP_CHECKBOX_PATTERN,
            changes_content, re.MULTILINE
        )
        if step_checkbox_match:
            errors.append(
                f"FAIL: Changes must not contain checkbox format "
                f"(Task '{task_title}')"
            )
    
    return errors
