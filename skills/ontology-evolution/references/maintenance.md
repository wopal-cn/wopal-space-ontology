# Ontology and Space Maintenance Reference

Read this file for status inspection, space / ontology synchronization, capability assembly, or local capability selection. For upstream GitHub PR creation, revision, and closeout, read [`contribution.md`](contribution.md).

## Command surface

| Command | Responsibility |
|---------|----------------|
| `wopal space status` | Show space branch vs `local main`, assembly state, sparse consistency, local include / exclude selections, and unregistered files |
| `wopal space sync [--confirm]` | Align the space branch with `local main`: integrate space-unique evolution upward, then fast-forward downward |
| `wopal space capability add/remove <kind>:<name> [--local]` | Without `--local`, change type-default assembly; with `--local`, change this space's include / exclude override. |
| `wopal ontology capability list` | Show capabilities owned by the central pool |
| `wopal ontology status` | Show ontology downstream / upstream deltas and contribution status |
| `wopal ontology sync [--confirm]` | Align the `upstream ⇄ origin ⇄ local main` source chain; clone mode collapses to the applicable topology |

## Reading status

`wopal space status` distinguishes:

- **to contribute**: the space branch has shared changes not yet in `local main`.
- **behind local main**: the space needs ontology-main changes.
- **include**: an extra shared capability mounted only in this space.
- **exclude**: a type-default capability disabled in this space.
- **unregistered files**: transient untracked working-tree content; status reports it for protection and possible adoption, not as a persistent capability state.

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

Under the target contract, `space capability add` can adopt a complete new capability that already exists in the current Space worktree, then perform the requested type-default or space-local assembly. **Until the CLI version in use supports that automatic adoption, perform the equivalent maintenance manually: widen sparse safely, commit the complete asset to the registered Space branch, then update the archetype or Space `include`.**

## Untracked working-tree protection

Untracked files are not a capability state and are never auto-registered. Before sync, rematerialization, or sparse-range changes touch their paths, the operation must detect the collision and stop rather than overwrite or delete them. A complete capability that should be kept is adopted into the Space branch; other transient files remain ordinary working-tree content until the user moves or deletes them.

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
