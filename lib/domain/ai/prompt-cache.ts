/**
 * Provider prompt-cache policy (AI v3.2.2).
 *
 * AI SDK does not own a universal cache. It forwards provider-specific
 * controls and normalizes cache usage. This module keeps those controls
 * deterministic and gives the chat route one provider-neutral telemetry seam.
 */

import { createHash } from "node:crypto";

export type PromptCacheJSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: PromptCacheJSONValue }
  | PromptCacheJSONValue[];

export type AIProviderOptions = Record<
  string,
  Record<string, PromptCacheJSONValue>
>;

export const PROMPT_CACHE_POLICY_VERSION = "ai-v3.2.2-p1";

export interface PromptCachePolicyInput {
  /** Provider that actually executes the request, after routing/fallback. */
  providerId: string | null | undefined;
  /** Upstream model id. Namespaced gateway ids are accepted. */
  modelId: string;
  /** Ownership scope. Hashed before it becomes part of the provider key. */
  userId: string;
  /** Final attached tool names; order must not affect cache identity. */
  toolNames: readonly string[];
  /** Present only when an attached/rooted playbook was validated. */
  charterId?: string | null;
  /** Standing rules + active phase (or the rooted playbook body). */
  charterContext?: string;
}

export interface PromptCachePolicy {
  enabled: boolean;
  policyVersion: string;
  scope: "general" | "playbook";
  cacheKey?: string;
  providerOptions?: AIProviderOptions;
}

export interface PromptCacheUsageLike {
  inputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

export interface PromptCacheUsageSummary {
  inputTokens: number;
  noCacheTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Share of all input tokens served from cache, from 0 to 1. */
  hitRate: number;
}

function digest(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function upstreamModelId(modelId: string): string {
  return modelId.split("/").at(-1) ?? modelId;
}

/**
 * Conservative allow-list for OpenAI families that expose prompt caching.
 * In particular, legacy `gpt-4` must not receive `prompt_cache_key`.
 */
export function supportsOpenAIPromptCaching(modelId: string): boolean {
  const id = upstreamModelId(modelId);
  return (
    /^gpt-4o(?:$|-)/.test(id) ||
    /^chatgpt-4o(?:$|-)/.test(id) ||
    /^gpt-4\.1(?:$|-)/.test(id) ||
    /^gpt-5(?:$|[.-])/.test(id) ||
    /^o[134](?:$|-)/.test(id)
  );
}

/**
 * Build a privacy-safe, run-independent cache key.
 *
 * A playbook key intentionally excludes conversation/run ids. Its identity is
 * the user boundary + executed model + final toolset + rendered playbook
 * revision/phase, so separate runs of the same unchanged phase can converge on
 * the same provider cache while edits or phase changes naturally rotate it.
 */
export function buildPromptCachePolicy(
  input: PromptCachePolicyInput,
): PromptCachePolicy {
  const scope =
    input.charterId && input.charterContext ? "playbook" : "general";
  const base: PromptCachePolicy = {
    enabled: false,
    policyVersion: PROMPT_CACHE_POLICY_VERSION,
    scope,
  };

  if (
    input.providerId !== "openai" ||
    !supportsOpenAIPromptCaching(input.modelId)
  ) {
    return base;
  }

  const toolset = [...input.toolNames].sort().join("\n");
  const playbookFingerprint =
    scope === "playbook"
      ? digest(`${input.charterId}\0${input.charterContext}`, 24)
      : "general";
  const cacheIdentity = JSON.stringify({
    policy: PROMPT_CACHE_POLICY_VERSION,
    user: digest(input.userId),
    model: upstreamModelId(input.modelId),
    tools: digest(toolset, 24),
    playbook: playbookFingerprint,
  });
  // Keep the opaque provider key compact and free of user/content identifiers.
  const cacheKey = `dg-chat:${digest(cacheIdentity, 40)}`;

  return {
    ...base,
    enabled: true,
    cacheKey,
    providerOptions: {
      openai: {
        promptCacheKey: cacheKey,
      },
    },
  };
}

/** Merge independent provider features (reasoning, caching, etc.) safely. */
export function mergeAIProviderOptions(
  ...options: Array<AIProviderOptions | undefined>
): AIProviderOptions | undefined {
  const merged: AIProviderOptions = {};

  for (const option of options) {
    if (!option) continue;
    for (const [provider, values] of Object.entries(option)) {
      merged[provider] = {
        ...(merged[provider] ?? {}),
        ...values,
      };
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Normalize AI SDK cache usage for spans, logs, and later product analytics. */
export function summarizePromptCacheUsage(
  usage: PromptCacheUsageLike | null | undefined,
): PromptCacheUsageSummary {
  const inputTokens = Math.max(usage?.inputTokens ?? 0, 0);
  const cacheReadTokens = Math.max(
    usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    0,
  );
  const cacheWriteTokens = Math.max(
    usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
    0,
  );
  const reportedNoCache = usage?.inputTokenDetails?.noCacheTokens;
  const noCacheTokens = Math.max(
    reportedNoCache ??
      inputTokens - cacheReadTokens - cacheWriteTokens,
    0,
  );

  return {
    inputTokens,
    noCacheTokens,
    cacheReadTokens,
    cacheWriteTokens,
    hitRate: inputTokens > 0 ? cacheReadTokens / inputTokens : 0,
  };
}
