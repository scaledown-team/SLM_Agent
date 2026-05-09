#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDetectionPatterns } from "./tools/patterns.js";
import { getBestTemplate, getTemplates } from "./tools/templates.js";
import { analyzeSnippet, generateMigrationPlanMarkdown } from "./tools/analyzer.js";
import type { Finding } from "./tools/analyzer.js";
import type { OpportunityType } from "./tools/templates.js";

const server = new McpServer({
  name: "scaledown-migration-agent",
  version: "0.1.0",
});

// ── Tool 1: get_ai_detection_patterns ────────────────────────────────────────

server.tool(
  "get_ai_detection_patterns",
  `Returns grep-compatible regex patterns for finding AI API calls in a codebase.
Use these patterns with Grep or Bash to locate all files that call AI providers
(OpenAI, Anthropic, LangChain, LlamaIndex, Cohere, Google GenAI, Vercel AI SDK).
Returns patterns for both Python and TypeScript/JavaScript.`,
  {
    language: z
      .enum(["python", "typescript", "javascript", "all"])
      .optional()
      .describe(
        "Filter patterns by language. Omit or pass 'all' to get patterns for all languages."
      ),
  },
  async ({ language }) => {
    const lang =
      language === "all" || language === undefined ? undefined : language;
    const patterns = getDetectionPatterns(lang as "python" | "typescript" | "javascript" | undefined);

    const result = {
      patterns,
      usage_guide: {
        bash_example:
          "grep -rn --include='*.py' 'chat\\.completions\\.create' ./src",
        note: "Use the grep_patterns array with grep -E for extended regex support.",
        file_extensions: {
          python: [".py"],
          typescript_javascript: [".ts", ".tsx", ".js", ".mjs"],
        },
        exclude_dirs: [
          "node_modules",
          ".venv",
          "venv",
          "__pycache__",
          ".git",
          "dist",
          "build",
        ],
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool 2: analyze_code_snippet ─────────────────────────────────────────────

server.tool(
  "analyze_code_snippet",
  `Analyzes a code snippet containing an AI API call and identifies ScaleDown
integration opportunities. Returns a list of opportunities (compression,
classification, extraction, summarization) with confidence levels and estimated
cost savings. Use this after finding AI API calls with grep to understand which
ScaleDown SLM is the best fit for each call site.`,
  {
    code: z
      .string()
      .describe(
        "The code snippet to analyze. Include surrounding context (±15 lines) for best results."
      ),
    language: z
      .enum(["python", "typescript", "javascript"])
      .describe("Programming language of the snippet."),
    file_path: z
      .string()
      .optional()
      .describe("File path (used for context in the analysis output)."),
  },
  async ({ code, language, file_path }) => {
    const lang = language === "javascript" ? "typescript" : language;
    const analysis = analyzeSnippet(code, lang as "python" | "typescript");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { file_path: file_path ?? "unknown", ...analysis },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool 3: get_integration_template ─────────────────────────────────────────

server.tool(
  "get_integration_template",
  `Returns a concrete before/after code template showing exactly how to integrate
ScaleDown for a specific opportunity type, AI provider, and language.
Use this to get the exact code changes to make in a file.

Opportunity types:
- compression:     Add sd_compress before an LLM call to reduce context tokens 50-70%
- classification:  Replace an LLM classification call with sd_classify (~95% cheaper)
- extraction:      Replace an LLM extraction call with sd_extract (~95% cheaper)
- summarization:   Replace an LLM summarization call with sd_summarize (~90% cheaper)`,
  {
    opportunity_type: z
      .enum(["compression", "classification", "extraction", "summarization"])
      .describe("The type of ScaleDown integration to apply."),
    provider: z
      .string()
      .describe(
        "The AI provider in the original code (e.g. 'openai', 'anthropic', 'langchain')."
      ),
    language: z
      .enum(["python", "typescript"])
      .describe("Programming language."),
  },
  async ({ opportunity_type, provider, language }) => {
    const template = getBestTemplate(
      opportunity_type as OpportunityType,
      provider,
      language
    );

    if (!template) {
      // Return generic guidance when no specific template exists
      const allForType = getTemplates({
        opportunity_type: opportunity_type as OpportunityType,
        language,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                found: false,
                message: `No exact template for ${provider}/${opportunity_type}/${language}. Closest matches:`,
                alternatives: allForType.map((t) => ({
                  provider: t.provider,
                  description: t.description,
                  after_snippet: t.after_snippet,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              found: true,
              ...template,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool 4: generate_migration_plan ──────────────────────────────────────────

server.tool(
  "generate_migration_plan",
  `Generates a structured markdown migration plan from a list of findings.
Call this after you have analyzed all AI API call sites in the codebase.
The plan includes a summary table, per-opportunity sections with file lists,
action items, and setup instructions.`,
  {
    findings: z
      .array(
        z.object({
          file_path: z.string(),
          line_number: z.number().optional(),
          provider: z.string(),
          opportunities: z.array(
            z.object({
              type: z.enum([
                "compression",
                "classification",
                "extraction",
                "summarization",
              ]),
              confidence: z.enum(["high", "medium", "low"]),
              reason: z.string(),
              estimated_savings: z.string(),
            })
          ),
          code_snippet: z.string(),
        })
      )
      .describe(
        "Array of findings from analyze_code_snippet, one per AI API call site."
      ),
    project_name: z
      .string()
      .optional()
      .describe("Name of the project/codebase (used in the plan heading)."),
  },
  async ({ findings, project_name }) => {
    const plan = generateMigrationPlanMarkdown(
      findings as Finding[],
      project_name
    );
    return {
      content: [{ type: "text", text: plan }],
    };
  }
);

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("ScaleDown migration agent failed to start:", err);
  process.exit(1);
});
