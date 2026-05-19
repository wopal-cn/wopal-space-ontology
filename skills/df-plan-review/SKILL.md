---
name: df-plan-review
description: |
  Plan quality verification for dev-flow. Goal-backward analysis ensures plans WILL achieve their stated goal before execution burns context.
  
  ⚠️ MUST use when:
  (1) Reviewing Plan quality before approve
  (2) Wopal completes Plan writing and needs quality gate
  (3) User asks to "check plan", "verify plan", "review plan"
  (4) Plan enters planning status and needs pre-execution validation
  
  🔴 Trigger automatically when Plan is ready for review, even if user doesn't explicitly say "review".
  
  Agent: rook (read-only verification subagent)
  Mode: verification, not execution
---

# df-plan-review — Plan Quality Verification

Goal-backward verification: Start from what the plan SHOULD deliver, verify it addresses that goal completely.

## Core Principle

**Plan completeness =/= Goal achievement**

A task "create auth endpoint" can exist in the plan while password hashing is missing. The task exists but the goal "secure authentication" won't be achieved.

## Six Verification Dimensions

### 1. Goal Coverage

**Question**: Does every stated goal have implementing task(s)?

**Why**: Missing goal coverage = plan won't deliver what it promises.

**Process**:
1. Extract goal from Plan header
2. For each goal component, find covering task(s)
3. Flag goals with zero tasks or vague coverage

**Severity**: BLOCKER if any goal component lacks coverage.

### 2. Task Completeness

**Question**: Does every task have Files + Action + Verify + Done?

**Why**: Missing verification = can't confirm completion.

**Required elements by task type**:
- `auto`: Files, Action, Verify, Done
- `tdd`: Files, Behavior, Implementation, Test commands, Expected outcomes
- `checkpoint:*`: N/A (marker tasks)

**Red flags**: Missing `<verify>`, vague `<action>`, empty `<files>`

**Severity**: BLOCKER for missing required fields.

### 3. Dependency & Wave Correctness

**Question**: Are task dependencies valid and wave assignment consistent?

**Why**: Broken dependencies = execution will fail at runtime.

**Process**:
1. Parse Delegation Strategy wave assignments
2. Check: Wave N depends on Wave N-1 outputs
3. Check: No circular dependencies
4. Check: Parallel tasks (same wave) have independent files

**Red flags**: Wave 2 referencing Wave 3 output, circular A→B→A

**Severity**: BLOCKER for circular dependencies or impossible wave order.

### 4. Key Links Planned

**Question**: Are artifacts wired together, not just created in isolation?

**Why**: Component created but not imported = dead code.

**Process**:
1. Identify artifacts in Files columns
2. For dependent pairs (Component→API, Form→Handler), check Action mentions wiring
3. Flag missing connections

**Severity**: WARNING for missing wiring in Action descriptions.

### 5. Verification Falsifiability

**Question**: Can each Verify command actually prove completion?

**Why**: "Manual — later" or "quality is good" = unverifiable.

**Valid patterns**:
- `rg -c 'pattern' file` ≥ 1
- `pytest tests/` passes
- `flow.sh complete` succeeds

**Invalid patterns**:
- "Manual verification" without explicit reason
- Vague descriptions ("tests pass", "code works")
- Commands that can't be executed by Agent

**Severity**: BLOCKER for unverifiable commands without explicit manual reason.

### 6. Scope & Context Match

**Question**: Will plan complete within context budget and scope boundaries?

**Why**: 5+ tasks/plan = quality degradation. Scope exceeding In Scope = uncontrolled expansion.

**Thresholds**:
- Tasks/plan: 2-3 good, 4 warning, 5+ blocker (split required)
- Files/plan: 5-8 good, 10 warning, 15+ blocker
- Out of Scope violations: BLOCKER

**Red flags**: Plan includes Out of Scope items, 5+ tasks, complex work crammed into one wave

**Severity**: BLOCKER for Out of Scope violations or extreme complexity.

## Scope Reduction Detection

**Most insidious failure**: Plan claims to implement a decision but delivers a shadow version.

**Pattern scan**: Look for scope reduction language in Actions:
- "v1", "simplified", "static for now", "hardcoded"
- "future enhancement", "placeholder", "basic version"
- "NOT wired to", "NOT connected to", "stub"

**Cross-reference**: Match against Plan goal and Technical Context decisions. If reduced from stated requirement → BLOCKER.

**Fix path**: Either deliver fully or propose phase split, don't silently shrink.

## Revision Loop

**Bounded iteration**: Max 3 revision rounds to prevent infinite planner-checker对抗.

**Loop behavior**:
1. Checker finds issues → returns ISSUES FOUND
2. Planner revises → Checker re-verifies
3. Repeat until PASS or 3 rounds exhausted
4. 3 rounds BLOCK → escalate to user with preserved分歧注释

## Output Contract

### VERIFICATION PASSED

```markdown
## VERIFICATION PASSED

**Plan**: {plan-name}
**Status**: Ready for approve

### Goal Coverage
| Goal Component | Tasks | Coverage |
|----------------|-------|----------|
| {component-1}  | 1,2   | Complete |
| {component-2}  | 3     | Complete |

### Plan Summary
| Metric | Value | Status |
|--------|-------|--------|
| Tasks  | 3     | ✅ Within budget |
| Files  | 6     | ✅ Within budget |
| Waves  | 2     | ✅ Valid |

Plan verified. Proceed to `approve`.
```

### ISSUES FOUND

```markdown
## ISSUES FOUND

**Plan**: {plan-name}
**Issues**: {N} blocker(s), {Y} warning(s), {Z} info

### Blockers (must fix)

**1. [{dimension}] {description}**
- Task: {task-number}
- Issue: {specific problem}
- Fix: {concrete fix hint}

### Warnings (should fix)

**1. [{dimension}] {description}**
- Fix: {suggestion}

### Recommendation

Return to planner with feedback. Max {remaining} revision rounds.
```

## Anti-patterns

**DO NOT**:
- Check codebase existence (that's verifier's job)
- Run tests (static plan analysis only)
- Accept vague tasks ("implement auth" without specifics)
- Skip dependency analysis
- Ignore scope boundaries
- Trust task names alone (read Action/Verify/Done)
- Allow unverifiable commands without explicit manual reason

## References

Load detailed rubric when needed:
- `references/review-rubric.md` — Six-dimension detailed process, scope reduction patterns, revision loop rules, issue format specification

## Examples

### Example 1: Missing Goal Coverage

**Plan goal**: "Implement secure authentication with login, logout, session persistence"

**Issue found**:
```yaml
issue:
  dimension: goal_coverage
  severity: blocker
  description: "Logout functionality has no implementing task"
  plan: "143-..."
  goal_component: "logout"
  fix_hint: "Add Task for logout endpoint or confirm logout is deferred with explicit reason"
```

### Example 2: Scope Reduction

**Technical Context D-26**: "Config displays calculated costs in impulses from pricing table"

**Task Action**: "D-26 cost references (v1 — static labels). NOT wired to billing"

**Issue found**:
```yaml
issue:
  dimension: scope_reduction
  severity: blocker
  description: "Plan reduces D-26 from calculated costs to static hardcoded labels"
  plan: "143-..."
  task: 1
  decision: "D-26: Config displays calculated costs"
  plan_action: "static labels v1 — NOT wired"
  fix_hint: "Either implement D-26 fully or split phase, don't silently reduce"
```