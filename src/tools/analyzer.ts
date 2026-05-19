import type { OpportunityType } from "./templates.js";

export interface Opportunity {
  type: OpportunityType;
  confidence: "high" | "medium" | "low";
  reason: string;
  estimated_savings: string;
}

export interface SnippetAnalysis {
  provider: string | null;
  api_call_detected: boolean;
  opportunities: Opportunity[];
  has_large_context_risk: boolean;
  summary: string;
}

export interface Finding {
  file_path: string;
  line_number?: number;
  provider: string;
  opportunities: Opportunity[];
  code_snippet: string;
}

// ── Keyword banks ────────────────────────────────────────────────────────────

const CLASSIFICATION_KEYWORDS = [
  "classif",
  "categor",
  "label",
  "sentiment",
  "intent",
  "topic",
  "spam",
  "route",
  "triage",
  "tag",
  "bucket",
];

const EXTRACTION_KEYWORDS = [
  "extract",
  "parse",
  "identify",
  "find all",
  "list all",
  "named entity",
  "ner",
  "pull out",
  "get all",
  "structured",
  "json output",
  "return json",
  "return as json",
];

const SUMMARIZATION_KEYWORDS = [
  "summar",
  "tldr",
  "tl;dr",
  "brief",
  "overview",
  "key points",
  "condense",
  "shorten",
  "recap",
  "digest",
];

const LARGE_CONTEXT_SIGNALS = [
  /context\s*[\+\[]/, // context + query or context[...]
  /retrieved.*doc/i,
  /documents?\s*[\+\[]/,
  /chunks?\s*[\+\[]/,
  /passages?\s*[\+\[]/,
  /\brag\b/i, // RAG pipeline mention
  /\bjoin\(.*doc/i, // "\n".join(docs)
  /\n.*join/i,
  /f["'].*\{.*context/i, // f-string with context
  /f["'].*\{.*doc/i, // f-string with doc
  /template\.format/i,
  /PromptTemplate/i,
  /context_window/i,
  /long.*context/i,
  /large.*context/i,
];

// ── Provider detection ────────────────────────────────────────────────────────

const PROVIDER_SIGNALS: Record<string, RegExp[]> = {
  openai: [
    /from openai import/i,
    /import openai/i,
    /chat\.completions\.create/i,
    /ChatCompletion\.create/i,
    /openai\.Completion/i,
  ],
  anthropic: [
    /from anthropic import/i,
    /import anthropic/i,
    /messages\.create/i,
    /Anthropic\(\)/i,
  ],
  langchain: [
    /from langchain/i,
    /ChatOpenAI/,
    /ChatAnthropic/,
    /LLMChain/,
    /RetrievalQA/,
  ],
  llamaindex: [
    /from llama_index/i,
    /VectorStoreIndex/,
    /ServiceContext/,
    /QueryEngine/,
  ],
  cohere: [/import cohere/i, /co\.chat/, /co\.generate/, /co\.classify/],
  google_genai: [
    /import google\.generativeai/i,
    /genai\.GenerativeModel/i,
    /generate_content/i,
  ],
  vercel_ai: [/from ['"]ai['"]/, /generateText/, /streamText/, /generateObject/],
};

function detectProvider(code: string): string | null {
  for (const [provider, patterns] of Object.entries(PROVIDER_SIGNALS)) {
    if (patterns.some((p) => p.test(code))) return provider;
  }
  return null;
}

// ── Main analysis ─────────────────────────────────────────────────────────────

export function analyzeSnippet(
  code: string,
  language: "python" | "typescript" | "javascript"
): SnippetAnalysis {
  const codeLower = code.toLowerCase();
  const opportunities: Opportunity[] = [];

  const provider = detectProvider(code);
  const hasLargeContext = LARGE_CONTEXT_SIGNALS.some((p) => p.test(code));

  // Classification replacement opportunity
  if (CLASSIFICATION_KEYWORDS.some((kw) => codeLower.includes(kw))) {
    opportunities.push({
      type: "classification",
      confidence: "high",
      reason:
        "Code uses a frontier LLM for text classification. ScaleDown's sd_classify SLM handles this at a fraction of the cost.",
      estimated_savings: "~95% cost reduction vs. GPT-4o per call",
    });
  }

  // Extraction replacement opportunity
  if (EXTRACTION_KEYWORDS.some((kw) => codeLower.includes(kw))) {
    opportunities.push({
      type: "extraction",
      confidence: "high",
      reason:
        "Code uses a frontier LLM for structured data / entity extraction. ScaleDown's sd_extract handles this without an LLM.",
      estimated_savings: "~95% cost reduction vs. GPT-4o per call",
    });
  }

  // Summarization replacement opportunity
  if (SUMMARIZATION_KEYWORDS.some((kw) => codeLower.includes(kw))) {
    opportunities.push({
      type: "summarization",
      confidence: "medium",
      reason:
        "Code uses a frontier LLM for summarization. ScaleDown's sd_summarize can handle this at a lower cost.",
      estimated_savings: "~90% cost reduction vs. GPT-4o per call",
    });
  }

  // Compression opportunity (large context passed to LLM)
  if (hasLargeContext) {
    opportunities.push({
      type: "compression",
      confidence: "medium",
      reason:
        "Code passes large or variable-length context to an LLM. Compressing with sd_compress before the call reduces tokens 50-70%.",
      estimated_savings: "50-70% token reduction on context portion of call",
    });
  }

  // If no structural signals but we see an LLM API call, suggest compression as general advice
  if (opportunities.length === 0 && provider !== null) {
    opportunities.push({
      type: "compression",
      confidence: "low",
      reason:
        "LLM API call detected. If this call receives large user inputs or retrieved context, sd_compress can reduce token costs 50-70%.",
      estimated_savings: "50-70% on context tokens (if applicable)",
    });
  }

  const summary =
    opportunities.length > 0
      ? `Found ${opportunities.length} ScaleDown opportunity(ies): ${opportunities.map((o) => o.type).join(", ")}.`
      : "No clear ScaleDown integration opportunity detected in this snippet.";

  return {
    provider,
    api_call_detected: provider !== null,
    opportunities,
    has_large_context_risk: hasLargeContext,
    summary,
  };
}

// ── Migration plan generation ─────────────────────────────────────────────────

export function generateMigrationPlanMarkdown(
  findings: Finding[],
  projectName: string = "your project"
): string {
  if (findings.length === 0) {
    return `# ScaleDown Migration Plan\n\nNo AI API calls were found in ${projectName}.\n`;
  }

  // Aggregate savings by type
  const byType: Record<string, Finding[]> = {};
  for (const f of findings) {
    for (const o of f.opportunities) {
      if (!byType[o.type]) byType[o.type] = [];
      byType[o.type].push(f);
    }
  }

  const uniqueFiles = new Set(findings.map((f) => f.file_path)).size;
  const totalOpportunities = findings.reduce(
    (n, f) => n + f.opportunities.length,
    0
  );

  let md = `# ScaleDown Migration Plan — ${projectName}

## Summary

| Metric | Value |
|---|---|
| Files with AI API calls | ${uniqueFiles} |
| Total integration opportunities | ${totalOpportunities} |
| Providers detected | ${[...new Set(findings.map((f) => f.provider))].join(", ")} |

`;

  if (byType["classification"]) {
    md += `## 1. Replace Classification Calls with \`sd_classify\`

**Estimated savings: ~95% per call**

These files use a frontier LLM (e.g. GPT-4o) purely for text classification.
ScaleDown's task-specific SLM handles classification at a fraction of the cost and with lower latency.

| File | Line |
|---|---|
${byType["classification"].map((f) => `| \`${f.file_path}\` | ${f.line_number ?? "?"} |`).join("\n")}

**Action:** For each file, replace the LLM \`messages.create\` / \`chat.completions.create\` call with \`sd.classify(...)\`.

`;
  }

  if (byType["extraction"]) {
    md += `## ${Object.keys(byType).indexOf("extraction") + 1}. Replace Extraction Calls with \`sd_extract\`

**Estimated savings: ~95% per call**

These files use a frontier LLM purely for structured data or entity extraction.
ScaleDown's \`sd_extract\` SLM handles this without calling a frontier model.

| File | Line |
|---|---|
${byType["extraction"].map((f) => `| \`${f.file_path}\` | ${f.line_number ?? "?"} |`).join("\n")}

**Action:** For each file, replace the LLM call with \`sd.extract(text=..., entities={...})\`.

`;
  }

  if (byType["summarization"]) {
    md += `## ${Object.keys(byType).indexOf("summarization") + 1}. Replace Summarization Calls with \`sd_summarize\`

**Estimated savings: ~90% per call**

| File | Line |
|---|---|
${byType["summarization"].map((f) => `| \`${f.file_path}\` | ${f.line_number ?? "?"} |`).join("\n")}

**Action:** For each file, replace the LLM summarization call with \`sd.summarize(text=...)\`.
> Note: \`sd_summarize\` is currently in private preview. Contact ScaleDown to enable.

`;
  }

  if (byType["compression"]) {
    md += `## ${Object.keys(byType).indexOf("compression") + 1}. Add Context Compression with \`sd_compress\`

**Estimated savings: 50-70% on context tokens**

These files pass large or variable-length context to an LLM (e.g. RAG results, documents).
Inserting \`sd.compress(context=..., prompt=...)\` before the LLM call reduces token costs significantly.

| File | Line |
|---|---|
${byType["compression"].map((f) => `| \`${f.file_path}\` | ${f.line_number ?? "?"} |`).join("\n")}

**Action:** For each file, wrap the context with \`sd.compress(...)\` and pass \`compressed.compressed_prompt\` to the LLM.

`;
  }

  md += `## Setup

### Python

\`\`\`bash
pip install scaledown
export SCALEDOWN_API_KEY=your_key_here
\`\`\`

### TypeScript / JavaScript

\`\`\`bash
npm install @scaledown/sdk
export SCALEDOWN_API_KEY=your_key_here
\`\`\`

Get a free API key (50M tokens free) at: https://scaledown.ai/dashboard

---
*Generated by ScaleDown Migration Agent*
`;

  return md;
}
