# {name}

<!--
Proposal naming contract — inherited by every new proposal from this shared
skeleton.

- Structure: `<type>-<slug>`; `type` uses the standard values, fully spelled
  (feature / fix / enhance / refactor / docs / test / chore / perf).
- `slug` = 1–2 core nouns, kebab-case, ≤ 20 chars. Drop verb phrases and
  articles; never copy the title.
- The name is load-bearing: `accept` derives the isolation branch and the
  worktree directory by prefixing `ontology-` to the **entire proposal name**
  (the stem): `refactor-ontology-maintenance` yields
  `ontology-refactor-ontology-maintenance`, and a verbose name produces an
  unreadable branch.

| Verbose (forbidden) | Lean (target) |
|---------------------|---------------|
| `consolidate-ontology-maintenance-into-the-ontology-evolution-skill` | `refactor-ontology-maintenance` |
-->

## Metadata

<!--
Mode / Worktree / Branch / Base Commit are recorded by `accept`, Final Commit
by `integrate`; `Stage` advances only through `wopal space evo advance`.
Never hand-edit any of these — the fields stay `(none)` until the mechanism
writes them.
-->

- **Type**: {type}
- **Project Path**: .wopal
- **Created**: {created}
- **Stage**: draft
- **Mode**: (none)
- **Worktree**: (none)
- **Branch**: (none)
- **Base Commit**: (none)
- **Final Commit**: (none)

## Scope Assessment

<!--
Pick one level per dimension; do not overrate. Complexity drives the
delegation waves; Confidence tells the reader how strong the evidence is.
-->
- **Complexity**: <Low | Medium | High>
- **Confidence**: <High | Medium | Low>

## Goal

<!--
One sentence: what this evolution is meant to achieve. Readers decide from
here whether to keep reading.
-->
<What this evolution aims to achieve.>

## Technical Context

<!-- Four subsections; keep the ones that apply, at least one. -->

### Architecture Context

<!--
Current state + why it must change. Cite the design source of truth
(DESIGN-*.md) and key code locations (file:line) — evidence first.
-->
<Current mechanism, modules involved, and why it must change.>

### Research Findings

<!-- Research conclusions; the reference list holds context document paths only. -->
<Research conclusion summary>

**References**:
- `<context document path>`

### Key Decisions

<!-- Settled decisions numbered D-01, D-02, ...; decision + rationale, no implementation detail. -->
- D-01: <decision and rationale>

### Key Interfaces

<!--
External contracts (hard constraint): command behavior, file naming, error
codes, boundary conditions. Once listed, it is a red line — changing it
during implementation requires reporting back for a revised proposal.
Write N/A when there is no external contract.
-->
<Contract definition, or N/A>

## In Scope

<!-- What this round delivers, item by item, checkable. -->
- <Item 1>
- <Item 2>

## Out of Scope

<!--
What is deliberately excluded and why. Keep "deliberately cut" separate from
"awaiting the user's call" so the reader does not mistake it for an omission.
-->
- <Excluded item and reason>

## Affected Files

<!-- Expected footprint, not a construction list; implementation may adjust. -->
| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| <component> | `file1`, `file2` | create / modify / delete | <role in this change> |

## Assembly Intent

<!--
Register only the new whole assets this proposal introduces — one
canonical reference per asset (`skill:new-skill`, `path:assets`, ...) —
and only when no held asset already covers the new path. A file inside
an asset the space already holds is an ordinary content change; reserved
content (`assembly/`, `config/`, `docs/`, repository-root files) is
never claimable — neither belongs here. `type-default` writes the
reference into the current type manifest, so every space of the type
receives the asset; `space-local` records it in this space's `include`,
so only this space mounts it. Each reference appears once; a whole asset
left undeclared is refused when the proposal lands. Leave the table
empty when nothing new is added; one row reads
`skill:new-skill | space-local | why only this space`.
-->

| Ref | Scope | 理由 |
|-----|-------|------|

## Acceptance Criteria

### Agent Verification

<!--
Two-beat rule: write behavioral criteria now (decidable, able to catch a bad
implementation); during implementation each one gets a real command and is
written back here. Every entry maps to a Task's Verification Intent.
-->
1. [ ] <Behavioral criterion + pass standard>

### User Validation

<!--
Only items an agent cannot verify and the user must observe by hand. Every
scenario needs: environment, launch command, user actions, pass criteria,
failure feedback.
-->
#### Scenario 1: <user-observable behavior>
- Goal: <validation goal>
- Environment: <environment reference>
- Precondition: <precondition>
- Launch command: <copy-pasteable command>
- User Actions:
  1. <step>
- Pass criteria: <assertable expected result>
- Failure feedback: <what the user provides on failure>

- [ ] The user has validated the behavior above and confirmed the result.

## Implementation

<!--
Tasks split by behavior group, not by file. One Task = one cohesive
behavior unit, independently testable.
-->

### Task 1: <task title>

**Verification Intent**: <Agent Verification entry number(s) this task answers>

**Behavior**:
- <given input / condition → observable result>

**Pre-read**: <files to read before implementing>

**Design**: <approach, key ideas, constraints>

**TDD**: true

**Changes**:
1. RED: turn the Behavior above into a failing test
2. GREEN: implement until the test passes

**Verify**: <verification command>

**Done**:
<!--
Record ownership: the 主控 (orchestrator) is the single author of this
whole block — the completion checkbox, the task output and the files
touched. The record is filled in the proposal copy on the working branch
(the isolation worktree in isolated mode, the space worktree in quick
mode), after the task passed verification and before its commit.
Implementation agents do not edit any part of the proposal file.
-->
Task output: <one line>
Files touched: <fill in after implementation>
- [ ] The implementation agent has completed all development and verification steps above.

---

## Delegation Strategy

<!-- Required for 2+ Tasks or Complexity = High; Wave batches the parallel work. -->

| Wave | Task | Executor | Depends on | Why delegated |
|------|------|----------|------------|---------------|
| 1 | Task 1 | fae | none | <reason> |

## Delivery

`space sync` and `ontology contribute` are the user's call — the skill never uploads on its own.
