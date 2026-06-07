#!/usr/bin/env python3
# workflow.py - Plan workflow state machine and display for dev-flow
#
# Merged from:
#   core/workflow.py - status constants and guard helpers
#   domain/workflow.py - state machine (states, transitions, validation)
#   core/status.py - plan status update
#
# Provides:
#   Constants: PLAN_STATES, STATUS_PLANNING, STATUS_REVIEWING, STATUS_EXECUTING, STATUS_VERIFYING, STATUS_DONE
#   State machine: is_valid_state, is_valid_transition, get_next_state,
#                   parse_plan_status, get_state_order, get_status_display,
#                   plan_status_to_issue_label
#   Status update: update_plan_status
#   Guard helpers: guard_status, format_suggestion, resolve_space_repo

from __future__ import annotations

import re
from pathlib import Path

from lib.logging import log_error, log_warn
from lib.workspace import detect_space_repo


# ============================================
# Status Constants
# ============================================

STATUS_PLANNING = "planning"
STATUS_REVIEWING = "reviewing"
STATUS_EXECUTING = "executing"
STATUS_VERIFYING = "verifying"
STATUS_DONE = "done"

# Valid Plan states in order
PLAN_STATES = [STATUS_PLANNING, STATUS_REVIEWING, STATUS_EXECUTING, STATUS_VERIFYING, STATUS_DONE]

# Valid state transitions (from_state -> to_state)
VALID_TRANSITIONS = {
    (None, STATUS_PLANNING),          # Initial state
    (STATUS_PLANNING, STATUS_REVIEWING),    # submit
    (STATUS_REVIEWING, STATUS_EXECUTING),   # approve --confirm
    (STATUS_PLANNING, STATUS_EXECUTING),    # approve --confirm (shortcut)
    (STATUS_EXECUTING, STATUS_VERIFYING),   # complete
    (STATUS_VERIFYING, STATUS_DONE),        # verify --confirm
}


# ============================================
# State Machine (from domain/workflow.py)
# ============================================

def is_valid_state(state: str) -> bool:
    """Check if state is a valid Plan status."""
    return state in PLAN_STATES


def is_valid_transition(from_state: str | None, to_state: str) -> bool:
    """Check if state transition is valid.

    Same state is always allowed (no-op).
    Any state can reset to planning.
    """
    if from_state == to_state:
        return True

    if to_state == STATUS_PLANNING:
        return True

    return (from_state, to_state) in VALID_TRANSITIONS


def get_next_state(command: str) -> str | None:
    """Get next state based on command."""
    command_state_map = {
        "plan": STATUS_PLANNING,
        "submit": STATUS_REVIEWING,
        "approve": STATUS_EXECUTING,
        "complete": STATUS_VERIFYING,
        "verify": STATUS_DONE,
        "archive": None,
    }

    return command_state_map.get(command)


def parse_plan_status(plan_path: str) -> str | None:
    """Parse current status from Plan file.

    Reads the "- **Status**: <state>" line from Plan frontmatter.
    """
    path = Path(plan_path)
    if not path.exists():
        return None

    content = path.read_text()

    match = re.search(r"^\- \*\*Status\*\*:\s*(\w+)", content, re.MULTILINE)

    if not match:
        return None

    status = match.group(1)

    if is_valid_state(status):
        return status

    return None


def get_state_order(state: str) -> int:
    """Get order number for state (1-5)."""
    try:
        return PLAN_STATES.index(state) + 1
    except ValueError:
        return 0


def get_status_display(state: str) -> dict:
    """Get display info for a status."""
    state_info = {
        "planning": {"order": 1, "name": "planning", "emoji": "P"},
        "reviewing": {"order": 2, "name": "reviewing", "emoji": "R"},
        "executing": {"order": 3, "name": "executing", "emoji": "E"},
        "verifying": {"order": 4, "name": "verifying", "emoji": "V"},
        "done": {"order": 5, "name": "done", "emoji": "D"},
    }

    return state_info.get(state, {"order": 0, "name": "unknown", "emoji": "?"})


def plan_status_to_issue_label(status: str) -> str | None:
    """Map Plan status to Issue label."""
    label_map = {
        "planning": "status/planning",
        "reviewing": "status/planning",
        "executing": "status/in-progress",
        "verifying": "status/verifying",
        "done": None,
    }

    return label_map.get(status)


# ============================================
# Status Update (from core/status.py)
# ============================================

def update_plan_status(plan_path: str | Path, new_status: str) -> bool:
    """Update Plan file's first Status line in Metadata section.
    
    Finds and replaces the first occurrence of `- **Status**: <value>`
    in the plan file.
    """
    path = Path(plan_path)
    
    if not path.exists():
        return False
    
    content = path.read_text()
    
    new_content = re.sub(
        r'^\- \*\*Status\*\*:\s*\w+',
        f'- **Status**: {new_status}',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    
    if new_content == content:
        return False
    
    path.write_text(new_content)
    return True


# ============================================
# Guard Helpers (from core/workflow.py)
# ============================================

_STATUS_COMMANDS = {
    "reviewing": {
        "planning": "submit",
    },
    "executing": {
        "planning": "approve --confirm",
        "reviewing": "approve --confirm",
        "verifying": "verify --confirm",
        "done": "archive",
    },
    "verifying": {
        "planning": "approve --confirm",
        "reviewing": "approve --confirm",
        "executing": "complete",
        "done": "archive",
    },
    "done": {
        "planning": "approve --confirm",
        "reviewing": "approve --confirm",
        "executing": "complete",
        "verifying": "verify --confirm",
    },
}


def guard_status(
    current_status: str,
    expected_status: str,
    input_ref: str,
) -> bool:
    """Check if plan status matches expected status; print error if not.

    Returns True if status matches, False otherwise.
    """
    if current_status == expected_status:
        return True

    log_error(f"Plan must be in {expected_status} state (current: {current_status})")
    log_error("")

    suggestion = format_suggestion(current_status, expected_status, input_ref)
    log_error(suggestion)

    return False


def format_suggestion(
    current_status: str,
    expected_status: str,
    input_ref: str,
) -> str:
    """Format next-step suggestion for wrong-status scenarios."""
    status_commands = _STATUS_COMMANDS.get(expected_status, {})
    command = status_commands.get(current_status)

    if command:
        return f"Run: flow.sh {command} {input_ref}"

    return "Check plan status"


def resolve_space_repo(
    issue: int | str | None,
    workspace_root: Path,
) -> str:
    """Resolve space repo with issue-aware fallback.

    Returns owner/repo string if resolvable, empty string otherwise.
    """
    if not issue:
        return ""

    try:
        return detect_space_repo(workspace_root)
    except Exception as e:
        log_warn(f"Cannot determine space repo, skipping Issue sync: {e}")
        return ""
