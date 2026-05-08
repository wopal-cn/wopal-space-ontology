---
title: Skill Installation Lifecycle
description: Complete workflow for finding, downloading, scanning, and installing skills
---

# Skill Installation Lifecycle

## Install Commands

```bash
# From INBOX
wopal skills install skill-name

# From remote (auto download + scan)
wopal skills install owner/repo@skill-name

# From local path
wopal skills install /path/to/skill

# Clean INBOX after install
wopal skills install skill-name --rm-inbox

# Overwrite existing
wopal skills install /path/to/skill --force
```

## Find Skills

```bash
wopal skills find "query"              # Basic search
wopal skills find openspec --limit 10  # Limit results
wopal skills find "deploy*" --verify   # Verify with temp download
wopal skills find ci-cd --json         # JSON output
```

## Download to INBOX

```bash
wopal skills download owner/repo@skill-name
wopal skills download owner/repo@skill-a,skill-b  # Multiple
wopal skills download owner/repo@skill --branch dev
wopal skills download owner/repo@skill --force
```

## Security Scan

```bash
wopal skills scan skill-name
wopal skills scan --all              # All INBOX skills
wopal skills scan skill-name --json
```

Scanner checks: C2 infrastructure, reverse shells, data exfiltration, malware, known CVEs.

## Manage INBOX

```bash
wopal skills inbox list
wopal skills inbox show skill-name --detail
wopal skills inbox remove skill-name
```

## Decision Guide

| User Intent | Command |
|-------------|---------|
| Find/search skills | `wopal skills find` |
| Download for review | `wopal skills download` |
| Check security | `wopal skills scan` |
| Install skill | `wopal skills install /path` |
| View INBOX | `wopal skills inbox list` |

## Browse Online

https://skills.sh/