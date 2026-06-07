#!/usr/bin/env python3
# submit.py - Submit command for dev-flow
#
# Transitions Plan from planning → reviewing, commits and pushes,
# then prompts user to run approve --confirm.
#
# Command: flow.sh submit <plan>
#
# Flow:
#   1. Find Plan file (by issue number OR plan name)
#   2. Guard status is "planning"
#   3. Run check_doc validation
#   4. Update Plan status to "reviewing"
#   5. Commit and push
#   6. Print "Next: flow.sh approve <plan> --confirm"

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from lib.logging import log_info, log_success, log_error, log_step
from lib.workspace import find_workspace_root
from workflow import update_plan_status, parse_plan_status, STATUS_PLANNING
from plan import find_plan, get_plan_issue, get_plan_status
from validation import check_doc_plan, ValidationError
from lib.plan_commit import commit_and_push_plan


def cmd_submit(args: argparse.Namespace) -> int:
    """Submit Plan for review: planning → reviewing.

    Returns:
        0 on success, 1 on error
    """
    input_ref = args.target

    if not input_ref:
        log_error("Issue number or Plan name required")
        log_error("Usage: flow.sh submit <issue-or-plan>")
        return 1

    workspace_root = find_workspace_root()

    # 1. Find Plan file
    try:
        plan_path = find_plan(input_ref, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1

    log_info(f"Found plan: {plan_path}")

    plan_name = Path(plan_path).stem

    # 2. Guard status is "planning"
    current_status = parse_plan_status(plan_path)

    if not current_status:
        current_status = get_plan_status(plan_path)

    if current_status != STATUS_PLANNING:
        log_error(f"Plan must be in planning state to submit (current: {current_status})")
        log_error("")

        if current_status == "reviewing":
            log_error("Plan already submitted. Next: flow.sh approve <plan> --confirm")
        elif current_status == "executing":
            log_error("Plan already approved. Next: flow.sh complete <plan>")
        elif current_status == "verifying":
            log_error("Plan awaiting verification. Next: flow.sh verify <plan> --confirm")
        elif current_status == "done":
            log_error("Plan already archived.")
        else:
            log_error("Unknown status. Check plan file.")

        return 1

    # 3. Run check_doc validation
    try:
        check_doc_plan(plan_path)
    except ValidationError as e:
        log_error("Plan failed check-doc validation")
        print(str(e))
        log_error(f"Fix the issues and retry: flow.sh submit {input_ref}")
        return 1

    # 4. Extract Issue number (if plan has Issue link)
    issue_number = get_plan_issue(plan_path)

    # 5. Update Plan status to reviewing
    log_step("Transitioning state: planning -> reviewing")

    if not update_plan_status(plan_path, "reviewing"):
        log_error("Failed to update Plan status")
        return 1

    log_success("Plan status updated to: reviewing")

    # 6. Commit and push
    if not commit_and_push_plan(plan_path, issue_number, workspace_root, message_prefix="submit"):
        log_error("Failed to commit/push Plan")
        return 1

    # Output confirmation
    print("Status: reviewing")
    if issue_number:
        print(f"Issue: #{issue_number}")

    next_ref = str(issue_number) if issue_number else plan_name
    print("")
    print(f"Next: flow.sh approve {next_ref} --confirm")

    return 0


# ============================================
# argparse registration
# ============================================

def register_submit_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register submit subcommand."""
    submit_parser = subparsers.add_parser(
        "submit",
        help="Submit Plan for review (planning → reviewing)",
    )
    submit_parser.add_argument(
        "target",
        nargs="?",
        help="Issue number or Plan name",
    )
