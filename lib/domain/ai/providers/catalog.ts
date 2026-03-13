/**
 * AI Provider Catalog
 *
 * Static metadata for provider/model selection in the settings UI.
 * This is display-only data — actual model resolution happens in registry.ts.
 */

import type { ProviderMeta } from "./types";

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    requiresApiKey: true,
    models: [
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        contextWindow: 200_000,
        maxOutput: 64_000,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "medium",
      },
      {
        id: "claude-sonnet-3-5",
        name: "Claude 3.5 Sonnet",
        contextWindow: 200_000,
        maxOutput: 8_192,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "medium",
      },
      {
        id: "claude-opus-4",
        name: "Claude Opus 4",
        contextWindow: 200_000,
        maxOutput: 32_000,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "high",
      },
      {
        id: "claude-haiku-3-5",
        name: "Claude 3.5 Haiku",
        contextWindow: 200_000,
        maxOutput: 8_192,
        capabilities: ["text", "tools", "streaming"],
        costTier: "low",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        contextWindow: 128_000,
        maxOutput: 16_384,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "medium",
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        contextWindow: 128_000,
        maxOutput: 16_384,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "low",
      },
      {
        id: "gpt-4",
        name: "GPT-4",
        contextWindow: 8_192,
        maxOutput: 8_192,
        capabilities: ["text", "tools", "streaming"],
        costTier: "high",
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    requiresApiKey: true,
    models: [
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        maxOutput: 65_536,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "high",
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        contextWindow: 1_000_000,
        maxOutput: 8_192,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "low",
      },
    ],
  },
  {
    id: "xai",
    name: "xAI",
    requiresApiKey: true,
    models: [
      {
        id: "grok-3",
        name: "Grok 3",
        contextWindow: 131_072,
        maxOutput: 16_384,
        capabilities: ["text", "tools", "streaming"],
        costTier: "high",
      },
      {
        id: "grok-3-mini",
        name: "Grok 3 Mini",
        contextWindow: 131_072,
        maxOutput: 16_384,
        capabilities: ["text", "tools", "streaming"],
        costTier: "medium",
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    requiresApiKey: true,
    models: [
      {
        id: "mistral-large",
        name: "Mistral Large",
        contextWindow: 128_000,
        maxOutput: 8_192,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "medium",
      },
      {
        id: "codestral",
        name: "Codestral",
        contextWindow: 32_000,
        maxOutput: 8_192,
        capabilities: ["text", "tools", "streaming"],
        costTier: "medium",
      },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    requiresApiKey: true,
    models: [
      {
        id: "mixtral-8x7b",
        name: "Mixtral 8x7B",
        contextWindow: 32_768,
        maxOutput: 4_096,
        capabilities: ["text", "tools", "streaming"],
        costTier: "low",
      },
      {
        id: "llama-3.3-70b",
        name: "Llama 3.3 70B",
        contextWindow: 128_000,
        maxOutput: 8_192,
        capabilities: ["text", "tools", "streaming"],
        costTier: "low",
      },
    ],
  },
];

/** Look up a provider by ID */
export function getProviderMeta(
  providerId: string
): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === providerId);
}

/** Look up a model across all providers */
export function getModelMeta(modelId: string) {
  for (const provider of PROVIDER_CATALOG) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return undefined;
}
