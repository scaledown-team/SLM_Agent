# ScaleDown Migration Agent

An MCP server + Claude Code plugin that scans your codebase for AI API calls and shows you exactly where and how to integrate [ScaleDown](https://scaledown.ai) SLMs to cut costs by up to 95%.

## What it does

1. **Evaluates** — scans your project for OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, and other AI API calls
2. **Plans** — generates a structured migration plan showing which ScaleDown SLM fits each call site:
   - `sd_compress` — reduce context tokens 50–70% before calling your LLM (for RAG, long docs)
   - `sd_classify` — replace frontier LLM classification calls (~95% cheaper)
   - `sd_extract` — replace frontier LLM entity extraction calls (~95% cheaper)
   - `sd_summarize` — replace frontier LLM summarization calls (~90% cheaper)
3. **Migrates** — applies the changes to your code with your approval, adapting to your real variable names

## Installation

### Claude Code (recommended)

```bash
# Install the plugin — auto-configures the MCP server and adds the /scaledown-migration-agent:evaluate skill
claude plugin install scaledown-migration-agent@scaledown-team
```

Then in any project:

```
/scaledown-migration-agent:evaluate
```

### Cursor

Add to your project's `.cursor/mcp.json` (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "scaledown-migration-agent": {
      "command": "npx",
      "args": ["-y", "@scaledown/migration-agent"]
    }
  }
}
```

Then ask Cursor: *"Use the scaledown-migration-agent tools to evaluate this codebase for ScaleDown integration opportunities."*

### VS Code (Copilot / any MCP-compatible extension)

Add to your workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "scaledown-migration-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@scaledown/migration-agent"]
    }
  }
}
```

### Manual (any MCP client)

```bash
npm install -g @scaledown/migration-agent
```

Then configure your MCP client to run: `scaledown-agent`

## MCP Tools

The server exposes four tools that any MCP-compatible AI assistant can call:

| Tool | Description |
|---|---|
| `get_ai_detection_patterns` | Returns grep-compatible regex patterns for all supported AI providers |
| `analyze_code_snippet` | Classifies a code snippet and returns ScaleDown integration opportunities |
| `get_integration_template` | Returns before/after code showing exactly how to integrate ScaleDown |
| `generate_migration_plan` | Generates a full markdown migration plan from a list of findings |

## Supported providers

| Provider | Language |
|---|---|
| OpenAI (v0 and v1) | Python, TypeScript/JS |
| Anthropic | Python, TypeScript/JS |
| LangChain | Python, TypeScript/JS |
| LlamaIndex | Python |
| Cohere | Python |
| Google Generative AI | Python |
| Vercel AI SDK | TypeScript/JS |

## Example output

```
## ScaleDown Migration Plan — my-app

| Metric | Value |
|---|---|
| Files with AI API calls | 7 |
| Total integration opportunities | 11 |
| Providers detected | openai, langchain |

## 1. Replace Classification Calls with `sd_classify`
Estimated savings: ~95% per call

| File | Line |
|---|---|
| `src/triage.py` | 42 |
| `src/router.py` | 88 |

## 2. Add Context Compression with `sd_compress`
Estimated savings: 50-70% on context tokens

| File | Line |
|---|---|
| `src/rag_pipeline.py` | 117 |
| `src/chat.py` | 55 |
```

## Development

```bash
git clone https://github.com/scaledown-team/SLM_Agent
cd SLM_Agent
npm install
npm run build       # compile TypeScript → dist/
npm run dev         # run without compiling (via tsx)
```

## Get a ScaleDown API key

Sign up at [scaledown.ai/dashboard](https://scaledown.ai/dashboard) — **50 million free tokens** included.

## Extending to other IDEs

- **Codex (OpenAI)**: Add to `mcp_servers` in your Codex config once MCP support is available
- **JetBrains**: Use any MCP proxy plugin and point it at `npx @scaledown/migration-agent`
- **Neovim / Emacs**: Use any MCP client plugin with the same npx command
