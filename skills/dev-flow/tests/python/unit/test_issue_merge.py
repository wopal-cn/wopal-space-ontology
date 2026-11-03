#!/usr/bin/env python3
"""Behavior tests for merging duplicate Issues into one primary Issue."""

import argparse
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path

ensure_scripts_path()

from commands.issue import cmd_issue_merge, register_issue_parser


def _issue(number, body="", state="OPEN", labels=None):
    return {
        "number": number,
        "title": f"feat(flow): issue {number}",
        "body": body,
        "state": state,
        "labels": [{"name": label} for label in (labels or [])],
    }


def _args(target="10", sources=None):
    return argparse.Namespace(into=target, issues=sources or ["11", "12"])


def _ok():
    result = MagicMock()
    result.returncode = 0
    result.stdout = ""
    result.stderr = ""
    return result


def test_issue_merge_records_both_sides_and_closes_sources_not_planned():
    infos = {
        "10": _issue(10, "## Goal\n\nPrimary\n"),
        "11": _issue(11, "## Goal\n\nDuplicate A\n", labels=["status/planning"]),
        "12": _issue(12, "## Goal\n\nDuplicate B\n", labels=["status/planning"]),
    }

    with patch("commands.issue.find_workspace_root", return_value="/workspace"):
        with patch("commands.issue.detect_space_repo", return_value="example/repo"):
            with patch("commands.issue.get_issue_info", side_effect=lambda number, repo: infos[str(number)]):
                with patch("commands.issue.subprocess.run", return_value=_ok()) as run:
                    assert cmd_issue_merge(_args()) == 0

    commands = [call.args[0] for call in run.call_args_list]
    edit_commands = [
        command for command in commands
        if command[:3] == ["gh", "issue", "edit"] and "--body" in command
    ]
    status_commands = [
        command for command in commands
        if command[:3] == ["gh", "issue", "edit"] and "--remove-label" in command
    ]
    close_commands = [command for command in commands if command[:3] == ["gh", "issue", "close"]]

    target_edit = next(command for command in edit_commands if command[3] == "10")
    target_body = target_edit[target_edit.index("--body") + 1]
    assert "Merged from: #11" in target_body
    assert "Merged from: #12" in target_body

    source_11 = next(command for command in edit_commands if command[3] == "11")
    source_body = source_11[source_11.index("--body") + 1]
    assert "Merged into: #10" in source_body

    assert len(close_commands) == 2
    assert all(command[-2:] == ["--reason", "not planned"] for command in close_commands)
    assert len(status_commands) == 2
    assert all("status/planning" in command for command in status_commands)


def test_issue_merge_is_idempotent_for_existing_relationship_and_closed_source():
    infos = {
        "10": _issue(10, "## Merge History\n\n- Merged from: #11\n"),
        "11": _issue(11, "## Merge History\n\n- Merged into: #10\n", state="CLOSED"),
    }

    with patch("commands.issue.find_workspace_root", return_value="/workspace"):
        with patch("commands.issue.detect_space_repo", return_value="example/repo"):
            with patch("commands.issue.get_issue_info", side_effect=lambda number, repo: infos[str(number)]):
                with patch("commands.issue.subprocess.run", return_value=_ok()) as run:
                    assert cmd_issue_merge(_args(sources=["11", "11"])) == 0

    assert run.call_count == 0


def test_issue_merge_rejects_source_that_is_the_target_before_writes():
    with patch("commands.issue.find_workspace_root", return_value="/workspace"):
        with patch("commands.issue.detect_space_repo", return_value="example/repo"):
            with patch("commands.issue.get_issue_info") as get_info:
                with patch("commands.issue.subprocess.run") as run:
                    assert cmd_issue_merge(_args(sources=["10"])) == 1

    get_info.assert_not_called()
    run.assert_not_called()


def test_issue_merge_rejects_source_already_merged_elsewhere_before_writes():
    infos = {
        "10": _issue(10),
        "11": _issue(11, "## Merge History\n\n- Merged into: #9\n"),
    }

    with patch("commands.issue.find_workspace_root", return_value="/workspace"):
        with patch("commands.issue.detect_space_repo", return_value="example/repo"):
            with patch("commands.issue.get_issue_info", side_effect=lambda number, repo: infos[str(number)]):
                with patch("commands.issue.subprocess.run") as run:
                    assert cmd_issue_merge(_args(sources=["11"])) == 1

    run.assert_not_called()


def test_issue_merge_stops_if_status_label_cleanup_fails_before_close():
    infos = {
        "10": _issue(10, "## Goal\n\nPrimary\n"),
        "11": _issue(11, "## Goal\n\nDuplicate\n"),
    }

    with patch("commands.issue.find_workspace_root", return_value="/workspace"):
        with patch("commands.issue.detect_space_repo", return_value="example/repo"):
            with patch("commands.issue.get_issue_info", side_effect=lambda number, repo: infos[str(number)]):
                with patch("commands.issue.remove_status_labels", return_value=False):
                    with patch("commands.issue.subprocess.run", return_value=_ok()) as run:
                        assert cmd_issue_merge(_args(sources=["11"])) == 1

    commands = [call.args[0] for call in run.call_args_list]
    assert not any(command[:3] == ["gh", "issue", "close"] for command in commands)


def test_issue_merge_parser_accepts_into_and_multiple_sources():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    register_issue_parser(subparsers)

    args = parser.parse_args(["issue", "merge", "--into", "#10", "#11", "12"])

    assert args.into == "#10"
    assert args.issues == ["#11", "12"]
