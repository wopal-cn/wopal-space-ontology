---
name: df-implement
description: >
  Write or update code and tests to deliver a settled requirement, an approved
  Plan task, an active design, or a bug fix. Use for both direct and delegated
  coding work.
---

# df-implement — Implementation Discipline

You are doing **implementation work**. Deliver the requested change with the smallest reliable, verifiable code change that stays inside the design and task boundaries.

For project/phase work: **DESIGN defines the target, the approved Plan defines this delivery scope, implementation builds it.**

## Read before writing

Before editing, understand:

- the current task and acceptance criteria;
- the Task's `Design Source` when present, confirming every cited DESIGN is `Status: Active`;
- the Task's `Pre-read`, `Interface`, and `Constraints` when present;
- the relevant call path and callers;
- the current and parent `AGENTS.md` rules.

If you still cannot explain why the proposed change fits the current code, design, and task, keep investigating instead of guessing.

## Minimum implementation order

While preserving design, Plan, correctness, and tests, prefer the simplest option in this order:

1. If the task and acceptance do not require it, do not add it.
2. Reuse an existing function, module, or pattern in this repo when one already fits.
3. Prefer the language standard library when it fits.
4. Prefer built-in platform or runtime features when they fit.
5. Reuse already-installed dependencies when appropriate.
6. Prefer simple direct code over new abstractions, wrappers, or dependencies.
7. Add new structure only when the earlier options are not enough.

A new dependency needs a clear reason why existing options fall short. “Minimum” means leaving no unnecessary code or structure behind after all requirements are met—never doing less than required.

## Clean up orphans your change creates

When your change replaces or removes a function call, a module import, or a package usage, check with `rg` whether the old function, file, or dependency now has **zero references** in production code. If nothing in production uses it anymore, delete the dead function or file, delete tests that only covered that dead code, and remove the unused package from the dependency manifest in the same change. Cleaning up orphans created by your own edit is finishing the job, not scope creep.

## Do not drift from design or task

Do not autonomously change:

- the target or architecture constraints defined by DESIGN / `Design Source`;
- the behavior, scope, boundaries, interfaces, or acceptance criteria of an approved Plan;
- anything the user explicitly required.

You may decide:

- file layout, internal APIs, and helper decomposition inside the stated boundaries;
- concrete implementation technique;
- test implementation details.

Do not expand scope, bundle unrelated refactors, fix unrelated bugs, or weaken acceptance criteria to make tests pass.

A few easy-to-misjudge boundaries:

- A pre-existing bug unrelated to the current task: record it in `Notes/deviations`; do not fix it on the side.
- The root cause belongs to the current problem, but the fix would exceed approved scope: stop and return the scope decision.
- The Plan did not name a test, but the code reveals a real edge case: add the test and report it.
- Adding or upgrading a dependency: first explain why existing capability is not enough, and list it explicitly in the report.

### Stop on conflict

If a DESIGN cited by `Design Source` is not `Active`, or the Plan, Active DESIGN, and actual code conflict with each other, do not redesign on the fly and do not edit the Plan or design to make implementation fit.

Stop with the relevant Plan text, design basis, and `file:line` evidence, then return the decision to the **controller/delegator**:

- if there is a delegator, report it and wait;
- if you are also the controller, switch back to the controlling workflow and decide there.

Use this minimal report format:

```text
STOP
Task: <task>
Found: <conflict + file:line evidence>
Impact: <why the current task cannot continue>
Awaiting: <controller/delegator decision>
```

Whether an approved Plan or DESIGN should change is not an implementation-level decision under this skill.

## TDD

Use TDD only when it actually helps define behavior, not mechanically every time a file changes.

With `TDD: true`, follow RED → GREEN → REFACTOR: first write a failing test that checks the new or fixed behavior, then write the smallest implementation that passes, then clean up while tests stay green. Every new test must protect real behavior over time; do not write a throwaway test just to produce one red-green cycle.

With `TDD: false`, do not force a fake failing test. Pick verification that actually proves the change works: existing tests, tests that lock in current behavior, build/typecheck/static checks, integration tests, or smoke checks.

- When deleting obsolete behavior or code, delete tests that only existed to check that deleted behavior. Keep or update tests that still protect remaining behavior. If deletion creates a new external behavior, test that new behavior instead.
- For refactors that keep behavior unchanged, existing tests must stay green. If the old code has no test coverage, first add tests that lock in its current behavior before refactoring; do not manufacture a fake failing test.
- Config, build/CI, metadata, dependency updates, file moves/renames, import cleanup, UI styling, exploratory work, and simple wiring usually do not need TDD, but still need verification that matches the risk.

For a dev-flow Plan, determine the real verification commands for relevant ACs during implementation/Verify and return them in the completion report; the implementer does not write them into the Plan directly.

## Bugs: fix the root cause

A bug report usually names a visible symptom. Trace all callers and shared code paths, then fix the single place where the problem actually starts so every caller is fixed at once.

Do not scatter workarounds across callers to hide a shared bug. If fixing the root cause exceeds the current task scope, stop and return the scope decision to the controller.

## Never remove these for brevity

A smaller diff never justifies cutting:

- input validation at trust boundaries;
- error handling that prevents data loss;
- security checks;
- behavior explicitly required by DESIGN, Plan, or the user.

Correct first, simple second.

## Mark deliberate temporary simplifications

If a deliberately simple solution has a known limit (such as in-memory storage or a full scan) that is fine for the current scope, leave one searchable comment:

```text
// simplified: <what was simplified> — <when and how to upgrade>
```

Use this only when there is a real known limit, not on ordinary code.

## Work in small batches

For long tasks, work one Task or one small feature at a time: **implement → verify → report → next batch**. Each batch must be independently verifiable. Record real command outputs right away instead of reconstructing them from memory at the end. When an outer workflow owns git commits and progress files, do not write those states yourself.

## Reports must be verifiable

Return a short report to the controller/requester:

```text
Done: <what was completed>
Touched: <actual files changed>
Verified: <real command> → <real result>
AC Commands: <real commands for relevant ACs>     # for dev-flow Plan Tasks
Skipped: <explicitly skipped work and why>        # only when applicable
Notes/deviations: <boundary notes or deviations>  # only when applicable
```

Do not replace commands and results with “should be fine” or “tests are green.” Report failures as failures.

## Decisions outside implementation

Do not decide product requirements, expand approved scope, rewrite an approved Plan/DESIGN, or issue the final review verdict while acting under this skill. When delegated by a controlling workflow, also do not commit code or update Plan/progress records; return the implementation and evidence to the controller. Stop and return higher-level decisions to the controlling workflow.
