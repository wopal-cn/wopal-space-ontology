# Ontology Capability Routing Reference

This file is the compact capability map for evolution analysis. Use the short table in `SKILL.md` first. Read this reference only when ownership overlaps, placement is unstable, or a formal proposal is being prepared. Read product DESIGN only when the capability model itself, loading lifecycle, or architectural ownership is in question.

## Routing principles

1. **Find the existing owner first.** Repair an existing capability instead of creating a new one when possible.
2. **Put behavior in its natural layer.** Do not place workflows in Agent prompts merely because prompts are easy to inject, and do not promote project facts into the public pool for convenience.
3. **Use the lowest valid scope.** Project-only knowledge stays in the project; space-only knowledge stays in the space; only cross-space behavior belongs in type-scoped or public ontology.
4. **Mechanism problems go to mechanism owners.** Missing tools, state, automation, or runtime integrations should not be hidden behind prompt-only patches.
5. **One fact, one owner.** Avoid copying the same rule into Agent, Rule, and Skill. Let one component own it and have other layers only trigger or reference it when needed.

## Component responsibilities

### Agent prompt

Owns role identity, responsibilities, decision principles, long-lived default behavior, and stable output style.

Use it for wrong role boundaries, wrong default judgment, or behavior that should change across all tasks for that Agent.

Do not put detailed workflows, tool APIs, command sequences, or scenario-specific rules here.

### Rule

Owns behavioral constraints that become active only when matching conditions apply, such as language, framework, project-type, or Agent-specific constraints.

Use it for contextual “should / should not” behavior.

Do not use it for full workflows, deterministic system operations, or space facts.

### Skill

Owns execution workflow, judgment method, verification, and tool-use guidance for a class of work. It answers “how should this task be done?”

Use it when steps drift, the same detour repeats, verification is missing, tools are chosen badly, or an Agent collaboration protocol is needed.

Do not use it for single-project facts, Agent identity, or capabilities that require real runtime implementation.

### Command

Owns a stable human-to-Agent work entry and its argument semantics. It describes how a user invokes a class of Agent work.

Use it for slash/agent command entry points and invocation-contract changes.

Do not use it for deterministic system operations; those belong to the CLI or runtime owner.

### Plugin / runtime owner

Owns real runtime capabilities: tools, state, automation, message injection, external integration, and lifecycle logic.

Use it when a prompt cannot provide the missing capability or deterministic execution is required.

Do not use it for pure behavioral guidance or workflow prose.

### Assembly / archetype

Owns which capabilities a space type receives. It does not own the content of those capabilities.

Use it when the capability itself is correct but its default installation, type composition, or visibility is wrong.

Do not use it to repair behavior inside a capability.

### REGULATIONS / project AGENTS / memory

- `REGULATIONS.md`: long-lived workspace rules and safety boundaries shared by all Agents.
- Project `AGENTS.md`: project-specific facts and development constraints that should govern work in that project.
- Space memory: user preferences, durable lessons, and space-local knowledge retrieved when relevant.

If knowledge is true only in the current space or project, do not promote it into public ontology merely because it was useful once.

## Common routing decisions

| Symptom | Preferred owner |
|---------|-----------------|
| An Agent repeatedly makes decisions outside its responsibility | Agent prompt |
| A constraint applies only to one technical stack or matching context | Rule |
| The order of execution drifts across similar tasks | Skill |
| Users need a stable entry point for a fixed Agent workflow | Command |
| A callable tool, persistent state, or system integration is missing | Plugin / runtime |
| A capability belongs in Coding spaces but not other space types | Assembly |
| One project requires a durable Git convention | Project `AGENTS.md` |
| One user has a durable communication preference | Space memory / user profile |

## When DESIGN must be consulted

Read only the relevant design sections when:

- two capability components both look like plausible owners and the current boundary is insufficient;
- a proposal changes capability loading, injection, assembly, or lifecycle;
- a proposal changes domain ownership among Plugin, CLI, Runtime, or WopalSpace;
- a new capability component type or a new component responsibility is proposed;
- an existing Skill directly contradicts the product design about ownership.

If DESIGN already defines the owner, follow it. If the proposal intends to change that ownership, include the design change in the proposal instead of patching around it only in a Skill or prompt.

## Avoid over-evolution

- One criticism may remain a `candidate`; it is not automatically a Proposal.
- A symptom may come from an unclear existing capability; repair the owner before splitting out a new one.
- Merge same-root signals; do not create proposals according to the number of session events.
- Keep weak evidence as a candidate; **no proposal is better than a weak proposal**.
