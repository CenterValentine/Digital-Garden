/**
 * AI Provider Registry
 *
 * Resolves DG model IDs to AI SDK LanguageModel instances.
 * Uses dynamic imports to lazy-load only the provider being used.
 *
 * Pattern adapted from conductor-one, but with dynamic imports
 * instead of static imports for better performance.
 */

import "server-only";
import type { LanguageModel } from "ai";
import type { ProviderConfig } from "../types";

/**
 * Maps DG's canonical model IDs to provider-specific model strings.
 * The provider field determines which @ai-sdk/* package to load.
 */
const MODEL_MAP: Record<string, { provider: string; modelString: string }> = {
  // Anthropic models
  "claude-opus-4": { provider: "anthropic", modelString: "claude-opus-4-5-20250414" },
  "claude-sonnet-4": { provider: "anthropic", modelString: "claude-sonnet-4-20250514" },
  "claude-sonnet-3-5": { provider: "anthropic", modelString: "claude-3-5-sonnet-20241022" },
  "claude-haiku-3-5": { provider: "anthropic", modelString: "claude-3-5-haiku-20241022" },
  // OpenAI models
  "gpt-4o": { provider: "openai", modelString: "gpt-4o" },
  "gpt-4o-mini": { provider: "openai", modelString: "gpt-4o-mini" },
  "gpt-4": { provider: "openai", modelString: "gpt-4" },
};

/**
 * Resolves a provider config to an AI SDK LanguageModel instance.
 *
 * Uses dynamic import() so only the requested provider's package is loaded.
 * Node.js caches modules after first import, so subsequent calls are fast.
 *
 * @example
 * const model = await resolveChatModel({
 *   providerId: "anthropic",
 *   modelId: "claude-sonnet-4",
 *   apiKey: "sk-ant-..." // optional BYOK key
 * });
 */
export async function resolveChatModel(
  config: ProviderConfig
): Promise<LanguageModel> {
  const mapping = MODEL_MAP[config.modelId];
  if (!mapping) {
    throw new Error(`Unknown model: ${config.modelId}`);
  }

  switch (mapping.provider) {
    case "anthropic": {
      const { anthropic, createAnthropic } = await import("@ai-sdk/anthropic");
      const provider = config.apiKey
        ? createAnthropic({ apiKey: config.apiKey })
        : anthropic;
      return provider(mapping.modelString);
    }

    case "openai": {
      const { openai, createOpenAI } = await import("@ai-sdk/openai");
      const provider = config.apiKey
        ? createOpenAI({ apiKey: config.apiKey })
        : openai;
      return provider(mapping.modelString);
    }

    default:
      throw new Error(`Unknown provider: ${mapping.provider}`);
  }
}
