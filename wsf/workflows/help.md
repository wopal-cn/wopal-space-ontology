<purpose>
Display the complete WSF command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<language>
Language preference is determined by:
1. If `$ARGUMENTS` contains `--lang <code>` → use specified language
2. If not provided → infer from context (check USER.md "沟通语言" field, user's conversation language in current session)
3. Default → English if no preference detected

Regardless of language, these MUST remain in English:
- Command names (e.g., `/wsf-new-project`, `/wsf-plan-phase`)
- File paths (e.g., `.planning/STATE.md`, `.planning/codebase/`)
- Code identifiers, CLI flags, and technical terms
</language>

<reference>
# WSF Command Reference

**WSF** (Wopal Space Flow) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/wsf-new-project` - Initialize project (includes research, requirements, roadmap)
2. `/wsf-plan-phase 1` - Create detailed plan for first phase
3. `/wsf-execute-phase 1` - Execute the phase

## Staying Updated

WSF evolves fast. Update periodically:

```bash
npx wsf-cc@latest
```

## Core Workflow

```
/wsf-new-project → /wsf-plan-phase → /wsf-execute-phase → repeat
```

### Project Initialization

**`/wsf-new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with phase breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — phases mapped to requirements
- `STATE.md` — project memory

Usage: `/wsf-new-project`

**`/wsf-map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel Explore agents
- Creates `.planning/codebase/` with 7 focused documents
- Covers stack, architecture, structure, conventions, testing, integrations, concerns
- Use before `/wsf-new-project` on existing codebases

Usage: `/wsf-map-codebase`

### Phase Planning

**`/wsf-discuss-phase <number>`**
Help articulate your vision for a phase before planning.

- Captures how you imagine this phase working
- Creates CONTEXT.md with your vision, essentials, and boundaries
- Use when you have ideas about how something should look/feel
- Optional `--batch` asks 2-5 related questions at a time instead of one-by-one

Usage: `/wsf-discuss-phase 2`
Usage: `/wsf-discuss-phase 2 --batch`
Usage: `/wsf-discuss-phase 2 --batch=3`

**`/wsf-research-phase <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Creates RESEARCH.md with "how experts build this" knowledge
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/wsf-research-phase 3`

**`/wsf-list-phase-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for a phase
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/wsf-list-phase-assumptions 3`

**`/wsf-plan-phase <number>`**
Create detailed execution plan for a specific phase.

- Generates `.planning/phases/XX-phase-name/XX-YY-PLAN.md`
- Breaks phase into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per phase supported (XX-01, XX-02, etc.)

Usage: `/wsf-plan-phase 1`
Result: Creates `.planning/phases/01-foundation/01-01-PLAN.md`

**PRD Express Path:** Pass `--prd path/to/requirements.md` to skip discuss-phase entirely. Your PRD becomes locked decisions in CONTEXT.md. Useful when you already have clear acceptance criteria.

### Execution

**`/wsf-execute-phase <phase-number>`**
Execute all plans in a phase, or run a specific wave.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Optional `--wave N` flag executes only Wave `N` and stops unless the phase is now fully complete
- Verifies phase goal after all plans complete
- Updates REQUIREMENTS.md, ROADMAP.md, STATE.md

Usage: `/wsf-execute-phase 5`
Usage: `/wsf-execute-phase 5 --wave 2`

### Smart Router

**`/wsf-do <description>`**
Route freeform text to the right WSF command automatically.

- Analyzes natural language input to find the best matching WSF command
- Acts as a dispatcher — never does the work itself
- Resolves ambiguity by asking you to pick between top matches
- Use when you know what you want but don't know which `/wsf-*` command to run

Usage: `/wsf-do fix the login button`
Usage: `/wsf-do refactor the auth system`
Usage: `/wsf-do I want to start a new milestone`

### Quick Mode

**`/wsf-quick [--full] [--validate] [--discuss] [--research]`**
Execute small, ad-hoc tasks with WSF guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier by default)
- Quick tasks live in `.planning/quick/` separate from planned phases
- Updates STATE.md tracking (not ROADMAP.md)

Flags enable additional quality steps:
- `--full` — Complete quality pipeline: discussion + research + plan-checking + verification
- `--validate` — Plan-checking (max 2 iterations) and post-execution verification only
- `--discuss` — Lightweight discussion to surface gray areas before planning
- `--research` — Focused research agent investigates approaches before planning

Granular flags are composable: `--discuss --research --validate` gives the same as `--full`.

Usage: `/wsf-quick`
Usage: `/wsf-quick --full`
Usage: `/wsf-quick --research --validate`
Result: Creates `.planning/quick/NNN-slug/PLAN.md`, `.planning/quick/NNN-slug/SUMMARY.md`

---

**`/wsf-fast [description]`**
Execute a trivial task inline — no subagents, no planning files, no overhead.

For tasks too small to justify planning: typo fixes, config changes, forgotten commits, simple additions. Runs in the current context, makes the change, commits, and logs to STATE.md.

- No PLAN.md or SUMMARY.md created
- No subagent spawned (runs inline)
- ≤ 3 file edits — redirects to `/wsf-quick` if task is non-trivial
- Atomic commit with conventional message

Usage: `/wsf-fast "fix the typo in README"`
Usage: `/wsf-fast "add .env to gitignore"`

### Roadmap Management

**`/wsf-add-phase <description>`**
Add new phase to end of current milestone.

- Appends to ROADMAP.md
- Uses next sequential number
- Updates phase directory structure

Usage: `/wsf-add-phase "Add admin dashboard"`

**`/wsf-insert-phase <after> <description>`**
Insert urgent work as decimal phase between existing phases.

- Creates intermediate phase (e.g., 7.1 between 7 and 8)
- Useful for discovered work that must happen mid-milestone
- Maintains phase ordering

Usage: `/wsf-insert-phase 7 "Fix critical auth bug"`
Result: Creates Phase 7.1

**`/wsf-remove-phase <number>`**
Remove a future phase and renumber subsequent phases.

- Deletes phase directory and all references
- Renumbers all subsequent phases to close the gap
- Only works on future (unstarted) phases
- Git commit preserves historical record

Usage: `/wsf-remove-phase 17`
Result: Phase 17 deleted, phases 18-20 become 17-19

### Milestone Management

**`/wsf-new-milestone <name>`**
Start a new milestone through unified flow.

- Deep questioning to understand what you're building next
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with scoping
- Roadmap creation with phase breakdown
- Optional `--reset-phase-numbers` flag restarts numbering at Phase 1 and archives old phase dirs first for safety

Mirrors `/wsf-new-project` flow for brownfield projects (existing PROJECT.md).

Usage: `/wsf-new-milestone "v2.0 Features"`
Usage: `/wsf-new-milestone --reset-phase-numbers "v2.0 Features"`

**`/wsf-complete-milestone <version>`**
Archive completed milestone and prepare for next version.

- Creates MILESTONES.md entry with stats
- Archives full details to milestones/ directory
- Creates git tag for the release
- Prepares workspace for next version

Usage: `/wsf-complete-milestone 1.0.0`

### Progress Tracking

**`/wsf-progress`**
Check project status and intelligently route to next action.

- Shows visual progress bar and completion percentage
- Summarizes recent work from SUMMARY files
- Displays current position and what's next
- Lists key decisions and open issues
- Offers to execute next plan or create it if missing
- Detects 100% milestone completion

Usage: `/wsf-progress`

### Session Management

**`/wsf-resume-work`**
Resume work from previous session with full context restoration.

- Reads STATE.md for project context
- Shows current position and recent progress
- Offers next actions based on project state

Usage: `/wsf-resume-work`

**`/wsf-pause-work`**
Create context handoff when pausing work mid-phase.

- Creates .continue-here file with current state
- Updates STATE.md session continuity section
- Captures in-progress work context

Usage: `/wsf-pause-work`

### Debugging

**`/wsf-debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Creates `.planning/debug/[slug].md` to track investigation
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/wsf-debug` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/`

Usage: `/wsf-debug "login button doesn't work"`
Usage: `/wsf-debug` (resume active session)

### Quick Notes

**`/wsf-note <text>`**
Zero-friction idea capture — one command, instant save, no questions.

- Saves timestamped note to `.planning/notes/` (or `/Users/sam/coding/wopal/wopal-workspace/.wopal/notes/` globally)
- Three subcommands: append (default), list, promote
- Promote converts a note into a structured todo
- Works without a project (falls back to global scope)

Usage: `/wsf-note refactor the hook system`
Usage: `/wsf-note list`
Usage: `/wsf-note promote 3`
Usage: `/wsf-note --global cross-project idea`

### Todo Management

**`/wsf-add-todo [description]`**
Capture idea or task as todo from current conversation.

- Extracts context from conversation (or uses provided description)
- Creates structured todo file in `.planning/todos/pending/`
- Infers area from file paths for grouping
- Checks for duplicates before creating
- Updates STATE.md todo count

Usage: `/wsf-add-todo` (infers from conversation)
Usage: `/wsf-add-todo Add auth token refresh`

**`/wsf-check-todos [area]`**
List pending todos and select one to work on.

- Lists all pending todos with title, area, age
- Optional area filter (e.g., `/wsf-check-todos api`)
- Loads full context for selected todo
- Routes to appropriate action (work now, add to phase, brainstorm)
- Moves todo to done/ when work begins

Usage: `/wsf-check-todos`
Usage: `/wsf-check-todos api`

### User Acceptance Testing

**`/wsf-verify-work [phase]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (yes/no responses)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/wsf-verify-work 3`

### Ship Work

**`/wsf-ship [phase]`**
Create a PR from completed phase work with an auto-generated body.

- Pushes branch to remote
- Creates PR with summary from SUMMARY.md, VERIFICATION.md, REQUIREMENTS.md
- Optionally requests code review
- Updates STATE.md with shipping status

Prerequisites: Phase verified, `gh` CLI installed and authenticated.

Usage: `/wsf-ship 4` or `/wsf-ship 4 --draft`

---

**`/wsf-review --phase N [--gemini] [--claude] [--codex] [--coderabbit] [--all]`**
Cross-AI peer review — invoke external AI CLIs to independently review phase plans.

- Detects available CLIs (gemini, claude, codex, coderabbit)
- Each CLI reviews plans independently with the same structured prompt
- CodeRabbit reviews the current git diff (not a prompt) — may take up to 5 minutes
- Produces REVIEWS.md with per-reviewer feedback and consensus summary
- Feed reviews back into planning: `/wsf-plan-phase N --reviews`

Usage: `/wsf-review --phase 3 --all`

---

**`/wsf-pr-branch [target]`**
Create a clean branch for pull requests by filtering out .planning/ commits.

- Classifies commits: code-only (include), planning-only (exclude), mixed (include sans .planning/)
- Cherry-picks code commits onto a clean branch
- Reviewers see only code changes, no WSF artifacts

Usage: `/wsf-pr-branch` or `/wsf-pr-branch main`

---

**`/wsf-plant-seed [idea]`**
Capture a forward-looking idea with trigger conditions for automatic surfacing.

- Seeds preserve WHY, WHEN to surface, and breadcrumbs to related code
- Auto-surfaces during `/wsf-new-milestone` when trigger conditions match
- Better than deferred items — triggers are checked, not forgotten

Usage: `/wsf-plant-seed "add real-time notifications when we build the events system"`

---

**`/wsf-audit-uat`**
Cross-phase audit of all outstanding UAT and verification items.
- Scans every phase for pending, skipped, blocked, and human_needed items
- Cross-references against codebase to detect stale documentation
- Produces prioritized human test plan grouped by testability
- Use before starting a new milestone to clear verification debt

Usage: `/wsf-audit-uat`

### Milestone Auditing

**`/wsf-audit-milestone [version]`**
Audit milestone completion against original intent.

- Reads all phase VERIFICATION.md files
- Checks requirements coverage
- Spawns integration checker for cross-phase wiring
- Creates MILESTONE-AUDIT.md with gaps and tech debt

Usage: `/wsf-audit-milestone`

**`/wsf-plan-milestone-gaps`**
Create phases to close gaps identified by audit.

- Reads MILESTONE-AUDIT.md and groups gaps into phases
- Prioritizes by requirement priority (must/should/nice)
- Adds gap closure phases to ROADMAP.md
- Ready for `/wsf-plan-phase` on new phases

Usage: `/wsf-plan-milestone-gaps`

### Configuration

**`/wsf-settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, plan checker, verifier agents
- Select model profile (quality/balanced/budget/inherit)
- Updates `.planning/config.json`

Usage: `/wsf-settings`

**`/wsf-set-profile <profile>`**
Quick switch model profile for WSF agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification
- `inherit` — Use current session model for all agents (OpenCode `/model`)

Usage: `/wsf-set-profile budget`

### Utility Commands

**`/wsf-cleanup`**
Archive accumulated phase directories from completed milestones.

- Identifies phases from completed milestones still in `.planning/phases/`
- Shows dry-run summary before moving anything
- Moves phase dirs to `.planning/milestones/v{X.Y}-phases/`
- Use after multiple milestones to reduce `.planning/phases/` clutter

Usage: `/wsf-cleanup`

**`/wsf-help`**
Show this command reference.

**`/wsf-join-discord`**
Join the WSF Discord community.

- Get help, share what you're building, stay updated
- Connect with other WSF users

Usage: `/wsf-join-discord`

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current phase breakdown
├── STATE.md              # Project memory & context
├── RETROSPECTIVE.md      # Living retrospective (updated per milestone)
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
│   ├── pending/          # Todos waiting to be worked on
│   └── done/             # Completed todos
├── debug/                # Active debug sessions
│   └── resolved/         # Archived resolved issues
├── milestones/
│   ├── v1.0-ROADMAP.md       # Archived roadmap snapshot
│   ├── v1.0-REQUIREMENTS.md  # Archived requirements
│   └── v1.0-phases/          # Archived phase dirs (via /wsf-cleanup or --archive-phases)
│       ├── 01-foundation/
│       └── 02-core-features/
├── codebase/             # Codebase map (brownfield projects)
│   ├── STACK.md          # Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md   # Patterns, layers, data flow
│   ├── STRUCTURE.md      # Directory layout, key files
│   ├── CONVENTIONS.md    # Coding standards, naming
│   ├── TESTING.md        # Test setup, patterns
│   ├── INTEGRATIONS.md   # External services, APIs
│   └── CONCERNS.md       # Tech debt, known issues
└── phases/
    ├── 01-foundation/
    │   ├── 01-01-PLAN.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-PLAN.md
        └── 02-01-SUMMARY.md
```

## Workflow Modes

Set during `/wsf-new-project`:

**Interactive Mode**

- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**

- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `.planning/config.json`

## Planning Configuration

Configure how planning artifacts are managed in `.planning/config.json`:

**`planning.commit_docs`** (default: `true`)
- `true`: Planning artifacts committed to git (standard workflow)
- `false`: Planning artifacts kept local-only, not committed

When `commit_docs: false`:
- Add `.planning/` to your `.gitignore`
- Useful for OSS contributions, client projects, or keeping planning private
- All planning files still work normally, just not tracked in git

**`planning.search_gitignored`** (default: `false`)
- `true`: Add `--no-ignore` to broad ripgrep searches
- Only needed when `.planning/` is gitignored and you want project-wide searches to include it

Example config:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## Common Workflows

**Starting a new project:**

```
/wsf-new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/wsf-plan-phase 1       # Create plans for first phase
/clear
/wsf-execute-phase 1    # Execute all plans in phase
```

**Resuming work after a break:**

```
/wsf-progress  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/wsf-insert-phase 5 "Critical security fix"
/wsf-plan-phase 5.1
/wsf-execute-phase 5.1
```

**Completing a milestone:**

```
/wsf-complete-milestone 1.0.0
/clear
/wsf-new-milestone  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/wsf-add-todo                    # Capture from conversation context
/wsf-add-todo Fix modal z-index  # Capture with explicit description
/wsf-check-todos                 # Review and work on todos
/wsf-check-todos api             # Filter by area
```

**Debugging an issue:**

```
/wsf-debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/wsf-debug                                    # Resume from where you left off
```

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for phase status
- Run `/wsf-progress` to check where you're up to
</reference>
