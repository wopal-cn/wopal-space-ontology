# Proposal Landing Reference

Read this file only after an evolution proposal has user approval and is about to enter, or is already in, landing. The main Skill decides whether landing should happen; this file explains how to land safely. For exact CLI arguments and refusal semantics, read [`commands.md`](commands.md).

## State machine

```text
draft → accepted → implementing → validating → archived
```

| Stage | Meaning |
|-------|---------|
| `draft` | Proposal is on disk, waiting for the user to read it |
| `accepted` | User approved; mode and isolation metadata are recorded |
| `implementing` | Tasks are implemented, committed one task at a time, and implementation review runs |
| `validating` | User observes / validates; required rework continues on the working branch |
| `archived` | User confirmed completion and the proposal is filed away |

Advance one edge at a time; there is no backward edge. Express rework with new commits, not stage rewinds. Review is a gate inside `implementing`, not its own stage.

## Ownership

| Action | Executor | Condition |
|--------|----------|-----------|
| `accept` / `advance` / `commit` / `integrate` / `archive` | Wopal | Follow the state machine and user gates |
| Implement capability assets | Fae | Work only in the workspace and file scope assigned by Wopal |
| Backfill proposal Done record | Wopal | After each task verifies, before its commit |
| Implementation review | Rook | After all tasks pass Wopal verification, before user validation |
| Validation and integration go | User | After review passes |

Implementation review cannot be skipped. Its budget is 2 rounds, and the first round must list every finding in one pass rather than stretching findings across rounds.

## Records and commits

The proposal's `Done` section is the implementation ledger: task completion, output, and files actually touched.

- **Wopal is the sole author.** Fae never edits the proposal.
- **Verify, then backfill, then commit.** The record and that task's asset changes ride the same commit.
- **Exactly one commit per completed task.** Implementation agents do not commit independently.
- In isolated mode, edit only the proposal copy on the working branch; do not maintain a second record on the space branch.
- Parallel tasks must use explicit `--paths` for that task's files plus the proposal file; new files must also be named explicitly.
- Never reset, stash, clean, or otherwise dispose of another task's work. Stop and report conflicts or unfamiliar changes.

## Isolated and Quick modes

### Default: isolated

`accept` derives an isolation worktree from `.wopal`. Implementation, per-task commits, and review happen on the working branch; the space branch remains unchanged until the user validates and authorizes integration.

Key constraints:

- The isolation worktree must retain the space assembly range or a safe superset.
- Widen visibility before committing new capabilities; bare `git add --sparse` is not an assembly substitute.
- The space branch receives isolated work only through `wopal space evo integrate <name> --confirm`.
- For load-path changes, real validation means restarting the runtime and observing behavior; passing tests alone is not enough.

### Quick mode

When the user explicitly scopes a small change as quick, `accept <name> --no-worktree` creates no isolation worktree and per-task commits land directly on the space branch.

Quick changes only the work location. Records, per-task commits, mandatory review, user validation, and archive gates stay the same. Because work already lands on the space branch, quick mode has no `switch` or `integrate` step.

## Validation forms

After review passes and the proposal enters `validating`, let the user choose the validation form.

### Preferred: branch switch

```bash
wopal space evo switch <name>   # enter validation view
# restart the runtime and observe
wopal space evo switch <name>   # return to the space branch
```

This lets the user observe the feature branch without integrating first. Findings during observation are repaired on the working branch and validation repeats.

### Alternative: integrate first

Only on explicit user choice, after entering `validating`:

```bash
wopal space evo integrate <name> --confirm
```

The user then validates the current delivery candidate directly on the space branch. If validation finds a problem, rework still lands on the working branch; run `integrate --confirm` again to refresh the same candidate, so the space branch does not accumulate a second delivery commit.

## Integration gate

`integrate --confirm` represents the user's explicit go. Do not integrate without user confirmation; `--confirm` itself does not advance the stage.

Branch-switch path: user validation passes → leave validation view → user explicitly confirms → `integrate --confirm`.

Integrate-first path: user explicitly chooses early integration → `integrate --confirm` → user validates; if rework is needed, keep it on the working branch and re-run `integrate --confirm` to refresh the same candidate before validating again.

## Complete sequence

1. User approves the proposal.
2. Wopal runs `accept`.
3. Wopal runs `advance --to implementing`.
4. Fae implements a task.
5. Wopal repeats per task: verify → backfill Done → `commit`.
6. Rook performs implementation review; budget 2 rounds, with every finding listed in round one; rework and re-review as needed.
7. Wopal runs `advance --to validating`.
8. Wopal lets the user choose branch switch (recommended) or integrate-first.
9. User restarts / observes and reports; rework, candidate refresh, and validation repeat if needed.
10. User confirms validation passed.
11. Only the branch-switch path now runs `integrate --confirm`.
12. Once user validation has already passed, a successful `integrate` is not a stopping point; Wopal immediately runs `advance --to archived`, then `archive`.
13. `space sync`, upstream PR publication, merge, and deletion are separate user decisions.

## Instant mode: direct capability maintenance

If the work is a defect repair, or a bounded capability maintenance change with clear ownership and no separate validation boundary, no proposal is needed:

```bash
wopal space evo commit -m "<message>" --paths <path>...
```

Instant mode commits directly to the space branch and creates no proposal or stage movement, while retaining the same sparse-range and named-staging safety checks.

Adding one complete Skill / Rule / Command does not by itself require a Proposal. Use the formal evolution flow when the change needs a separate design or validation boundary, such as a cross-capability contract, assembly-model or loading-lifecycle change, high-risk migration, or staged validation.

## When to read the command reference

Read [`commands.md`](commands.md) instead of guessing whenever:

- You need full arguments or a stage guard for a `wopal space evo` command.
- A command refuses and you need the exact precondition.
- Sparse range, visibility / corpus assertion, or Assembly Intent is involved.
- You need exact commit behavior for instant, isolated, or quick mode.
