# <Product Name>

> **Status**: Active  
> **Updated**: YYYY-MM-DD  
> **Product Intent**: `<prd-path>`

## 0. Change Log

| Date | Type | Summary |
|---|---|---|
| YYYY-MM-DD | Created / Updated | One-line summary |

## 1. Architecture Design

Provide a high-level architecture diagram (ASCII preferred) and a layer table.

```text
<ASCII architecture diagram>
```

### Layers

| Layer | Location | Owner | Responsibility |
|---|---|---|---|
| ... | ... | ... | ... |

## 2. Core Projects

Define each core project's role, boundary, and interaction contract. One subsection per project, covering responsibility, design principles, and external contracts. Link to the corresponding project DESIGN document.

## 3. Runtime Model

Describe runtime structure, state locations, data ownership, configuration layers, lifecycle behavior, and persistence boundaries.

## 4. End-to-End Flows

Describe critical cross-project flows. Use numbered steps. Focus on system behavior.

## 5. Evolution Roadmap

Describe product phases from current to target state using design decisions as the unit of tracking. Each phase has one Goal and a set of D-NN decisions with checkbox completion status:

```markdown
### Phase N: Title

> Phase doc: [phases/<product>-pN-<slug>.md]

- **Goal**: Product capability target for this phase (one line, ≥20 chars, no placeholders)

- [x] D-01: <design decision, done>
- [ ] D-02: <design decision, pending>
```

**Requirements**:
- Every phase must have a **Goal** line and ≥1 D-NN decision
- D-NN numbering restarts per phase. `[x]` = done, `[ ]` = pending
- Completion is based on whether the design has been decided and implemented, not on code completeness
- A phase with all `[x]` is considered complete
- This section is the input source for `/cupdate-roadmap`

## 6. Related Documents

Link only durable product/design references: PRD, project DESIGNs, business rules, architecture references, research summaries, project specs.
