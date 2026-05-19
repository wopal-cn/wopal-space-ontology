# Plan Review Rubric — Detailed Process

Six-dimension goal-backward verification with scope reduction detection and bounded revision loop.

## Dimension 1: Goal Coverage

### Why Critical

Plan header states a goal. If goal components lack implementing tasks, execution will burn context without delivering the promised outcome.

### Process

1. Extract goal from `## Goal` section
2. Decompose goal into verifiable components:
   - Example: "Add rook for automated verification" → components: agent definition, plan-review skill, implement-review skill, wopal delegation integration
3. For each component, scan `## Implementation` tasks for coverage
4. Check Delegation Strategy: does every task exist in a wave?
5. Build coverage matrix

### Coverage Matrix

```
Goal Component      | Tasks | Wave | Status
--------------------|-------|------|--------
Agent definition    | 1     | 1    | Covered
Plan-review skill   | -     | -    | MISSING
Implement skill     | 3     | 2    | Covered
```

### Severity Rules

- **BLOCKER**: Goal component with zero tasks
- **WARNING**: Goal component covered by single vague task ("implement all skills")
- **INFO**: Multiple goal components share one task (acceptable if task is comprehensive)

### Fix Hints

- Missing component: Add dedicated task or split existing task
- Vague coverage: Decompose task into specific implementation steps
- Shared coverage: Verify task Action explicitly mentions all components

## Dimension 2: Task Completeness

### Why Critical

Incomplete task fields = unverifiable execution. Agent can't confirm completion, Wopal can't gate quality.

### Required Fields by Task Type

| Task Type | Files | Action | Verify | Done | Behavior | TDD |
|-----------|-------|--------|--------|------|----------|-----|
| `auto` | Required | Required | Required | Required | Optional | Default: true |
| `tdd` | Required | Required | Required | Required | Required | Required: true |
| `checkpoint:*` | N/A | N/A | N/A | N/A | N/A | N/A |

### Field Quality Checks

**Files**:
- Must specify concrete paths (not "various files")
- Check: paths align with Affected Files table

**Action**:
- Must be specific steps (not "implement feature")
- Check: numbered list format (1. 2. 3.), not checkboxes

**Verify**:
- Must be executable command or explicit `Manual — <reason>`
- Check: command can run in shell (rg, pytest, flow.sh, etc.)
- Invalid: "Manual — later", "quality is good", "tests pass"

**Done**:
- Must exist and be checkbox format `- [ ] ...`
- Check: placeholder for Agent completion marking

**Behavior** (TDD tasks):
- Must describe input/output mapping
- Example: "Given X input, returns Y output, throws Z on error"
- Invalid: "behavior is correct"

### Severity Rules

- **BLOCKER**: Missing Files, Action, Verify, Done (required fields)
- **BLOCKER**: Unverifiable Verify without explicit manual reason
- **WARNING**: Vague Action ("implement", "create", "add" without specifics)
- **INFO**: Behavior field could be more specific

### Fix Hints

- Missing field: Add field with concrete content
- Unverifiable Verify: Replace with `rg -c 'pattern' file` or explicit `Manual — user must verify UI appearance`
- Vague Action: Decompose into numbered implementation steps

## Dimension 3: Dependency & Wave Correctness

### Why Critical

Execution follows wave order. Wave N tasks assume Wave N-1 outputs exist. Broken dependencies = runtime failure.

### Dependency Rules

- **Wave N depends on Wave N-1**: All Wave 2 tasks can reference Wave 1 outputs
- **Wave N tasks are parallel**: No file conflicts within same wave
- **No forward references**: Wave 1 cannot reference Wave 2 outputs
- **No circular dependencies**: A→B→C→A is impossible

### Process

1. Parse Delegation Strategy table
2. Build dependency graph from "依赖" column
3. For each wave:
   - Check dependencies: all referenced tasks in lower waves
   - Check parallelism: Files columns have no intersection
4. Detect cycles via graph traversal

### File Conflict Detection

```
Wave 1:
  Task 1: Files: `agents/rook-cn.md`
  Task 2: Files: `agents/rook-cn.md` ← BLOCKER: same file, can't parallelize

Wave 2:
  Task 3: Files: `skills/df-plan-review/SKILL.md`
  Task 4: Files: `skills/df-implement-review/SKILL.md` ← OK: different files
```

### Severity Rules

- **BLOCKER**: Circular dependency
- **BLOCKER**: Forward reference (Wave N referencing Wave N+1)
- **BLOCKER**: File conflict within same wave
- **WARNING**: Missing dependency declaration (should explicitly state dependency)
- **INFO**: Dependency could be split for better parallelism

### Fix Hints

- Circular dependency: Reorder tasks or split into phases
- Forward reference: Move task to higher wave or redesign
- File conflict: Sequentialize tasks (move to higher wave) or split files
- Missing declaration: Add explicit dependency in Delegation Strategy

## Dimension 4: Key Links Planned

### Why Critical

Artifacts created in isolation = dead code. Wiring between components is the real implementation.

### Common Link Patterns

| Link Type | From | To | Via | Check in Action |
|-----------|------|----|----|-----------------|
| Component→API | UI component | API route | fetch call | "fetch('/api/...')" in Action |
| Form→Handler | Form component | Submit handler | onSubmit | "handleSubmit" in Action |
| State→Render | State definition | Render logic | useState/useEffect | "useEffect" in Action |
| Agent→Skill | Agent definition | Skill load | skill tool | "加载 df-plan-review skill" in Action |

### Process

1. Extract Affected Files table
2. Identify link patterns from file pairs (e.g., `agents/rook-cn.md` + `skills/df-plan-review/SKILL.md`)
3. For each link, scan Task Action for wiring evidence
4. Flag missing connections

### Severity Rules

- **WARNING**: Key link missing in Action (artifact created but wiring not planned)
- **INFO**: Link could be more explicit (Action mentions component but not specific connection)

### Fix Hints

- Missing link: Add wiring step in Action (e.g., "In rook-cn.md, add skill routing rule to load df-plan-review")
- Implicit link: Make explicit in Action (e.g., "Connect X to Y via fetch call")

## Dimension 5: Verification Falsifiability

### Why Critical

Unverifiable Verify commands = Agent can't confirm completion, Wopal can't gate quality.

### Valid Command Patterns

- `rg -c 'pattern' file` ≥ 1 (pattern must exist)
- `rg -n 'pattern' file` ≥ N (multiple matches)
- `pytest tests/` passes
- `flow.sh complete` succeeds
- `test -f file` exits 0

### Invalid Patterns

- "Manual verification" without explicit reason
- "Manual — later" (deferred without justification)
- "Quality is good" (vague)
- "Tests pass" (no command)
- "Code works" (unverifiable)

### Explicit Manual Reason Pattern

Valid: `Manual — user must verify UI appearance in browser`
Valid: `Manual — requires human judgment on content quality`
Invalid: `Manual — later`

### Severity Rules

- **BLOCKER**: Verify field missing
- **BLOCKER**: Unverifiable command without explicit manual reason
- **WARNING**: Verify command could be more specific (e.g., "tests pass" → "pytest tests/unit/test_auth.py -v")

### Fix Hints

- Missing Verify: Add executable command
- Unverifiable command: Replace with `rg -c 'pattern' file` or explicit manual reason
- Vague command: Add specific file path or pattern

## Dimension 6: Scope & Context Match

### Why Critical

Context budget limits execution quality. 5+ tasks/plan degrades quality. Scope boundary violations = uncontrolled expansion.

### Task Count Thresholds

| Metric | Target | Warning | Blocker |
|--------|--------|---------|---------|
| Tasks/plan | 2-3 | 4 | 5+ |
| Files/plan | 5-8 | 10 | 15+ |
| Total waves | 2-3 | 4 | 5+ |

### Scope Boundary Check

1. Parse `## In Scope` and `## Out of Scope`
2. For each Task, check Action aligns with In Scope
3. Flag any Task implementing Out of Scope item
4. Check Technical Context decisions: are all implemented?

### Scope Reduction Detection

**Most insidious pattern**: Plan claims to implement decision but delivers shadow version.

Scan Actions for reduction language:
- "v1", "v2", "simplified", "static for now", "hardcoded"
- "future enhancement", "placeholder", "basic version", "minimal"
- "NOT wired to", "NOT connected to", "stub"
- "will be wired later", "dynamic in future", "skip for now"

Cross-reference with Technical Context decisions. If reduced from stated requirement → BLOCKER.

### Severity Rules

- **BLOCKER**: Out of Scope item in Implementation
- **BLOCKER**: Scope reduction from stated decision (D-XX reduced to "v1")
- **BLOCKER**: 5+ tasks/plan (split required)
- **WARNING**: 4 tasks/plan (split recommended)
- **INFO**: 3 tasks/plan but files exceed 10 (consider split)

### Fix Hints

- Out of Scope violation: Remove task or update Out of Scope with explicit reason
- Scope reduction: Either implement fully or split into phases
- 5+ tasks: Split into multiple plans (e.g., "143-part-1", "143-part-2")

## Scope Reduction Rules

### Definition

Scope reduction = planner silently delivers a fraction of user requirement, often with "v1/v2" language that doesn't exist in the original decision.

### Pattern Library

| Reduction Pattern | Example |
|-------------------|---------|
| Versioning invention | "D-26 (v1 — static)" when D-26 says "calculated costs" |
| Deferred wiring | "NOT wired to billing" when decision requires connection |
| Placeholder | "placeholder for future" when decision requires now |
| Simplified | "simplified version" without decision approval |
| Hardcoded | "hardcoded for demo" when decision requires dynamic |

### Cross-Reference Process

1. Extract all D-XX from Technical Context
2. For each task claiming D-XX, compare Action content with D-XX text
3. If Action reduces D-XX → BLOCKER

### Fix Path

When detected:
```markdown
Plan reduces {N} decisions. Options:
1. Revise plan to deliver decisions fully (may increase task count)
2. Split phase: [suggested grouping of D-XX into sub-phases]
```

## Severity Levels

### BLOCKER

Must fix before execution. Examples:
- Missing goal coverage
- Missing required task fields
- Circular dependency
- Unverifiable Verify without manual reason
- Out of Scope violation
- Scope reduction
- 5+ tasks/plan

### WARNING

Should fix, execution may work but quality risks. Examples:
- Vague Action
- Missing wiring in Action
- 4 tasks/plan
- Verify command could be more specific

### INFO

Suggestions for improvement. Examples:
- Could split for better parallelism
- Behavior field could be more specific
- Link could be more explicit

## Revision Loop

### Bounded Iteration

Max 3 revision rounds to prevent infinite planner-checker对抗.

### Loop Flow

```
Round 1: Checker finds issues → ISSUES FOUND → Planner revises
Round 2: Checker re-verifies → ISSUES FOUND (reduced) → Planner revises
Round 3: Checker re-verifies → ISSUES FOUND (persistent) → BLOCK → Escalate
```

### Escalation Pattern

After 3 rounds BLOCK:
```markdown
## VERIFICATION BLOCKED

**Plan**: {plan-name}
**Rounds**: 3/3 exhausted
**Persistent blockers**: {N}

Checker and planner disagree on:
- {issue-1}
- {issue-2}

Recommendation: User decision required. Preserved分歧注释 in Plan for approve gate.
```

### Preserved Divergence

Add comment in Plan:
```markdown
<!-- VERIFICATION DISPUTE: Checker认为Task X缺少Y, Planner认为Z足够. User decide at approve. -->
```

## Issue Format

### YAML Structure

```yaml
issue:
  plan: "{plan-name}"
  dimension: "{dimension-name}"
  severity: "{blocker|warning|info}"
  description: "{specific problem}"
  task: {task-number}
  goal_component: "{component}"  # for goal_coverage
  decision: "D-XX"                # for scope_reduction
  plan_action: "{action excerpt}" # for scope_reduction
  fix_hint: "{concrete fix}"
```

### Examples

**Goal coverage**:
```yaml
issue:
  dimension: goal_coverage
  severity: blocker
  description: "Logout functionality has no implementing task"
  goal_component: "logout"
  fix_hint: "Add Task for logout endpoint or confirm deferred with explicit reason"
```

**Scope reduction**:
```yaml
issue:
  dimension: scope_reduction
  severity: blocker
  description: "Plan reduces D-26 from calculated costs to static labels"
  task: 1
  decision: "D-26: Config displays calculated costs"
  plan_action: "static labels v1 — NOT wired"
  fix_hint: "Either implement D-26 fully or split phase"
```

**Unverifiable Verify**:
```yaml
issue:
  dimension: verification_falsifiability
  severity: blocker
  description: "Verify command unverifiable: 'Manual — later'"
  task: 2
  fix_hint: "Replace with 'rg -c 'pattern' file' or explicit manual reason"
```

## Anti-patterns (Checker)

**DO NOT**:
- Check codebase files exist (verifier's job)
- Run tests (static analysis only)
- Accept vague Actions without challenging
- Skip dependency graph validation
- Ignore scope boundaries
- Trust task names (read Action/Verify/Done fields)
- Allow unverifiable commands
- Permit scope reduction without blocking

**DO**:
- Start from goal, work backwards
- Read every Action, Verify, Done field
- Build dependency graph explicitly
- Check every file pair for key links
- Scan for scope reduction language
- Issue specific fix hints
- Respect 3-round limit