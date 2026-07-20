import type { OpportunityType } from "./templates.js";

// ── Shared types (filled in by Claude, not by heuristics) ────────────────────

export interface Opportunity {
  type: OpportunityType;
  confidence: "high" | "medium" | "low";
  reason: string;
  estimated_savings: string;
}

/**
 * Complexity score (1–5) assessed by Claude based on full cross-file context.
 * 1 = trivial single-purpose call; 5 = highly complex multi-step reasoning.
 */
export interface ComplexityAnalysis {
  /** Expected range 1–5 (1 = trivial, 5 = highly complex). */
  score: number;
  /** Expected: "trivial" | "simple" | "moderate" | "complex" | "highly_complex". */
  label: string;
  reasons: string[];
  /**
   * When score >= 3, Claude-suggested decomposition: break the call into
   * simpler sub-calls where some can be handled by ScaleDown SLMs.
   */
  decomposition?: DecompositionStep[];
}

export interface DecompositionStep {
  step: number;
  purpose: string;
  /** "scaledown" = replace with an SLM; "llm" = still needs a frontier model */
  handler: "scaledown" | "llm";
  slm_type?: OpportunityType;
  notes: string;
}

export interface Finding {
  file_path: string;
  line_number?: number;
  provider: string;
  opportunities: Opportunity[];
  complexity: ComplexityAnalysis;
  code_snippet: string;
}

// ── Standardised report schema (version "1") ─────────────────────────────────

export interface ReportFinding {
  file: string;
  line: number | null;
  provider: string;
  complexity_score: number;
  complexity_label: string;
  opportunities: Array<{
    type: OpportunityType;
    confidence: "high" | "medium" | "low";
    estimated_savings: string;
    reason: string;
  }>;
  decomposition: DecompositionStep[] | null;
  snippet_preview: string;
}

export interface ArchitectureOverview {
  /** Plain-English summary of how and where AI is used in the system */
  description: string;
  /** Each distinct AI usage pattern found (e.g. "RAG pipeline", "ticket routing") */
  patterns: Array<{
    name: string;
    files: string[];
    provider: string;
    purpose: string;
  }>;
}

export interface MigrationReport {
  version: "1";
  generated_at: string;
  project_name: string;
  architecture?: ArchitectureOverview;
  summary: {
    files_scanned: number;
    files_with_ai_calls: number;
    total_opportunities: number;
    providers_detected: string[];
    complexity_breakdown: Record<string, number>;
  };
  findings: ReportFinding[];
  api: {
    base_url: string;
    auth: string;
    docs_url: string;
  };
}

// ── Report builder ────────────────────────────────────────────────────────────

export function buildReport(
  findings: Finding[],
  projectName: string = "your project",
  filesScanned: number = 0,
  architecture?: ArchitectureOverview
): MigrationReport {
  const complexityBreakdown: Record<string, number> = {};
  for (const f of findings) {
    const label = f.complexity?.label ?? "unknown";
    complexityBreakdown[label] = (complexityBreakdown[label] ?? 0) + 1;
  }

  return {
    version: "1",
    generated_at: new Date().toISOString(),
    project_name: projectName,
    ...(architecture ? { architecture } : {}),
    summary: {
      files_scanned: filesScanned,
      files_with_ai_calls: new Set(findings.map((f) => f.file_path)).size,
      total_opportunities: findings.reduce(
        (n, f) => n + f.opportunities.length,
        0
      ),
      providers_detected: [
        ...new Set(findings.map((f) => f.provider).filter(Boolean)),
      ],
      complexity_breakdown: complexityBreakdown,
    },
    findings: findings.map((f) => ({
      file: f.file_path,
      line: f.line_number ?? null,
      provider: f.provider,
      complexity_score: f.complexity?.score ?? 1,
      complexity_label: f.complexity?.label ?? "trivial",
      opportunities: f.opportunities.map((o) => ({
        type: o.type,
        confidence: o.confidence,
        estimated_savings: o.estimated_savings,
        reason: o.reason,
      })),
      decomposition: f.complexity?.decomposition ?? null,
      snippet_preview: f.code_snippet.split("\n").slice(0, 3).join("\n"),
    })),
    api: {
      base_url: "https://api.scaledown.xyz",
      auth: "x-api-key: $SCALEDOWN_API_KEY",
      docs_url: "https://docs.scaledown.ai/api-reference/",
    },
  };
}

// ── Migration plan markdown ───────────────────────────────────────────────────

const ORDER: OpportunityType[] = [
  "classification",
  "extraction",
  "summarization",
  "compression",
];
const TITLES: Record<OpportunityType, string> = {
  classification: "Replace Classification Calls with `sd_classify`",
  extraction: "Replace Extraction Calls with `sd_extract`",
  summarization: "Replace Summarization Calls with `sd_summarize`",
  compression: "Add Context Compression with `sd_compress`",
};
const SAVINGS: Record<OpportunityType, string> = {
  classification: "~95% per call",
  extraction: "~95% per call",
  summarization: "~90% per call",
  compression: "50–70% on context tokens",
};
const ACTIONS: Record<OpportunityType, string> = {
  classification:
    "Replace the frontier LLM call with a POST to `/classify`.",
  extraction:
    "Replace the frontier LLM call with a POST to `/extract`.",
  summarization:
    "Replace the frontier LLM call with a POST to `/summarization/abstractive`. **Note:** `sd_summarize` is currently in private preview — contact ScaleDown to enable.",
  compression:
    "Before the LLM call, POST the context to `/compress/raw/` and pass `compressed_prompt` from the response to the LLM.",
};

function slmName(type: OpportunityType): string {
  const map: Record<OpportunityType, string> = {
    compression: "sd_compress → POST /compress/raw/",
    classification: "sd_classify → POST /classify",
    extraction: "sd_extract → POST /extract",
    summarization: "sd_summarize → POST /summarization/abstractive",
  };
  return map[type];
}

export function generateMigrationPlanMarkdown(
  findings: Finding[],
  projectName: string = "your project",
  filesScanned: number = 0,
  architecture?: ArchitectureOverview
): string {
  const report = buildReport(findings, projectName, filesScanned, architecture);

  if (findings.length === 0) {
    return `# ScaleDown Migration Plan — ${projectName}\n\nNo AI API calls were found.\n\n---\n*Generated by ScaleDown Migration Agent at ${report.generated_at}*\n`;
  }

  // Group findings by opportunity type (deduplicated per finding)
  const byType: Record<string, Finding[]> = {};
  for (const f of findings) {
    for (const o of f.opportunities) {
      if (!byType[o.type]) byType[o.type] = [];
      if (!byType[o.type].includes(f)) byType[o.type].push(f);
    }
  }

  const { summary } = report;
  const complexRows = Object.entries(summary.complexity_breakdown)
    .map(([label, count]) => `| ${label} | ${count} |`)
    .join("\n");

  // Architecture overview section
  let architectureSection = "";
  if (architecture) {
    const patternRows = architecture.patterns
      .map(
        (p) =>
          `| ${p.name} | ${p.provider} | ${p.files.map((f) => `\`${f}\``).join(", ")} | ${p.purpose} |`
      )
      .join("\n");
    architectureSection = `## Current AI Architecture

${architecture.description}

| Usage Pattern | Provider | Files | Purpose |
|---|---|---|---|
${patternRows}

`;
  }

  let md = `# ScaleDown Migration Plan — ${projectName}

> Generated: ${report.generated_at}
> Report version: ${report.version}

${architectureSection}## Summary

| Metric | Value |
|---|---|
| Files scanned | ${summary.files_scanned} |
| Files with AI API calls | ${summary.files_with_ai_calls} |
| Total integration opportunities | ${summary.total_opportunities} |
| Providers detected | ${summary.providers_detected.join(", ")} |

### Call Complexity Breakdown

| Complexity | Count |
|---|---|
${complexRows}

`;

  let sectionNum = 1;
  for (const type of ORDER) {
    if (!byType[type]) continue;
    md += `## ${sectionNum++}. ${TITLES[type]}

**Estimated savings: ${SAVINGS[type]}**

| File | Line | Complexity | Confidence |
|---|---|---|---|
${byType[type]
  .map((f) => {
    const opp = f.opportunities.find((o) => o.type === type)!;
    return `| \`${f.file_path}\` | ${f.line_number ?? "?"} | ${f.complexity?.label ?? "?"} (${f.complexity?.score ?? "?"}/5) | ${opp.confidence} |`;
  })
  .join("\n")}

**Action:** ${ACTIONS[type]}

`;
  }

  // Complex call decompositions
  const complexFindings = findings.filter(
    (f) => (f.complexity?.score ?? 0) >= 3 && f.complexity?.decomposition?.length
  );
  if (complexFindings.length > 0) {
    md += `## ${sectionNum++}. Complex Call Decompositions

The following calls handle multiple tasks in a single LLM prompt.
Breaking them into focused sub-calls reduces cost and improves reliability.

`;
    for (const f of complexFindings) {
      md += `### \`${f.file_path}\`${f.line_number ? ` (line ${f.line_number})` : ""}

**Complexity:** ${f.complexity.label} (${f.complexity.score}/5)
**Reasons:** ${f.complexity.reasons.join("; ")}

| Step | Purpose | Handler | Notes |
|---|---|---|---|
${f.complexity
  .decomposition!.map(
    (d) =>
      `| ${d.step} | ${d.purpose} | ${
        d.handler === "scaledown"
          ? `ScaleDown \`${slmName(d.slm_type!)}\``
          : "Frontier LLM"
      } | ${d.notes} |`
  )
  .join("\n")}

`;
    }
  }

  md += `## ScaleDown HTTP API

All ScaleDown SLMs are called via REST. No SDK required.

**Base URL:** \`https://api.scaledown.xyz\`
**Auth:** \`x-api-key: $SCALEDOWN_API_KEY\`
**Docs:** https://docs.scaledown.ai/api-reference/

### sd_classify

\`\`\`http
POST /classify
Content-Type: application/json
x-api-key: $SCALEDOWN_API_KEY

{
  "text": "<input text>",
  "labels": [
    { "name": "billing",   "rubric": "Does this describe a billing issue?" },
    { "name": "technical", "rubric": "Does this describe a technical issue?" }
  ]
}
\`\`\`

Response: \`{ "top_label": "billing", "scores": { "billing": 0.91, "technical": 0.09 }, "labels": [...], "ocr_text": null }\`

### sd_extract

\`\`\`http
POST /extract
Content-Type: application/json
x-api-key: $SCALEDOWN_API_KEY

{
  "text": "<input text>",
  "entities": {
    "Name":  "Full name of a person",
    "Email": "Email address"
  }
}
\`\`\`

Response: \`{ "entities": [{ "text": "Alice", "type": "Name", "confidence": 0.98, "start": 0, "end": 5 }], "structured_result": { "Name": "Alice", "Email": "..." }, "ocr_text": null }\` — read clean per-field values from \`structured_result\`.

### sd_compress

\`\`\`http
POST /compress/raw/
Content-Type: application/json
x-api-key: $SCALEDOWN_API_KEY

{
  "context": "<retrieved documents or long background text>",
  "prompt":  "<user query or instruction>",
  "scaledown": { "rate": "auto" }
}
\`\`\`

Response: \`{ "compressed_prompt": "...", "successful": true, "original_prompt_tokens": 4200, "compressed_prompt_tokens": 1400 }\`

### sd_summarize *(private preview)*

\`\`\`http
POST /summarization/abstractive
Content-Type: application/json
x-api-key: $SCALEDOWN_API_KEY

{
  "text": "<document to summarize>",
  "instructions": "Be concise."
}
\`\`\`

Response: \`{ "summary": "...", "input_chars": 4200, "output_chars": 380, "latency_ms": 120, "ocr_text": null }\`

Response: \`{ "summary": "..." }\`

Get a free API key (50M tokens free) at: https://scaledown.ai/dashboard

---
*Generated by ScaleDown Migration Agent v${report.version} at ${report.generated_at}*
`;

  return md;
}
