/**
 * Tavily search backend (AI v3.1) — AI-agent-optimized search; returns
 * LLM-ready results with minimal post-processing. Default backend.
 *
 * Env: TAVILY_API_KEY
 */

import type { AppSearchProvider, AppSearchResult } from "./types";

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
  }>;
}

export const tavilyProvider: AppSearchProvider = {
  id: "tavily",
  label: "Tavily",
  apiKeyDocsURL: "https://app.tavily.com/home",
  isConfigured: () => Boolean(process.env.TAVILY_API_KEY),
  async search(query, opts) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set.");
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: opts?.maxResults ?? 5,
        search_depth: "basic",
      }),
      signal: opts?.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Tavily search failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as TavilyResponse;
    return (data.results ?? [])
      .filter((r): r is { url: string } & typeof r => Boolean(r.url))
      .map<AppSearchResult>((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        snippet: (r.content ?? "").slice(0, 500),
        publishedAt: r.published_date,
      }));
  },
};
