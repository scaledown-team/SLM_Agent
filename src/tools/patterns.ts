export interface ProviderPattern {
  provider: string;
  language: "python" | "typescript" | "javascript" | "any";
  /** grep-compatible patterns to detect API usage */
  grep_patterns: string[];
  /** human-readable description of what these patterns detect */
  description: string;
  /** file extensions to search */
  extensions: string[];
}

export const AI_PROVIDER_PATTERNS: ProviderPattern[] = [
  // ── Python: OpenAI v1 ────────────────────────────────────────────────────
  {
    provider: "openai",
    language: "python",
    grep_patterns: [
      "chat\\.completions\\.create",
      "completions\\.create",
      "from openai import OpenAI",
      "import openai",
    ],
    description: "OpenAI Python SDK v1 (openai>=1.0)",
    extensions: [".py"],
  },
  // ── Python: OpenAI v0 (legacy) ───────────────────────────────────────────
  {
    provider: "openai_legacy",
    language: "python",
    grep_patterns: [
      "openai\\.ChatCompletion\\.create",
      "openai\\.Completion\\.create",
      "openai\\.Embedding\\.create",
    ],
    description: "OpenAI Python SDK v0 (openai<1.0, legacy)",
    extensions: [".py"],
  },
  // ── Python: Anthropic ────────────────────────────────────────────────────
  {
    provider: "anthropic",
    language: "python",
    grep_patterns: [
      "messages\\.create",
      "from anthropic import Anthropic",
      "import anthropic",
      "anthropic\\.Anthropic()",
    ],
    description: "Anthropic Python SDK",
    extensions: [".py"],
  },
  // ── Python: LangChain ────────────────────────────────────────────────────
  {
    provider: "langchain",
    language: "python",
    grep_patterns: [
      "from langchain",
      "ChatOpenAI",
      "ChatAnthropic",
      "LLMChain",
      "RetrievalQA",
      "VectorstoreIndexCreator",
      "load_qa_chain",
      "ConversationalRetrievalChain",
    ],
    description: "LangChain (Python)",
    extensions: [".py"],
  },
  // ── Python: LlamaIndex ───────────────────────────────────────────────────
  {
    provider: "llamaindex",
    language: "python",
    grep_patterns: [
      "from llama_index",
      "VectorStoreIndex",
      "ServiceContext",
      "QueryEngine",
      "llama_index\\.llms",
    ],
    description: "LlamaIndex (Python)",
    extensions: [".py"],
  },
  // ── Python: Cohere ───────────────────────────────────────────────────────
  {
    provider: "cohere",
    language: "python",
    grep_patterns: [
      "import cohere",
      "co\\.chat",
      "co\\.generate",
      "co\\.classify",
      "co\\.summarize",
      "cohere\\.Client",
    ],
    description: "Cohere Python SDK",
    extensions: [".py"],
  },
  // ── Python: Google Generative AI ────────────────────────────────────────
  {
    provider: "google_genai",
    language: "python",
    grep_patterns: [
      "import google\\.generativeai",
      "genai\\.GenerativeModel",
      "model\\.generate_content",
      "genai\\.configure",
    ],
    description: "Google Generative AI Python SDK",
    extensions: [".py"],
  },
  // ── TypeScript/JS: OpenAI ────────────────────────────────────────────────
  {
    provider: "openai",
    language: "typescript",
    grep_patterns: [
      "chat\\.completions\\.create",
      "completions\\.create",
      "from ['\"]openai['\"]",
      "require\\(['\"]openai['\"]\\)",
    ],
    description: "OpenAI Node.js SDK",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
  },
  // ── TypeScript/JS: Anthropic ─────────────────────────────────────────────
  {
    provider: "anthropic",
    language: "typescript",
    grep_patterns: [
      "messages\\.create",
      "from ['\"]@anthropic-ai/sdk['\"]",
      "require\\(['\"]@anthropic-ai/sdk['\"]\\)",
    ],
    description: "Anthropic Node.js SDK",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
  },
  // ── TypeScript/JS: LangChain ─────────────────────────────────────────────
  {
    provider: "langchain",
    language: "typescript",
    grep_patterns: [
      "from ['\"]@langchain",
      "ChatOpenAI",
      "ChatAnthropic",
      "LLMChain",
      "RetrievalQAChain",
    ],
    description: "LangChain.js",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
  },
  // ── TypeScript/JS: Vercel AI SDK ─────────────────────────────────────────
  {
    provider: "vercel_ai",
    language: "typescript",
    grep_patterns: [
      "from ['\"]ai['\"]",
      "from ['\"]@ai-sdk",
      "generateText",
      "streamText",
      "generateObject",
    ],
    description: "Vercel AI SDK",
    extensions: [".ts", ".tsx", ".js", ".mjs"],
  },
];

/** Returns all patterns as a flat list, optionally filtered by language */
export function getDetectionPatterns(
  language?: "python" | "typescript" | "javascript"
): ProviderPattern[] {
  if (!language) return AI_PROVIDER_PATTERNS;
  const lang = language === "javascript" ? "typescript" : language;
  return AI_PROVIDER_PATTERNS.filter(
    (p) => p.language === lang || p.language === "any"
  );
}

/** Returns the unique file extensions to scan for a given language */
export function getExtensionsForLanguage(
  language: "python" | "typescript" | "javascript" | "all"
): string[] {
  if (language === "python") return [".py"];
  if (language === "typescript" || language === "javascript")
    return [".ts", ".tsx", ".js", ".mjs"];
  return [".py", ".ts", ".tsx", ".js", ".mjs"];
}
