/**
 * Token estimation — shared by the server resolver (budget accounting) and,
 * from Phase 3, the client source picker (live budget bar). Client-safe: no
 * imports, no side effects.
 *
 * This is a coarse ~4-chars-per-token heuristic, not a real tokenizer. It only
 * needs to be good enough to keep assembled context under a budget and to size
 * the picker's bars; exact accounting happens provider-side at call time.
 */

const CHARS_PER_TOKEN = 4;

/** Estimate the token count of a string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Character ceiling equivalent to a token budget, for cheap truncation. */
export function tokensToChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

/**
 * Truncate text to a token ceiling, appending an elision marker when cut.
 * Returns the text unchanged (and `truncated: false`) when already under.
 */
export function truncateToTokens(
  text: string,
  maxTokens: number
): { text: string; truncated: boolean } {
  const maxChars = tokensToChars(maxTokens);
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars).trimEnd()}\n\n… [truncated]`,
    truncated: true,
  };
}
