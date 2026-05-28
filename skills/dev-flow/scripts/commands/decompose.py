#!/usr/bin/env python3
# decompose.py - Decompose PRD into Issues
#
# Ported from scripts/cmd/utility.sh (cmd_decompose_prd)
#
# Parses a PRD file, extracts Implementation Phases sections,
# and creates GitHub Issues for each phase.

from __future__ import annotations

import argparse
import os
import re
import subprocess
from dataclasses import dataclass, field

from lib.logging import log_info, log_success, log_warn, log_error, log_step
from lib.workspace import find_workspace_root, detect_space_repo


# ============================================
# Slice dataclass (for ROADMAP.md parsing)
# ============================================

@dataclass
class Slice:
    id: str           # "S01"
    title: str        # "CLI 多空间管理"
    project: str      # "space-flow"（已解析 = 前缀）
    risk: str = "medium"  # "high" | "medium" | "low"
    depends: list[str] = field(default_factory=list)  # ["S01"] or []
    demo: str = ""    # After this: 后的文本


# ============================================
# GitHub CLI Helpers
# ============================================


def create_phase_issue(phase_num: str, phase_title: str, project: str, prd_path: str) -> str | None:
    """Create a GitHub Issue for a single PRD phase.
    
    Args:
        phase_num: Phase number (e.g., "1")
        phase_title: Phase title text
        project: Target project name (e.g., "ontology")
        prd_path: Relative path to PRD file
        
    Returns:
        Issue number string if created, None if failed
    """
    issue_body = (
        "## Source\n"
        "\n"
        f"From PRD: [{prd_path}](../{prd_path})\n"
        "\n"
        "## Phase Description\n"
        "\n"
        f"{phase_title}\n"
        "\n"
        "---\n"
        "\n"
        "This Issue was auto-created by dev-flow decompose-prd."
    )
    
    issue_title = f"[Phase {phase_num}] {phase_title}"
    
    try:
        repo = detect_space_repo(find_workspace_root())
    except RuntimeError:
        log_error("Cannot get repo info for Issue creation")
        return None
    
    result = subprocess.run(
        ["gh", "issue", "create",
         "--repo", repo,
         "--title", issue_title,
         "--body", issue_body,
         "--label", "status/planning",
         "--label", f"project/{project or 'space'}",
         "--label", "type/feature"],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_error(f"Failed to create Issue for Phase {phase_num}")
        return None
    
    # Extract issue number from URL (e.g., https://github.com/owner/repo/issues/42)
    url = result.stdout.strip()
    match = re.search(r'/issues/(\d+)$', url)
    if match:
        return match.group(1)
    
    return None


def extract_phases(prd_content: str) -> list[tuple[str, str]]:
    """Extract phases from PRD content.
    
    Looks for "## Implementation Phases" section and extracts
    ### Phase N: <title> headings.
    
    Args:
        prd_content: Full PRD markdown content
        
    Returns:
        List of (phase_num, phase_title) tuples
    """
    phases = []
    
    # Pattern: ### Phase N: Title or ### Phase N Title
    pattern = re.compile(r'^###\s+Phase\s+(\d+):?\s+(.+)', re.MULTILINE)
    
    for match in pattern.finditer(prd_content):
        phase_num = match.group(1)
        phase_title = match.group(2).strip()
        phases.append((phase_num, phase_title))
    
    return phases


def extract_implementation_phases_section(prd_content: str) -> str | None:
    """Extract the ## Implementation Phases section from PRD content.
    
    Args:
        prd_content: Full PRD markdown content
        
    Returns:
        Content of the Implementation Phases section, or None if not found
    """
    # Match ## Implementation Phases section until next ## heading
    pattern = re.compile(
        r'^##\s+Implementation\s+Phases\n(.*?)(?=\n##\s+)',
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(prd_content)
    
    if match:
        return match.group(1)
    
    return None


# ============================================
# ROADMAP.md Slices parsing
# ============================================


def parse_roadmap_slices(md_path: str) -> list[Slice]:
    """Parse ROADMAP.md Slices table into Slice objects.
    
    Reads ## Slices heading, parses markdown table rows,
    and extracts demo text from ### Snn: paragraphs.
    """
    with open(md_path, 'r') as f:
        content = f.read()
    
    # Find ## Slices section
    slices_match = re.search(r'^##\s+Slices\s*$', content, re.MULTILINE)
    if not slices_match:
        return []
    
    # Extract content until next ## heading
    start = slices_match.end()
    next_h2 = re.search(r'^##\s+', content[start:], re.MULTILINE)
    section = content[start:start + next_h2.start()] if next_h2 else content[start:]
    
    # Parse markdown table
    lines = section.strip().split('\n')
    table_rows = [l for l in lines if l.strip().startswith('|') and not re.match(r'^\|[\s\-|]+\|$', l.strip())]
    
    if len(table_rows) < 2:
        return []
    
    # Parse header to get column indices
    headers = [h.strip() for h in table_rows[0].split('|')[1:-1]]
    col_idx = {h: i for i, h in enumerate(headers)}
    
    slices = []
    for row in table_rows[1:]:
        cells = [c.strip() for c in row.split('|')[1:-1]]
        
        slice_id = cells[col_idx.get('Slice', 0)] if col_idx.get('Slice', 0) < len(cells) else ""
        title = cells[col_idx.get('Title', 1)] if col_idx.get('Title', 1) < len(cells) else ""
        project_raw = cells[col_idx.get('Project', 2)] if col_idx.get('Project', 2) < len(cells) else ""
        
        # Resolve = prefix for project
        if project_raw.startswith('='):
            project = project_raw[1:]
        else:
            project = project_raw
        
        risk = cells[col_idx.get('Risk', 3)] if 'Risk' in col_idx and col_idx['Risk'] < len(cells) else "medium"
        depends_raw = cells[col_idx.get('Depends', 4)] if 'Depends' in col_idx and col_idx['Depends'] < len(cells) else "none"
        
        # Parse depends
        if not depends_raw or depends_raw.lower() == 'none':
            depends = []
        else:
            depends = [d.strip() for d in depends_raw.split(',') if d.strip()]
        
        # Extract demo from ### Snn: paragraphs
        demo = _extract_demo_text(content, slice_id)
        
        slices.append(Slice(
            id=slice_id,
            title=title,
            project=project,
            risk=risk if risk else "medium",
            depends=depends,
            demo=demo,
        ))
    
    return slices


def _extract_demo_text(content: str, slice_id: str) -> str:
    """Extract 'After this:' text from ### {slice_id}: paragraph."""
    pattern = re.compile(
        rf'^###\s+{re.escape(slice_id)}:\s*.+?\n'
        rf'(.*?)(?=^###\s+|\Z)',
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(content)
    if not match:
        return ""
    
    paragraph = match.group(1).strip()
    after_match = re.search(r'After this:\s*(.+)', paragraph)
    return after_match.group(1).strip() if after_match else ""


def create_slice_issue(slice_obj: Slice, repo: str, roadmap_path: str, product: str = "", slice_titles: dict[str, str] | None = None) -> str | None:
    """Create a GitHub Issue for a single Slice from ROADMAP.md."""
    
    # Build title: feat({project}): S01 — {title} (<=72 chars)
    title_base = f"feat({slice_obj.project}): {slice_obj.id} — {slice_obj.title}"
    if len(title_base) > 72:
        max_title_len = 72 - len(f"feat({slice_obj.project}): {slice_obj.id} — ")
        truncated = slice_obj.title[:max_title_len - 3] + "..."
        title_base = f"feat({slice_obj.project}): {slice_obj.id} — {truncated}"
    
    # Build depends section
    if slice_obj.depends:
        lines = []
        for dep in slice_obj.depends:
            if slice_titles and dep in slice_titles:
                lines.append(f"- {dep}: {slice_titles[dep]}")
            else:
                lines.append(f"- {dep}: _(see ROADMAP)_")
        depends_lines = "\n".join(lines)
    else:
        depends_lines = "_无_"
    
    # Build body
    body_parts = []
    if product:
        body_parts.append(f"- **Product**: {product}")
    body_parts.append(f"- **Slice**: {slice_obj.id}")
    body_parts.append("")
    body_parts.append("## Goal")
    body_parts.append(slice_obj.title)
    body_parts.append("")
    body_parts.append("## Depends on")
    body_parts.append(depends_lines)
    body_parts.append("")
    body_parts.append("## Demo")
    body_parts.append(slice_obj.demo if slice_obj.demo else "_待定义_")
    body_parts.append("")
    
    # Related Resources
    workspace_root = str(find_workspace_root())
    from issue import build_repo_blob_url
    roadmap_rel = os.path.relpath(roadmap_path, workspace_root)
    roadmap_url = build_repo_blob_url(repo, roadmap_rel)
    roadmap_name = os.path.basename(roadmap_path)
    body_parts.append("## Related Resources")
    body_parts.append("")
    body_parts.append(f"| Roadmap | [{roadmap_name}]({roadmap_url}) |")
    
    body = "\n".join(body_parts)
    
    result = subprocess.run(
        ["gh", "issue", "create",
         "--repo", repo,
         "--title", title_base,
         "--body", body,
         "--label", "status/planning",
         "--label", f"project/{slice_obj.project}",
         "--label", "type/feature"],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_error(f"Failed to create Issue for Slice {slice_obj.id}")
        return None
    
    url = result.stdout.strip()
    match = re.search(r'/issues/(\d+)$', url)
    return match.group(1) if match else None


# ============================================
# cmd_decompose: Create Issues from PRD
# ============================================

def cmd_decompose(args: argparse.Namespace) -> int:
    """Create Issues from PRD phases or ROADMAP.md slices.
    
    Parses a PRD file or ROADMAP.md and creates GitHub Issues.
    """
    from_path = getattr(args, 'from_file', None)
    
    if from_path:
        return _decompose_from_file(from_path, args)
    
    prd_path = args.prd_path
    dry_run = args.dry_run
    project = args.project or "space"
    
    if not prd_path:
        log_error("PRD path required")
        print("Usage: flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]")
        return 1
    
    workspace_root = find_workspace_root()
    full_prd_path = os.path.join(str(workspace_root), prd_path)
    
    if not os.path.isfile(full_prd_path):
        log_error(f"PRD file not found: {full_prd_path}")
        return 1
    
    log_info(f"Parsing PRD: {prd_path}")
    
    with open(full_prd_path, 'r') as f:
        prd_content = f.read()
    
    # Try to extract Implementation Phases section first
    phases_section = extract_implementation_phases_section(prd_content)
    
    if phases_section:
        print("")
        log_info("Found Implementation Phases section")
        print("")
        phases = extract_phases(phases_section)
    else:
        log_warn("No '## Implementation Phases' section found in PRD")
        print("Looking for Phase sections...")
        phases = extract_phases(prd_content)
    
    if not phases:
        log_warn("No Phase sections found in PRD")
        return 0
    
    created_issues = []
    
    for phase_num, phase_title in phases:
        print("")
        print(f"Phase {phase_num}: {phase_title}")
        
        if dry_run:
            print(f"  Would create Issue: [Phase {phase_num}] {phase_title}")
            continue
        
        issue_num = create_phase_issue(phase_num, phase_title, project, prd_path)
        if issue_num:
            created_issues.append(f"# {issue_num}")
            log_success(f"Issue #{issue_num} created: [Phase {phase_num}] {phase_title}")
        else:
            log_error(f"Failed to create Issue for Phase {phase_num}")
    
    if not dry_run and created_issues:
        print("")
        log_success(f"Created {len(created_issues)} Issues: {' '.join(created_issues)}")
    
    return 0


def _decompose_from_file(from_path: str, args: argparse.Namespace) -> int:
    """Decompose from ROADMAP.md or PRD using --from flag."""
    workspace_root = find_workspace_root()
    full_path = os.path.join(str(workspace_root), from_path)
    
    if not os.path.isfile(full_path):
        log_error(f"File not found: {full_path}")
        return 1
    
    # Detect file type by content
    with open(full_path, 'r') as f:
        content = f.read()
    
    if '## Slices' in content:
        return _decompose_from_roadmap(full_path, args)
    else:
        # Fall back to PRD mode
        args.prd_path = from_path
        return cmd_decompose(args)


def _decompose_from_roadmap(roadmap_path: str, args: argparse.Namespace) -> int:
    """Create Issues from ROADMAP.md Slices table."""
    dry_run = getattr(args, 'dry_run', False)
    product = getattr(args, 'product', '') or ''
    
    log_info(f"Parsing ROADMAP.md: {roadmap_path}")
    slices = parse_roadmap_slices(roadmap_path)
    
    if not slices:
        log_warn("No Slices found in ROADMAP.md")
        return 0
    
    log_info(f"Found {len(slices)} slices")
    
    # Build slice_id -> title mapping for depends rendering
    slice_titles = {s.id: s.title for s in slices}
    
    try:
        repo = detect_space_repo(find_workspace_root())
    except RuntimeError:
        log_error("Cannot get repo info")
        return 1
    
    created = []
    for s in slices:
        print(f"  {s.id}: {s.title} (project={s.project}, risk={s.risk})")
        
        if dry_run:
            print(f"    Would create: feat({s.project}): {s.id} — {s.title}")
            continue
        
        issue_num = create_slice_issue(s, repo, roadmap_path, product, slice_titles=slice_titles)
        if issue_num:
            created.append(f"#{issue_num}")
            log_success(f"Issue #{issue_num}: {s.id} — {s.title}")
        else:
            log_error(f"Failed for Slice {s.id}")
    
    if not dry_run and created:
        log_success(f"Created {len(created)} Issues: {', '.join(created)}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def _add_decompose_args(parser):
    """Add shared arguments to decompose parser."""
    parser.add_argument(
        "prd_path",
        nargs="?",
        help="Path to PRD file (relative to workspace root)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without creating Issues",
    )
    parser.add_argument(
        "--project",
        help="Target project name (default: space)",
    )
    parser.add_argument(
        "--from", dest="from_file",
        help="Decompose from ROADMAP.md or PRD",
    )
    parser.add_argument(
        "--product",
        help="Product name (for ROADMAP.md slices)",
    )


def register_decompose_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register decompose-prd and decompose subcommands."""
    for name in ("decompose-prd", "decompose"):
        p = subparsers.add_parser(
            name,
            help="Create Issues from PRD phases or ROADMAP.md slices",
        )
        _add_decompose_args(p)