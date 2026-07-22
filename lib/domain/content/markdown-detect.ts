/**
 * Markdown-paste detection (v3.2 T2)
 *
 * A conservative heuristic for "the text the user just pasted is probably
 * Markdown", used by the editor's paste handler to WARN (never auto-convert)
 * that the paste went in as plain text and offer the "Paste as Markdown" path.
 *
 * Deliberately biased toward false negatives: a missed hint is silent, a false
 * hint is an annoying (if dismissable) nag. Requires either one strong
 * structural signal (heading, fenced code, a real list, task item, table,
 * blockquote) or two independent inline signals (link / bold / inline code).
 */

/** Does the pasted text look enough like Markdown to warrant a hint? */
export function isLikelyMarkdown(text: string): boolean {
  if (!text || text.length < 4) return false;
  const lines = text.split("\n");
  const countLines = (re: RegExp) => lines.reduce((n, l) => (re.test(l) ? n + 1 : n), 0);

  let strong = 0;
  if (countLines(/^\s{0,3}#{1,6}\s+\S/) >= 1) strong++; // heading
  if (countLines(/^\s*[-*+]\s+\[[ xX]\]\s/) >= 1) strong++; // task item
  if (countLines(/^\s*>\s+\S/) >= 1) strong++; // blockquote
  if (/(^|\n)\s{0,3}(```|~~~)/.test(text)) strong++; // fenced code
  if (countLines(/^\s*[-*+]\s+\S/) >= 2) strong++; // bullet list (2+ items)
  if (countLines(/^\s*\d+\.\s+\S/) >= 2) strong++; // ordered list (2+ items)
  if (countLines(/^\s*\|.*\|\s*$/) >= 2) strong++; // table (2+ rows)

  let inline = 0;
  if (/\[[^\]\n]+\]\([^)\s]+\)/.test(text)) inline++; // link
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text)) inline++; // bold
  if (/`[^`\n]+`/.test(text)) inline++; // inline code

  return strong >= 1 || inline >= 2;
}

// ── "Don't show again" dismissal (local UI preference) ───────────────────────
const DISMISS_KEY = "notes:markdown-paste-hint-dismissed";

export function isMarkdownPasteHintDismissed(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissMarkdownPasteHint(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode / no storage — hint just keeps showing, which is safe */
  }
}
