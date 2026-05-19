# SLM Agent by ScaleDown

An MCP server + Claude Code plugin that scans your codebase for AI API calls and shows you exactly where and how to integrate [ScaleDown](https://scaledown.ai) SLMs to cut costs by up to 95%.

> **Privacy**: This plugin analyzes your code locally. No source code or codebase data is ever sent to ScaleDown servers. The only network calls are to ScaleDown's API endpoints at runtime, when *your application* calls them with the `SCALEDOWN_API_KEY` you provide.

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

```
/plugin install scaledown-team/SLM_Agent
```

Then in any project:

```
/slm-agent:evaluate
```

The plugin automatically configures the MCP server and registers the `/slm-agent:evaluate` skill. No further setup needed.

### Cursor

Add to your project's `.cursor/mcp.json` (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "scaledown-slm-agent": {
      "command": "npx",
      "args": ["-y", "@scaledown/migration-agent"]
    }
  }
}
```

Then ask Cursor: *"Use the scaledown-slm-agent tools to evaluate this codebase for ScaleDown integration opportunities."*

### VS Code (Copilot / any MCP-compatible extension)

Add to your workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "scaledown-slm-agent": {
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
| `get_integration_template` | Returns before/after code showing exactly how to integrate ScaleDown |
| `generate_migration_plan` | Generates a full structured markdown migration plan from a list of findings |
| `save_migration_report` | Writes the migration plan markdown to `scaledown-report.md` in the user's project root |

## Migration report

After evaluation, a file named **`scaledown-report.md`** is saved in your project root. It follows a fixed schema (version `"1"`) and contains:

| Section | Content |
|---|---|
| **Summary table** | Files scanned, files with AI calls, total opportunities, providers detected |
| **Complexity breakdown** | Count of calls at each complexity level (trivial → highly_complex) |
| **Per-opportunity sections** | Files, line numbers, complexity score, confidence level, and action for each of `sd_classify` / `sd_extract` / `sd_summarize` / `sd_compress` |
| **Complex call decompositions** | For calls scoring 3+/5, a step-by-step breakdown showing which sub-tasks can move to a ScaleDown SLM and which still need a frontier LLM |
| **HTTP API reference** | Exact request/response shapes for all four ScaleDown endpoints (`/v1/classify`, `/v1/extract`, `/v1/compress`, `/v1/summarize`) |

The report header looks like:

```markdown
# ScaleDown Migration Plan — my-app

> Generated: 2025-05-19T10:00:00.000Z
> Report version: 1

## Summary
| Metric | Value |
|---|---|
| Files scanned | 42 |
| Files with AI API calls | 7 |
| Total integration opportunities | 11 |
| Providers detected | openai, langchain |

### Call Complexity Breakdown
| Complexity | Count |
|---|---|
| simple | 4 |
| moderate | 2 |
| complex | 1 |
```

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
