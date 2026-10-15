/**
 * Repeat guard for search tools (ITERATION-RUN-HARNESS-FIXES §9).
 *
 * Prod 62ac2b76 (gpt-6-sol, 2026-09-29): five near-identical `site:clay.com`
 * searches across two turns, each a step of an 8-step cap, each re-sending
 * the whole prompt. A search is deterministic enough that the same input
 * twice in one turn is a loop, not a plan. The route wraps the app-run
 * search tools so a byte-identical repeat answers with a pointer to the
 * earlier result instead of running again. Only searches: a re-read after
 * a write (query a row, update it, query it again) is legitimate and is
 * never guarded. Provider-native search (OpenAI's built-in) has no execute
 * to wrap and is not covered.
 *
 * Pure — pinned by `run-harness:check`.
 */

/** Tools whose identical repeat within a turn is a loop. */
export const REPEAT_GUARDED_TOOLS = ["search_web", "search_content"] as const;

/** Stable identity of one call: tool name + canonical JSON of its input. */
export function repeatedCallKey(toolName: string, input: unknown): string {
  return `${toolName}:${canonical(input)}`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** The result a repeated call gets: where the first result is, and what to do instead. */
export function repeatedCallNotice(toolName: string, firstStep: number): string {
  return (
    `[Repeated call: this exact ${toolName} input already ran in this turn (step ${firstStep}) and its result is above — it was NOT run again. ` +
    "Use that result. If you need something different, change the query; if the answer is not there, record the gap and move on.]"
  );
}
