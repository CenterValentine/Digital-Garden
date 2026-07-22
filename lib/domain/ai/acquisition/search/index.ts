/**
 * App-executed web search (AI v3.1) — barrel.
 *
 * `appWebSearch()` runs a query through a specific backend with the user's
 * BYOK key (resolved from a SearchConnection). The chat route attaches the
 * `search_web` tool for models whose provider has no native search.
 */

export type { AppSearchProvider, AppSearchResult } from "./types";
export {
  SEARCH_PROVIDER_IMPLS,
  getSearchProviderImpl,
} from "./registry";

import { getSearchProviderImpl } from "./registry";
import type { AppSearchResult } from "./types";

export interface AppWebSearchOutcome {
  provider: string;
  results: AppSearchResult[];
}

/**
 * Run a web search through a named backend with a resolved BYOK key.
 * Throws on unknown backend or backend error — never masks a failure.
 */
export async function appWebSearch(
  query: string,
  opts: {
    providerId: string;
    apiKey: string;
    maxResults?: number;
    signal?: AbortSignal;
  },
): Promise<AppWebSearchOutcome> {
  const impl = getSearchProviderImpl(opts.providerId);
  if (!impl) {
    throw new Error(`Unknown search backend "${opts.providerId}".`);
  }
  const results = await impl.search(query, {
    apiKey: opts.apiKey,
    maxResults: opts.maxResults,
    signal: opts.signal,
  });
  return { provider: impl.id, results };
}
