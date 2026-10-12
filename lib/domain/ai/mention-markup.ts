/**
 * Chat mention markup — ONE definition. The chat input serializes a mention
 * pill as `@[Title](id)`; the input, the engine and the message renderer all
 * parse it, and anything that turns a message into plain text (a chat title,
 * a screenshot chip) must render it as `@Title`.
 *
 * Owner smoke 2026-10-09: a chat whose first message mentioned a file was
 * titled `Try to just look at the @[bookcove](ec196794-147` — the fallback
 * title cut the raw markup at 48 characters. Client-safe (no imports).
 */

/** `@[Title](id)` — group 1 the title, group 2 the id. Use `new RegExp(MENTION_RE.source, "g")` for a fresh lastIndex. */
export const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** `@[bookcove](ec19…)` → `@bookcove`. Leaves every other character alone. */
export function mentionsToPlainText(text: string): string {
  return text.replace(new RegExp(MENTION_RE.source, "g"), (_, title: string) => `@${title}`);
}
