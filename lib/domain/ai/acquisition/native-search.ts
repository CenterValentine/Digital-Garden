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
