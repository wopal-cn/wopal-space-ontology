#!/usr/bin/env python3
# validation.py - Plan Quality Gates
#
# Provides:
#   check_doc_plan          - Plan completeness gate (submit/approve)
#   check_user_validation   - UV checkbox gate (verify)
#   check_acceptance_criteria - AC completion gate (complete)
#   check_step_completion   - Task Done completion gate (complete)

import re
from pathlib import Path

from lib.workspace import find_workspace_root


class ValidationError(Exception):
    pass


# ── Patterns ──

TASK_PATTERN = r'^### Task \d+: (.+?)\n(.*?)(?=^### Task|^##[^#]|\Z)'

DESIGN_PAT = r'\*\*Design\*\*:\s*\n(.*?)(?:\*\*TDD\*\*:|^###|^##|\Z)'
BEHAVIOR_PAT = r'\*\*Behavior\*\*:\s*(.*?)(?:\n\*\*Files\*\*:|\Z)'
TDD_PAT = r'\*\*TDD\*\*:\s*(true|false)'
DONE_PAT = r'\*\*Done\*\*:\s*\n(.*?)(?=^###|^##|\Z)'
CHANGES_PAT = r'\*\*Changes\*\*:\s*\n(.*?)(?:\*\*Verify\*\*:|^###|^##|\Z)'

STEP_CHECKBOX_PAT = r'-\s+\[\s*\]\s+Step\s+\d+:'

COMMAND_PATTERNS = [
    r'rg\s+-', r'python\s+-m', r'pytest', r'npm\s+', r'bun\s+',
    r'cargo\s+', r'git\s+', r'gh\s+', r'bash\s+',
]

FORBIDDEN_UV_PATTERNS = [
    r'npm\s+test', r'npm\s+run', r'npm\s+build',
    r'pytest', r'python\s+-m\s+pytest', r'bun\s+test',
    r'cargo\s+test', r'cargo\s+build', r'tsc',
]

PLACEHOLDER_PATTERNS = [
    r'待补充|待补|TBD|TBC',
    r'REQ-xxx|\bXXX\b',
    r'path/to/|/path/to/',
]


# ── Helpers ──

def _strip_md(value: str) -> str:
    return re.sub(r'[`*]', '', value).strip()


def _no_code(content: str) -> str:
    return re.sub(r'^```.*?^```', '', content, flags=re.MULTILINE | re.DOTALL)


def _line_at(content: str, pos: int) -> int:
    return content[:pos].count('\n') + 1


def _section(content: str, heading: str) -> str:
    level = heading.count('#')
    stop = rf'(?=^#{{2,{level}}}[^#]|\Z)'
    m = re.search(rf'^{re.escape(heading)}\s*\n(.*?){stop}', content, re.MULTILINE | re.DOTALL)
    return m.group(1).strip() if m else ""


def _clean_field(text: str) -> str:
    return re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL).strip()


# ── check_doc_plan: Plan quality gate for submit/approve ──

def check_doc_plan(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()

    issues: list[str] = []
    clean = _no_code(content)

    issues.extend(_check_placeholders(clean))
    issues.extend(check_task_structure(content))
    issues.extend(check_agent_verification(content))
    issues.extend(check_user_validation_new(content))

    p = _check_project_path(content)
    if p:
        issues.append(p)

    if issues:
        raise ValidationError(
            f"{len(issues)} issue(s) in {plan_file}\n"
            + "\n".join(issues)
        )


def _check_placeholders(content: str) -> list[str]:
    issues = []
    for pat in PLACEHOLDER_PATTERNS:
        for m in re.finditer(pat, content):
            issues.append(f"[L{_line_at(content, m.start())}] placeholder: '{m.group()}'")
    return issues


def check_task_structure(content: str) -> list[str]:
    issues = []
    impl = _section(content, "## Implementation")
    if not impl:
        return issues

    for title, body in re.findall(TASK_PATTERN, impl, re.MULTILINE | re.DOTALL):
        t = title.strip()

        dm = re.search(DESIGN_PAT, body, re.MULTILINE | re.DOTALL)
        if not dm or not _clean_field(dm.group(1)):
            issues.append(f"Task '{t}': missing Design")

        tm = re.search(TDD_PAT, body, re.IGNORECASE)
        if tm and tm.group(1).lower() == 'true':
            bm = re.search(BEHAVIOR_PAT, body, re.MULTILINE | re.DOTALL)
            if not bm or not _clean_field(bm.group(1)):
                issues.append(f"Task '{t}': TDD=true requires Behavior")

        dm2 = re.search(DONE_PAT, body, re.MULTILINE | re.DOTALL)
        if dm2 and not re.search(r'-\s+\[[ x]]', dm2.group(1)):
            issues.append(f"Task '{t}': Done missing checkbox")

        cm = re.search(CHANGES_PAT, body, re.MULTILINE | re.DOTALL)
        if cm and re.search(STEP_CHECKBOX_PAT, cm.group(1)):
            issues.append(f"Task '{t}': Changes must not use checkbox format")

    return issues


def check_agent_verification(content: str) -> list[str]:
    issues = []

    ac_pos = content.find("### Agent Verification")
    impl_pos = content.find("## Implementation")
    if ac_pos != -1 and impl_pos != -1 and ac_pos > impl_pos:
        issues.append("Agent Verification must appear before Implementation")

    section = _section(content, "### Agent Verification")
    if not section:
        return issues

    has_cmd = any(re.search(p, section) for p in COMMAND_PATTERNS)
    if not has_cmd and not re.search(r'`[^`]+`', section):
        issues.append("Agent Verification: no executable commands found")

    return issues


def check_user_validation_new(content: str) -> list[str]:
    section = _section(content, "### User Validation")
    if not section:
        return []

    for p in FORBIDDEN_UV_PATTERNS:
        m = re.search(p, section, re.IGNORECASE)
        if m:
            return [f"User Validation: automated command found ('{m.group()}')"]
    return []


def _check_project_path(content: str) -> str | None:
    m = re.search(r'^-\s+\*\*Project Path\*\*:\s*(.+)$', content, re.MULTILINE)
    if not m:
        return None

    declared = _strip_md(m.group(1))
    ws_root = find_workspace_root()
    resolved = ws_root / declared
    line = _line_at(content, m.start())

    if not resolved.exists():
        return f"[L{line}] Project Path not found: '{declared}'"

    if not (resolved / ".git").exists():
        return f"[L{line}] Project Path not a git repo: '{declared}'"

    return None


# ── Hard gates for complete/verify ──

def check_acceptance_criteria(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()

    section = _section(content, "### Agent Verification")
    if not section:
        return

    unchecked = re.findall(r'^\s*(?:\d+\.\s*|-\s+)\[\s*\].*$', section, re.MULTILINE)
    if unchecked:
        raise ValidationError(
            "Agent Verification not completed:\n"
            + "\n".join(unchecked)
        )


def check_step_completion(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()

    impl = _section(content, "## Implementation")
    if not impl:
        return

    issues = []
    for title, body in re.findall(TASK_PATTERN, impl, re.MULTILINE | re.DOTALL):
        dm = re.search(DONE_PAT, body, re.MULTILINE | re.DOTALL)
        if dm and not re.search(r'-\s+\[x\]', dm.group(1)):
            issues.append(f"Task '{title.strip()}': Done not checked")

    if issues:
        raise ValidationError(
            "Task Done not completed:\n" + "\n".join(issues)
        )


def check_user_validation(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()

    section = _section(content, "### User Validation")
    if not section:
        return

    if not re.findall(r'^####\s+', section, re.MULTILINE):
        raise ValidationError("User Validation: no scenario found")

    if not re.search(r'^\s*-\s+\[x\]\s+用户已完成', section, re.MULTILINE):
        raise ValidationError("User Validation: final checkbox not checked")
