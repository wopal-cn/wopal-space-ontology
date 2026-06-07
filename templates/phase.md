# <Phase Name>

> **Product**: `<product>`
> **Phase ID**: `<phase-id>`
> **Status**: Planned | Active | Completed
> **Updated**: YYYY-MM-DD
> **Product PRD**: `<prd-path>`
> **Product DESIGN**: `<design-path>`

---

## 0. Goal

One sentence describing the product capability to be delivered in this phase (cross-project perspective).

## 1. Current State

Describe the current state for each project or subsystem in concise narrative prose. Cover both existing capabilities and what is missing — present the full gap between current state and the phase goal.

## 2. Scope

A concise summary list of product capabilities to be delivered in this phase, so humans and agents can grasp the full scope at a glance. One line per scope area with Owner. Example:

- **CLI 分发** — Node SEA release packaging → public release carrier → installer one-click install. Owner: wopal-cli
- **ellamaka 分发** — artifact branding + 4-platform matrix + GitHub Release. Owner: ellamaka

## 3. Out of Scope

- Capabilities or projects explicitly excluded from this product phase

## 4. Targets and Gaps

Each scope area from §2 gets a detailed gap analysis here. Organized by `###` for each scope area, with `#### Gaps` and `#####` for individual gaps.

Gap structure:

- **Current**: current state (what is missing)
- **Target**: the target state after the gap is closed
- **Design**: where the solution is documented (project DESIGN or DISTRIBUTION path)
- **Exit**: checkbox-format exit criteria — one line when single, multi-line `- [ ]` when multiple. Each gap must have at least one exit criterion. Exit criteria checkboxes collectively define the phase's completion.

```
### <Scope Area>
Owner: <project>

#### Gaps

##### <Gap Title>
- **Current**: ...
- **Target**: ...
- **Design**: ...
- **Exit**:
  - [ ] exit criterion
  - [ ] exit criterion
```

Writing rules for gaps:

- A gap without a design solution does not belong here — it belongs in §6 Risks.
- Exit criteria describe delivery facts, not implementation steps.
- Each scope area should have ≥1 gap.
- Each gap should be independently verifiable via its exit criteria.

## 5. Related Plans

<!-- Maintained automatically or manually after Plans are linked -->

| Project | Plan | Status |
|---------|------|--------|

## 6. Risks

Only items without a design solution go here. Gaps with design solutions are managed in §4.

| Risk / Dependency | Impact | Why no design solution |
|-------------------|--------|------------------------|

## 7. References

Do not repeat documents already referenced in the Phase document header. List project DESIGNs and other relevant references.

- Project DESIGN: `<project-design-path>`
