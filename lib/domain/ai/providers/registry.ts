/**
 * AI Provider Registry
 *
 * Resolves a `Connection` (Session 3.5+) or a legacy provider/model
 * pair (pre-3.5) to an AI SDK `LanguageModel` instance.
 *
 * Two resolver functions:
 *   - resolveChatModelFromConnection() — the new path; routes by
 *     `adapterKind` + decrypted key from the user's connection
 *   - resolveChatModel() — the legacy path; kept for backward compat
 *     while the chat route + settings UI transition. Will be removed
 *     in a cleanup pass once everything is on connections.
 *
 * Uses dynamic import() so only the requested SDK is loaded.
 */

import "server-only";
import type { LanguageModel } from "ai";
import type { ProviderConfig } from "../types";
import type {
  AdapterKind,
  ConnectionWithKey,
} from "@/lib/features/ai-connections/types";
import { isGatewayEnabled, resolveChatModelViaGateway } from "./gateway";

/**
 * Thrown when a chat request reaches the resolver with no usable
 * connection / API key. The chat route catches this and returns a 402
 * with `code: "BYOK_REQUIRED"` so the client can surface a "set up
 * your API key" CTA.
 */
export class BYOKRequiredError extends Error {
  readonly providerId: string;
  constructor(providerId: string) {
    super(
      `BYOK required: add an API key for ${providerId} in Settings → AI.`,
    );
    this.name = "BYOKRequiredError";
    this.providerId = providerId;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// New path — connection-driven
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a Connection + model id to an AI SDK LanguageModel.
 *
 * The `adapterKind` drives which SDK package is used; `modelId` is
 * sent to the upstream as-is (connections store upstream IDs directly,
 * no DG-canonical mapping needed).
 *
 * For `openai-compat` (Fireworks/Together/OpenRouter/customs), the
 * connection's `baseURL` is required; we use `createOpenAI` with the
 * custom endpoint to talk to the gateway/endpoint.
 */
export async function resolveChatModelFromConnection(
  connection: ConnectionWithKey,
  modelId: string,
): Promise<LanguageModel> {
  if (!connection.apiKey) {
    throw new BYOKRequiredError(connection.presetId ?? "custom");
  }

  const adapter = connection.adapterKind as AdapterKind;
  switch (adapter) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: connection.apiKey })(modelId);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: connection.apiKey })(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: connection.apiKey })(modelId);
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey: connection.apiKey })(modelId);
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey: connection.apiKey })(modelId);
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey: connection.apiKey })(modelId);
    }
    case "vercel-gateway": {
      // Vercel AI Gateway BYOK: user supplies their own Gateway key.
      const { createGateway } = await import("@ai-sdk/gateway");
      return createGateway({ apiKey: connection.apiKey })(modelId);
    }
    case "openai-compat": {
      // Generic OpenAI-compatible endpoint — Fireworks, Together,
      // OpenRouter, Ollama, etc. baseURL is required.
      if (!connection.baseURL) {
        throw new Error(
          `Connection ${connection.id} uses openai-compat but has no baseURL configured.`,
        );
      }
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({
        apiKey: connection.apiKey,
        baseURL: connection.baseURL,
      })(modelId);
    }
    default:
      throw new Error(`Unknown adapter kind: ${adapter}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy path — kept for transition. Used by code that still receives
// {providerId, modelId, apiKey?} and doesn't yet have a connection id.
// Will be removed once the chat route is fully migrated to connections.
// ────────────────────────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, { provider: string; modelString: string }> = {
  "claude-opus-4": { provider: "anthropic", modelString: "claude-opus-4-5-20250414" },
  "claude-sonnet-4": { provider: "anthropic", modelString: "claude-sonnet-4-20250514" },
  "claude-sonnet-3-5": { provider: "anthropic", modelString: "claude-3-5-sonnet-20241022" },
  "claude-haiku-3-5": { provider: "anthropic", modelString: "claude-3-5-haiku-20241022" },
  "gpt-4o": { provider: "openai", modelString: "gpt-4o" },
  "gpt-4o-mini": { provider: "openai", modelString: "gpt-4o-mini" },
  "gpt-4": { provider: "openai", modelString: "gpt-4" },
  "o3-mini": { provider: "openai", modelString: "o3-mini" },
  "gemini-2.5-pro": { provider: "google", modelString: "gemini-2.5-pro" },
  "gemini-2.0-flash": { provider: "google", modelString: "gemini-2.0-flash" },
  "grok-3": { provider: "xai", modelString: "grok-3" },
  "grok-3-mini": { provider: "xai", modelString: "grok-3-mini" },
  "mistral-large": { provider: "mistral", modelString: "mistral-large-latest" },
  "codestral": { provider: "mistral", modelString: "codestral-latest" },
  "mixtral-8x7b": { provider: "groq", modelString: "mixtral-8x7b-32768" },
  "llama-3.3-70b": { provider: "groq", modelString: "llama-3.3-70b-versatile" },
};

/** @deprecated Prefer `resolveChatModelFromConnection`. */
export async function resolveChatModel(
  config: ProviderConfig,
): Promise<LanguageModel> {
  const mapping = MODEL_MAP[config.modelId];
  if (!mapping) {
    throw new Error(`Unknown model: ${config.modelId}`);
  }

  if (!config.apiKey) {
    if (isGatewayEnabled()) {
      return resolveChatModelViaGateway(mapping.provider, mapping.modelString);
    }
    throw new BYOKRequiredError(config.providerId);
  }

  switch (mapping.provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: config.apiKey })(mapping.modelString);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: config.apiKey })(mapping.modelString);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(mapping.modelString);
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey: config.apiKey })(mapping.modelString);
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey: config.apiKey })(mapping.modelString);
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      return createGroq({ apiKey: config.apiKey })(mapping.modelString);
    }
    default:
      throw new Error(`Unknown provider: ${mapping.provider}`);
  }
}
