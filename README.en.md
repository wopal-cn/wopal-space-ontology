# WopalSpace Ontology

WopalSpace Soul, Specification, and Capability Toolkit — Agent Development Standards, Rule Systems, Skills, and Workflows.

## Project Overview

WopalSpace Ontology is a workspace framework designed for AI Agent software development, providing:

- **Agent System**: Multiple specialized Agents (wopal controller, rook reviewer, fae executor, translator)
- **Skill System**: Various skills including development, review, automation, etc.
- **Command System**: Issue/Plan-driven development workflow
- **Rule System**: Code standards, memory management, business rules
- **Plugin System**: Core plugins (wopal-plugin) for memory, tasks, and notifications
- **Template System**: Standardized document templates

## Core Workflow

### Issue / Plan-Driven Development

```
planning → executing → verifying → done
```

Key Commands:
- `issue create` - Create an Issue
- `plan` - Create a Plan
- `approve` - Approve Plan for execution
- `complete` - Mark task as completed
- `verify` - User verification
- `archive` - Archive

### Sub-Agent Collaboration

Initiate sub-tasks via the `wopal_task` tool:
- `wopal_task` - Start a task
- `wopal_task_output` - View status
- `wopal_task_reply` - Communicate
- `wopal_task_abort` - Abort
- `wopal_task_finish` - Finalize

## Directory Structure

```
├── agents/              # Agent soul definitions
├── commands/           # Command specifications
├── rules/              # Development rules
├── skills/             # Skill definitions
│   ├── agents-collab/  # Agent collaboration
│   ├── dev-flow/       # Development workflow
│   ├── df-plan-review/
│   ├── df-implement-review/
│   └── ...
├── plugins/            # Plugins
│   └── wopal-plugin/  # Core plugin
├── docs/               # Documentation
├── scripts/           # Script tools
└── templates/          # Templates
```

## Quick Start

### Initialize Workspace

```bash
/init
```

### Create an Issue

```bash
issue create --title "feat(scope): description"
```

### Create a Plan

```bash
plan <issue_number> --type feature
```

### Approve and Execute

```bash
approve <issue_number> --confirm
```

### Complete and Verify

```bash
verify <issue_number> --confirm
complete <issue_number> --pr
```

## Core Capabilities

### Memory System

- Automatic session memory distillation
- Vector retrieval
- Memory categorization (Profile/Preference/Knowledge/Fact/Gotcha/Experience/Requirement)

### Task Management

- Sub-session lifecycle management
- Status notifications
- Context compression
- Concurrency control

### Rule Injection

- Keyword matching
- Agent scope definition
- Automatic loading

## Development Standards

See [AGENTS.md](./AGENTS.md) for details.

## Related Documentation

- [SKILL.md](./skills/dev-flow/SKILL.md) - Development Workflow Skill
- [agents/wopal.md](./agents/wopal.md) - Controller Agent Definition
- [plugins/wopal-plugin/AGENTS.md](./plugins/wopal-plugin/AGENTS.md) - Plugin Development Guidelines

## License

MIT