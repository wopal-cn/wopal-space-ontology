#!/usr/bin/env python3
"""Formal Delivery integration for dev-flow.

The formal title is data owned by the approved Plan. This module consumes the
Plan field verbatim; it never synthesizes or decorates the delivery subject.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from lib.git import (
    GitMutationFailure,
    commit_exists,
    commit_paths,
    fast_forward_from_remote,
    get_branch_head,
    get_commit_subject,
    has_uncommitted_changes,
    integrate_branch,
    is_ancestor,
    paths_have_changes,
)
from lib.github import merge_pull_request
from lib.logging import log_error, log_info, log_success
from lib.project import resolve_plan_location
from lib.workspace import find_workspace_root
from plan import (
    find_plan,
    get_plan_field,
    get_plan_project,
    get_plan_worktree,
    resolve_project_path,
    set_plan_field,
)
from workflow import parse_plan_status


def integrate_local_delivery(
    repo: str | Path,
    *,
    integration_branch: str,
    work_branch: str,
    delivery_base: str,
    strategy: str,
    commit_subject: str,
) -> str:
    """Integrate one validated work branch into its formal branch.

    `commit_subject` is passed directly to Git. Empty values are refused; no
    fallback subject exists on this formal-delivery path.
    """
    repo_path = Path(repo)
    if not commit_subject or not commit_subject.strip():
        raise ValueError("Commit Subject is required for formal integration")
    if strategy not in ("squash", "preserve-history"):
        raise ValueError(f"Unsupported Integration Strategy: {strategy}")
    if not integration_branch or not work_branch or not delivery_base:
        raise ValueError(
            "Integration Branch, Work Branch, and Delivery Base Commit are required"
        )

    if has_uncommitted_changes(str(repo_path)):
        raise RuntimeError("Integration repository has uncommitted changes")
    result = integrate_branch(
        str(repo_path),
        integration_branch=integration_branch,
        work_branch=work_branch,
        delivery_base=delivery_base,
        strategy=strategy,
        commit_subject=commit_subject,
    )
    if not result:
        raise RuntimeError(str(result))
    return result


def integrate_pr_delivery(
    repo: str | Path,
    *,
    pr_url: str,
    integration_branch: str,
    strategy: str,
    commit_subject: str,
) -> str:
    """Merge the Delivery PR with the approved subject, then refresh local base."""
    repo_path = Path(repo)
    if not commit_subject or not commit_subject.strip():
        raise ValueError("Commit Subject is required for formal PR integration")
    if strategy not in ("squash", "preserve-history"):
        raise ValueError(f"Unsupported Integration Strategy: {strategy}")
    if has_uncommitted_changes(str(repo_path)):
        raise RuntimeError("Integration repository has uncommitted changes")
    merged, error = merge_pull_request(
        str(repo_path),
        pr_url,
        strategy=strategy,
        subject=commit_subject,
    )
    if not merged:
        raise RuntimeError(f"PR integration failed: {error}")
    result = fast_forward_from_remote(str(repo_path), integration_branch)
    if not result:
        raise RuntimeError(str(result))
    return result


_SHARED_FIELDS = (
    "Commit Subject",
    "Integration Strategy",
    "Integration Branch",
    "Work Branch",
    "Delivery Base Commit",
)


def _is_unset(value: str) -> bool:
    value = (value or "").strip()
    return (
        not value
        or value in {"(none)", "N/A", "none"}
        or (value.startswith("<") and value.endswith(">"))
        or "recorded automatically" in value
    )


def _active_plan_paths(workspace_root: Path) -> list[Path]:
    plans_root = workspace_root / ".wopal-space" / "plans"
    if not plans_root.exists():
        return []
    return sorted(
        path
        for path in plans_root.rglob("*.md")
        if "done" not in path.relative_to(plans_root).parts
    )


def _resolve_owner_plan(
    current_plan: Path, delivery: str, workspace_root: Path
) -> Path:
    if current_plan.stem == delivery:
        return current_plan
    for candidate in _active_plan_paths(workspace_root):
        if candidate.stem == delivery:
            return candidate
    return Path(find_plan(delivery, str(workspace_root)))


def _delivery_members(
    owner_plan: Path, delivery: str, workspace_root: Path
) -> list[Path]:
    members: list[Path] = []
    for candidate in _active_plan_paths(workspace_root):
        candidate_delivery = get_plan_field(str(candidate), "Delivery")
        if candidate.stem == delivery or candidate_delivery == delivery:
            members.append(candidate)
    if owner_plan not in members:
        members.append(owner_plan)
    return sorted(set(members))


def _commit_plan_records(
    plan_paths: list[Path], workspace_root: Path, delivery: str
) -> bool:
    """Commit only the Delivery Plan records, grouped by their owning repo."""
    groups: dict[Path, list[str]] = {}
    for plan_path in plan_paths:
        location = resolve_plan_location(plan_path, workspace_root)
        groups.setdefault(location.repo_root, []).append(location.repo_relative_path)

    for repo_root, rel_paths in groups.items():
        unique_paths = sorted(set(rel_paths))
        changes = paths_have_changes(str(repo_root), unique_paths)
        if isinstance(changes, GitMutationFailure):
            log_error(
                "Formal code integration succeeded, but Delivery Plan record "
                "status could not be verified:"
            )
            log_error(str(changes))
            return False
        if not changes:
            continue
        result = commit_paths(
            str(repo_root),
            unique_paths,
            f"docs(plan): integrate delivery {delivery}",
        )
        if not result:
            log_error("Formal code integration succeeded, but Delivery Plan record commit failed:")
            log_error(str(result))
            return False
    return True


def _recorded_integration_valid(
    repo: Path,
    *,
    integration_branch: str,
    integration_commit: str,
    commit_subject: str,
) -> bool:
    """Check a previously recorded formal commit before retry/no-op handling."""
    if not commit_exists(str(repo), integration_commit):
        return False
    if not is_ancestor(str(repo), integration_commit, integration_branch):
        return False
    return get_commit_subject(str(repo), integration_commit) == commit_subject


def _delivery_pr_url(members: list[Path]) -> tuple[str, str]:
    """Resolve one PR identity for the Delivery, regardless of member owner."""
    urls = {
        value
        for member in members
        if not _is_unset(value := get_plan_field(str(member), "PR"))
    }
    if len(urls) > 1:
        return "", "Delivery members record different PR URLs; refusing integration"
    return (next(iter(urls)) if urls else ""), ""


def _dirty_delivery_worktree(
    members: list[Path], workspace_root: Path
) -> Path | None:
    """Return the first still-present dirty Delivery worktree, if any."""
    seen: set[Path] = set()
    for member in members:
        metadata = get_plan_worktree(str(member))
        if not metadata or _is_unset(metadata.get("path", "")):
            continue
        worktree = Path(metadata["path"])
        if not worktree.is_absolute():
            worktree = workspace_root / worktree
        worktree = worktree.resolve()
        if worktree in seen or not worktree.exists():
            continue
        seen.add(worktree)
        if not worktree.is_dir() or has_uncommitted_changes(str(worktree)):
            return worktree
    return None


def _validate_delivery_contract(
    members: list[Path], owner_plan: Path, delivery: str
) -> tuple[dict[str, str] | None, str]:
    """Validate shared fields and verifying state before any Git mutation."""
    owner_values = {field: get_plan_field(str(owner_plan), field) for field in _SHARED_FIELDS}
    for field, value in owner_values.items():
        if _is_unset(value):
            return None, f"Delivery owner is missing required field '{field}'"

    if owner_values["Integration Strategy"] not in ("squash", "preserve-history"):
        return None, "Integration Strategy must be squash or preserve-history"

    for member in members:
        status = parse_plan_status(str(member))
        if status != "verifying":
            return None, f"Delivery member {member.stem} must be verifying (current: {status})"
        member_delivery = get_plan_field(str(member), "Delivery")
        if member.stem != delivery and member_delivery != delivery:
            return None, f"Delivery member {member.stem} does not name owner {delivery}"
        for field, owner_value in owner_values.items():
            member_value = get_plan_field(str(member), field)
            if member_value != owner_value:
                return (
                    None,
                    f"Delivery member {member.stem} has mismatched {field}: "
                    f"'{member_value}' != '{owner_value}'",
                )
    return owner_values, ""


def _record_delivery_commits(
    members: list[Path],
    owner_plan: Path,
    verification_commit: str,
    integration_commit: str,
    pr_url: str = "",
) -> bool:
    if not set_plan_field(str(owner_plan), "Integration Commit", integration_commit):
        return False
    for member in members:
        if not set_plan_field(str(member), "Verification Commit", verification_commit):
            return False
        if pr_url and not set_plan_field(str(member), "PR", pr_url):
            return False
    return True


def cmd_integrate(args: argparse.Namespace) -> int:
    """Integrate one validated Delivery and persist its commit identities."""
    target = getattr(args, "target", None)
    if not target:
        log_error("Missing issue number or plan name")
        return 1
    if not getattr(args, "confirm", False):
        log_error("integrate requires --confirm")
        return 1

    workspace_root = Path(find_workspace_root())
    try:
        current_plan = Path(find_plan(target, str(workspace_root)))
    except FileNotFoundError:
        log_error(f"No plan found for: {target}")
        return 1

    delivery = get_plan_field(str(current_plan), "Delivery") or current_plan.stem
    if _is_unset(delivery):
        delivery = current_plan.stem

    try:
        owner_plan = _resolve_owner_plan(current_plan, delivery, workspace_root)
    except FileNotFoundError:
        log_error(f"Delivery owner Plan not found: {delivery}")
        return 1
    members = _delivery_members(owner_plan, delivery, workspace_root)
    if current_plan not in members:
        members.append(current_plan)

    values, error = _validate_delivery_contract(members, owner_plan, delivery)
    if values is None:
        log_error(error)
        return 1

    project = get_plan_project(str(owner_plan))
    project_path = resolve_project_path(
        str(owner_plan), project, workspace_root
    ) if project else None
    if not project_path:
        log_error(f"Cannot resolve project path for Delivery owner: {delivery}")
        return 1

    # No formal integration may start from a dirty project checkout. If the
    # worktree still exists, it must be clean as well.
    if has_uncommitted_changes(str(project_path)):
        log_error(f"Integration repository has uncommitted changes: {project_path}")
        return 1
    dirty_worktree = _dirty_delivery_worktree(members, workspace_root)
    if dirty_worktree is not None:
        log_error(f"Delivery worktree has uncommitted changes: {dirty_worktree}")
        return 1

    pr_url, pr_error = _delivery_pr_url(members)
    if pr_error:
        log_error(pr_error)
        return 1

    work_branch = values["Work Branch"]
    integration_branch = values["Integration Branch"]
    delivery_base = values["Delivery Base Commit"]
    strategy = values["Integration Strategy"]
    commit_subject = values["Commit Subject"]

    try:
        verification_commit = get_branch_head(str(project_path), work_branch)
        if not verification_commit:
            raise RuntimeError(f"Work Branch does not exist: {work_branch}")
        if not is_ancestor(str(project_path), delivery_base, work_branch):
            raise RuntimeError("Delivery Base Commit is not an ancestor of Work Branch")
        if not is_ancestor(str(project_path), delivery_base, integration_branch):
            raise RuntimeError(
                "Delivery Base Commit is not an ancestor of Integration Branch"
            )

        # Retry/no-op path: a previous run may already have integrated the
        # code and written the record fields but failed while committing those
        # Plan files. Never create a second formal commit in that case.
        recorded_integration = get_plan_field(str(owner_plan), "Integration Commit")
        recorded_verifications = [
            get_plan_field(str(member), "Verification Commit") for member in members
        ]
        if not _is_unset(recorded_integration):
            if any(_is_unset(value) for value in recorded_verifications):
                log_error(
                    "Delivery is already integrated but its member records are incomplete; "
                    "refusing a second formal integration"
                )
                return 1
            if len(set(recorded_verifications)) != 1:
                log_error("Delivery members disagree on Verification Commit")
                return 1
            recorded_verification = recorded_verifications[0]
            if verification_commit != recorded_verification:
                log_error(
                    "Work Branch advanced after formal integration; "
                    "this Delivery is closed to further changes"
                )
                return 1
            if not _recorded_integration_valid(
                Path(project_path),
                integration_branch=integration_branch,
                integration_commit=recorded_integration,
                commit_subject=commit_subject,
            ):
                log_error("Recorded Integration Commit is invalid; refusing retry")
                return 1
            if not _record_delivery_commits(
                members,
                owner_plan,
                recorded_verification,
                recorded_integration,
                pr_url=pr_url,
            ):
                log_error("Failed to restore Delivery commit records")
                return 1
            if not _commit_plan_records(members, workspace_root, delivery):
                return 1
            log_success(f"Delivery already integrated: {delivery}")
            log_info(f"Verification Commit: {recorded_verification}")
            log_info(f"Integration Commit: {recorded_integration}")
            return 0

        if pr_url:
            integration_commit = integrate_pr_delivery(
                project_path,
                pr_url=pr_url,
                integration_branch=integration_branch,
                strategy=strategy,
                commit_subject=commit_subject,
            )
        else:
            integration_commit = integrate_local_delivery(
                project_path,
                integration_branch=integration_branch,
                work_branch=work_branch,
                delivery_base=delivery_base,
                strategy=strategy,
                commit_subject=commit_subject,
            )
    except (RuntimeError, ValueError) as exc:
        log_error(str(exc))
        return 1

    if not _record_delivery_commits(
        members,
        owner_plan,
        verification_commit,
        integration_commit,
        pr_url=pr_url,
    ):
        log_error("Failed to write Verification Commit / Integration Commit to Delivery Plans")
        return 1
    if not _commit_plan_records(members, workspace_root, delivery):
        return 1

    log_success(f"Delivery integrated: {delivery}")
    log_info(f"Verification Commit: {verification_commit}")
    log_info(f"Integration Commit: {integration_commit}")
    return 0


def register_integrate_parser(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "integrate", help="Integrate a validated Delivery into its formal branch"
    )
    parser.add_argument("target", nargs="?", help="Issue number or Plan name")
    parser.add_argument(
        "--confirm",
        action="store_true",
        default=False,
        help="Confirm formal Delivery integration",
    )
