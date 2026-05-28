#!/usr/bin/env python3
# roadmap.py - Roadmap command: 4-phase workflow (Analyze/Discuss/Produce/Decompose)
#
# Command:
#   roadmap <prd-path> [--product <name>] [--project <project>] [--yes]
#
# Flow:
#   1. Analyze: Parse PRD, extract phase headings -> List[PhaseInfo]
#   2. Discuss: Interactive confirmation (skip with --yes) -> List[ConfirmedPhase]
#   3. Produce: Write phase documents to phases/ directory -> List[Path]
#   4. Decompose: Create GitHub Issues per involved project

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from issue import build_structured_issue_body
from issue import ensure_label_exists
from lib.logging import log_info, log_success, log_warn, log_error, log_step
from lib.workspace import find_workspace_root, detect_space_repo


# ============================================
# Data structures
# ============================================


@dataclass
class PhaseInfo:
    """Parsed phase info from PRD."""

    id: str                          # "P1", "P2", ...
    title: str                       # Phase heading text
    goal: str                        # Extracted goal / description
    involved_projects: List[str] = field(default_factory=list)
    exit_criteria: List[str] = field(default_factory=list)


@dataclass
class ConfirmedPhase(PhaseInfo):
    """User-confirmed phase with overrides."""

    pass


# ============================================
# Phase document template (Interface 4 schema)
# ============================================

_PHASE_DOC_TEMPLATE = """\
# Phase {id}: {title}

## Metadata
- **Phase ID**: {id}
- **Product**: {product}
- **Status**: planning

## Goal
{goal}

## Involved Projects
{projects_section}

## Exit Criteria
{exit_criteria_section}
"""


# ============================================
# Analyze: parse PRD phases
# ============================================


def parse_prd_phases(prd_path: str) -> List[PhaseInfo]:
    """Parse PRD file and extract phase definitions.

    Matches ``## Phase N:`` and ``### Phase N:`` headings. Collects
    sibling list items and paragraph text until the next heading.

    Args:
        prd_path: Absolute or relative path to PRD markdown file.

    Returns:
        List of PhaseInfo in document order.
    """
    if not os.path.isfile(prd_path):
        log_error(f"PRD file not found: {prd_path}")
        return []

    with open(prd_path, "r", encoding="utf-8") as f:
        content = f.read()

    phases: list[PhaseInfo] = []

    # Match ## Phase N: ... or ### Phase N: ...
    pattern = re.compile(
        r'^(#{2,3})\s+Phase\s+(\d+):?\s+(.+?)$',
        re.MULTILINE,
    )

    matches = list(pattern.finditer(content))
    for idx, match in enumerate(matches):
        heading_level = len(match.group(1))
        phase_num = match.group(2)
        phase_title = match.group(3).strip()

        # Determine the heading prefix for detecting the next same-or-higher-level heading
        phase_id = f"P{phase_num}"

        # Extract content between this heading and the next heading of same or higher level
        start = match.end()
        end = len(content)
        if idx + 1 < len(matches):
            end = matches[idx + 1].start()

        section_text = content[start:end]

        # Parse goal: first non-empty paragraph
        goal = _extract_goal(section_text)

        # Parse involved projects: lines like "- project: <name>"
        involved_projects = _extract_involved_projects(section_text)

        # Parse exit criteria: list items under "## Exit Criteria" or
        # "### Exit Criteria" within the section, or fallback to
        # "- [x] ..." / "- [ ] ..." items
        exit_criteria = _extract_exit_criteria(section_text)

        phases.append(PhaseInfo(
            id=phase_id,
            title=phase_title,
            goal=goal,
            involved_projects=involved_projects,
            exit_criteria=exit_criteria,
        ))

    return phases


def _extract_goal(section: str) -> str:
    """Extract the first non-empty paragraph as goal text."""
    lines = section.split("\n")
    paragraphs: list[str] = []
    current: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            # Skip sub-headings
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if stripped == "":
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if stripped.startswith("- "):
            # Stop at list items
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(stripped)

    if current:
        paragraphs.append(" ".join(current))

    return paragraphs[0] if paragraphs else ""


def _extract_involved_projects(section: str) -> list[str]:
    """Extract project names from 'Involved Projects' subsection.

    Patterns:
      - project: <name>, scope: ...
      - <name> (standalone list items under Involved Projects)
    """
    projects: list[str] = []

    # Find "## Involved Projects" or "### Involved Projects"
    ip_match = re.search(
        r'^#{2,4}\s+Involved\s+Projects\s*\n(.*?)(?=\n#{2,}\s|\Z)',
        section,
        re.MULTILINE | re.DOTALL,
    )
    if ip_match:
        block = ip_match.group(1)
        for line in block.split("\n"):
            line = line.strip()
            if not line or not line.startswith("- "):
                continue
            item = line[2:].strip()
            # Pattern: "project: <name>" or "project: <name>, scope: ..."
            pm = re.match(r'project:\s*([^,]+)', item)
            if pm:
                projects.append(pm.group(1).strip())
            else:
                # Fallback: treat the whole item as project name (first word)
                name = item.split(",")[0].split(":")[0].strip()
                if name:
                    projects.append(name)

    return projects


def _extract_exit_criteria(section: str) -> list[str]:
    """Extract exit criteria from subsection or fallback list items."""
    criteria: list[str] = []

    # Find "## Exit Criteria" or "### Exit Criteria"
    ec_match = re.search(
        r'^#{2,4}\s+Exit\s+Criteria\s*\n(.*?)(?=\n#{2,}\s|\Z)',
        section,
        re.MULTILINE | re.DOTALL,
    )
    if ec_match:
        block = ec_match.group(1)
        for line in block.split("\n"):
            line = line.strip()
            if line.startswith("- "):
                criteria.append(line[2:].strip())
            elif line.startswith("- [ ] "):
                criteria.append(line[6:].strip())
            elif line.startswith("- [x] "):
                criteria.append(line[6:].strip())

    return criteria


def _infer_product(prd_path: str, args: argparse.Namespace) -> str:
    """Infer product name from --product flag or PRD filename stem."""
    if getattr(args, "product", None):
        return args.product

    stem = Path(prd_path).stem
    # Common PRD naming: PRD.md, <product>-PRD.md
    name = stem.upper().replace("-PRD", "").replace("_PRD", "").replace("PRD", "")
    if not name:
        name = stem.lower()
    return name.lower() if name else "unknown"


def _analyze(args: argparse.Namespace) -> tuple[list[PhaseInfo], str]:
    """Analyze phase: parse PRD and infer product name.

    Returns:
        Tuple of (phases, product_name)
    """
    prd_path = args.prd_path

    if not prd_path:
        log_error("PRD path required")
        raise RuntimeError("Missing prd_path")

    # Resolve to absolute path
    workspace_root = find_workspace_root()
    if not os.path.isabs(prd_path):
        full_path = os.path.join(str(workspace_root), prd_path)
    else:
        full_path = prd_path

    log_step("Analyze: Parsing PRD phases")
    phases = parse_prd_phases(full_path)

    if not phases:
        log_warn("No phases found in PRD")
        return [], ""

    product = _infer_product(prd_path, args)

    for p in phases:
        print(f"  {p.id}: {p.title}")
        if p.goal:
            print(f"     Goal: {p.goal[:80]}{'...' if len(p.goal) > 80 else ''}")

    log_info(f"Found {len(phases)} phases, product={product}")
    return phases, product


# ============================================
# Discuss: interactive confirmation
# ============================================


def _discuss(
    phases: list[PhaseInfo],
    args: argparse.Namespace,
) -> list[ConfirmedPhase]:
    """Discuss phase: interactive confirmation of each phase.

    With --yes, auto-confirms all phases. Without --yes on non-TTY, raises.
    """
    yes_mode = getattr(args, "yes", False)

    if not yes_mode and not sys.stdin.isatty():
        log_error("Non-interactive terminal. Use --yes to auto-confirm.")
        raise RuntimeError("Non-interactive terminal without --yes")

    confirmed: list[ConfirmedPhase] = []

    for phase in phases:
        print("")
        log_step(f"Discuss: Phase {phase.id}")
        print(f"  Title: {phase.title}")
        print(f"  Goal: {phase.goal or '(empty)'}")
        print(f"  Involved Projects: {', '.join(phase.involved_projects) or '(none)'}")
        print(f"  Exit Criteria: {len(phase.exit_criteria)} items")

        if yes_mode:
            log_info("Auto-confirmed (--yes)")
            confirmed.append(ConfirmedPhase(
                id=phase.id,
                title=phase.title,
                goal=phase.goal,
                involved_projects=list(phase.involved_projects),
                exit_criteria=list(phase.exit_criteria),
            ))
            continue

        # Interactive: allow overrides
        title = _prompt_default("  Title", phase.title)
        goal = _prompt_default("  Goal", phase.goal)

        confirmed.append(ConfirmedPhase(
            id=phase.id,
            title=title,
            goal=goal,
            involved_projects=list(phase.involved_projects),
            exit_criteria=list(phase.exit_criteria),
        ))

    return confirmed


def _prompt_default(label: str, default: str) -> str:
    """Prompt user with a default value. Empty input keeps default."""
    try:
        value = input(f"{label} [{default}]: ").strip()
    except EOFError:
        return default
    return value if value else default


# ============================================
# Produce: write phase documents
# ============================================


def _slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    slug = text.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    # Limit length
    if len(slug) > 40:
        slug = slug[:40].rstrip('-')
    return slug


def _produce(
    phases: list[ConfirmedPhase],
    product: str,
    prd_path: str,
    workspace_root: Path,
) -> list[Path]:
    """Produce phase: write phase documents to phases/ directory.

    Phase documents follow Interface 4 schema:
      - Metadata (Phase ID, Product, Status)
      - Goal
      - Involved Projects
      - Exit Criteria

    File naming: ``{product}-p{N}-{slug}.md``
    Directory: ``phases/`` sibling to PRD file.
    """
    log_step("Produce: Writing phase documents")

    # Determine phases directory: sibling to PRD
    prd_dir = Path(os.path.dirname(os.path.abspath(prd_path)))
    phases_dir = prd_dir / "phases"
    phases_dir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []

    for phase in phases:
        slug = _slugify(phase.title)
        filename = f"{product}-p{phase.id[1:]}-{slug}.md"
        filepath = phases_dir / filename

        # Build projects section
        if phase.involved_projects:
            projects_section = "\n".join(
                f"- project: {p}" for p in phase.involved_projects
            )
        else:
            projects_section = "- _(none)_"

        # Build exit criteria section
        if phase.exit_criteria:
            criteria_section = "\n".join(
                f"- {c}" for c in phase.exit_criteria
            )
        else:
            criteria_section = "- _(to be defined)_"

        content = _PHASE_DOC_TEMPLATE.format(
            id=phase.id,
            title=phase.title,
            product=product,
            goal=phase.goal or "_(to be defined)_",
            projects_section=projects_section,
            exit_criteria_section=criteria_section,
        )

        filepath.write_text(content, encoding="utf-8")
        written.append(filepath)
        log_info(f"  Written: {filepath}")

        # PRD reference writeback: append phase doc link after Phase heading
        _writeback_prd_reference(prd_path, phase.id, filename)

    return written


def _writeback_prd_reference(prd_path: str, phase_id: str, phase_filename: str) -> None:
    """Append phase doc reference line after the Phase heading in the PRD."""
    # phase_id is like "P1", phase_num is "1"
    phase_num = phase_id[1:]

    if not os.path.isfile(prd_path):
        return

    with open(prd_path, "r", encoding="utf-8") as f:
        prd_content = f.read()

    # Match ## Phase N: or ### Phase N: heading
    heading_pattern = re.compile(
        rf'^(#{{2,3}})\s+Phase\s+{re.escape(phase_num)}:?\s+.+$',
        re.MULTILINE,
    )
    heading_match = heading_pattern.search(prd_content)
    if not heading_match:
        log_warn(f"  Phase {phase_num} heading not found in PRD, skipping reference writeback")
        return

    ref_line = f"> Phase doc: [phases/{phase_filename}](phases/{phase_filename})"

    # Check if reference already exists
    after_heading = prd_content[heading_match.end():]
    if ref_line in after_heading[:200]:
        return  # Already written

    # Insert ref line right after the heading line
    insert_pos = heading_match.end()
    # Find end of current line (may already be at line end)
    if insert_pos < len(prd_content) and prd_content[insert_pos] == '\n':
        insert_pos += 1

    new_content = prd_content[:insert_pos] + ref_line + "\n" + prd_content[insert_pos:]

    with open(prd_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    log_info(f"  PRD reference added: Phase {phase_num} -> {phase_filename}")


# ============================================
# Decompose: create GitHub Issues
# ============================================


def _truncate_title(title: str, max_len: int = 72) -> str:
    """Truncate issue title to max_len, adding '...' if truncated."""
    if len(title) <= max_len:
        return title
    # Leave room for "..."
    return title[: max_len - 3] + "..."


def _decompose(
    phases: list[ConfirmedPhase],
    product: str,
    prd_path: str,
    args: argparse.Namespace,
) -> list[str]:
    """Decompose phase: create GitHub Issues per involved project.

    For each phase, creates one Issue per involved project.
    Issue title: ``feat({scope}): {phase-id} — {goal-summary}``
    Body: uses build_structured_issue_body() with Product/Phase injection.
    Labels: project/{name}, status/planning
    """
    log_step("Decompose: Creating GitHub Issues")

    workspace_root = find_workspace_root()
    try:
        repo = detect_space_repo(workspace_root)
    except RuntimeError:
        log_error("Cannot detect repo for Issue creation")
        return []

    project_override = getattr(args, "project", None) or None
    dry_run = getattr(args, "dry_run", False)

    created: list[str] = []

    for phase in phases:
        # Determine projects for this phase
        projects = phase.involved_projects if phase.involved_projects else []
        if not projects:
            # Fallback: use --project flag or product name
            scope = project_override or product
            projects = [scope]

        for project in projects:
            # Build issue title
            goal_summary = phase.goal or phase.title
            issue_title = f"feat({project}): {phase.id} — {goal_summary}"
            issue_title = _truncate_title(issue_title)

            # Build issue body via build_structured_issue_body
            body = build_structured_issue_body(
                type="feature",
                goal=goal_summary,
            )

            # Inject Product/Phase metadata at top
            meta_injection = (
                f"- **Product**: {product}\n"
                f"- **Phase**: {phase.id}\n"
                "\n"
            )
            body = meta_injection + body

            if dry_run:
                print(f"  Would create: {issue_title}")
                print(f"    Labels: project/{project}, status/planning")
                created.append("(dry-run)")
                continue

            # Ensure labels exist
            ensure_label_exists("status/planning", repo)
            ensure_label_exists(f"project/{project}", repo)

            result = subprocess.run(
                [
                    "gh", "issue", "create",
                    "--repo", repo,
                    "--title", issue_title,
                    "--body", body,
                    "--label", "status/planning",
                    "--label", f"project/{project}",
                ],
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                log_error(f"Failed to create Issue for {phase.id}/{project}")
                log_error(result.stderr)
                continue

            issue_url = result.stdout.strip()
            match = re.search(r'/issues/(\d+)$', issue_url)
            if match:
                issue_num = match.group(1)
                log_success(f"  Issue #{issue_num}: {issue_title}")
                created.append(f"#{issue_num}")
            else:
                log_success(f"  Issue created: {issue_url}")
                created.append(issue_url)

    if created and not dry_run:
        log_success(f"Created {len([c for c in created if c.startswith('#')])} Issues")

    return created


# ============================================
# cmd_roadmap: main entry point
# ============================================


def cmd_roadmap(args: argparse.Namespace) -> int:
    """Execute the roadmap 4-phase workflow.

    Analyze -> Discuss -> Produce -> Decompose
    """
    prd_path = args.prd_path

    if not prd_path:
        log_error("PRD path required")
        print("Usage: flow.sh roadmap <prd-path> [--product <name>] [--yes]")
        return 1

    workspace_root = find_workspace_root()

    # Resolve PRD path
    if not os.path.isabs(prd_path):
        full_prd_path = os.path.join(str(workspace_root), prd_path)
    else:
        full_prd_path = prd_path

    if not os.path.isfile(full_prd_path):
        log_error(f"PRD file not found: {full_prd_path}")
        return 1

    # Store resolved path back for sub-functions
    args.prd_path = full_prd_path

    print("")
    print("=" * 60)
    print("  ROADMAP: Analyze -> Discuss -> Produce -> Decompose")
    print("=" * 60)

    # Phase 1: Analyze
    print("")
    phases, product = _analyze(args)
    if not phases:
        log_error("No phases found. Check PRD format (expected '## Phase N: ...' headings)")
        return 1

    # Phase 2: Discuss
    print("")
    confirmed = _discuss(phases, args)

    # Phase 3: Produce
    print("")
    doc_paths = _produce(confirmed, product, full_prd_path, workspace_root)

    # Phase 4: Decompose
    print("")
    issues = _decompose(confirmed, product, full_prd_path, args)

    # Summary
    print("")
    print("=" * 60)
    log_success(f"Roadmap complete: {len(doc_paths)} phase docs, {len(issues)} issues")
    print("=" * 60)

    return 0


# ============================================
# argparse registration
# ============================================


def register_roadmap_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register roadmap subcommand."""
    roadmap_parser = subparsers.add_parser(
        "roadmap",
        help="Product phase roadmap: Analyze/Discuss/Produce/Decompose",
        description=(
            "Run 4-phase roadmap workflow on a PRD file.\n\n"
            "Phases:\n"
            "  1. Analyze  — Parse PRD, extract phase definitions\n"
            "  2. Discuss  — Interactive confirmation (skip with --yes)\n"
            "  3. Produce  — Write phase documents to phases/ directory\n"
            "  4. Decompose — Create GitHub Issues per involved project\n\n"
            "Usage: flow.sh roadmap <prd-path> [--product <name>] [--project <project>] [--yes] [--dry-run]"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    roadmap_parser.add_argument(
        "prd_path",
        nargs="?",
        help="Path to PRD file (relative to workspace root or absolute)",
    )
    roadmap_parser.add_argument(
        "--product",
        help="Product name (default: inferred from PRD filename)",
    )
    roadmap_parser.add_argument(
        "--project",
        help="Default project name for Issues (used when phase has no involved_projects)",
    )
    roadmap_parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive confirmation (auto-confirm all phases)",
    )
    roadmap_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without creating Issues",
    )
