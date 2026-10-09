/**
 * P0 — provider-native web search resolution (AI v3 core S2).
 *
 * The abstract `search_web` capability maps to the ACTIVE provider's own
 * server-executed search tool: Anthropic web_search, OpenAI web search,
 * Google search grounding, xAI Live Search. Resolution happens at request
 * composition in the chat route (a routing-layer decision, deliberately
 * NOT model middleware — tool choice should be legible where model choice
 * lives). The vendor executes the search and returns cited results; our
 * runtime never sees the fetch, so policy is compiled into the native
 * tool's own parameters where expressible (maxUses budget below). If a
 * policy can't be expressed natively, don't attach the tool — fall back
 * to owned providers instead.
 *
 * Post-V3: Kimi/Moonshot builtin $web_search joins here.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";

import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";

/** Mirrors the acquisition per-turn page budget. */
const MAX_SEARCHES_PER_TURN = 5;

/**
 * Return type is intentionally inferred: each vendor's tool carries its own
 * concrete generics, and `ToolSet`'s indexed type demands an intersection
 * they don't structurally satisfy. The route assigns into its tools record
 * via a widening cast.
 */
export function resolveNativeWebSearchTool(providerId: string) {
  switch (providerId) {
    case "anthropic":
      return anthropic.tools.webSearch_20250305({
        maxUses: MAX_SEARCHES_PER_TURN,
      });
    case "openai":
      return openai.tools.webSearch();
    case "google":
      return google.tools.googleSearch({});
    case "xai":
      return xai.tools.webSearch();
    default:
      // mistral / groq / other gateway models: no native search tool —
      // the owned pipeline (P1+) remains available via read_page.
      return null;
  }
}

// ── Models that reject their vendor's hosted search ─────────────────────────

/**
 * Learned this process's lifetime: a model whose provider rejected the hosted
 * search tool is not offered it again. The catalog's `nativeWebSearch: false`
 * is the durable record; this catches models the catalog does not list
 * (hand-added ids, new releases) after their first rejection.
 */
const rejectedNativeSearch = new Set<string>();

const key = (vendorId: string, bareModelId: string) => `${vendorId}/${bareModelId}`;

/** May the vendor's hosted search tool be attached for this model? */
export function supportsNativeWebSearch(vendorId: string, bareModelId: string): boolean {
  if (rejectedNativeSearch.has(key(vendorId, bareModelId))) return false;
  const model = PROVIDER_CATALOG.find((p) => p.id === vendorId)?.models.find((m) => m.id === bareModelId);
  return model?.nativeWebSearch !== false;
}

/**
 * The provider's rejection, e.g. OpenAI's "Tool 'web_search_preview' is not
 * supported with gpt-4." Returns the model id it names, or null.
 */
export function nativeSearchRejectedModel(message: string): string | null {
  const match = /Tool '[a-z_]*search[a-z_]*' is not supported with ([\w.:\-]+?)\.?(?:\s|$)/i.exec(message);
  return match ? match[1] : null;
}

/** Remember a rejection so the next request for that model leaves the tool off. */
export function noteNativeSearchRejection(vendorId: string, message: string): string | null {
  const model = nativeSearchRejectedModel(message);
  if (model) rejectedNativeSearch.add(key(vendorId, model));
  return model;
}
