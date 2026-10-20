/**
 * Comment mark ⇄ CriticMarkup — the one grammar for both halves.
 *
 *   {==passage==}{>>#8f2c1a0e-…<<}
 *
 * CriticMarkup is the existing markdown convention for inline comments
 * (Obsidian plugins, iA Writer, Ulysses, Marked read it): `{==…==}` marks the
 * passage, the `{>>…<<}` right after it is the comment — here, the thread id
 * prefixed with `#`, since the discussion itself lives beside the note.
 *
 * Why a grammar at all: an inline mark with attributes and no markdown form
 * drops its WHOLE top-level block to raw HTML in the source view (a commented
 * sentence would show its paragraph as `<p>…<span data-comment=…>`). The
 * serializer's self-verify decides whether this form is used, so it is always
 * safe: a passage the grammar cannot carry DECLINES (returns null) and the
 * block falls to the HTML tier — lossless, less pretty.
 *
 * Both halves live here, pure (no TipTap imports): the turndown rule
 * (`dgComment` in markdown-serialize.ts) writes with `commentToMarkdown`; the
 * codec's reTag (markdown-block-codecs.ts) reads with `reTagCommentMarkdown`.
 * Nested threads (`excludes: ""` lets two threads share text) serialise as
 * nested forms and are rebuilt innermost-first.
 */

import { COMMENT_THREAD_ID_RE } from "./comments";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A complete inner form, as the serializer writes it (never entity-escaped). */
const COMPLETE_INNER_FORM_RE = new RegExp(`\\{==(?:(?!\\{==|==\\})[\\s\\S])*?==\\}\\{>>#${UUID}<<\\}`, "gi");

/**
 * The passage may hold complete nested forms (an overlapping thread) but no
 * stray delimiter — a lone `{==` or `==}` would make the form ambiguous.
 */
function hasStrayDelimiter(inner: string): boolean {
  let s = inner;
  for (;;) {
    const next = s.replace(COMPLETE_INNER_FORM_RE, "");
    if (next === s) break;
    s = next;
  }
  return /\{==|==\}/.test(s);
}

/**
 * Serialize one marked run. `inner` is the already-serialised markdown of the
 * passage (nested marks, links, even an inner comment). Returns null when the
 * form cannot carry it (empty passage, stray delimiter inside, bad id).
 */
export function commentToMarkdown(inner: string, threadId: string | null | undefined): string | null {
  if (!threadId || !COMMENT_THREAD_ID_RE.test(threadId)) return null;
  if (!inner) return null;
  if (hasStrayDelimiter(inner)) return null;
  // The passage is nested markdown, so the delimiters must stay tight against
  // it: a leading/trailing newline would let marked split the paragraph.
  if (/^\s|\s$/.test(inner) && /\n/.test(inner)) return null;
  return `{==${inner}==}{>>#${threadId.toLowerCase()}<<}`;
}

/**
 * Parse-side: marked leaves `{==` / `==}` as literal text and HTML-escapes
 * the angle brackets, so the comment tail arrives as `{&gt;&gt;#id&lt;&lt;}`
 * (or raw, from a serializer that did not escape). The body between the
 * delimiters may hold inline tags (`<strong>`, `<a>`), never a block
 * boundary and never a bare `{==` (innermost first — the loop rebuilds
 * outer forms on later passes).
 */
const COMMENT_FORM_RE = new RegExp(
  `\\{==((?:(?!\\{==|==\\})[\\s\\S])*?)==\\}\\{(?:>>|&gt;&gt;)#(${UUID})(?:<<|&lt;&lt;)\\}`,
  "i",
);

const BLOCK_BOUNDARY_RE = /<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|pre|table|thead|tbody|tr|td|th|details|summary)\b/i;

/** Is `index` inside an HTML tag (between an unclosed `<` and its `>`)? */
function insideTag(html: string, index: number): boolean {
  const open = html.lastIndexOf("<", index);
  if (open === -1) return false;
  const close = html.lastIndexOf(">", index);
  return close < open;
}

function balancedTags(fragment: string): boolean {
  return (fragment.match(/</g) ?? []).length === (fragment.match(/>/g) ?? []).length;
}

/**
 * Rewrite every CriticMarkup comment form in `html` into the span the
 * `comment` mark's parseHTML reads. Runs on marked's output; the caller keeps
 * it outside <pre>/<code>. Nesting of any depth resolves in as many passes as
 * there are levels.
 */
export function reTagCommentMarkdown(html: string): string {
  let out = html;
  let from = 0;
  for (;;) {
    const slice = out.slice(from);
    const m = COMMENT_FORM_RE.exec(slice);
    if (!m) return out;
    const index = from + m.index;
    const [whole, body, threadId] = m;
    const usable =
      !insideTag(out, index) &&
      balancedTags(body) &&
      !BLOCK_BOUNDARY_RE.test(body);
    if (!usable) {
      // Leave this occurrence alone and keep scanning after it.
      from = index + 1;
      continue;
    }
    const span = `<span data-comment="${threadId.toLowerCase()}">${body}</span>`;
    out = out.slice(0, index) + span + out.slice(index + whole.length);
    // Restart from the beginning: an outer form may now be complete.
    from = 0;
  }
}
