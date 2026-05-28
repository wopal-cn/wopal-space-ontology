"""Flow CLI — Python entry point for dev-flow.

Phase 0 skeleton: only provides --help and version; all subcommands
will be dispatched here in later phases by switching the hybrid router.
"""

from __future__ import annotations

import argparse
import sys

__version__ = "0.1.0"

from commands.issue import register_issue_parser, cmd_issue
from commands.query import cmd_query_status, cmd_query_list
from commands.sync import register_sync_parser, cmd_sync
from commands.archive import register_archive_parser, cmd_archive
from commands.approve import register_approve_parser, cmd_approve
from commands.complete import register_complete_parser, cmd_complete
from commands.verify import register_verify_parser, cmd_verify
from commands.plan import register_plan_parser, cmd_plan
from commands.decompose import register_decompose_parser, cmd_decompose
from commands.roadmap import register_roadmap_parser, cmd_roadmap
from commands.reset import register_reset_parser, cmd_reset
from commands.verify_switch import run_verify_switch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="flow.py",
        description="Dev-flow CLI (Python implementation)",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    subparsers = parser.add_subparsers(dest="command")

    # Help subcommand with detailed output
    help_parser = subparsers.add_parser("help", help="Show help")

    # Register issue subcommand
    register_issue_parser(subparsers)

    # Register sync subcommand
    register_sync_parser(subparsers)

    # Register archive subcommand
    register_archive_parser(subparsers)

    # Register approve subcommand
    register_approve_parser(subparsers)

    # Register complete subcommand
    register_complete_parser(subparsers)

    # Register verify subcommand
    register_verify_parser(subparsers)

    # Register plan subcommand
    register_plan_parser(subparsers)

    # Register decompose-prd subcommand (top-level alias)
    register_decompose_parser(subparsers)

    # Register roadmap subcommand
    register_roadmap_parser(subparsers)

    # Register reset subcommand
    register_reset_parser(subparsers)

    # Register status as top-level command
    status_parser = subparsers.add_parser("status", help="Show Issue/Plan status")
    status_parser.add_argument("target", nargs="?", help="Issue number or Plan name")

    # Register list as top-level command
    list_parser = subparsers.add_parser("list", help="List active Plans")

    # Register verify-switch subcommand
    vs_parser = subparsers.add_parser("verify-switch", help="Switch .wopal/ to feature branch for verification")
    vs_parser.add_argument("issue", help="Issue number or plan name")
    vs_parser.add_argument("--merge", action="store_true", help="Phase 2: merge feature branch back to main")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "help" or args.command is None:
        # Print detailed help with all subcommands and their nested commands
        parser.print_help()
        print()
        print("Available subcommands:")
        print("  issue create    Create a new GitHub Issue")
        print("  issue update    Update an existing GitHub Issue")
        print("  status          Show Issue/Plan status")
        print("  list            List active Plans")
        print("  sync            Sync Plan to Issue (body + labels)")
        print("  sync --body-only    Sync only Issue body")
        print("  sync --labels-only  Sync only Issue labels")
        print("")
        print("Workflow commands:")
        print("  plan            Create or locate a Plan")
        print("  approve         Review and approve a Plan")
        print("  complete        Mark implementation complete")
        print("  verify          Verify and confirm completion")
        print("  verify-switch   Switch .wopal/ for worktree verification")
        print("  archive         Archive a completed Plan")
        print("")
        print("Utility commands:")
        print("  decompose-prd   Create Issues from PRD phases")
        print("  decompose       Create Issues from PRD or ROADMAP.md slices")
        print("  roadmap         Product phase roadmap (Analyze/Discuss/Produce/Decompose)")
        print("  reset           Reset Plan to planning status")
        print("  query           Low-level data queries")
        print("")
        print("For detailed options: flow.sh <command> --help")
        return 0

    # Dispatch issue subcommand
    if args.command == "issue":
        return cmd_issue(args)

    # Dispatch sync subcommand
    if args.command == "sync":
        return cmd_sync(args)

    # Dispatch archive subcommand
    if args.command == "archive":
        return cmd_archive(args)

    # Dispatch approve subcommand
    if args.command == "approve":
        return cmd_approve(args)

    # Dispatch complete subcommand
    if args.command == "complete":
        return cmd_complete(args)

    # Dispatch verify subcommand
    if args.command == "verify":
        return cmd_verify(args)

    # Dispatch plan subcommand
    if args.command == "plan":
        return cmd_plan(args)

    # Dispatch decompose-prd / decompose subcommand
    if args.command in ("decompose-prd", "decompose"):
        return cmd_decompose(args)

    # Dispatch roadmap subcommand
    if args.command == "roadmap":
        return cmd_roadmap(args)

    # Dispatch reset subcommand
    if args.command == "reset":
        return cmd_reset(args)

    # Dispatch status as top-level command
    if args.command == "status":
        return cmd_query_status(args)

    # Dispatch list as top-level command
    if args.command == "list":
        return cmd_query_list(args)

    # Dispatch verify-switch
    if args.command == "verify-switch":
        return 0 if run_verify_switch(args.issue, merge=args.merge) else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())