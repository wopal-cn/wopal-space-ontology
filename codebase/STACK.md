# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- **TypeScript 5.x** - Main language for wopal-cli, ellamaka/OpenCode, skills
  - Used in: `projects/wopal-cli/`, `projects/ellamaka/`, `projects/ontology/`

**Secondary:**
- **Python** - Skill scripts and utilities
  - Used in: `projects/ontology/skills/fc-local/scripts/`, `projects/ontology/skills/youtube-master/scripts/`

## Runtime

**Primary:**
- **Bun 1.3.11** - JavaScript runtime for ellamaka/OpenCode
  - Lockfile: `projects/ellamaka/bun.lock`
  - Config: `projects/ellamaka/bunfig.toml`

**Secondary:**
- **Node.js** - Runtime for wopal-cli
  - Used via `ts-node` for development

**Package Managers:**
- **pnpm** - For wopal-cli
  - Lockfile: `projects/wopal-cli/pnpm-lock.yaml`
- **Bun** - For ellamaka (native package manager)
  - Lockfile: `projects/ellamaka/bun.lock`

## Frameworks

### Core Application

**OpenCode (ellamaka):**
- **SolidJS** - UI framework
- **Vite 7.x** - Build tool
- **TailwindCSS 4.x** - Styling
- **Hono** - HTTP server framework
- **Drizzle ORM** - Database ORM
- **Bun:sqlite** - SQLite database (embedded)
- **Effect** - Functional programming / Effect system

**wopal-cli:**
- **Commander** - CLI framework
- **Vitest** - Testing framework

### AI/LLM Integration

**Vercel AI SDK (`ai`)** - AI SDK ecosystem
- **@ai-sdk/anthropic** - Anthropic Claude models
- **@ai-sdk/openai** - OpenAI GPT models
- **@ai-sdk/google** - Google Gemini models
- **@ai-sdk/google-vertex** - Google Vertex AI
- **@ai-sdk/amazon-bedrock** - AWS Bedrock models
- **@ai-sdk/azure** - Azure OpenAI
- **@ai-sdk/cohere** - Cohere models
- **@ai-sdk/groq** - Groq models
- **@ai-sdk/mistral** - Mistral models
- **@ai-sdk/perplexity** - Perplexity models
- **@ai-sdk/xai** - xAI models
- **@ai-sdk/cerebras** - Cerebras models
- **@ai-sdk/deepinfra** - DeepInfra models
- **@ai-sdk/togetherai** - TogetherAI models
- **@ai-sdk/vercel** - Vercel AI
- **@ai-sdk/openai-compatible** - OpenAI-compatible APIs

**OpenAI SDK Ecosystem:**
- **@openrouter/ai-sdk-provider** - OpenRouter
- **ai-gateway-provider** - AI Gateway
- **gitlab-ai-provider** - GitLab AI
- **venice-ai-sdk-provider** - Venice AI

### MCP (Model Context Protocol)

- **@modelcontextprotocol/sdk** - MCP protocol implementation
- Custom MCP servers for Exa search

### Database

- **Drizzle ORM** - Type-safe SQL
- **Bun:sqlite** - Embedded SQLite (Bun native)
- **node:sqlite** - Node.js SQLite (fallback)

### Authentication

- **@openauthjs/openauth** - Authentication framework
- **OAuth 2.0** - External auth protocols
- **@octokit/rest** - GitHub API
- **@octokit/graphql** - GitHub GraphQL
- **google-auth-library** - Google Cloud auth
- **opencode-gitlab-auth** - GitLab OAuth

### UI Components

- **@kobalte/core** - SolidJS accessible components
- **@solid-primitives/** - SolidJS utilities
- **@tanstack/solid-query** - Data fetching
- **shiki** - Syntax highlighting
- **marked** - Markdown parsing
- **diff** - Text diffing
- **@pierre/diffs** - Diff utilities

### Development Tools

- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **Prettier** - Code formatting
- **Turbo** - Monorepo build system
- **TypeScript** - Type safety
- **@parcel/watcher** - File watching
- **tree-sitter-bash** - Bash parsing
- **tree-sitter-powershell** - PowerShell parsing

## Key Dependencies

### Critical (AI/LLM)

- `ai` (6.x) - AI SDK core
- `@ai-sdk/provider` - Provider abstraction
- `@ai-sdk/provider-utils` - Provider utilities
- `effect` - Functional Effect system

### Infrastructure

- `hono` - Lightweight web framework
- `drizzle-orm` - Database ORM
- `zod` - Schema validation
- `solid-js` - Reactive UI

### CLI Tools

- `commander` - CLI argument parsing
- `simple-git` - Git operations
- `fs-extra` - File system utilities
- `gray-matter` - Frontmatter parsing
- `dotenv` - Environment variables

## Configuration

### TypeScript

**wopal-cli:** `projects/wopal-cli/tsconfig.json`
- Target: ES2022
- Module: ES2022
- Strict mode enabled

**ellamaka:** `projects/ellamaka/tsconfig.json`
- Extends: `@tsconfig/bun/tsconfig.json`
- Uses Bun-specific settings

### Build

- **Turbo:** `projects/ellamaka/turbo.json` - Monorepo orchestration
- **Vite:** `projects/ellamaka/packages/app/` - Web app bundling
- **Drizzle Kit:** Database migrations

### Environment

- **wopal-cli:** Uses `dotenv` for `.env` loading
- **Config files:** `.env`, `.env.example` in root

## Platform Requirements

**Development:**
- macOS (primary)
- Bun runtime
- Node.js (for wopal-cli development)

**Production:**
- Bun runtime or Node.js
- SQLite (embedded, no separate DB needed)

---

*Stack analysis: 2026-04-09*
