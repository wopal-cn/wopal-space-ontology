---
description: Create or update project AGENTS.md
---

# Create or Update Agent Rules

Create or update project-level or directory-level `AGENTS.md`.

**Input**: `$1` `$2`

**Parameter Notes**: `[path|project-name] [extra-rules-context]`. Path or project name is required. When only a project name is given, infer candidates from `.wopal-space/STRUCTURE.md` and `projects/`; confirm if the target cannot be resolved uniquely.

---

## Core Principles

- `AGENTS.md` is a development rules document for coding agents. It answers only: what the project is, where the code structure lives, and which project-specific technical rules must be followed during development, testing, and verification.
- Project-level and module-level `AGENTS.md` files are required agent context. They must be highly concise, accurate, and noise-free; every line should directly affect development, testing, or verification behavior.
- It is not a README, DESIGN, PRD, or business rules document. Product intent, design details, and business behavior must be referenced through canonical documents only.
- Project-level documents define project boundaries and cross-module rules. Directory-level documents define only the rules directly owned by that directory. When a subdirectory already has `AGENTS.md`, reference it instead of copying its details.
- Use `.wopal/templates/agent-rules.md`. The formal `AGENTS.md` must preserve the template frontmatter `name` and `description`; information already present in frontmatter must not be repeated in the body.
- `name` identifies the current project or directory module. `description` must be single-line, stable, Markdown-free, describe the current project or directory module responsibility, and serve as the controlled description source for `wopal space scan`.
- Do not write roadmap, temporary status, completion progress, marketing slogans, or vague vision in `description`. If the description cannot be determined reliably, mark it as "needs confirmation" in the plan.
- The body must contain only project-specific technical implementation rules. Use current implementation facts, not roadmap speculation.
- List only informative canonical references; do not write `N/A` placeholders for nonexistent PRD or `BUSINESS_RULES.md` files. Directory-level `AGENTS.md` must list any DESIGN or PRD document directly relevant to its scope; do not rely solely on parent-level indirect references.
- The body must not restate DESIGN, frontmatter, or space-wide regulations. Write only project-specific, executable rules that change development behavior.
- From PRD, extract only scope constraints that affect implementation. If PRD has been merged into DESIGN, reference DESIGN only. From DESIGN, extract the execution chain, directory responsibilities, technology choices, and interface / state / configuration / output / error-handling contracts.
- `BUSINESS_RULES.md` must only be linked as a canonical reference when it exists. Do not read it to extract rules into the body.
- From code / config, extract only build, test, typecheck, lint, and format commands, basic development commands, existing framework / library constraints, and local implementation conventions. Do not create a source-code encyclopedia.
- Merge project technical rules from `rules-context` directly into the appropriate section. If content belongs to PRD, business rules, or a temporary plan, do not put it in the body and explain that after completion.
- Shorter is better: target 80-150 lines. 300 lines is the hard limit, not the goal. If it would exceed the target, compress content, replace detail with references, or split rules into a closer subdirectory `AGENTS.md`.
- Preserve basic development / testing commands and applicable verification requirements. The Testing section must include a TDD requirement.
- Use direct, executable imperatives. Make boundaries explicit: what this scope owns and what it must not change.
- Describe positive facts: what this scope is and owns. Avoid defensive explanations and low-information negative statements.
- User-preferred language versions must follow the AGENTS template headings; English section headings defined by the template must not be translated.
- Architecture descriptions should contain only one execution chain and the necessary directory table. Forbid README-style introductions, low-information applicability sentences, PRD vision / user narrative / roadmap, business rule restatements, large copied DESIGN prose, architecture diagrams, directory encyclopedias, API / command catalogs, and links to temporary plans or command logs unless the user explicitly asks for them.
- `User-Supplied Rules` is user-maintained. When generating or updating, do not add, modify, delete, or reorder content in this section (rules migrated from the original specification are excepted, and only appending is allowed).
- **When updating an existing `AGENTS.md`, all non-obsolete original rules must be preserved.** Rules that fit sections 1-5 go into the corresponding section; rules that do not must be moved verbatim into section 6 (User-Supplied Rules). Deleting an original rule requires explicit, itemized justification in the plan. Code examples, inline comments, and procedural notes are organic parts of the rules and must also be preserved.

## Step 1: Resolve Target

1. If `$1` is an explicit path, use it directly.
2. If `$1` is a project name, locate candidates from `.wopal-space/STRUCTURE.md` and `projects/`.
3. If exactly one project matches, ask the user to confirm the inferred path. If there are multiple exact or near matches, list the candidates and let the user choose.
4. Determine the target file: project-level uses `<project>/AGENTS.md`; directory-level uses `<target-directory>/AGENTS.md`.

**Output**: Target directory, target `AGENTS.md` path, and any path assumption that needs user confirmation.

## Step 2: Collect Context

Prefer reading:

- Target `AGENTS.md` and nearest parent `AGENTS.md`
- `.wopal-space/STRUCTURE.md`
- Related DESIGN; read PRD only when it exists and has not been merged into DESIGN; list `BUSINESS_RULES.md` only when it exists
- Project package / build / test / typecheck / lint configuration
- Key source files in the target scope, only to extract commands and hard constraints, not to create source encyclopedias
- `rules-context` when provided

Common WopalSpace document locations:

```text
docs/products/<name>/docs/PRD*.md
docs/products/<name>/docs/DESIGN*.md
projects/<name>/docs/DESIGN.md
<project repo>/AGENTS.md
```

**Output**: Canonical document list, existing rules summary, implementation facts summary, and missing or needs-confirmation information.

## Step 3: Draft Confirmation Plan

Before writing, present the full plan and get explicit user confirmation. The plan must include:

1. Target file path
2. Canonical documents to reference
3. frontmatter `name` and `description` to write or preserve
4. Summary of rules to preserve, add, remove, or compress
4.5 Original rules to move to section 6 (rules not fitting sections 1-5), and any rules proposed for deletion with justification
5. Architecture / directory summary plan
6. Development, testing, and verification requirements
7. Where `rules-context` will be merged
8. Compression or split strategy if the result may exceed 300 lines
9. Confirmation that `User-Supplied Rules` will remain unchanged
10. Low-information content to delete or avoid: `N/A` placeholders for nonexistent documents, text duplicated from DESIGN / frontmatter / global regulations, and long directory / API / command catalogs

When updating an existing `AGENTS.md`, rules and specifications are immutable after initial creation. Any addition, modification, or deletion must first appear as a proposal in the plan and can only be executed after explicit user confirmation.

**Output**: Change plan waiting for user confirmation.

## Step 4: Write After Confirmation

1. If the user's preferred language is not English, first update `AGENTS.<locale>.md` in the same directory. `<locale>` must use an IETF BCP 47 / RFC 5646 tag.
2. After the user confirms the review version, translate and update the formal English `AGENTS.md`. The formal English version must stay semantically aligned with the confirmed version.
3. If the user's preferred language is English, create or update `AGENTS.md` directly. Do not generate English variants such as `AGENTS.en-US.md`.
4. Before confirmation, do not write, overwrite, or reorder the formal English `AGENTS.md`.

**Output**: Updated review-version and / or formal-version paths.

## Quality Checklist

- [ ] Target path is explicit or safely inferred
- [ ] frontmatter `name` and `description` exist, and body content does not repeat frontmatter information
- [ ] frontmatter `description` is single-line, stable, and suitable for `wopal space scan`
- [ ] Target and parent `AGENTS.md` files were considered when present
- [ ] PRD, DESIGN, and `BUSINESS_RULES.md` were referenced when present
- [ ] Nonexistent canonical documents are not written as `N/A` placeholders
- [ ] The body does not repeat DESIGN, frontmatter, or space-wide regulations
- [ ] The architecture section has no architecture diagram, API catalog, command catalog, or directory encyclopedia
- [ ] Project-level documents reference subdirectory `AGENTS.md` files instead of copying their details
- [ ] The document targets 80-150 lines and stays under the 300-line hard limit
- [ ] Basic development / testing commands are preserved
- [ ] Rules focus on technical implementation, testing, and verification
- [ ] If the user's preferred language is not English, the user-preferred language version was generated first
- [ ] Canonical documents are referenced instead of copied
- [ ] No rules were extracted from `BUSINESS_RULES.md` into the body
- [ ] Testing section includes a TDD requirement
- [ ] User-preferred language version follows the AGENTS template headings and does not translate template-defined English section headings
- [ ] `User-Supplied Rules` remained unchanged: no additions, modifications, deletions, or reordering (original specification migrations excepted)
- [ ] All non-obsolete original rules were preserved: rules fitting sections 1-5 placed there, remaining rules moved verbatim to section 6; any deleted rule has explicit justification in the plan
- [ ] The full plan was shown and confirmed before writing
- [ ] The formal English version was updated after confirmation when applicable

## Response After Completion

Respond in the user's language with:

1. Updated file path
2. Scope covered
3. Key added / changed rules
4. Any ignored `rules-context` content and why
5. Any missing canonical references or assumptions
