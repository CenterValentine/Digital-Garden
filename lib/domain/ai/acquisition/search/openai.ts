/**
 * OpenAI search backend (owner-requested, 2026-09-30) — delegates a query to
 * OpenAI's dedicated search model and hands back its cited answer.
 *
 * Why a model and not a result list: the chat model's own search puts the
 * raw retrieved pages into ITS context, billed at its input rate and re-read
 * on every later step. The search model reads them at its own lower rate
 * ($1.25 / 1M input vs gpt-6-sol's $2–2.50) and returns a short answer with
 * URL citations, so only the answer enters the chat's context
 * (ITERATION-RUN-HARNESS-FIXES §10 round 4).
 *
 * `gpt-5-search-api` is a Chat Completions search model: it takes
 * `web_search_options` rather than the Responses `web_search` tool, returns
 * `message.annotations` of type `url_citation`, and rejects sampling
 * parameters. The key is the user's own — pasted, or reused from their
 * OpenAI AI connection (resolved at call time; see resolve.ts).
 */

import type { AppSearchProvider, AppSearchResult } from "./types";

/** The search model this backend calls — shown in settings. */
export const OPENAI_SEARCH_MODEL = "gpt-5-search-api";

/** Per 1M tokens (developers.openai.com/api/docs/pricing, 2026-09-30). */
const PRICE_PER_1M = { input: 1.25, output: 10 } as const;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string; start_index?: number; end_index?: number };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * The cited answer as results: one entry per distinct URL, its snippet the
 * sentence the citation supports. Pure; exported for the gate.
 */
export function citationsToResults(
  content: string,
  annotations: NonNullable<NonNullable<ChatCompletionResponse["choices"]>[number]["message"]>["annotations"],
  maxResults: number,
): AppSearchResult[] {
  const byUrl = new Map<string, AppSearchResult>();
  for (const a of annotations ?? []) {
    const c = a.type === "url_citation" ? a.url_citation : undefined;
    if (!c?.url || byUrl.has(c.url)) continue;
    const end = Math.min(content.length, c.end_index ?? content.length);
    // The supporting sentence: back from the citation to the previous
    // sentence break, bounded so a citation-less answer stays short.
    let start = Math.max(0, c.start_index ?? end);
    const before = content.slice(Math.max(0, start - 400), start);
    const lastBreak = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"));
    start = lastBreak >= 0 ? start - before.length + lastBreak + 1 : Math.max(0, start - 400);
    const snippet = content
      .slice(start, end)
      .replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    byUrl.set(c.url, { title: c.title || c.url, url: c.url, snippet: snippet.slice(0, 500) });
    if (byUrl.size >= maxResults) break;
  }
  return [...byUrl.values()];
}

export const openaiSearchProvider: AppSearchProvider = {
  id: "openai",
  label: "OpenAI",
  model: OPENAI_SEARCH_MODEL,
  apiKeyDocsURL: "https://platform.openai.com/api-keys",
  apiKeyHint: `Starts with \`sk-\` — searches run on ${OPENAI_SEARCH_MODEL}, billed to this key`,
  async search(query, opts) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_SEARCH_MODEL,
        // "low" keeps the retrieved context — the part billed per token —
        // small; the chat model reads the answer, not the pages.
        web_search_options: { search_context_size: "low" },
        messages: [
          {
            role: "user",
            content:
              `Search the web and answer concisely with citations: ${query}\n` +
              "State facts with their sources; say plainly when nothing relevant is found.",
          },
        ],
      }),
      signal: opts.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI search failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as ChatCompletionResponse;
    const message = data.choices?.[0]?.message;
    const content = message?.content ?? "";
    const input = data.usage?.prompt_tokens ?? 0;
    const output = data.usage?.completion_tokens ?? 0;
    return {
      results: citationsToResults(content, message?.annotations, opts.maxResults ?? 6),
      answer: content.trim() || undefined,
      costUsd: (input * PRICE_PER_1M.input + output * PRICE_PER_1M.output) / 1_000_000,
    };
  },
};
