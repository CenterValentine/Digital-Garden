/**
 * Brave Search backend (AI v3.1) — independent search index (not a
 * Google/Bing reseller), privacy-forward. Second built-in backend, proves
 * the swap seam.
 *
 * Env: BRAVE_SEARCH_API_KEY
 */

import type { AppSearchProvider, AppSearchResult } from "./types";

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      page_age?: string;
    }>;
  };
}

export const braveProvider: AppSearchProvider = {
  id: "brave",
  label: "Brave Search",
  apiKeyDocsURL: "https://brave.com/search/api/",
  isConfigured: () => Boolean(process.env.BRAVE_SEARCH_API_KEY),
  async search(query, opts) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not set.");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(opts?.maxResults ?? 5));
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-subscription-token": apiKey,
      },
      signal: opts?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Brave search failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as BraveResponse;
    return (data.web?.results ?? [])
      .filter((r): r is { url: string } & typeof r => Boolean(r.url))
      .map<AppSearchResult>((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        snippet: (r.description ?? "").slice(0, 500),
        publishedAt: r.page_age,
      }));
  },
};
