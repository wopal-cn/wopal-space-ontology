# Active Plan Graph — Current Plan Orchestration

The Active Plan Graph is the single orchestration surface for a Space's managed lifecycle window from **submit through archive**. It records **submitted, non-archived Plan nodes, implementation order/hard constraints between Plans, and Graph groups used to organize several Plans around one goal**. Each Plan's workflow state remains owned solely by its dev-flow Plan file.

During the current practice phase there is no Graph CLI. **The controller Agent edits** `.wopal-space/plans/active-graph.json` directly at dev-flow lifecycle points. Delegated implementers do not edit the Graph.

## Truth Ownership

| Fact | Single source of truth |
|---|---|
| Plan goal, scope, Tasks, acceptance, workflow state | Plan file / dev-flow |
| Current implementation order, hard dependencies, and organization groups | `active-graph.json` |
| Phase goal, scope, gaps, completion criteria | Phase document |

Therefore:

- Do not copy Graph edges into Plan `Depends On`, Required Inputs, or a Plan-level Phase execution DAG. A Plan may explain business context, but that explanation is not a second orchestration source.
- The Graph does not copy `planning / reviewing / executing / verifying / done` state; read the Plan when state is needed.
- A Graph group is organization, not a Plan: it owns no Issue, lifecycle state, Acceptance Criteria, worktree, or Delivery.
- Phase `Related Plans` is stable traceability only and carries no Plan status. Plan-level execution order belongs only to the Graph.

## File Contract

The current fixed file is:

```text
<space>/.wopal-space/plans/active-graph.json
```

The Graph contains at least:

- `schema`, `space`, `updated`;
- `membership`, documenting the submit/archive entry and exit rule;
- `nodes`, Plans that have been submitted and not yet archived;
- `edges`, implementation order and hard constraints between Plans;
- `groups`, pure organization for grouping several Plans around one goal or work surface.

During this practice phase, do not add cron, timezone, priority, dispatch, notBefore, maxRuntime, nextRun, or other automatic-scheduling fields. Those belong to the later P4 Scheduler capability.

## Membership

Graph membership is latched by lifecycle events rather than derived only from current `Status`:

| Plan situation | Graph |
|---|---|
| `planning` draft never submitted | node absent |
| `reviewing` | node present |
| `executing` | node present |
| `verifying` | node present |
| `done` | node remains present |
| reset back to `planning` after a previous submit | node remains present |
| `archived` | node absent |

After the first successful `submit`, the controller immediately adds the node. A `planning` draft does not enter the Graph before its first submit.

When `verify --confirm` moves a Plan to `done`, **membership does not change**. The Plan and related edges remain so the current overview can still show the full implementation order. Only successful `archive` removes the node, incident edges, and group membership.

`reset` itself does not change Graph membership. A Plan that has been submitted and not yet archived remains in the Graph even if reset to `planning`; existing edges also remain unless the user explicitly changes orchestration.

## Edge Semantics

An edge `from → to` means: **before `to` begins implementation, `from` must already have reached `done`**.

```json
{
  "from": "project/producer-plan",
  "to": "project/consumer-plan",
  "reason": "why the consumer must wait for the producer"
}
```

Rules:

- Edges connect only current `nodes`.
- `reason` is required and states the real implementation constraint.
- Self-dependencies, duplicate edges, and cycles are forbidden.
- Edges are Graph-owned facts; never parse or infer them automatically from Plan Markdown.
- Leave independent work as parallel roots. Do not invent dependencies merely to manufacture a unique "next" Plan.
- Once a producer reaches `done`, the edge is **satisfied but retained** until either endpoint is archived and the incident edge is removed. This lets the UI keep showing the full implementation order.
- Add new unsatisfied incoming edges only to consumers that have not started implementation. A Plan already `executing` / `verifying` must not suddenly acquire a new prerequisite. If the execution relationship must be redone, return to the user to decide whether to reset/re-plan.

## Groups

When one goal needs several implementations, do not create another coordination Plan. Add a group directly to the Graph.

Minimum group shape:

```json
{
  "id": "platform-delivery",
  "title": "Platform Delivery",
  "goal": "the overall result these Plans jointly deliver",
  "members": [
    {
      "planId": "project/plan-a",
      "responsibility": "this Plan's responsibility inside the overall goal"
    }
  ]
}
```

Rules:

- `id` is unique and stable within the current Graph; `title` / `goal` let the UI and Agents understand the overall intent.
- `members[].planId` must reference current `nodes`; `responsibility` describes responsibility only, never dependency.
- A group owns no workflow state, progress percentage, or completion gate. The UI projects progress from the member Plans' live states.
- A group owns no execution order. All ordering and blocking live in the global `edges` collection.
- Create, rename, or change group membership directly when the user-confirmed organization changes; these edits do not change any Plan lifecycle.
- Remove a member when that Plan is archived; remove the group when its last member leaves.
- The Active Graph represents current work only. Do not create a separate historical group object; use Git history and archived Plans for traceability.

## Lifecycle Hooks

There is currently no Graph CLI, so each lifecycle command and Graph maintenance are two consecutive controller actions. After a command succeeds, finish the corresponding Graph change before continuing other work.

| dev-flow point | Controller Graph action |
|---|---|
| `plan new` | membership unchanged; drafts stay out of the Graph |
| successful `submit` | add node; keep idempotent if already present |
| multi-Plan organization changes | maintain `groups` directly; maintain `edges` when implementation order changes |
| before `approve --confirm` | Plan must exist in the Graph; every incoming-edge producer must already be `done` |
| after `approve --confirm` | membership unchanged |
| `complete` | membership unchanged |
| successful `verify --confirm` | membership unchanged; retain the `done` node and edges |
| successful `archive` | remove node + incident edges + group membership; remove empty groups |
| `reset` | membership unchanged; a submitted non-archived Plan stays in the Graph even if back in planning |

If manual Graph maintenance fails, do not fabricate a lifecycle rollback. Preserve the dev-flow transition that already succeeded, repair the Graph immediately, and do not approve or start another Plan until the Graph is consistent again.

## Manual Validation

After every manual edit, check at least:

1. JSON parses.
2. Every submitted non-archived Plan has exactly one node; never-submitted planning drafts and archived Plans have no node.
3. Every edge endpoint exists in nodes.
4. There are no self-edges, duplicate edges, or cycles.
5. Every group `id` is unique and every `members[].planId` exists in nodes.
6. Groups do not store Plan state or execution order, and edges are not copied into Plans/Phases.
7. No scheduling fields exist during this practice phase.

One-off `python3` / `jq` validation is fine; do not turn this into a Graph CLI yet or write validation state back into Plans/Phases.

## Phase Boundary

A Phase may retain stable capability-level ordering when its scope areas inherently depend on each other, but it **does not maintain a Plan-level DAG, live Plan status, or "what runs next"**. `Related Plans` only maps Plans to phase scope/gaps. Current implementation relationships and multi-Plan organization live in the Active Plan Graph.
