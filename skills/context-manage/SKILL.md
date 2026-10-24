---
name: context-manage
description: Preserve and restore working context across sessions, covering session handoffs and post-compaction recovery. Use this skill whenever the user asks to save the current session state before ending or switching sessions, to continue unfinished work in a new session, or to reload essential files, memories, and skills after context compaction.
---

# context-manage

Centralize saving, cross-session restoration, and post-compaction recovery of working context. Thin command entry points select a workflow here; the protocol itself lives only in this skill.

## Select a workflow

- `handoff`: before ending or switching the current session, save enough state to resume later into a timestamped handoff file, then produce a restoration prompt the user can paste directly into a new session.
- `continue`: in a new session, read the handoff file at the path supplied by the user, rebuild the working environment, resume, and delete the file on success.
- `recover`: after context compaction, reload the most important files, memories, and skills from the compaction summary.

When invoked directly, select the workflow from the user's explicit intent. Do not guess a destructive workflow when deletion of the handoff file may occur.

## Handoff — save context

1. Use an available shell/terminal tool to run `date '+%Y%m%d-%H%M%S'` to generate the timestamp for the file name. Never guess the timestamp. If no command-execution tool is available, tell the user a timestamped handoff file cannot be produced instead of inventing a time.
2. Target file: `<space-root>/.wopal-space/.tmp/.working-context-<YYYYMMDD-HHMMSS>.md`, with the timestamp from step 1's command output.
3. Treat this invocation as user authorization to write **only this handoff file**, while still obeying system, tool, and workspace safety boundaries.
4. Record enough information for the next session to resume immediately, including at least:
   - user concerns and current objective
   - completed research, analysis, and key decision rationale
   - critical discoveries and important reference materials
   - related files, project paths, and current working location
   - rules and constraints that must continue to apply
   - current progress, unfinished work, and next steps
   - the handoff reason, when supplied by the user
5. Verify that the file exists, is readable, and is located under the space root's `.wopal-space/.tmp/` directory.
6. On success, produce a **restoration prompt the user can paste directly into a new session**. The prompt must be self-contained: the next agent can complete recovery by following the prompt alone, without loading any skill. The handoff file path must be prefixed with `@` (absolute or relative path both work). In the user's preferred language, generate it from this template (replace placeholders with the actual path; wording may be adjusted, but no step may be omitted):

   > Restore context from the handoff file and continue the unfinished work:
   > 1. Read the handoff file `@.wopal-space/.tmp/.working-context-20261020-143000.md` in full (if this message already carries the file content, use it directly and do not read the file again)
   > 2. Rebuild the working environment from the handoff: fully read the important related files and key references named there; if the handoff conflicts with current files or code, prefer current evidence
   > 3. Briefly summarize "what is being done / where it stands / what comes next"
   > 4. After the summary, immediately delete the handoff file; if safe deletion is unavailable, keep it and say so explicitly
   > 5. Continue directly with the next step recorded in the handoff file instead of stopping at the summary

7. Output nothing beyond the restoration prompt from step 6 and one brief confirmation. On failure, identify the exact failed step.

## Continue — restore from the handoff file

1. The handoff file path comes from the restoration prompt the user pasted (the path carries an `@` prefix; in some environments the file content may already be attached to the message after being parsed). Apply this priority:
   - The user's message already contains the handoff file content → use that content directly; do not read the file again.
   - The user's message contains only a path (including an `@` reference) → read the file at that path.
   - The user's message contains no path → look for the newest `.working-context-*.md` under `<space-root>/.wopal-space/.tmp/`; when the result is ambiguous or uncertain, confirm with the user first instead of guessing.
2. Read the handoff file content in full (when the message already carries the content, it takes precedence); do not rely on a snippet or summary.
3. Restore the current objective, user concerns, progress, key decisions, relevant paths, rules, next steps, and the important materials referenced by the previous session.
4. To rebuild the same working environment, fully read the important related files and key references named by the handoff. Re-analyze relevant code or run verifiable checks when needed instead of relying only on stale conclusions in the handoff text.
5. If the handoff conflicts with current files or code, prefer current evidence and call out the difference in the recovery summary.
6. Briefly summarize the restored state in the user's preferred language: what is being done, where it stands, and what comes next.
7. The recovery itself is straightforward reading and summarizing; there is no need to deliberately load a skill or follow a fixed procedure. Simply apply this section's priority rules and deletion rules during recovery.
8. Delete the handoff file only after recovery succeeds. Follow the current workspace deletion rules and available safe-delete mechanism; if safe deletion is unavailable, keep the file and say so explicitly. Never delete before recovery completes.
9. After recovery, continue the unfinished next step from the previous session instead of stopping at the summary.

## Recover — restore after compaction

Use this workflow when the current session has just been compacted:

1. Identify the most important files from the compaction summary, prioritizing Plans, workflow specifications, design documents, and key references. Re-read up to 3 first; load more only when needed.
2. If a memory-search capability is available, search with 2–3 keywords most relevant to the current task and take at most the top 3 results per query. If no memory tool is available, skip this step and never pretend memories were loaded.
3. Identify the skills that were active before compaction and reload at most the 2 most relevant ones. Mandatory-gate skills take priority.
4. For claims about actual system behavior, re-read control flow/config evaluation or rerun verification when necessary; a conclusion in the compaction summary is not evidence that it is still true.
5. Briefly report the restored state in the user's preferred language: which key materials were restored, the current task state, and the next step.
6. Continue the current task after the report; context recovery is not the endpoint.

## Output

- `handoff`: one brief confirmation plus the restoration prompt (with the handoff file's full path) on success; identify the exact failure on error.
- `continue` / `recover`: give a short recovery summary, then immediately resume the original work.
- Do not print large portions of the handoff file or compaction summary verbatim.
