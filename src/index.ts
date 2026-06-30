#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDetectionPatterns } from "./tools/patterns.js";
import { getBestTemplate, getTemplates } from "./tools/templates.js";
import { generateMigrationPlanMarkdown } from "./tools/analyzer.js";
import type { Finding } from "./tools/analyzer.js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
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

// ── Tool 2: get_integration_template ─────────────────────────────────────────

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

// ── Tool 3: generate_migration_plan ──────────────────────────────────────────

const findingSchema = z.object({
  file_path: z.string(),
  line_number: z.number().optional(),
  provider: z.string(),
  opportunities: z.array(
    z.object({
      type: z.enum(["compression", "classification", "extraction", "summarization"]),
      confidence: z.enum(["high", "medium", "low"]),
      reason: z.string(),
      estimated_savings: z.string(),
    })
  ),
  complexity: z
    .object({
      score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      label: z.enum(["trivial", "simple", "moderate", "complex", "highly_complex"]),
      reasons: z.array(z.string()),
      decomposition: z
        .array(
          z.object({
            step: z.number(),
            purpose: z.string(),
            handler: z.enum(["scaledown", "llm"]),
            slm_type: z
              .enum(["compression", "classification", "extraction", "summarization"])
              .optional(),
            notes: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
  code_snippet: z.string(),
});

server.tool(
  "generate_migration_plan",
  `Generates a structured markdown migration plan from a list of findings.
Call this after you have analyzed all AI API call sites in the codebase.
The plan includes a summary table, complexity breakdown, per-opportunity sections
with confidence levels, complex call decompositions, and setup instructions.
The markdown is returned as text — use save_migration_report to persist it to disk.`,
  {
    findings: z
      .array(findingSchema)
      .describe("Array of findings assembled by Claude, one per AI API call site."),
    project_name: z
      .string()
      .optional()
      .describe("Name of the project/codebase (used in the plan heading)."),
    files_scanned: z
      .number()
      .optional()
      .describe("Total number of files scanned (for the summary table)."),
  },
  async ({ findings, project_name, files_scanned }) => {
    const plan = generateMigrationPlanMarkdown(
      findings as Finding[],
      project_name,
      files_scanned ?? 0
    );
    return {
      content: [{ type: "text", text: plan }],
    };
  }
);

// ── Tool 4: save_migration_report ─────────────────────────────────────────────

server.tool(
  "save_migration_report",
  `Saves the migration report as a markdown file inside the user's project.
Always call this after generate_migration_plan so the report is persisted.
The file is written to <project_root>/scaledown-report.md.
Returns the absolute path of the saved file.`,
  {
    markdown: z
      .string()
      .describe("The markdown string returned by generate_migration_plan."),
    project_root: z
      .string()
      .describe(
        "Absolute path to the root of the user's project (the directory being evaluated)."
      ),
  },
  async ({ markdown, project_root }) => {
    const outPath = join(project_root, "scaledown-report.md");
    try {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, markdown, "utf8");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ saved: true, path: outPath }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              saved: false,
              error: String(err),
              path: outPath,
            }),
          },
        ],
      };
    }
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
