#!/usr/bin/env python3
# check_doc.py - Plan Document Quality Check
#
# Provides:
#   - check_doc_plan: Plan document completeness validation
#   - check_user_validation: User Validation section gate check
#   - ValidationError: Exception for validation failures
#
# Ported from lib/check-doc.sh, lib/plan.sh

import re
from pathlib import Path

from dev_flow.core.workspace import find_workspace_root


# ============================================
# Module-level Regex Patterns (REFACTOR)
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
ANY_CHECKBOX_PATTERN = r'-\s+\[[ x]\]'  # matches both checked and unchecked
STEP_CHECKBOX_PATTERN = r'-\s+\[\s*\]\s+Step\s+\d+:'

# Numbered checkbox patterns (Agent Verification AC items)
NUM_CHECKBOX_PATTERN = r'\d+\.\s+\[\s*\]'
NUM_CHECKBOX_CHECKED_PATTERN = r'\d+\.\s+\[x\]'

# Unified AC checkbox pattern: matches both `- [ ]` and `1. [ ]`
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
    """
    Check Plan document completeness (execution-grade quality gate).
    
    Supports both old and new template formats via version detection.
    
    Old template validates:
    - No placeholders
    - Changes block format (checkbox, not numbered list)
    - Test Plan structure
    - User Validation section
    - Project Path / Project Type
    
    New template validates:
    - No placeholders
    - Task structure (Design/Behavior/TDD/Done/Changes)
    - Agent Verification (command format + position)
    - User Validation (no automated commands)
    - Project Path / Project Type
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If validation fails
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    issues = []
    version = detect_template_version(content)
    
    # Common checks: placeholders
    content_no_codeblocks = _remove_code_blocks(content)
    placeholder_pattern = r'(<!-- *(TODO|FIXME)|\- \[ \] *(TODO|FIXME)|\*\*(TODO|FIXME)|(TODO|FIXME)[：:]|待补充|REQ-xxx|path/to/)'
    if re.search(placeholder_pattern, content_no_codeblocks):
        issues.append("Found placeholders in plan")
    
    if version == 'new':
        # New template checks
        task_issues = check_task_structure(content)
        issues.extend(task_issues)
        
        ac_issues = check_agent_verification(content)
        issues.extend(ac_issues)
        
        uv_issues = check_user_validation_new(content)
        issues.extend(uv_issues)
    else:
        # Old template checks (unchanged)
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
        raise ValidationError("\n".join(issues))


def check_user_validation(plan_file: str) -> None:
    """
    Check User Validation section passes the hard gate.
    
    Gate rules (strict):
    1. Must contain at least one named user scenario (#### Scenario)
    2. Must contain a final confirmation checkbox: '- [ ] 用户已完成...'
    3. The final confirmation checkbox must be checked ([x])
    
    Backward compat: old plans with no User Validation section still pass
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If validation fails
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract User Validation section (level-3 heading)
    uv_section = _extract_level3_section(content, "### User Validation")
    
    # Backward compat: no section = pass
    if not uv_section:
        return
    
    # Gate 1: Must have at least one scenario heading (####)
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        raise ValidationError("User Validation must contain at least one named user scenario (#### Scenario N:)")
    
    # Gate 2: Must contain final confirmation checkbox
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        raise ValidationError("User Validation must contain a final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    # Gate 3: Final checkbox must be checked [x]
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
    
    # Find each Task section
    tasks = re.findall(TASK_PATTERN, content, re.MULTILINE | re.DOTALL)
    
    for task_title, task_content in tasks:
        # Extract Changes block
        changes_match = re.search(r'\*\*Changes\*\*:\s*\n(.*?)(?:\*\*Verification\*\*:|^###|^##|\Z)', 
                                   task_content, re.MULTILINE | re.DOTALL)
        if not changes_match:
            continue
        
        changes_block = changes_match.group(1).strip()
        if not changes_block:
            continue
        
        # Check for numbered list format (1. 2. 3.)
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
    
    # Check for N/A markers
    has_na_markers = bool(re.search(r'N/A\s*—', testplan_section))
    
    # Check for Case headings (##### Case or #### Case or just Case)
    # Accept both "##### Case U1:" and "#### 单元测试" followed by "##### Case"
    case_count = len(re.findall(r'^#{4,5}\s+Case\s+', testplan_section, re.MULTILINE))
    
    if case_count >= 1:
        # Validate each case has minimum structure
        # Case heading can be level-4 or level-5
        case_pattern = r'^#{4,5}\s*Case\s*([^#\n]+)\n(.*?)(?=^#{4,5}[^#]|\Z)'
        cases = re.findall(case_pattern, testplan_section, re.MULTILINE | re.DOTALL)
        
        for case_name, case_content in cases:
            case_content = case_content.strip()
            
            has_goal = bool(re.search(r'-\s*Goal:', case_content, re.IGNORECASE))
            has_fixture = bool(re.search(r'-\s*Fixture:', case_content, re.IGNORECASE))
            has_execution = bool(re.search(r'-\s*Execution:', case_content, re.IGNORECASE))
            has_evidence = bool(re.search(r'-\s*Expected\s*Evidence:', case_content, re.IGNORECASE) or 
                                re.search(r'-\s*Expected\s*Result:', case_content, re.IGNORECASE))
            has_step = bool(re.search(r'^\s*-\s+\[[ x]\]', case_content, re.MULTILINE))
            
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
        # N/A categories with reasons - OK
        pass
    else:
        # No Case structure and no N/A markers
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
        # Warning only (backward compat)
        return issues
    
    # Must have at least one scenario (#### heading)
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        issues.append("### User Validation: must have at least one named user scenario (#### Scenario N:)")
    
    # Must contain final confirmation checkbox
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        issues.append("### User Validation: must contain final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    return issues


def _check_project_path(content: str) -> str | None:
    """Validate Project Path if declared in plan metadata.

    For ontology-worktree projects, .git is a worktree pointer file (not a
    directory). Validates existence and a resolvable upstream main repo path.

    For standard projects, validates .git exists (directory or file).
    Optional field — returns None if not declared.

    Returns:
        Error message string if validation fails, None if OK or not declared
    """
    match = re.search(r'^\-\s+\*\*Project Path\*\*:\s*(.+)$', content, re.MULTILINE)
    if not match:
        return None

    declared = match.group(1).strip()
    ws_root = find_workspace_root()
    resolved = ws_root / declared

    if not resolved.exists():
        return f"Project Path: declared path does not exist: {declared}"

    git_path = resolved / ".git"
    if not git_path.exists():
        return f"Project Path: not a git repository (no .git): {declared}"

    # ontology-worktree: .git is a file pointing to main repo
    project_type = _read_project_type(content)
    if project_type == "ontology-worktree":
        if not git_path.is_file():
            return (
                f"Project Path: expected worktree pointer file at {declared}/.git "
                f"but found directory (ontology-worktree .git must be a file)"
            )
        try:
            content_git = git_path.read_text().strip()
            if not content_git.startswith("gitdir: "):
                return f"Project Path: {declared}/.git is not a valid worktree pointer (missing 'gitdir:' prefix)"
            main_repo_part = content_git[len("gitdir: "):]
            if "/.git/worktrees/" not in main_repo_part:
                return f"Project Path: {declared}/.git does not reference a valid worktree"
        except Exception:
            return f"Project Path: cannot read {declared}/.git worktree pointer"

    return None


def _check_project_type(content: str) -> str | None:
    """Validate Project Type if declared in plan metadata.

    For ontology-worktree projects, requires Project Path to be declared and
    consistent with the worktree layout.

    Returns:
        Error message string if validation fails, None if OK or not declared
    """
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
    """Read Project Type value from plan metadata.

    Returns:
        Project type string ('standard', 'ontology-worktree'), or None
    """
    match = re.search(r'^\-\s+\*\*Project Type\*\*:\s*(.+)$', content, re.MULTILINE)
    return match.group(1).strip() if match else None


def check_acceptance_criteria(plan_file: str) -> None:
    """
    Check if all Agent Verification Acceptance Criteria are completed.
    
    This is a hard gate for complete command.
    
    Behavior:
    - If `### Agent Verification` sub-section exists: only check that section
    - If no sub-section: fallback to checking entire `## Acceptance Criteria` (backward compat)
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If any Agent Verification items are unchecked
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # First, try to extract `### Agent Verification` sub-section
    agent_ac_section = _extract_level3_section(content, "### Agent Verification")
    
    ac_section = ""
    section_name = ""
    
    # Check if `### Agent Verification` exists and has checkbox content
    if agent_ac_section and re.search(r'^\s*(?:\d+\.\s*|-\s+)\[', agent_ac_section, re.MULTILINE):
        ac_section = agent_ac_section
        section_name = "Agent Verification"
    else:
        # Fallback: extract entire Acceptance Criteria section (backward compat)
        ac_section = _extract_level2_section(content, "## Acceptance Criteria")
        section_name = "Acceptance Criteria"
    
    # If no section or empty, pass
    if not ac_section or not re.search(r'(?:\d+\.|-)\s', ac_section):
        return
    
    # Check for unchecked items: both `1. [ ]` and `- [ ]` formats
    unchecked = re.findall(r'^\s*(?:\d+\.\s*|-\s+)\[\s*\].*$', ac_section, re.MULTILINE)
    
    if unchecked:
        unchecked_str = "\n".join(unchecked)
        raise ValidationError(f"{section_name} not completed:\n\n{unchecked_str}\n\nPlease complete the remaining items and update the Plan file.")
    
    # Check if there are any checked items
    checked = re.findall(r'^\s*(?:\d+\.\s*|-\s+)\[x\].*$', ac_section, re.MULTILINE)
    
    if not checked:
        # No items found - pass
        return


def check_step_completion(plan_file: str) -> None:
    """
    Check if all done/step checkboxes in Implementation are completed.
    
    This is a hard gate for complete command.
    
    New template: each Task's **Done** checkbox (- [ ] must become - [x])
    Old template: each Task's **Changes** and **Verification** step checkboxes,
                  plus Test Plan case execution step checkboxes
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If any required checkboxes are unchecked
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
    
    # 1. Check Implementation section
    impl_section = _extract_level2_section(content, "## Implementation")
    
    if impl_section:
        tasks = re.findall(TASK_PATTERN, impl_section, re.MULTILINE | re.DOTALL)
        
        for task_title, task_content in tasks:
            # Check Changes block for unchecked steps
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
            
            # Check Verification block for unchecked steps
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
    
    # 2. Check Test Plan section
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
    """
    Detect Plan template version (new vs old).
    
    Detection rule:
    - New template: contains '### Architecture Context' subsection
    - Old template: does not contain this subsection
    
    Args:
        content: Plan file content
        
    Returns:
        'new' if Architecture Context subsection found, 'old' otherwise
    """
    if re.search(ARCH_CONTEXT_PATTERN, content, re.MULTILINE):
        return 'new'
    return 'old'


def check_task_structure(content: str) -> list[str]:
    """
    Check Task structure validation for new template.
    
    Validates:
    - Design field exists and non-empty
    - Behavior field exists when TDD=true
    - Behavior precedes Design (order validation)
    - Done contains checkbox (- [ ])
    - Changes does NOT contain Step checkbox format
    
    Args:
        content: Plan file content
        
    Returns:
        List of error message strings (empty if valid)
    """
    errors = []
    
    # Extract Implementation section
    impl_section = _extract_level2_section(content, "## Implementation")
    if not impl_section:
        return errors
    
    # Find each Task section
    tasks = re.findall(TASK_PATTERN, impl_section, re.MULTILINE | re.DOTALL)
    
    for task_title, task_content in tasks:
        task_errors = _check_single_task(task_title.strip(), task_content)
        errors.extend(task_errors)
    
    return errors


def check_agent_verification(content: str) -> list[str]:
    """
    Check Agent Verification validation for new template.
    
    Validates:
    - At least one item contains executable command
    - Agent Verification appears before Implementation
    
    Args:
        content: Plan file content
        
    Returns:
        List of error message strings (empty if valid)
    """
    errors = []
    
    # Check position: Agent Verification must be before Implementation
    ac_pos = content.find("### Agent Verification")
    impl_pos = content.find("## Implementation")
    
    if ac_pos != -1 and impl_pos != -1 and ac_pos > impl_pos:
        errors.append("FAIL: Agent Verification must appear before Implementation")
    
    # Extract Agent Verification section
    agent_ac_section = _extract_level3_section(content, "### Agent Verification")
    if not agent_ac_section:
        return errors
    
    # Check for at least one executable command
    has_command = False
    for pattern in COMMAND_PATTERNS:
        if re.search(pattern, agent_ac_section):
            has_command = True
            break
    
    if not has_command:
        # Check for inline code format: `command`
        if re.search(r'\`[^\`]+\`', agent_ac_section):
            has_command = True
    
    if not has_command:
        errors.append("FAIL: At least one AC item must contain executable command")
    
    return errors


def check_user_validation_new(content: str) -> list[str]:
    """
    Check User Validation validation for new template.
    
    Validates:
    - User Validation does NOT contain automated test commands
    - Forbidden: npm test, pytest, bun test, cargo test, tsc, build commands
    
    Args:
        content: Plan file content
        
    Returns:
        List of error message strings (empty if valid)
    """
    errors = []
    
    # Extract User Validation section
    uv_section = _extract_level3_section(content, "### User Validation")
    if not uv_section:
        return errors
    
    # Forbidden automated test/build commands
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
    """
    Check single Task structure validation.
    
    Args:
        task_title: Task title
        task_content: Task content
        
    Returns:
        List of error message strings
    """
    errors = []
    
    # 1. Check Design field exists and non-empty
    design_match = re.search(
        DESIGN_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    if not design_match:
        errors.append(f"MISSING: Design (Task '{task_title}')")
    else:
        design_content = design_match.group(1).strip()
        # Remove HTML comments
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
    
    # 5. Check Done contains checkbox (checked or unchecked)
    done_match = re.search(
        DONE_PATTERN, task_content, re.MULTILINE | re.DOTALL
    )
    if done_match:
        done_content = done_match.group(1)
        # Use ANY_CHECKBOX_PATTERN to match both [ ] and [x]
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