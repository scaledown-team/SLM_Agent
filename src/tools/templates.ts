export type OpportunityType =
  | "compression"
  | "classification"
  | "extraction"
  | "summarization";

export interface IntegrationTemplate {
  opportunity_type: OpportunityType;
  provider: string;
  language: "python" | "typescript";
  description: string;
  /** pip/npm package to add */
  dependency: string;
  /** environment variable required */
  env_var: string;
  setup_snippet: string;
  before_snippet: string;
  after_snippet: string;
  notes: string[];
}

const TEMPLATES: IntegrationTemplate[] = [
  // ── Python: Compression before OpenAI call ───────────────────────────────
  {
    opportunity_type: "compression",
    provider: "openai",
    language: "python",
    description:
      "Compress large context (RAG results, documents) before sending to OpenAI to reduce token cost by 50-70%",
    dependency: "scaledown",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import os
from scaledown import Client as ScaledownClient

sd = ScaledownClient(api_key=os.environ["SCALEDOWN_API_KEY"])`,
    before_snippet: `response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": context + "\\n\\n" + user_query},
    ],
)`,
    after_snippet: `# Compress the context before the LLM call
compressed = sd.compress(context=context, prompt=user_query)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": compressed.compressed_prompt},
    ],
)
# compressed.compressed_prompt_tokens / compressed.original_prompt_tokens ≈ 0.30-0.50`,
    notes: [
      "The 'context' variable should hold the large background text (e.g. retrieved docs).",
      "The 'prompt' should be the user's query or instruction.",
      "Use rate='auto' (default) to let ScaleDown pick the optimal compression level.",
      "Check compressed.successful before using compressed.compressed_prompt.",
    ],
  },
  // ── Python: Compression before Anthropic call ────────────────────────────
  {
    opportunity_type: "compression",
    provider: "anthropic",
    language: "python",
    description:
      "Compress large context before sending to Anthropic Claude to reduce token cost by 50-70%",
    dependency: "scaledown",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import os
from scaledown import Client as ScaledownClient

sd = ScaledownClient(api_key=os.environ["SCALEDOWN_API_KEY"])`,
    before_snippet: `message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": context + "\\n\\n" + user_query}
    ],
)`,
    after_snippet: `compressed = sd.compress(context=context, prompt=user_query)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": compressed.compressed_prompt}
    ],
)`,
    notes: [
      "Works with any Anthropic model — Claude 3, Claude 3.5, Claude 4.",
      "Pair with Anthropic prompt caching for maximum savings.",
    ],
  },
  // ── Python: Replace OpenAI classification with sd_classify ───────────────
  {
    opportunity_type: "classification",
    provider: "openai",
    language: "python",
    description:
      "Replace an OpenAI call used for text classification with sd_classify — 95% cheaper",
    dependency: "scaledown",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import os
from scaledown import Client as ScaledownClient

sd = ScaledownClient(api_key=os.environ["SCALEDOWN_API_KEY"])`,
    before_snippet: `response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": "Classify the following text as one of: billing, technical, general. Reply with just the label.",
        },
        {"role": "user", "content": text},
    ],
)
label = response.choices[0].message.content.strip()`,
    after_snippet: `result = sd.classify(
    text=text,
    labels=[
        {"name": "billing",   "rubric": "Does this text describe a billing or payment issue?"},
        {"name": "technical", "rubric": "Does this text describe a technical or product issue?"},
        {"name": "general",   "rubric": "Is this a general inquiry not related to billing or technical issues?"},
    ],
)
label = result.top_label  # or result.scores for full probability distribution`,
    notes: [
      "Rubrics are yes/no questions — ScaleDown's SLM answers each and normalises scores.",
      "result.scores returns {label: probability} for all labels.",
      "Typical latency: ~50-200ms. Much faster than a GPT-4o call.",
      "Add threshold parameter to filter low-confidence classifications.",
    ],
  },
  // ── Python: Replace OpenAI entity extraction with sd_extract ─────────────
  {
    opportunity_type: "extraction",
    provider: "openai",
    language: "python",
    description:
      "Replace an OpenAI call used for named entity extraction with sd_extract — 95% cheaper",
    dependency: "scaledown",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import os
from scaledown import Client as ScaledownClient

sd = ScaledownClient(api_key=os.environ["SCALEDOWN_API_KEY"])`,
    before_snippet: `response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": 'Extract all person names and email addresses from the text. Return as JSON: {"names": [...], "emails": [...]}',
        },
        {"role": "user", "content": text},
    ],
)
import json
data = json.loads(response.choices[0].message.content)`,
    after_snippet: `result = sd.extract(
    text=text,
    entities={
        "Name":  "Full name of a person",
        "Email": "Email address",
    },
)
# result is a list of {"text", "type", "confidence", "start", "end", "context"}
names  = [e["text"] for e in result if e["type"] == "Name"]
emails = [e["text"] for e in result if e["type"] == "Email"]`,
    notes: [
      "You can pass any entity types — they're defined by natural language descriptions.",
      "Use threshold (0.0-1.0) to control confidence cutoff.",
      "Use top_n to limit results per entity type.",
    ],
  },
  // ── Python: Replace OpenAI summarization with sd_summarize ───────────────
  {
    opportunity_type: "summarization",
    provider: "openai",
    language: "python",
    description:
      "Replace an OpenAI call used for summarization with sd_summarize — 90% cheaper",
    dependency: "scaledown",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import os
from scaledown import Client as ScaledownClient

sd = ScaledownClient(api_key=os.environ["SCALEDOWN_API_KEY"])`,
    before_snippet: `response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "Summarize the following document concisely."},
        {"role": "user", "content": long_text},
    ],
)
summary = response.choices[0].message.content`,
    after_snippet: `result = sd.summarize(
    text=long_text,
    instructions="Be concise.",  # optional style instruction
)
summary = result.summary`,
    notes: [
      "sd_summarize is abstractive (rewrites, not just extracts sentences).",
      "Currently in private preview — contact ScaleDown to enable.",
      "Use max_tokens to limit output length.",
    ],
  },
  // ── TypeScript: Compression before OpenAI call ───────────────────────────
  {
    opportunity_type: "compression",
    provider: "openai",
    language: "typescript",
    description:
      "Compress large context before sending to OpenAI to reduce token cost by 50-70%",
    dependency: "@scaledown/sdk",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import ScaledownClient from "@scaledown/sdk";

const sd = new ScaledownClient({ apiKey: process.env.SCALEDOWN_API_KEY! });`,
    before_snippet: `const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user",   content: context + "\\n\\n" + userQuery },
  ],
});`,
    after_snippet: `const compressed = await sd.compress({
  context: context,
  prompt: userQuery,
});

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user",   content: compressed.compressed_prompt },
  ],
});`,
    notes: [
      "Await sd.compress — it returns a promise.",
      "Check compressed.successful before using the result.",
      "Use rate: 'auto' (default) or a float between 0.0 and 1.0.",
    ],
  },
  // ── TypeScript: Replace OpenAI classification with sd_classify ───────────
  {
    opportunity_type: "classification",
    provider: "openai",
    language: "typescript",
    description:
      "Replace an OpenAI call used for text classification with sd_classify — 95% cheaper",
    dependency: "@scaledown/sdk",
    env_var: "SCALEDOWN_API_KEY",
    setup_snippet: `import ScaledownClient from "@scaledown/sdk";

const sd = new ScaledownClient({ apiKey: process.env.SCALEDOWN_API_KEY! });`,
    before_snippet: `const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "Classify as: billing, technical, or general. Reply with just the label." },
    { role: "user",   content: text },
  ],
});
const label = response.choices[0].message.content?.trim();`,
    after_snippet: `const result = await sd.classify({
  text,
  labels: [
    { name: "billing",   rubric: "Does this text describe a billing or payment issue?" },
    { name: "technical", rubric: "Does this text describe a technical or product issue?" },
    { name: "general",   rubric: "Is this a general inquiry?" },
  ],
});
const label = result.top_label;`,
    notes: [
      "result.scores gives the full probability distribution over labels.",
      "Much lower latency than a frontier LLM call (~50-200ms).",
    ],
  },
];

/** Returns all templates, optionally filtered */
export function getTemplates(filters?: {
  opportunity_type?: OpportunityType;
  provider?: string;
  language?: "python" | "typescript";
}): IntegrationTemplate[] {
  let results = TEMPLATES;
  if (filters?.opportunity_type)
    results = results.filter(
      (t) => t.opportunity_type === filters.opportunity_type
    );
  if (filters?.provider)
    results = results.filter((t) => t.provider === filters.provider);
  if (filters?.language)
    results = results.filter((t) => t.language === filters.language);
  return results;
}

/** Returns a single best-match template */
export function getBestTemplate(
  opportunity_type: OpportunityType,
  provider: string,
  language: "python" | "typescript"
): IntegrationTemplate | undefined {
  return (
    TEMPLATES.find(
      (t) =>
        t.opportunity_type === opportunity_type &&
        t.provider === provider &&
        t.language === language
    ) ??
    // Fallback: match opportunity + language, any provider
    TEMPLATES.find(
      (t) =>
        t.opportunity_type === opportunity_type && t.language === language
    )
  );
}
