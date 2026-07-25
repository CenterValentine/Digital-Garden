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

import { containsTable } from "./markdown-tables";

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
  // Table: recognised by its delimiter row, not by counting `|…|` lines — GFM
  // makes the outer pipes optional, so the old line-shape count missed every
  // "Claim | Evidence" / "--- | ---" table (the shape GitHub, Claude and most
  // docs tools emit) and left it pasted as literal text.
  if (containsTable(text)) strong++;

  let inline = 0;
  if (/\[[^\]\n]+\]\([^)\s]+\)/.test(text)) inline++; // link
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text)) inline++; // bold
  if (/`[^`\n]+`/.test(text)) inline++; // inline code

  return strong >= 1 || inline >= 2;
}

/**
 * Did this paste come from a ProseMirror/TipTap editor (ours or another tab's)?
 *
 * ProseMirror stamps its clipboard HTML with `data-pm-slice="<openStart>
 * <openEnd> <context>"`, so its own parser can restore the slice exactly. When
 * that marker is present the paste is ALREADY rich content — ProseMirror parses
 * the HTML and the text/plain flavour is never used. Two reasons to bail out of
 * the markdown path entirely:
 *
 *   • the hint's premise is false. "Pasted as plain text" is wrong — nothing was
 *     flattened, so offering to "format it" is a nag about a problem that
 *     doesn't exist. Copying a heading or a list out of one note and into
 *     another made it fire on every paste.
 *   • under "Always format" it's destructive. That path pre-empts the real
 *     paste and re-parses the text/plain flavour instead — turning a faithful
 *     rich-content paste into a lossy round-trip through markdown, silently.
 *
 * Deliberately narrow: only ProseMirror's own marker. Plenty of sources (VS
 * Code, GitHub, a docs site) put markdown-ish text on the clipboard WITH a
 * text/html flavour, and those are exactly the pastes the hint is for.
 */
export function isProseMirrorClipboardHtml(html: string | null | undefined): boolean {
  return !!html && html.includes("data-pm-slice");
}

// ── Local paste preferences (client UI prefs, no backend) ────────────────────
const DISMISS_KEY = "notes:markdown-paste-hint-dismissed";
const AUTO_FORMAT_KEY = "notes:markdown-paste-auto-format";

function readFlag(key: string): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode / no storage — flags just don't persist, which is safe */
  }
}

/** The user chose "Don't show again" for the markdown-paste hint. */
export function isMarkdownPasteHintDismissed(): boolean {
  return readFlag(DISMISS_KEY);
}
export function dismissMarkdownPasteHint(): void {
  writeFlag(DISMISS_KEY, true);
}

/**
 * The user opted into auto-formatting pasted Markdown ("Always format"). When
 * on, a markdown-looking paste is converted to rich text immediately (via the
 * paste event — no clipboard permission needed) instead of landing literal.
 * Opt-in, so the "unsafe guess" concern doesn't apply: the user asked for it.
 */
export function isMarkdownPasteAutoFormat(): boolean {
  return readFlag(AUTO_FORMAT_KEY);
}
export function setMarkdownPasteAutoFormat(value: boolean): void {
  writeFlag(AUTO_FORMAT_KEY, value);
}

/**
 * Guidance for when `navigator.clipboard.readText()` is blocked (the context-menu
 * "Paste as Markdown"). Browser-specific because the fix differs: Chromium has a
 * per-site clipboard permission the user can grant; Safari/Firefox don't, so we
 * point them at the always-works path (paste + the toast).
 */
export function clipboardBlockedGuidance(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const fallback = "Instead, paste with ⌘/Ctrl+V and pick “Paste as Markdown” on the toast.";

  if (/Firefox\//.test(ua)) {
    return `Firefox doesn't allow reading the clipboard here. ${fallback}`;
  }
  if (/Edg\//.test(ua) || (/Chrome\//.test(ua) && !/OPR\//.test(ua))) {
    return "Chrome blocked clipboard access. Click the icon at the left of the address bar → Clipboard → Allow, then try again — or paste with ⌘/Ctrl+V and pick “Paste as Markdown” on the toast.";
  }
  if (/Safari\//.test(ua)) {
    return `Safari restricts reading the clipboard from a menu. ${fallback}`;
  }
  return `Clipboard access was blocked. ${fallback}`;
}
