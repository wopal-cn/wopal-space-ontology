# <Project Name>

> **Status**: Active  
> **Updated**: YYYY-MM-DD  
> **Parent Architecture**: `<parent-design-path>`  
> **Parent Product**: `<parent-product-prd-path>`

## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| YYYY-MM-DD | Created / Updated | One-line summary |

## 1. Project Role

State where the project fits in the parent product, what it owns, and what it explicitly does not own. One-sentence core responsibility plus technical positioning.

## 2. Capability Scope

List target-state capability groups owned by the project. Describe boundaries only: owned target capabilities, explicit out-of-scope areas, and delegation boundaries. Do not include phase timing, implementation status, or delivery progress.

## 3. Design Principles

List the principles that guide technical choices inside this project. Keep them specific enough to resolve design tradeoffs.

## 4. Module Architecture

Describe internal modules and responsibilities in design-state language. Avoid implementation-state labels such as "current location". Columns: module, responsibility, carrier.

## 5. Technical Stack Choices

Document the technical stack and integration choices: runtime, framework, build/package tools, filesystem/state handling, external binaries, security scanners, protocol/client, output model, configuration format. For each choice, explain why it fits this project and what boundary it must not cross.

## 6. Interfaces and Contracts

Define external surfaces: CLI commands, APIs, events, file formats, schemas, protocols, or integration contracts. Keep at specification level.

## 7. Data and State Model

Describe owned state, persistence, configuration, caches, generated files, and migration or idempotency rules.

## 8. Evolution Roadmap

Describe how the project matures across product phases using design decisions as the unit of tracking. Each phase has one Goal and a set of D-NN decisions with checkbox completion status:

```markdown
### Phase N: Title

> Phase doc: [phases/<project>-pN-<slug>.md]

- **Goal**: This project's role-specific delivery target for this phase (one line, ≥20 chars, aligned with the parent product phase doc's expectations for this project)

- [x] D-01: <design decision, done>
- [ ] D-02: <design decision, pending>
```

**Requirements**:
- Every phase must have a **Goal** line and ≥1 D-NN decision
- The Goal must be derived from the parent product phase doc's Involved Projects table — what is this project's scope in that phase
- D-NN numbering restarts per phase. `[x]` = done, `[ ]` = pending
- A phase with all `[x]` is considered complete
- This section is the input source for `/cupdate-roadmap` project mode

## 9. Related Documents

Link only durable product/design references: parent PRD/DESIGN, business rules, architecture references, project specs.
