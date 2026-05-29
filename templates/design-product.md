# <Product Name>

> **Status**: Active  
> **Updated**: YYYY-MM-DD  
> **Product Intent**: `<prd-path>`

## 0. Change Log

Record design intent, architecture, boundary, and contract-level changes.

| Date | Type | Summary |
|---|---|---|
| YYYY-MM-DD | Created / Updated | One-line summary |

## 1. Architecture Design

Overall product architecture diagram (ASCII preferred) and layer table. The diagram covers all core subsystems and their interaction relationships.

```text
<ASCII architecture diagram>
```

### Layers

| Layer | Location | Owner | Responsibility |
|---|---|---|---|

## 2. Core Projects

Each core subsystem's role, boundary, and interaction contract.

- One subsection per subsystem: responsibility, design principles, external contract
- Link to the corresponding project DESIGN document
- Inter-subsystem interaction relationships are traceable

## 3. Runtime Model

Runtime structure, state locations, data ownership, configuration layers, lifecycle, persistence boundaries.

- Clarify each subsystem's state ownership scope
- Configuration layer relationships are clear (global → space → project)

## 4. End-to-End Flows

Key cross-project flows, from a system perspective.

- Cover critical user paths (installation, daily use, failure recovery)
- Use numbered steps, focus on system behavior

## 5. Evolution Roadmap

Product evolution skeleton. Each phase includes title, Goal, and Phase document link. Phase delivery details and acceptance criteria are carried by Phase documents.

```markdown
### Phase N: Title

- **Goal**: Product capability target for this phase (one line, ≥20 characters, verifiable product capability statement)

> Phase doc: [phases/<product>-pN-<slug>.md]
```

## 6. Related Documents

Link durable reference documents: project DESIGNs, business rules, architecture references, project specs. Each link has a clear reference purpose.
