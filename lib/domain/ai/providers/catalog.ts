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
