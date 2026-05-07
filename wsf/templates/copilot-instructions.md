# Instructions for WSF

- Use the wsf skill when the user asks for WSF or uses a `wsf-*` command.
- Treat `/wsf-...` or `wsf-...` as command invocations and load the matching file from `.github/skills/wsf-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply WSF workflows unless the user explicitly asks for them.
- After completing any `wsf-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.
