/**
 * OCR text → paste-ready text. OCR-PASTE-PLAN.md D6.
 *
 * Tesseract emits one line per VISUAL line, so a wrapped paragraph arrives as
 * many short lines. This decides, for each line end, whether it was a
 * word-wrap (join with a space) or a real break (keep it). The output is
 * markdown-shaped: paragraphs separated by a blank line, list items one per
 * line with a markdown marker — so the paste path's `isLikelyMarkdown` /
 * `markdownPasteToTiptap` turns a screenshotted list into a real list.
 *
 * Pure, no DOM. Pinned by `pnpm ocr:blocks:check` (scripts/validate-ocr-blocks.ts).
 *
 * This is the one piece of product judgement in the feature; the rules are
 * deliberately few and each is named so it can be tuned in one place.
 */

/** Bullet glyphs OCR reads off rendered lists; normalised to markdown "- ". */
const BULLET_GLYPH = /^[•·◦▪‣●○■□➢►–—]\s+/;
/** Markdown bullet. */
const MD_BULLET = /^[-*+]\s+\S/;
/** "1." or "1)" — the latter normalised to "1." (the paste detector only knows "1."). */
const NUMBERED = /^(\d{1,3})[.)]\s+(?=\S)/;
/** "a)" / "B." — not markdown; kept as its own line, never joined into prose. */
const LETTERED = /^[a-zA-Z][.)]\s+(?=\S)/;
/** A word broken across lines with a hyphen: "infor-" + "mation". */
const HYPHEN_WRAP_END = /[A-Za-z]-$/;
const STARTS_LOWERCASE = /^[a-z]/;
/** Sentence end, then a line that starts like a new sentence. */
const SENTENCE_END = /[.!?:]["”')\]]?$/;
const STARTS_SENTENCE = /^["“(\[]?[A-Z0-9]/;

/** A line this much shorter than the block's longest line ended early on purpose. */
const SHORT_LINE_RATIO = 0.6;
/** Only judge "short" against blocks whose lines are long enough to wrap at all. */
const MIN_WRAP_WIDTH = 40;

type Line = { text: string; list: "bullet" | "numbered" | "lettered" | null };

function classify(raw: string): Line {
  let text = raw.trim().replace(/[ \t]{2,}/g, " ");
  if (BULLET_GLYPH.test(text)) text = text.replace(BULLET_GLYPH, "- ");
  if (MD_BULLET.test(text)) return { text, list: "bullet" };
  const numbered = NUMBERED.exec(text);
  if (numbered) return { text: `${numbered[1]}. ${text.slice(numbered[0].length)}`, list: "numbered" };
  if (LETTERED.test(text)) return { text, list: "lettered" };
  return { text, list: null };
}

/**
 * Was the end of `prev` a real break rather than a word-wrap before `next`?
 * `inListItem` is whether the item being built is a list item — a wrapped
 * item's continuation lines carry no marker, so the raw line can't tell.
 */
function isRealBreak(prev: Line, inListItem: boolean, next: Line, blockWidth: number): boolean {
  if (next.list) return true; // a new list item always starts its own line
  const endedShort = blockWidth >= MIN_WRAP_WIDTH && prev.text.length < blockWidth * SHORT_LINE_RATIO;
  if (inListItem) return endedShort; // wrapped item continues; prose after a short last line does not
  if (endedShort) return true; // stopped well short of the column: heading, address, sign-off
  return SENTENCE_END.test(prev.text) && STARTS_SENTENCE.test(next.text) && prev.text.length < MIN_WRAP_WIDTH;
}

function join(prev: string, next: string): string {
  if (HYPHEN_WRAP_END.test(prev) && STARTS_LOWERCASE.test(next)) {
    return prev.slice(0, -1) + next; // "infor-" + "mation" → "information"
  }
  return `${prev} ${next}`;
}

/** Reflow one blank-line-delimited block into markdown-shaped text. */
function reflowBlock(rawLines: string[]): string {
  const lines = rawLines.map(classify).filter((l) => l.text.length > 0);
  if (lines.length === 0) return "";
  const blockWidth = Math.max(...lines.map((l) => l.text.length));

  const out: Line[] = [{ ...lines[0] }];
  for (let i = 1; i < lines.length; i++) {
    const prev = out[out.length - 1];
    if (isRealBreak(lines[i - 1], prev.list !== null, lines[i], blockWidth)) {
      out.push({ ...lines[i] });
    } else {
      prev.text = join(prev.text, lines[i].text);
    }
  }

  // Consecutive markdown list items stay on adjacent lines (one list); every
  // other kept break becomes a paragraph break, because a single newline in
  // markdown is a soft break that renders as a space.
  let text = out[0].text;
  for (let i = 1; i < out.length; i++) {
    const sameList =
      (out[i].list === "bullet" || out[i].list === "numbered") && out[i].list === out[i - 1].list;
    text += (sameList ? "\n" : "\n\n") + out[i].text;
  }
  return text;
}

export function reflowOcrText(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/\f/g, "\n\n");
  return normalized
    .split(/\n[ \t]*\n/)
    .map((block) => reflowBlock(block.split("\n")))
    .filter((block) => block.length > 0)
    .join("\n\n");
}
