#!/usr/bin/env python3
# validation.py - Mechanical Plan lifecycle gates

import re
from pathlib import Path

from lib.workspace import find_workspace_root
from plan import ValidationError as PlanNameValidationError
from plan import validate_plan_name
from workflow import PLAN_STATES


class ValidationError(Exception):
    pass


TASK_PATTERN = r'^### Task \d+: (.+?)\n(.*?)(?=^### Task|^##[^#]|\Z)'
DONE_PAT = r'\*\*Done\*\*:\s*\n(.*?)(?=^###|^##|\Z)'
CHECKBOX_PAT = r'^\s*(?:\d+\.\s*|-\s+)\[([ xX])\]\s*(.*)$'


def _strip_md(value: str) -> str:
    return re.sub(r'[`*]', '', value).strip()


def _line_at(content: str, pos: int) -> int:
    return content[:pos].count('\n') + 1


def _section(content: str, heading: str) -> str:
    level = heading.count('#')
    stop = rf'(?=^#{{2,{level}}}[^#]|\Z)'
    match = re.search(
        rf'^{re.escape(heading)}\s*\n(.*?){stop}',
        content,
        re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _checkboxes(section: str) -> list[tuple[str, str]]:
    return re.findall(CHECKBOX_PAT, section, re.MULTILINE)


# submit / approve: only metadata that lifecycle commands rely on

def check_doc_plan(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as file:
        content = file.read()

    issues: list[str] = []
    issues.extend(check_plan_status(content))
    issues.extend(check_product_phase(content))
    issues.extend(check_plan_name(plan_file))
    issues.extend(check_issue_contract(content))
    issues.extend(check_template_residue(content))
    issues.extend(check_project_contract(content))

    project_path_issue = _check_project_path(content)
    if project_path_issue:
        issues.append(project_path_issue)

    if issues:
        raise ValidationError(
            f"{len(issues)} issue(s) in {plan_file}\n" + "\n".join(issues)
        )


def check_plan_name(plan_file: str) -> list[str]:
    """The file name is the Plan's identity: it derives the feature branch.

    Only the character set is enforced for existing Plans. The slug-length cap
    is a creation-time rule — a Plan already in flight has its branch derived
    from the current name, so a length complaint here would block a lifecycle
    step the user never asked to renegotiate.
    """
    try:
        validate_plan_name(Path(plan_file).stem, enforce_slug_length=False)
    except PlanNameValidationError as exc:
        return [f"Plan name: {exc}"]
    return []


def check_plan_status(content: str) -> list[str]:
    match = re.search(r'^- \*\*Status\*\*:\s*(\w+)', content, re.MULTILINE)
    if not match:
        return ["Metadata: Status is required"]
    if match.group(1) not in PLAN_STATES:
        return [f"Status: unsupported state '{match.group(1)}'"]
    return []


def check_product_phase(content: str) -> list[str]:
    """Product/Phase must both exist and be either both filled or both empty."""
    issues: list[str] = []
    product_m = re.search(r'^- \*\*Product\*\*:[ \t]*(.*)$', content, re.MULTILINE)
    phase_m = re.search(r'^- \*\*Phase\*\*:[ \t]*(.*)$', content, re.MULTILINE)

    if not product_m:
        issues.append("Metadata: 'Product' item missing")
    if not phase_m:
        issues.append("Metadata: 'Phase' item missing")

    if product_m and phase_m:
        product = _strip_md(product_m.group(1))
        phase = _strip_md(phase_m.group(1))
        if bool(product) != bool(phase):
            issues.append("Metadata: Product and Phase must be declared together")

    return issues


def check_issue_contract(content: str) -> list[str]:
    """A Plan may link zero or one Issue, never an Issue list."""
    match = re.search(r'^-\s+\*\*Issue\*\*:[ \t]*(.*)$', content, re.MULTILINE)
    if not match:
        return []

    value = _strip_md(match.group(1))
    if not value or value.lower() in {"n/a", "none"}:
        return []
    if re.fullmatch(r'#\d+', value):
        return []
    return ["Issue: Plan may reference at most one Issue in the form '#N'"]


_AUTHOR_PLACEHOLDER_PREFIXES = (
    "type(scope): delivered result",
    "Describe ",
    "Current architecture",
    "Research summary",
    "Contract definition",
    "List ",
    "excluded item",
    "component",
    "role in this change",
    "behavioral criterion",
    "user-visible behavior",
    "what the user is validating",
    "project spec section",
    "setup condition",
    "one real copy-paste command",
    "action ",
    "specific observable result",
    "logs, diff, screenshot",
    "user-validation confirmation",
    "Agent Verification entries",
    "required for project/phase Plans",
    "observable outcome",
    "important boundary",
    "files/docs the Plan author",
    "optional: task-local contract",
    "optional: hard implementation limits",
    "executable command",
    "controller accepted this Task",
    "agent name",
    "assignment rationale",
    "decision and rationale",
    "context document path",
    "item 1",
    "item 2",
    "brief reason when false",
    "backfilled by the controller after acceptance",
    "replace with a manual validation scenario",
)


def check_template_residue(content: str) -> list[str]:
    """Reject author-only template guidance while allowing technical metavariables."""
    issues: list[str] = []
    if re.search(r'<!--.*?-->', content, re.DOTALL):
        issues.append("Template residue: HTML comment remains in Plan")

    for match in re.finditer(r'<([^<>\n]+)>', content):
        inner = match.group(1).strip()
        if inner.startswith(_AUTHOR_PLACEHOLDER_PREFIXES):
            line = _line_at(content, match.start())
            issues.append(f"[L{line}] Template residue: author placeholder '<{inner}>'")
    return issues


def check_project_contract(content: str) -> list[str]:
    """Every Plan owns exactly one Target Project."""
    target_m = re.search(
        r'^-\s+\*\*Target Project\*\*:[ \t]*(.*)$', content, re.MULTILINE
    )
    target = _strip_md(target_m.group(1)) if target_m else ""
    if not target:
        return ["Target Project is required"]
    return []


def _check_project_path(content: str) -> str | None:
    target_m = re.search(
        r'^-\s+\*\*Target Project\*\*:[ \t]*(.*)$', content, re.MULTILINE
    )
    target = _strip_md(target_m.group(1)) if target_m else ""

    path_m = re.search(
        r'^-\s+\*\*Project Path\*\*:[ \t]*(.*)$', content, re.MULTILINE
    )
    declared = _strip_md(path_m.group(1)) if path_m else ""

    if target and not declared:
        return "Project Path is required when Target Project is declared"
    if not declared:
        return None

    resolved = find_workspace_root() / declared
    line = _line_at(content, path_m.start())
    if not resolved.exists():
        return f"[L{line}] Project Path not found: '{declared}'"
    if not (resolved / '.git').exists():
        return f"[L{line}] Project Path not a git repo: '{declared}'"
    return None


# complete / verify: only completion state, never semantic quality

def _require_all_checked(section: str, label: str) -> None:
    entries = _checkboxes(section)
    if not entries:
        raise ValidationError(f"{label}: no completion checkbox found")

    unchecked = [text for mark, text in entries if mark.lower() != 'x']
    if unchecked:
        raise ValidationError(
            f"{label} not completed:\n" + "\n".join(unchecked)
        )


def check_acceptance_criteria(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as file:
        content = file.read()

    if "### Agent Verification" in content:
        _require_all_checked(
            _section(content, "### Agent Verification"),
            "Agent Verification",
        )


def check_step_completion(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as file:
        content = file.read()

    implementation = _section(content, "## Implementation")
    if not implementation:
        return

    issues: list[str] = []
    for title, body in re.findall(
        TASK_PATTERN, implementation, re.MULTILINE | re.DOTALL
    ):
        done = re.search(DONE_PAT, body, re.MULTILINE | re.DOTALL)
        if not done:
            # Legacy Plans may predate the Done field. Do not turn a format
            # migration into a lifecycle blocker; authoring/review owns format quality.
            continue

        entries = _checkboxes(done.group(1))
        if not entries:
            issues.append(f"Task '{title.strip()}': Done checkbox missing")
        elif any(mark.lower() != 'x' for mark, _ in entries):
            issues.append(f"Task '{title.strip()}': Done not checked")

    if issues:
        raise ValidationError("Task Done not completed:\n" + "\n".join(issues))


# A Plan may legitimately have nothing for the user to inspect: the whole
# behaviour is covered by automated assertions and fixtures. Those Plans say
# so explicitly with N/A instead of inventing a checkbox nobody can judge.
NOT_APPLICABLE_PAT = re.compile(
    r'^[*_`\s]*(?:n\s*/\s*a|not\s+applicable)\b', re.IGNORECASE
)


def _declares_not_applicable(section: str) -> bool:
    """Whether the section opens with an explicit N/A declaration.

    Only an explicit declaration counts — free-form prose still fails the
    gate, so "the user probably won't check this" cannot silently skip UAT.
    """
    for line in section.splitlines():
        text = line.strip().lstrip('-*>').strip()
        if not text:
            continue
        return bool(NOT_APPLICABLE_PAT.match(text))
    return False


def check_user_validation(plan_file: str) -> None:
    with open(plan_file, 'r', encoding='utf-8') as file:
        content = file.read()

    if "### User Validation" in content:
        section = _section(content, "### User Validation")
        if not _checkboxes(section) and _declares_not_applicable(section):
            return
        _require_all_checked(section, "User Validation")
