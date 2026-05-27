---
description: Summon Wopal and restore memory
---

# Summon

Project mode: `$ARGUMENTS` (e.g. `wopal-cli`)

## Workflow

1. **Core memory**: load `.wopal-space/memory/USER.md`, `.wopal-space/memory/MEMORY.md` (skip if already loaded)
2. **Short-term memory**: read the last 3 days of diaries under `.wopal-space/memory/diary/`
3. **Space map**: read `.wopal-space/STRUCTURE.md`
4. **Project rules** (when argument provided): read `projects/<project>/AGENTS.md`
5. **State calibration**: `git status && git log -5 --oneline` (determine repo from argument)

## Summon Report

🧙 **Memory Highlights**
- Key MEMORY.md entries
- Recent diary summary (decisions / progress / TODOs)

📁 **Current State**
- Branch / recent commits / uncommitted changes

🏗️ **Project** (if applicable)
- Tech stack / special conventions

Keep the report concise; prefer bullet points.