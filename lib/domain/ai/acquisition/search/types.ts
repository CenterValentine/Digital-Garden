/**
 * App-executed web search (AI v3.1) — provider-agnostic search so models
 * WITHOUT a native search tool (DeepSeek, Kimi, Mistral, Groq, local, …)
 * can still answer current-data questions. Runs server-side through a
 * swappable search backend and exposes results as the same `search_web`
 * tool the big-four get natively.
 *
 * Modular by design (owner directive 2026-07-21: "modularize this so the
 * user can change out this part"): each backend is one file implementing
 * `AppSearchProvider`; the registry selects the active one. Adding a
 * backend = drop a file + one registry line, no call-site changes.
 */

export interface AppSearchResult {
  title: string;
  url: string;
  /** Short excerpt / description from the search backend. */
  snippet: string;
  /** ISO date when known (backend-dependent). */
  publishedAt?: string;
}

export interface AppSearchProvider {
  /** Stable id, e.g. "tavily" — matches SearchConnection.provider. */
  id: string;
  /** Human label for settings/UI. */
  label: string;
  /** URL where the user gets an API key (for settings hints). */
  apiKeyDocsURL: string;
  /** Hint shown under the key field in settings. */
  apiKeyHint: string;
  /**
   * Run a search with the user's BYOK key (resolved from SearchConnection,
   * NOT env). Implementations must throw on transport/auth errors so the
   * tool surfaces them honestly — never return an empty array to mask a
   * failure.
   */
  search(
    query: string,
    opts: { apiKey: string; maxResults?: number; signal?: AbortSignal },
  ): Promise<AppSearchResult[]>;
}
