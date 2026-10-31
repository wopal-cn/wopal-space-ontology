# Ontology and Space Maintenance Reference

Read this file for status inspection, space / ontology synchronization, capability assembly, or local capability selection. For upstream GitHub PR creation, revision, and closeout, read [`contribution.md`](contribution.md).

## Command surface

| Command | Responsibility |
|---------|----------------|
| `wopal space status` | Show space branch vs `local main`, assembly state, sparse consistency, local include / exclude / private selections, and unregistered files |
| `wopal space sync [--confirm]` | Align the space branch with `local main`: integrate space-unique evolution upward, then fast-forward downward |
| `wopal space capability add/remove <kind>:<name> [--local]` | Without `--local`, change type-default assembly; with `--local`, change this space's include / exclude override. Ordinary new capabilities should enter the pool, not default to private. |
| `wopal ontology capability list` | Show capabilities owned by the central pool |
| `wopal ontology status` | Show ontology downstream / upstream deltas and contribution status |
| `wopal ontology sync [--confirm]` | Align the `upstream ⇄ origin ⇄ local main` source chain; clone mode collapses to the applicable topology |

## Reading status

`wopal space status` distinguishes:

- **to contribute**: the space branch has shared changes not yet in `local main`.
- **behind local main**: the space needs ontology-main changes.
- **include**: an extra shared capability mounted only in this space.
- **exclude**: a type-default capability disabled in this space.
- **private**: exceptional content the user explicitly wants to keep out of Ontology Git for now; not the normal state of a newly authored capability.

`wopal ontology status` reports:

- **Downstream**: `upstream → origin → local main`.
- **Upstream**: the pending `local main → origin → upstream` file set.
- Local / remote `contribute/*` branches, worktrees, and PR state.

“Merged, awaiting closeout” is not deletion authorization, but it is an action-required state rather than a passive note. When status shows a merged PR with retained contribution resources, the Agent must surface the exact residue and obtain the user's cleanup decision in the same interaction before concluding. If cleanup for that PR is already authorized, follow `contribution.md` immediately; ordinary synchronization still never authorizes deletion.

## Capability pool, type-default assembly, and space-local overrides

`space capability` has two channels:

- **Type-default channel** (without `--local`): add or remove the capability from the current Space type's archetype defaults.
- **Space-local channel** (with `--local`): write `include` when the type does not provide the capability but this Space needs it; write `exclude` when the type provides it but this Space does not want it.

Capability content and assembly scope are separate facts. A formal new capability that is kept enters Ontology Git; whether it becomes a type default or only mounts in the current Space is an independent assembly decision. `include` / `exclude` only express the current Space's delta and do not decide whether shared content may upload.

Under the target contract, `space capability add` can adopt a complete new capability that already exists in the current Space worktree, then perform the requested type-default or space-local assembly. **Until the CLI version in use supports that automatic adoption, perform the equivalent maintenance manually: widen sparse safely, commit the complete asset into Ontology Git, then update the archetype or Space `include`; do not register an ordinary new capability as `private` merely to bypass adoption.**

## Upload gate

Before `space sync` integrates upward, it checks private capability roots. Any space-unique commit that touches a private-registered capability root must be refused.

This gate backstops manual `git add` / `commit`: local isolation must not depend on the operator remembering which content may not upload.

## Execution stance

- The CLI may provide dry-run preview by default; when the user has already authorized execution, use `--confirm` directly rather than adding another approval ritual.
- Synchronization authorization covers synchronization only; it does not authorize PR creation, review-fix push, merge, or deletion.
- On conflict, unclear scope, or inconsistent state, stop rather than using reset / stash / force to reshape the scene.

## Preparing an upstream contribution

Before creating a PR:

1. Enumerate every pending path and group it by topic / capability.
2. Separate genuinely shared capability changes from space-only or type-specific changes.
3. Let the user choose which groups belong in this contribution.
4. Use one PR per topic and exclude unrelated hunks even inside shared files.

Once creating, revising, retrying, or closing out a contribution, switch to [`contribution.md`](contribution.md); do not improvise Git/GitHub flow here.
