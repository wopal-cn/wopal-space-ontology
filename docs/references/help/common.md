# How This Space Works — Common Reference

## How to Work Here

You can interact with this space in three ways:

**1. Talk directly to the Agent.**
Just tell me what you want. "Create a project", "review this code", "look at this Issue". I'll figure out which skill to use and whether to handle it myself or delegate.

**2. Use slash commands.**
Shortcuts for frequent operations (see Core Commands below). Available inside the ellamaka session.

**3. Use the wopal CLI.**
For system operations like checking space status or managing ontologies, run `wopal` in your terminal.

Simple rule: **semantic work → talk to the Agent; system operations → use the CLI.**

---

## Important Files and Directories

| Location | What It Is | When You'll Use It |
|----------|-----------|-------------------|
| `projects/` | Code projects | Clone repos, create new projects |
| `contents/` | Content creation | Blog posts, tutorials |
| `docs/` | Cross-project docs | Product docs, design docs |
| `AGENTS.md` | Space entry point | Add your own Agent rules |
| `.wopal-space/STRUCTURE.md` | Space structure index | Agent uses it to understand the space |
| `.wopal-space/REGULATIONS.md` | Space regulations | read or modify Agent behavior rules |
| `.wopal-space/memory/USER.md` | User profile | Agent reads it on every start |

---

## Core Commands

| Command | What It Does | When To Use |
|---------|-------------|-------------|
| `/help` | Show space usage guide | Forgot how to work |
| `/init` | Calibrate space structure | After adding new projects or directories |
| `/commit` | Stage and commit with规范格式 | Code changes ready to commit |
| `/review` | Review code quality | Want the Agent to check your code |
| `wopal space status` | Check space ↔ type sync | Need to know if space is up to date |
| `wopal ontology status` | Check ontology source sync | Need to know about upstream changes |

---

## Core Skills

Skills are the Agent's workflow modules. They load automatically; you don't need to trigger them manually.

| Skill | What It Handles | When It Loads |
|-------|----------------|---------------|
| `space-master` | Workflow routing, space maintenance, ontology collaboration | Agent isn't sure what to do |
| `agents-collab` | Sub-agent delegation protocol | Before any fae/rook delegation |
| `dev-flow` | Issue/Plan driven development | Creating issues, progressing plans |

---

## Rules and Customization

**Where rules live:**
- `.wopal-space/REGULATIONS.md` — regulations the Agent must follow (safety, git, delegation rules)
- `AGENTS.md` — your space-specific customization entry point

**How to change Agent behavior:**
1. Edit `REGULATIONS.md` to adjust the rules
2. Edit `AGENTS.md` to add your own rules
3. Or just tell me "remember my preference" — I'll update `USER.md`

You don't need to read everything now. Just know where they are. When you want to change something, tell me.
