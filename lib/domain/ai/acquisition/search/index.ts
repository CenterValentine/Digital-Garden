/**
 * App-executed web search (AI v3.1) — barrel.
 *
 * `appWebSearch()` runs a query through the active backend; the chat route
 * attaches the `search_web` tool (see createAppWebSearchTool) for models
 * whose provider has no native search, so every model can search.
 */

export type { AppSearchProvider, AppSearchResult } from "./types";
export {
  SEARCH_PROVIDERS,
  getActiveSearchProvider,
  isAppSearchConfigured,
} from "./registry";

import { getActiveSearchProvider } from "./registry";
import type { AppSearchResult } from "./types";

export interface AppWebSearchOutcome {
  provider: string;
  results: AppSearchResult[];
}

/**
 * Run a web search through the active backend. Throws when no backend is
 * configured (callers gate on `isAppSearchConfigured()` first) or when the
 * backend errors — never masks a failure as empty results.
 */
export async function appWebSearch(
  query: string,
  opts?: { maxResults?: number; signal?: AbortSignal },
): Promise<AppWebSearchOutcome> {
  const provider = getActiveSearchProvider();
  if (!provider) {
    throw new Error("No web-search backend is configured.");
  }
  const results = await provider.search(query, opts);
  return { provider: provider.id, results };
}
