# REGULATIONS.md — Space Regulations

These regulations are the fundamental behavioral norms within this workspace. All agents **must** strictly comply.

---

## Part 1: Safety Red Lines

<CRITICAL_RULE>

### Deletion Protection

- Never delete any file or directory without careful consideration
- **Authorization**: Only delete when the user explicitly confirms with an imperative statement (e.g., "delete it")
- Questions (e.g., "should this be deleted?") do not constitute authorization
- **Read before delete**: Always read file contents before any deletion to determine if it is user work product
- **Untracked file protection**: Files shown as `??` (untracked) in `git status` must never be deleted
- Use `trash` to delete directories, never `rm -fr`
- Use `trash` to delete files, never `rm`
- `git rm` also deletes disk files and is subject to the same deletion protection

### Workspace Boundaries

- Operations are confined to the space root directory
- Do not modify system configuration or privacy files outside this boundary without authorization
- Code or commits must not contain `.env`, keys, or other sensitive credentials

### Directory Protection

- `external/` is a collection of external resource references
- Do not create, modify, or delete anything under `external/` without authorization

### Skill Management

Skills are located in the `.wopal/skills/` directory and can be edited directly.

| Action | Method |
|--------|--------|
| Edit existing skill | Edit directly in `.wopal/skills/<name>/` |
| Install external skill | `wopal skills install <url/path>` |
| Remove skill | Delete `.wopal/skills/<name>/` directory |

### Git History Immutability

Committed code is fact — only fix forward, never erase backward.

**Absolutely forbidden**:

| Action | Reason |
|--------|--------|
| `git reset --hard <non-HEAD>` | Discards commit history |
| `git reset --soft <non-HEAD>` | Rewinds commit history |
| `git commit --amend` (pushed commit) | Rewrites pushed history, recovery requires force push |
| `git checkout <file>` / `git restore <file>` (before diff confirmation) | Overwrites uncommitted changes, equivalent to deleting work product |

**Correction strategies** (in priority order):

1. **New commit**: Submit a correction commit (safest, preferred)
2. **Precise edit**: Use the `edit` tool to remove errors while preserving correct changes
3. **Rebase** (strictly limited): Only when all conditions are met — commits unpushed, created in current session, fixing only mistaken files, with user's explicit authorization

</CRITICAL_RULE>

---

## Part 2: Work Standards

### Core Skills

The following core skills are available in every WopalSpace. Agents should consult them when the situation calls for it.

| Skill | Responsibility | Trigger Scenario |
|-------|---------------|-----------------|
| `space-master` | Space root skill and process routing entry | Unclear task intent, space maintenance, ontology collaboration, skill system, process selection, multi-space management |
| `agents-collab` | Sub-agent collaboration protocol | Before delegating any fae, rook, or general sub-agent |
| `dev-flow` | Issue/Plan driven development state machine | Issue, Plan, approval, execution, verification, archive |

### Skill Invocation

- Check the `<available_skills>` list in context before choosing an approach
- When creating or modifying skills, follow the `skill-creator` skill guidance
- **Forbidden**: Ignoring available skills and forcing generic capability execution

### Git Workflow Basics

- **Pre-implementation check**: Run `git status` and `git log --oneline -5` before starting
- **User confirmation gate**: All code changes must be verified by the user before committing
- **Pre-commit check**: Run `git status`, `git diff --staged --name-only`, and `git log --oneline -5`
- **Commit format**: `<type>(scope): <description> [#ref]`

### Sub-agent Delegation

<CRITICAL_RULE>

Before delegating **any** subagent:
1. Search memory for relevant delegation rules and lessons learned
2. Verify all paths in the prompt use space-root-relative or absolute paths
3. Confirm the prompt includes target project path context

</CRITICAL_RULE>

### Verification Isolation

Verification and testing work must not pollute space project files. Verification operations should only be performed in `.wopal-space/.tmp/` or system temporary directories.

### Memory and Evolution

Memory only has value when actively retrieved. Proactive recall is required in these scenarios:

| Scenario | Search Keywords |
|----------|----------------|
| Before complex tasks | Task-type keywords |
| Encountering ambiguous/conflicting instructions | Related topic keywords |
| After user criticism | Problem-domain keywords |
| Key decision points | Node-specific keywords |
| After tool execution errors | Task-type keywords |

**Memory write rules**:
- Long-term memory writes require: deduplicate first → show full content to user → wait for explicit approval → execute
- Only record information with long-term reuse value related to space optimization or project building
- Memory conflicts with AGENTS.md / REGULATIONS → Constitution wins; unique details → merge then delete memory

---

## Part 3: Engineering Details

### Time Handling

- Always use system commands to obtain time; never guess
- Command: `date '+%Y-%m-%d %H:%M:%S'`

### Path Confirmation

- For files with unclear paths, use `glob` to confirm structure first; never assume paths

### Engineering Standards

- **Historical documents are not retroactively modified**: Records in `docs/projects/**/plans/done/` and similar paths are not retroactively changed
