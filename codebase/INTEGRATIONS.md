# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

### LLM Providers

**Primary (configured in `.env`):**
- **TogetherAI** - Default LLM provider
  - Endpoint: `https://api.together.xyz/v1`
  - Models: `deepseek-ai/DeepSeek-V3`, `meta-llama/Llama-3.3-70B-Instruct-Turbo`
  - API Key: `OPENAI_API_KEY` (TogetherAI token)

- **Local Ollama** - Local embedding model
  - Endpoint: `http://macmini.local:11434/v1`
  - Model: `nomic-embed-text-v2-moe`
  - Use case: Local embedding generation

- **Local LiteLLM** - Local LLM gateway
  - Endpoint: `http://macmini.local:8000/v1`
  - Model: `Qwen3.5-9B-MLX-4bit`
  - API Key: `123456789` (local dev)

**SDK Support (via @ai-sdk):**
- OpenAI, Anthropic, Google (Gemini), Azure, AWS Bedrock
- Cohere, Groq, Mistral, Perplexity, xAI, Cerebras, DeepInfra
- OpenRouter, GitLab AI, Venice AI

### Search & Research

- **Tavily API** - Search/research skill
  - Env: `TAVILY_API_KEY`
  - Used by: `projects/ontology/skills/fc-local/`

- **Brave Search API** - Web search
  - Env: `BRAVE_API_KEY`
  - Used by: `projects/ontology/skills/fc-local/`

### MCP (Model Context Protocol)

- **Exa Search MCP** - Web search via MCP
  - Endpoint: `https://mcp.exa.ai`
  - Used in: `projects/ellamaka/packages/opencode/src/tool/`

### Authentication Providers

- **GitHub OAuth** - GitHub authentication
  - Package: `@octokit/rest`, `@octokit/graphql`
  - Auth: `opencode-gitlab-auth`

- **GitLab OAuth** - GitLab integration
  - Package: `opencode-gitlab-auth`

- **OpenAuth.js** - Custom auth framework
  - Package: `@openauthjs/openauth`

## Data Storage

### Databases

**SQLite (Primary):**
- Type: Embedded SQLite via Bun:sqlite
- Location: App data directory
- ORM: Drizzle
- Used by: OpenCode session storage, project data, accounts

**Schema files in `projects/ellamaka/packages/opencode/src/`:**
- `session/session.sql.ts` - Session/message storage
- `account/account.sql.ts` - Account management
- `project/project.sql.ts` - Project data
- `share/share.sql.ts` - Session sharing
- `sync/event.sql.ts` - Sync events
- `control-plane/workspace.sql.ts` - Workspace management

### File Storage

**Local filesystem:**
- Projects: User-specified directories
- Config: `~/.wopal/` or project-local
- Skills: `.wopal/skills/`, `.agents/skills/`

### Memory

**LanceDB (configured in environment):**
- Type: Vector database for memory/embedding storage
- Used by: Wopal memory system
- Connection via custom implementation

## Authentication & Identity

**Auth Provider:** Custom + OAuth hybrid

**Implementation:**
- `@openauthjs/openauth` - Auth framework
- MCP OAuth flows - For MCP server authentication
- Session-based auth - For OpenCode sessions

**Environment Variables:**
- `WOPAL_LLM_API_KEY` - LLM API authentication
- `WOPAL_LLM_BASE_URL` - LLM endpoint
- `OPENAI_API_KEY` - External LLM API keys
- `ANTHROPIC_API_KEY` - Anthropic API key
- `HF_TOKEN` - HuggingFace access

## Monitoring & Observability

**Logging:**
- Custom logger in `projects/ellamaka/packages/opencode/src/log.ts`
- Output to stderr/file

**Tokens:**
- `LOGFIRE_TOKEN` - Logfire observability (Pydantic AI)

**Debug:**
- `--debug` flag in wopal-cli
- Verbose logging options

## CI/CD & Deployment

**Hosting:**
- OpenCode: Self-hosted (desktop application)
- Wopal skills: Distributed via Git/MCP

**CI Pipeline:**
- GitHub Actions in `.github/` (per project)
- Husky for pre-commit hooks

## Environment Configuration

### Required env vars for Wopal workspace:

**LLM Configuration:**
```
WOPAL_LLM_BASE_URL=http://macmini.local:8000/v1
WOPAL_LLM_API_KEY=
WOPAL_LLM_MODEL=Qwen3.5-9B-MLX-4bit
```

**Embedding:**
```
WOPAL_EMBEDDING_BASE_URL=http://macmini.local:11434/v1
WOPAL_EMBEDDING_MODEL=nomic-embed-text-v2-moe
```

**External APIs:**
```
OPENAI_API_KEY=
GEMINI_API_KEY=
HF_TOKEN=
LOGFIRE_TOKEN=
```

**Optional:**
```
TAVILY_API_KEY=tvly-dev-sk-xxx
BRAVE_API_KEY=xxx
```

### Secrets location

- `.env` - Workspace environment (git-ignored)
- `.env.example` - Template without secrets
- `~/.wopal/` - Per-installation config

## Webhooks & Callbacks

**Outgoing:**
- MCP OAuth callbacks: `/mcp/oauth/callback`
- SSE events: For task/session streaming

**Incoming:**
- MCP route: `/mcp` - MCP protocol endpoint
- Auth routes: `/mcp/auth/*` - OAuth flows

---

*Integration audit: 2026-04-09*
