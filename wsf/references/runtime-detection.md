# Runtime Detection — Tool Availability Detection Protocol

> **Purpose**: Define how WSF workflows detect runtime capabilities and select appropriate subagent delegation methods.
> **Principle**: Capability detection over name detection — judge by tool availability, don't hardcode runtime names.

---

## 1. Detection Priority

Detection order for subagent delegation capability (highest to lowest):

| Priority | Tool/Method | Applicable Scenarios | Detection Method |
|----------|-------------|---------------------|------------------|
| **1** | `wopal_task` | WopalSpace / OpenCode with wopal-plugin | Check if `wopal_task` tool exists |
| **2** | `Task()` / `task` | Claude Code / OpenCode (native) | Check if `Task` or `task` tool exists |

---

## 2. Detection Methods

### 2.1 Tool Existence Detection

Detect in workflow initialize step:

```
**Tool availability check:**

Before spawning any subagent, check which delegation tools are available:

1. Check if `wopal_task` tool exists → set `WSF_HAS_WOPAL_TASK=true`
2. Else check if `Task` or `task` tool exists → set `WSF_HAS_TASK=true`
3. Else → set `WSF_INLINE_ONLY=true`
```

### 2.2 Runtime Name Detection (Supplementary Only)

WSF may identify runtime via environment variables or tool signatures:

| Runtime | Environment Variable | Task Tool |
|---------|---------------------|----------|
| Claude Code | `CLAUDE_CODE=true` | `Task` (capitalized) |
| OpenCode | `OPENCODE=true` | `task` (lowercase) + wopal_task (if plugin) |
| Copilot | GitHub Copilot context | No Task tool |
| Gemini CLI | `GEMINI_CLI=true` | No Task tool |
| Codex | OpenAI Codex context | No Task tool |

---

## 3. Fallback Chain Logic

```xml
<subagent_delegation_priority>
When spawning subagents, follow this priority:

**If `wopal_task` is available:**
  - Use `wopal_task(agent, prompt, description)` to launch async task
  - Use `wopal_task_output(task_id, section="text")` to poll progress
  - Wait for idle verdict or synthetic `[WOPAL TASK COMPLETED]` marker
  - Use spot-check (SUMMARY.md + commits) as fallback verification

**If `Task` tool is available (no wopal_task):**
  - Use `Task(subagent_type, prompt)` — blocks until complete
  - Parse returned text for completion markers (## XXX COMPLETE)
  - Use spot-check as fallback if Task doesn't return (Copilot case)

**If neither tool is available:**
  - Execute workflow inline (sequential)
  - Read and follow execute-plan.md / relevant workflow directly
  - No subagent spawning — orchestrator does all work
</subagent_delegation_priority>
```

---

## 4. wopal_task Detection Implementation

### 4.1 Detection Conditions

Conditions for wopal_task existence:
- OpenCode runtime + wopal-plugin loaded
- Tool list contains `wopal_task` name

### 4.2 Detection Code (in workflow initialize)

```markdown
<step name="detect_delegation_capability" priority="first">
**Detect subagent delegation capability:**

Check for available delegation tools in order:

1. **wopal_task detection:**
   - If `wopal_task` tool is available → set `DELEGATION_MODE=wopal_task`
   - This indicates WopalSpace environment with async delegation support

2. **Task tool detection:**
   - If `Task` or `task` tool is available → set `DELEGATION_MODE=Task`
   - This indicates Claude Code or native OpenCode

3. **Fallback to inline:**
   - If neither tool exists → set `DELEGATION_MODE=inline`
   - Execute plans sequentially without spawning agents

**CRITICAL:** Never use `browser_subagent`, `Explore`, or other runtime-specific substitutes for Task/wopal_task.
</step>
```

---

## 5. Copilot Special Handling

WSF has existing Copilot fallback logic (`execute-phase.md:12-24`):

- Copilot's subagent completion signals are unreliable
- Defaults to sequential inline execution
- Spot-check as completion verification (SUMMARY.md + git commits)

When Copilot is detected, force inline mode regardless of Task tool existence:

```
**If Copilot runtime detected:**
  - Force `DELEGATION_MODE=inline`
  - Skip subagent spawning entirely
  - Read execute-plan.md and execute each plan inline
```

---

## 6. Detection Result Usage

After detection, workflow branches based on `DELEGATION_MODE`:

| DELEGATION_MODE | Behavior |
|-----------------|----------|
| `wopal_task` | Async delegation + polling notifications |
| `Task` | Sync blocking delegation + marker parsing |
| `inline` | Sequential execution + no subagents |

---

## 7. Important Notes

1. **Don't hardcode runtime names** — Judge by tool availability, not by detecting `CLAUDE_CODE` etc.
2. **Keep fallback chain complete** — wopal_task → Task → inline must all be available
3. **wopal_task needs polling** — Unlike Task's blocking mode, use `wopal_task_output` to check progress
4. **Spot-check is final verification** — Regardless of delegation method, verify completion via disk artifacts

---

## 8. Related Documents

- `subagent-tool-adapter.md` — Task and wopal_task parameter mapping and completion detection
- `agent-contracts.md` — Subagent completion marker contract
- `execute-phase.md` — runtime_compatibility block and detection logic
- `map-codebase.md` — detect_runtime_capabilities step
