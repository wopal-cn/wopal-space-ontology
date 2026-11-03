#!/usr/bin/env python3
# plan.py - Plan command for dev-flow
#
# Ported from scripts/cmd/plan.sh
#
# Commands:
#   plan <issue> [--project <name>] [--check]
#   plan --title "<title>" --project <name> --type <type> [--slug <slug>] [--check]
#   plan new <issue> [--project <name>]
#   plan status <plan-id>
#   plan list [--issue]
#
# Flow (Issue mode):
#   1. Check if Plan already exists (find_plan_by_issue)
#   2. Get Issue info from GitHub
#   3. Extract title and project from Issue
#   4. Generate plan name (make_plan_name)
#   5. Create plan file from template
#   6. Fill metadata (Issue, Type, Target Project, Created)
#   7. Output Plan file path
#
# Flow (no-issue mode):
#   1. Validate --project, --type, --slug required
#   2. Generate plan name: <type>-<slug> (slug is always explicit)
#   4. Create plan file from template (no Issue metadata)
#   5. Output Plan file path
#
# --check mode:
#   1. Find Plan (by Issue or by name)
#   2. Call check_doc_plan validation
#   3. Output validation result

from __future__ import annotations

import argparse
import subprocess
import json
import re
from pathlib import Path
from datetime import date

from plan import find_plan, find_plan_by_issue, find_plan_by_name
from lib.project import AmbiguousPlanError
from plan import make_plan_name
from plan import ValidationError as NamingValidationError
from plan import get_plan_status
from issue import ensure_label_exists, sync_project_label_group, sync_status_label_group
from labels import normalize_plan_type
from labels import ValidationError as LabelsValidationError
from workflow import PLAN_STATES
from validation import check_doc_plan
from validation import ValidationError as CheckDocValidationError
from lib.logging import log_info, log_success, log_error, log_warn, log_step
from lib.workspace import find_workspace_root, detect_space_repo
from lib import project as _project_resolver
from lib.worktree import parse_worktree_meta


# ============================================
# Helpers
# ============================================


def _get_issue_info(issue_number: int, repo: str) -> dict:
    """Get Issue info from GitHub."""
    result = subprocess.run(
        ["gh", "issue", "view", str(issue_number), "--repo", repo,
         "--json", "title,body,number,state,labels"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to get issue #{issue_number}")
        raise RuntimeError("gh issue view failed")
    
    return json.loads(result.stdout)


def _extract_projects_from_labels(issue_info: dict) -> list[str]:
    """Extract all distinct project names from an Issue, preserving order."""
    projects: list[str] = []
    for label in issue_info.get("labels", []):
        name = label.get("name", "")
        if not name.startswith("project/"):
            continue
        project = name[8:]
        if project and project not in projects:
            projects.append(project)
    return projects


def _select_issue_project(issue_number: int, issue_info: dict, explicit: str | None) -> str:
    """Resolve the one project a normal Plan will implement in."""
    if explicit:
        return explicit

    projects = _extract_projects_from_labels(issue_info)
    if len(projects) == 1:
        return projects[0]
    if not projects:
        raise ValueError(
            f"Issue #{issue_number} has no project label; pass --project <name> "
            "to choose this Plan's implementation project"
        )
    raise ValueError(
        f"Issue #{issue_number} has multiple project labels "
        f"({', '.join(projects)}); pass --project <name> to choose this Plan's project"
    )


def _extract_body_field(body: str, field_name: str) -> str | None:
    """Extract a metadata field value from an Issue body.

    Pattern: ``- **<field_name>**: <value>``
    Returns the value string, or None if the field is not present.
    """
    match = re.search(rf'^-\s*\*\*{re.escape(field_name)}\*\*:\s*(.+)$', body, re.MULTILINE)
    return match.group(1).strip() if match else None


def _extract_project_metadata_from_body(issue_info: dict) -> tuple[str | None, str | None]:
    """Extract Project Type and Project Path from Issue body metadata section."""
    body = issue_info.get("body", "")
    if not body:
        return None, None
    return (
        _extract_body_field(body, "Project Type"),
        _extract_body_field(body, "Project Path"),
    )


def _derive_project_path(project: str | None, declared_path: str | None) -> str:
    """Derive Project Path, auto-filling from project name when not declared.

    Standard projects follow the ``projects/<name>`` convention. When the
    Issue body does not declare a Project Path explicitly, we derive it from
    the Target Project so that verify/archive can locate the correct git repo.
    """
    if declared_path:
        return declared_path
    if project:
        return f"projects/{project}"
    return ""


def _extract_product_phase_from_body(issue_info: dict) -> tuple[str | None, str | None]:
    """Extract Product and Phase from Issue body metadata section."""
    body = issue_info.get("body", "")
    if not body:
        return None, None
    return (
        _extract_body_field(body, "Product"),
        _extract_body_field(body, "Phase"),
    )


def _resolve_product_phase(
    cli_product: str | None,
    cli_phase: str | None,
    body_product: str | None,
    body_phase: str | None,
) -> tuple[str | None, str | None]:
    """Merge Product/Phase from CLI flags and the Issue body.

    CLI flags, when given, override body values. The pair is atomic: a
    phase-linked plan declares both; an unlinked plan declares neither.
    A half-declared pair is an error — it cannot be rendered or synced.

    Raises:
        ValueError: when exactly one of the resolved pair is non-empty.
    """
    product = (cli_product or "").strip() or (body_product or "").strip() or None
    phase = (cli_phase or "").strip() or (body_phase or "").strip() or None

    if bool(product) != bool(phase):
        missing = "Phase" if product else "Product"
        raise ValueError(
            f"Product and Phase must be declared together: missing {missing}. "
            "Pass both --product/--phase, or fix the Issue body."
        )
    return product, phase


def _resolve_plan_dir(project: str, workspace_root: Path) -> Path:
    """Resolve Plan directory path.

    Delegates to lib.project.resolve_plan_dir() for canonical path resolution.
    All Plans are written to .wopal-space/plans/<project>/.
    """
    return _project_resolver.resolve_plan_dir(project, workspace_root)


def _print_existing_plan_info(plan_file: str, target_ref: str) -> None:
    """Print existing plan info and next action.
    
    Args:
        plan_file: Path to plan file
        target_ref: Issue number or plan name (used in next action hint)
    """
    current_status = get_plan_status(plan_file)
    
    print(f"Plan: {plan_file}")
    print(f"Status: {current_status}")
    
    status_to_next = {
        "planning": f"Next: flow.sh submit {target_ref}",
        "reviewing": f"Next: flow.sh approve {target_ref} --confirm",
        "executing": f"Next: flow.sh complete {target_ref}",
        "verifying": f"Next: flow.sh verify {target_ref} --confirm",
        "done": f"Next: flow.sh archive {target_ref}",
    }
    
    next_action = status_to_next.get(current_status, "Next: continue from current plan state")
    print(next_action)


# ============================================
# Create Plan from Template
# ============================================

def create_plan_from_template(
    plan_name: str,
    plan_dir: Path,
    issue_number: int | None,
    plan_type: str,
    project: str,
    workspace_root: Path,
    project_path: str | None = None,
    project_type: str | None = None,
    product: str | None = None,
    phase: str | None = None,
) -> Path:
    """Create Plan file from template.
    
    Args:
        plan_name: Plan name (without .md extension)
        plan_dir: Directory to create plan in
        issue_number: Issue number (None for no-issue mode)
        plan_type: Plan type (feature, fix, etc.)
        project: Target project name
        workspace_root: Workspace root path
        project_path: Optional project path override
        project_type: Optional project type label
        product: Optional product name
        phase: Optional phase name
        
    Returns:
        Path to created plan file
    """
    plan_file = plan_dir / f"{plan_name}.md"
    
    if plan_file.exists():
        log_error(f"Plan already exists: {plan_file}")
        raise FileExistsError(f"Plan already exists: {plan_file}")
    
    # Ensure directory exists
    plan_dir.mkdir(parents=True, exist_ok=True)
    
    # Read template
    template_path = workspace_root / ".wopal" / "skills" / "dev-flow" / "templates" / "plan.md"
    
    if not template_path.exists():
        log_error(f"Plan template not found at {template_path}")
        raise FileNotFoundError("Plan template not found")
    
    template_content = template_path.read_text()

    # HTML comments in the template are authoring guidance, not Plan content.
    # Strip them before placeholder replacement so generated Plans contain only
    # the material an author is expected to complete or review.
    template_content = re.sub(r'<!--.*?-->', '', template_content, flags=re.DOTALL)
    
    # Build metadata values (just the value part, not the full line)
    issue_value = f"#{issue_number}" if issue_number else "N/A"
    type_value = plan_type
    project_value = project
    project_path_value = _derive_project_path(project, project_path)
    project_type_value = project_type or ""
    product_value = product or ""
    phase_value = phase or ""

    created_date = date.today().strftime("%Y-%m-%d")
    
    # Replace placeholders (template shows the full markdown format)
    content = template_content.replace("{plan_name}", plan_name)
    content = content.replace("{issue}", issue_value)
    content = content.replace("{type}", type_value)
    content = content.replace("{project}", project_value)
    content = content.replace("{path}", project_path_value)
    content = content.replace("{ptype}", project_type_value)
    content = content.replace("{product}", product_value)
    content = content.replace("{phase}", phase_value)
    content = content.replace("{date}", created_date)
    
    # Remove metadata lines with empty values (optional fields), except
    # Product/Phase which are always kept — an empty value means "not
    # phase-linked". Presence and pair atomicity are gated at submit/approve.
    content = re.sub(
        r'^\s*-\s+\*\*(?!Product\*\*|Phase\*\*)[^*]+\*\*:[ \t]*(?:\n|$)',
        '',
        content,
        flags=re.MULTILINE,
    )

    # Normalize empty Product/Phase values (drop the trailing space)
    content = re.sub(
        r'^(- \*\*(?:Product|Phase)\*\*:)[ \t]+$',
        r'\1',
        content,
        flags=re.MULTILINE,
    )
    
    # Collapse consecutive empty lines
    lines = content.split("\n")
    cleaned_lines = []
    prev_empty = False
    
    for line in lines:
        is_empty = line.strip() == ""
        if is_empty and prev_empty:
            continue
        cleaned_lines.append(line)
        prev_empty = is_empty
    
    content = "\n".join(cleaned_lines)
    
    # Write plan file
    plan_file.write_text(content)
    
    return plan_file


# ============================================
# plan command (subcommand dispatch)
# ============================================

def cmd_plan(args: argparse.Namespace) -> int:
    """Dispatch to plan subcommand: new / status / list / check.

    Subcommands:
      new <issue>|--title TITLE   Create a new Plan
      status <plan-id>            Show Plan status details
      list [--issue]              List active Plans
      check <name-or-path>        Validate Plan against quality gates

    Returns:
        0 on success, 1 on error
    """
    sub = getattr(args, "plan_command", None)

    if sub == "new":
        return _cmd_plan_new(args)
    if sub == "status":
        return _cmd_plan_status(args.plan_id)
    if sub == "list":
        return _cmd_plan_list(args)
    if sub == "check":
        return _cmd_plan_check(args)

    # No subcommand — print usage
    log_error("Missing plan subcommand.")
    print("Usage:")
    print("  flow.sh plan new <issue>")
    print("  flow.sh plan new --project <name> --type <type> --slug <slug> [--title \"<free text>\"] [--product <name> --phase <id>]")
    print("  flow.sh plan status <plan-id>")
    print("  flow.sh plan list [--issue]")
    print("  flow.sh plan check <plan-name-or-path>")
    return 1


def _cmd_plan_new(args: argparse.Namespace) -> int:
    """Create a new Plan from Issue or from --title (no-issue mode).

    Issue mode:    flow.sh plan new <issue-number>
    No-issue mode: flow.sh plan new --project X --type Y --slug S [--title "..."]
    """
    issue_number = None
    if args.issue and re.match(r'^\d+$', args.issue):
        issue_number = int(args.issue)
    title = args.title
    project = args.project
    plan_type_arg = args.type
    slug_arg = getattr(args, 'slug', None)

    # Issue mode is selected by the positional Issue number; no-issue mode by
    # --project. Fail fast before touching git.
    if not issue_number and not project:
        log_error("Either an Issue number or --project is required")
        print("Usage: flow.sh plan new <issue> --type <type> --slug <slug>")
        print("   or: flow.sh plan new --project <name> --type <type> --slug <slug> [--title \"<free text>\"]")
        return 1

    # type and slug are always explicit. The Plan name is <issue?>-<type>-<slug>
    # and is never derived from a title: titles are free-form and long, while a
    # Plan name must stay short because it becomes the branch and worktree name.
    if not plan_type_arg:
        log_error("--type required")
        log_error("Available types: feature, enhance, fix, perf, refactor, docs, chore, test")
        return 1
    if not slug_arg:
        log_error("--slug required")
        log_error("Give a short English kebab-case name for the work, e.g. --slug pr-102")
        return 1

    workspace_root = find_workspace_root()
    repo = detect_space_repo(workspace_root)

    # No-issue mode: --project is the discriminator, --title is optional free
    # text and never feeds the Plan name.
    if not issue_number:
        try:
            plan_type = normalize_plan_type(plan_type_arg)
        except LabelsValidationError as e:
            log_error(str(e))
            log_error("Available types: feature, enhance, fix, perf, refactor, docs, chore, test")
            return 1
    else:
        plan_type = ""

    # Initialize issue context variables (may remain None for no-issue mode)
    issue_product = None
    issue_phase = None
    issue_project_type = None
    issue_project_path = None

    # ========================================
    # Issue mode: locate or create plan from Issue
    # ========================================
    if issue_number:
        try:
            plan_file = find_plan_by_issue(issue_number, str(workspace_root))
            _print_existing_plan_info(plan_file, str(issue_number))
            return 0
        except AmbiguousPlanError as e:
            log_error(str(e))
            print(
                "Resolve it with the Plan name instead of creating another Plan:\n"
                "  flow.sh plan status <plan-name>"
            )
            return 1
        except FileNotFoundError:
            # No existing plan, proceed to create
            pass

    # ========================================
    # Create new plan
    # ========================================
    if issue_number:
        # Issue mode: fetch info from Issue
        log_info(f"Fetching Issue #{issue_number}")
        issue_info = _get_issue_info(issue_number, repo)
        title = issue_info.get("title", "")

        if not title:
            log_error(f"Issue #{issue_number} has no title")
            return 1

        # A Plan always implements in exactly one project. Issue labels
        # describe impact scope and can therefore be empty or plural; only a
        # single label is safe to infer automatically.
        try:
            project = _select_issue_project(issue_number, issue_info, project)
        except ValueError as e:
            log_error(str(e))
            return 1

        # Normalize type
        try:
            plan_type = normalize_plan_type(plan_type_arg)
        except LabelsValidationError as e:
            log_error(str(e))
            return 1

        # Generate plan name from explicitly specified components
        try:
            plan_name = make_plan_name(issue_number, plan_type, slug_arg)
        except NamingValidationError as e:
            log_error(str(e))
            return 1

        # Extract Project Type and Project Path from Issue body
        issue_project_type, issue_project_path = _extract_project_metadata_from_body(issue_info)
        # Extract Product and Phase from Issue body
        issue_product, issue_phase = _extract_product_phase_from_body(issue_info)
    else:
        try:
            plan_name = make_plan_name(None, plan_type, slug_arg)
        except NamingValidationError as e:
            log_error(str(e))
            return 1

    # Product/Phase: CLI flags override Issue body values. The pair is
    # atomic — a phase-linked plan declares both, an unlinked plan neither.
    try:
        product_value, phase_value = _resolve_product_phase(
            getattr(args, "product", None),
            getattr(args, "phase", None),
            issue_product,
            issue_phase,
        )
    except ValueError as e:
        log_error(str(e))
        return 1

    log_info(f"Plan name: {plan_name}")

    # Resolve plan directory
    plan_dir = _resolve_plan_dir(project, workspace_root)

    # Create plan file from template
    try:
        plan_file = create_plan_from_template(
            plan_name,
            plan_dir,
            issue_number,
            plan_type,
            project,
            workspace_root,
            project_path=issue_project_path,
            project_type=issue_project_type,
            product=product_value,
            phase=phase_value,
        )
        log_success(f"Plan created: {plan_file}")
    except (FileExistsError, FileNotFoundError) as e:
        log_error(str(e))
        return 1

    # Issue mode: Update Issue labels
    if issue_number:
        # The Plan owns only its chosen project label. The additive sync
        # helper deliberately preserves every other project/* label.
        project_label = f"project/{project}"
        ensure_label_exists(project_label, repo)
        sync_project_label_group(issue_number, project_label, repo)
        ensure_label_exists("status/planning", repo)
        sync_status_label_group(issue_number, "status/planning", repo)

        # Output summary
        print(f"Plan: {plan_file}")
        print(f"Issue: #{issue_number} | Project: {project} | Status: planning")
        print(f"Next: flow.sh approve {issue_number}")
    else:
        # No-issue mode: Output summary
        print(f"Plan: {plan_file}")
        print(f"Project: {project} | Status: planning")
        print(f"Next: flow.sh approve {plan_name}")

    return 0


def _cmd_plan_check(args: argparse.Namespace) -> int:
    """Validate a Plan against quality gates.

    Usage: flow.sh plan check <issue-or-name-or-path>

    Accepts:
      - Issue number (e.g. 42)
      - Plan name (e.g. chore-ellamaka-merge-upstream-opencode-v11513)
      - File path to a Plan .md
    """
    target = args.target
    workspace_root = find_workspace_root()

    if not target:
        log_error("Plan name, Issue number, or file path required")
        print("Usage: flow.sh plan check <plan-name-or-path>")
        return 1

    plan_file = None

    # 1. Direct file path
    if Path(target).exists():
        plan_file = str(Path(target).resolve())
    # 2. Issue number
    elif re.match(r'^\d+$', target):
        try:
            plan_file = find_plan_by_issue(int(target), str(workspace_root))
        except FileNotFoundError:
            pass
    # 3. Plan name
    else:
        try:
            plan_file = find_plan_by_name(target, str(workspace_root))
        except FileNotFoundError:
            pass

    if not plan_file or not Path(plan_file).exists():
        log_error(f"No plan found for: {target}")
        print("Usage: flow.sh plan check <plan-name-or-path>")
        return 1

    try:
        check_doc_plan(plan_file)
        log_success("Plan passes validation")
        plan_name = Path(plan_file).stem
        print(f"Next: flow.sh approve {plan_name}")
        return 0
    except CheckDocValidationError as e:
        log_error("Plan has issues. Fix and re-run with --check")
        print(str(e))
        return 1


# ============================================
# Plan metadata helpers (from query.py)
# ============================================


def get_plan_metadata(plan_file: str) -> dict:
    """Extract metadata from Plan file.

    Returns dict with: status, issue, created, project, type
    """
    if not Path(plan_file).is_file():
        return {}

    metadata = {}

    with open(plan_file, 'r') as f:
        content = f.read()

    status_match = re.search(r'^\- \*\*Status\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['status'] = status_match.group(1).strip() if status_match else 'draft'

    issue_match = re.search(r'^\- \*\*Issue\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['issue'] = issue_match.group(1).strip() if issue_match else ''

    created_match = re.search(r'^\- \*\*Created\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['created'] = created_match.group(1).strip() if created_match else ''

    project_match = re.search(r'^\- \*\*Target Project\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['project'] = project_match.group(1).strip() if project_match else ''

    type_match = re.search(r'^\- \*\*Type\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['type'] = type_match.group(1).strip().lower() if type_match else ''

    return metadata


def _get_status_display_list(state: str) -> str:
    """Return state machine position display string."""
    markers = {s: ('>> ' + s + ' <<') if s == state else s for s in PLAN_STATES}
    return ' -> '.join(markers[s] for s in PLAN_STATES)


# ============================================
# plan status <plan-id>
# ============================================


def _cmd_plan_status(input_ref: str) -> int:
    """Show Plan status, Issue info, and worktree state."""
    if not input_ref:
        log_error("Issue number or Plan name required")
        print("Usage: flow.sh plan status <plan-id>")
        return 1

    workspace_root = find_workspace_root()

    try:
        plan_file = find_plan(input_ref)
    except (FileNotFoundError, ValueError):
        log_error(f"No plan found for: {input_ref}")
        return 1

    plan_name = Path(plan_file).stem
    active_plan_file = _resolve_active_plan_for_display(Path(plan_file), workspace_root)
    metadata = get_plan_metadata(str(active_plan_file))

    status = metadata.get('status', 'draft')
    project = metadata.get('project', '')
    created = metadata.get('created', '')
    plan_issue_str = metadata.get('issue', '')

    plan_issue_num = None
    if plan_issue_str:
        m = re.search(r'#(\d+)', plan_issue_str)
        if m:
            plan_issue_num = int(m.group(1))

    print("")

    if plan_issue_num:
        try:
            repo = detect_space_repo(workspace_root)
            log_step(f"Fetching Issue #{plan_issue_num} info...")
            issue_info = _get_issue_info(plan_issue_num, repo)

            title = issue_info.get('title', '')
            state = issue_info.get('state', '')
            labels = [l['name'] for l in issue_info.get('labels', [])]

            print(f"Issue #{plan_issue_num}")
            print(f"  Title: {title}")
            print(f"  State: {state}")
            print(f"  Labels: {' '.join(labels)}")
            print("")
        except RuntimeError:
            log_warn(f"Issue #{plan_issue_num} info not available via gh CLI")
            print("")

    print(f"Plan: {plan_name}")
    print(f"  File: {plan_file}")
    if active_plan_file != Path(plan_file):
        print(f"  Active: {active_plan_file} (worktree)")
    print(f"  Status: {status}")
    print(f"  Created: {created}")

    # Read Worktree metadata from Plan (written by approve --confirm)
    try:
        from plan import get_plan_worktree
        wt_meta = get_plan_worktree(plan_file)
    except Exception:
        wt_meta = None

    if wt_meta and wt_meta.get('path'):
        worktree_path = str(workspace_root / wt_meta['path'])
    else:
        # Fallback: worktree dir = branch = <project>-<plan-name>
        # (same naming as approve.py; no repeated project prefix)
        branch = f"{project}-{plan_name}"
        worktree_path = str(workspace_root / ".worktrees" / branch)

    if worktree_path and Path(worktree_path).is_dir():
        print("")
        print(f"Worktree: {worktree_path}")
        try:
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
            )
            wt_branch = result.stdout.strip() or "detached"
            print(f"  Branch: {wt_branch}")
        except Exception:
            print("  Branch: (unknown)")

    print("")
    print(f"State Machine: {_get_status_display_list(status)}")

    return 0


# ============================================
# plan list [--issue]
# ============================================


def _resolve_active_plan_for_display(plan_file: str | Path, workspace_root: Path) -> Path:
    """Resolve the active Plan path for display and metadata reading.

    When a Plan has a worktree and the worktree copy exists, return the worktree
    copy (which has the latest status and checkbox progress). Otherwise return
    the original plan file path.

    Args:
        plan_file: Path to the integration-branch Plan file.
        workspace_root: Workspace root path.

    Returns:
        Path to the active Plan file (worktree copy or original).
    """
    plan_path = Path(plan_file) if isinstance(plan_file, str) else plan_file

    wt_meta = parse_worktree_meta(str(plan_path))
    if wt_meta is None:
        return plan_path

    wt_rel_path = wt_meta.get("path", "")
    if not wt_rel_path:
        return plan_path

    # Compute the repo-relative path of the Plan within its git repo
    plan_loc = _project_resolver.resolve_plan_location(plan_path, workspace_root)
    repo_relative = plan_loc.repo_relative_path

    # Construct the worktree Plan path
    worktree_plan = workspace_root / wt_rel_path / repo_relative

    if worktree_plan.exists():
        return worktree_plan

    return plan_path


def _scan_local_plans(workspace_root: str | Path) -> list[dict]:
    """Scan local Plan files (excluding done/ directories).

    Returns list of dicts: {name, project, status, has_issue, issue_number}
    """
    results = []
    ws = Path(workspace_root)

    search_dirs = _project_resolver.search_plan_dirs(ws)

    for plans_dir in search_dirs:
        if plans_dir.name == "done":
            continue

        parts = plans_dir.relative_to(ws).parts
        if parts[0] == ".wopal-space" and parts[1] == "plans" and len(parts) >= 3:
            project_name = parts[2]
        else:
            project_name = "unknown"

        for f in sorted(plans_dir.glob("*.md")):
            if f.parent.name == "done":
                continue

            plan_name = f.stem
            active_file = _resolve_active_plan_for_display(f, ws)
            metadata = get_plan_metadata(str(active_file))
            status = metadata.get('status', 'draft')
            issue_str = metadata.get('issue', '')

            issue_number = None
            has_issue = False
            if issue_str:
                m = re.search(r'#(\d+)', issue_str)
                if m:
                    issue_number = int(m.group(1))
                    has_issue = True

            results.append({
                'name': plan_name,
                'project': project_name,
                'status': status,
                'has_issue': has_issue,
                'issue_number': issue_number,
            })

    return results


def _fetch_active_issues(repo: str) -> dict[int, dict]:
    """Fetch active Issues from GitHub with dev-flow labels.

    Returns dict: {issue_number: {title, status}}
    """
    issues_by_number: dict[int, dict] = {}

    try:
        result = subprocess.run(
            ["gh", "issue", "list", "--repo", repo, "--state", "open",
             "--search", "label:status/planning OR label:status/in-progress OR label:status/verifying",
             "--json", "number,title,labels",
             "--jq", r'.[] | "\(.number)|\(.title)|\(.labels | map(.name) | join(","))"'],
            capture_output=True,
            text=True,
        )

        issues_output = result.stdout.strip()
        if issues_output:
            for line in issues_output.split('\n'):
                if not line:
                    continue
                parts = line.split('|')
                if len(parts) < 3:
                    continue
                number, title, labels_str = parts[0], parts[1], parts[2]
                labels = labels_str.split(',') if labels_str else []

                status_label = "unknown"
                for label in labels:
                    label = label.strip()
                    if label == "status/planning":
                        status_label = "planning"
                    elif label == "status/in-progress":
                        status_label = "executing"
                    elif label == "status/verifying":
                        status_label = "verifying"

                issues_by_number[int(number)] = {
                    'title': title,
                    'status': status_label,
                }
    except RuntimeError:
        pass

    return issues_by_number


def _cmd_plan_list(args: argparse.Namespace) -> int:
    """List active Plans.

    Default (no --issue): local plans only, offline.
    --issue: merge with GitHub Issues.
    """
    with_issue = getattr(args, 'issue', False)
    workspace_root = find_workspace_root()

    local_plans = _scan_local_plans(workspace_root)

    if with_issue:
        return _cmd_plan_list_with_issue(local_plans, workspace_root)
    else:
        return _cmd_plan_list_local_only(local_plans)


def _cmd_plan_list_local_only(local_plans: list[dict]) -> int:
    """Display local plans only."""
    print("Active Plans")
    print("============")
    print("")

    count = 0
    for lp in local_plans:
        if lp['status'] in ('planning', 'reviewing', 'executing', 'verifying'):
            line = f"[{lp['status']}]  {lp['name']}{' ' + lp['project'] if lp['project'] else ''}"
            if not lp['has_issue']:
                line += " (no issue)"
            print(line)
            count += 1

    print("")
    print(f"{count} active plan(s). Use --issue to include GitHub Issues.")
    return 0


def _cmd_plan_list_with_issue(local_plans: list[dict], workspace_root: Path) -> int:
    """Display local plans merged with GitHub Issues."""
    print("Active Plans & Issues")
    print("=====================")
    print("")

    issues_by_number: dict[int, dict] = {}
    try:
        repo = detect_space_repo(workspace_root)
        issues_by_number = _fetch_active_issues(repo)
    except RuntimeError:
        pass

    # Build plan lookup by issue number
    plan_by_issue: dict[int, dict] = {}
    for lp in local_plans:
        if lp['has_issue'] and lp['issue_number']:
            plan_by_issue[lp['issue_number']] = lp

    count = 0

    # First: Issues that have local Plans
    for issue_num in sorted(issues_by_number.keys()):
        info = issues_by_number[issue_num]
        lp = plan_by_issue.get(issue_num)
        if lp:
            print(f"[{lp['status']}] #{issue_num}: {info['title']}")
            print(f"             -> {lp['name']}")
        else:
            print(f"[recorded] #{issue_num}: {info['title']}")
        count += 1

    # Then: local plans without Issue (not already displayed)
    displayed_plan_names = set()
    for lp in local_plans:
        if lp['has_issue'] and lp['issue_number'] in issues_by_number:
            displayed_plan_names.add(lp['name'])

    for lp in local_plans:
        if lp['name'] in displayed_plan_names:
            continue
        if lp['status'] in ('planning', 'reviewing', 'executing', 'verifying'):
            if not lp['has_issue']:
                print(f"[{lp['status']}] {lp['name']} (no issue)")
            else:
                # Issue-linked plan not in GitHub results (closed/label mismatch)
                print(f"[{lp['status']}] {lp['name']}")
            count += 1

    print("")
    print(f"{count} active item(s).")
    return 0


# ============================================
# argparse registration
# ============================================

def register_plan_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register plan subcommand.

    Subcommands:
      new <issue>                                Create from Issue
      new --project X --type Y --slug S      Create without an Issue (no-issue mode)
      status <plan-id>                           Show Plan status
      list [--issue]                             List active Plans
      check <plan-name-or-path>                  Validate Plan
    """
    plan_parser = subparsers.add_parser(
        "plan",
        help="Plan lifecycle: new / status / list / check",
        description=(
            "Plan lifecycle commands.\n\n"
            "Subcommands:\n"
            "  new <issue>                            Create from Issue number\n"
            "  new --project X --type Y --slug S      Create without an Issue (no-issue mode)\n"
            "  status <plan-id>                       Show Plan status details\n"
            "  list [--issue]                         List active Plans\n"
            "  check <plan-name-or-path>              Validate Plan against quality gates"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    plan_subparsers = plan_parser.add_subparsers(
        dest="plan_command",
        metavar="<new|status|list|check>",
    )

    # ---- plan new ----
    new_parser = plan_subparsers.add_parser(
        "new",
        help="Create a new Plan",
        description="Create a new Plan from an Issue, or with --project when there is no Issue.",
    )
    new_parser.add_argument(
        "issue",
        nargs="?",
        help="Issue number (selects Issue mode). Omit and pass --project for no-issue mode.",
    )
    new_parser.add_argument(
        "--title",
        help="Optional free-form note; does not affect the Plan name",
    )
    new_parser.add_argument(
        "--project",
        help="Target Project name (selects no-issue mode)",
    )
    new_parser.add_argument(
        "--type",
        help="Plan type: feature, enhance, fix, perf, refactor, docs, chore, test (always required)",
    )
    new_parser.add_argument(
        "--slug",
        help="Short English kebab-case name, e.g. pr-102 (always required)",
    )
    new_parser.add_argument(
        "--product",
        help="Product name for phase linkage (optional; must pair with --phase)",
    )
    new_parser.add_argument(
        "--phase",
        help="Phase id for phase linkage, e.g. P3 (optional; must pair with --product)",
    )
    # ---- plan status ----
    status_parser = plan_subparsers.add_parser(
        "status",
        help="Show Plan status details",
        description="Show Plan status, Issue info, and worktree state.",
    )
    status_parser.add_argument(
        "plan_id",
        help="Issue number or Plan name",
    )

    # ---- plan list ----
    list_parser = plan_subparsers.add_parser(
        "list",
        help="List active Plans",
        description="List active Plans (--issue to merge with GitHub Issues).",
    )
    list_parser.add_argument(
        "--issue",
        action="store_true",
        help="Include GitHub Issues in output",
    )

    # ---- plan check ----
    check_parser = plan_subparsers.add_parser(
        "check",
        help="Validate Plan against quality gates",
        description="Run validation checks on a Plan file.",
    )
    check_parser.add_argument(
        "target",
        help="Issue number, Plan name, or path to Plan file",
    )
