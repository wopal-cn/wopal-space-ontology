# sync-sample fixtures — sources

Recorded real samples for the Plan → Issue three-section sync tests
(`tests/python/unit/test_issue_sync_sections.py`). Files are byte copies of
what the sync pipeline reads; do not reformat them.

| Fixture | Source | Recorded | sha256 | Notes |
|---------|--------|----------|--------|-------|
| `issue-240-canonical.md` | GitHub issue `sampx/wopal-space#240` body, fetched with `gh issue view 240 --repo sampx/wopal-space --json body --jq .body` | 2026-09-29 | `556161336c022e5bf6729e952d885f85c558aaff27bc0b26fc21a068d09065ed` | Canonical five-section form: `## Goal` (contains a fence), `## Context`, `## Scope` with `### In（解决方案）` / `### Out`, `## Acceptance Criteria`, `## Related Resources` with a linked `\| Plan \|` row. |
| `issue-123-legacy.md` | GitHub issue `sampx/wopal-space#123` body, same command | 2026-09-29 | `9f7ff83c14390febef156a3dc7ba986158906db9eb1e73ae1f3f619a5dbc1819` | Legacy form: top-level `## In Scope` / `## Out of Scope` instead of `## Scope`; `## Background` instead of `## Context`; pending `\| Plan \| _待关联_ \|` row. |
| `plan-240.md` | `.wopal-space/plans/wopal-cli/done/20260929-240-enhance-wopal-cli-isolated-evo-flow.md` in the wopal-workspace space repo, byte copy | 2026-09-29 | `c05a86acb3f505eafd49fb222f22a68fe16aa82168d20d097db0c86862d5724b` | Real Plan with all four mapped sections; `## Goal` contains a fenced block; `## Acceptance Criteria` uses numbered checkboxes (`1. [x]`) under `### Agent Verification` / `### User Validation`. |

Edge-case inputs are derived from these files inside the tests (documented at
each derivation site): a heading inserted inside a fence, a removed Plan
section, a removed Issue target, and a `planning` status override.
