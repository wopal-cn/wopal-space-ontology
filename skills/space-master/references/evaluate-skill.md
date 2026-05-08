---
title: Evaluate Skill Reference
description: Detailed skill evaluation with scoring rubric and decision framework
---

# Skill Evaluation Reference

## Process

### 1. Collect Information

```bash
ls -la <skill-path>/
find <skill-path> -type f | wc -l
wc -l <skill-path>/SKILL.md
```

Read: `SKILL.md` (required), `scripts/`, `references/`, `templates/` (if present)

### 2. Analyze Functionality

Extract: name, description, core functions, trigger scenarios, dependencies

### 3. Check Compliance

| Item | Requirement | Status |
|------|-------------|--------|
| SKILL.md | Required | ✅/❌ |
| scripts/ | Executable scripts if needed | ✅/❌/N/A |
| references/ | Directory if >300 lines | ✅/❌/N/A |
| name | Matches directory, regex valid | ✅/❌ |
| description | Has trigger contexts | ✅/❌ |
| SKILL.md size | <500 lines ideal | ✅/⚠️ |
| shebang | `#!/usr/bin/env python` for .py | ✅/❌ |
| permission | Scripts executable | ✅/❌ |

Naming regex: `^[a-z0-9]+(-[a-z0-9]+)*$`

### 4. Score Quality (1-5 stars)

| Dimension | Criteria |
|-----------|----------|
| Content | SKILL.md depth, examples, edge cases |
| Utility | Problem-solving ability, expected usage |
| Executability | Scripts present, clear workflow |
| Documentation | Structure, formatting, clarity |
| Compliance | Matches skill-creator standards |
| Maintainability | Dependencies, update needs |

### 5. Analyze Relationships

- Overlap/complement with installed skills
- Project relevance
- Alternative options

---

## Output Format

### Scenario A: Installed Skills (Deep Analysis)

Use when path does NOT contain `.INBOX`. Focus on thorough understanding.

```markdown
## {Skill Name} Deep Analysis

### Core Functions
- **{Function}**: {Description}

### Use Cases
- {Scenario A}: {Description}
- {Scenario B}: {Description}

### Mechanism
- **Dependencies**: {Tools/APIs}
- **Workflow**: {Step-by-step logic}

### Usage
- **Basic**: {How to invoke}
- **Advanced**: {Tips/limitations}

### Ecosystem
- {Role and dependencies}
```

### Scenario B: INBOX Skills (Evaluation Report)

Use when path contains `.INBOX`. Focus on value assessment and decision.

```markdown
## {Skill Name} Evaluation

### Overview

| Attribute | Value |
|-----------|-------|
| Lines | {count} |
| Files | {list or "SKILL.md only"} |
| Type | {workflow/tool/reference} |

### Core Functions
1. **{Function}**: {Description}

### Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Content | ⭐⭐⭐⭐ | {Note} |
| Utility | ⭐⭐⭐⭐ | {Note} |
| Executability | ⭐⭐⭐ | {Note} |
| Documentation | ⭐⭐⭐⭐ | {Note} |
| Compliance | ⭐⭐⭐⭐ | {Note} |
| Maintainability | ⭐⭐⭐⭐⭐ | {Note} |

### Compliance Checklist

| Item | Status |
|------|--------|
| SKILL.md exists | ✅/❌ |
| Metadata complete | ✅/❌ |
| Naming compliant | ✅/❌ |
| Line count OK | ✅/⚠️ |
| Scripts valid | ✅/❌/N/A |

### Relationships

| Type | Skill | Note |
|------|-------|------|
| Complement | {name} | {how} |
| Overlap | {name} | {what} |

### Recommendation

**{✅ Install / ⚠️ Backup / ❌ Delete}**

Reasons:
- {reason 1}
- {reason 2}
```

### Multiple Skills Summary

```markdown
# Skill Evaluation Summary

Evaluated {N} skills in `{path}`

| Skill | Lines | Type | Compliance | Score | Rec | Note |
|-------|-------|------|------------|-------|-----|------|
| skill-a | 200 | workflow | ✅ | ⭐⭐⭐⭐ | ✅ | High value |
| skill-b | 50 | reference | ⚠️ | ⭐⭐ | ⚠️ | Naming issue |

## Summary

- **Install**: {list}
- **Backup**: {list}
- **Delete**: {list}
```

---

## Scoring Guide

### Compliance Score

| Score | Criteria |
|-------|----------|
| ⭐⭐⭐⭐⭐ | Fully compliant |
| ⭐⭐⭐⭐ | Minor issues |
| ⭐⭐⭐ | Fixable issues |
| ⭐⭐ | Needs refactor |
| ⭐ | Needs rewrite |

### Overall Score

| Score | Criteria |
|-------|----------|
| ⭐⭐⭐⭐⭐ | Complete, scripts, high utility, clear docs |
| ⭐⭐⭐⭐ | Good content, clear workflow, useful |
| ⭐⭐⭐ | Basic content, docs only, limited use |
| ⭐⭐ | Shallow, unclear, incomplete |
| ⭐ | Empty shell, no value |

---

## Decision Framework

| Recommendation | Criteria |
|----------------|----------|
| ✅ Install | Score ≥4, compliance ≥3, matches project |
| ⚠️ Backup | Score 3, fixable issues, possible future use |
| ❌ Delete | Score ≤2, compliance ≤2, empty or redundant |
| 🔧 Fix first | High value but compliance issues |
