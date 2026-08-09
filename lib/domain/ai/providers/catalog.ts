/**
 * AI Provider Catalog
 *
 * Static per-model metadata. Originally display-only for the settings UI;
 * since the per-model output-ceiling fix the chat route CONSUMES this at
 * call time — `maxOutput` becomes the default output ceiling and `reasoning`
 * gates provider thinking config. A model missing here silently falls back
 * to its provider's own default output cap (the 2026-08-08 DeepSeek incident
 * class). `pnpm ai:drift:check` enforces coverage against the connection
 * templates. Actual model resolution still happens in registry.ts.
 *
 * Where a vendor's direct-API id differs from our legacy canonical id
 * (mistral, groq), BOTH are listed: the BYOK path resolves the direct id,
 * the legacy MODEL_MAP path resolves the canonical one.
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
        // Extended thinking is opt-in per call; chat route reads this
        // and passes providerOptions.anthropic.thinking with the budget.
        reasoning: "enabled",
        thinkingBudgetTokens: 5_000,
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
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5",
        contextWindow: 200_000,
        maxOutput: 64_000,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "low",
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
      {
        // OpenAI o-series reasoning model — auto-emits reasoning parts
        // through the AI Gateway without any provider-options config.
        // Cheapest reasoning option in the family. No vision support.
        id: "o3-mini",
        name: "o3-mini",
        contextWindow: 200_000,
        maxOutput: 100_000,
        capabilities: ["text", "tools", "streaming"],
        costTier: "medium",
        reasoning: "auto",
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
        // Gemini 2.5 Pro thinks by default; surfacing thoughts to the
        // client requires providerOptions.google.thinkingConfig.includeThoughts.
        reasoning: "enabled",
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
      // Direct-API ids (what the Mistral template/connection actually sends);
      // the suffix-less ids above are the legacy canonical ids MODEL_MAP maps.
      {
        id: "mistral-large-latest",
        name: "Mistral Large",
        contextWindow: 128_000,
        maxOutput: 8_192,
        capabilities: ["text", "vision", "tools", "streaming"],
        costTier: "medium",
      },
      {
        id: "codestral-latest",
        name: "Codestral",
        contextWindow: 32_000,
        maxOutput: 8_192,
        capabilities: ["text", "tools", "streaming"],
        costTier: "medium",
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    requiresApiKey: true,
    models: [
      {
        // Hybrid-thinking model: emits reasoning unprompted ("auto"), and
        // accepts control knobs (thinking.type / reasoningEffort) that the
        // chat route synthesizes in buildProviderOptions. maxOutput is our
        // send-value budget, not the model ceiling (DeepSeek documents a far
        // higher output cap) — 64k leaves prompt headroom in the 128k window
        // the direct API serves (templates.ts pins the same figure).
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        contextWindow: 128_000,
        maxOutput: 65_536,
        capabilities: ["text", "tools", "streaming"],
        costTier: "medium",
        reasoning: "auto",
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        contextWindow: 128_000,
        maxOutput: 65_536,
        capabilities: ["text", "tools", "streaming"],
        costTier: "low",
        reasoning: "auto",
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
      // Direct-API ids (what the Groq template/connection actually sends);
      // the short ids above are the legacy canonical ids MODEL_MAP maps.
      {
        id: "mixtral-8x7b-32768",
        name: "Mixtral 8x7B",
        contextWindow: 32_768,
        maxOutput: 4_096,
        capabilities: ["text", "tools", "streaming"],
        costTier: "low",
      },
      {
        id: "llama-3.3-70b-versatile",
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
