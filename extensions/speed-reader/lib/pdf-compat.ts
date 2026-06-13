/**
 * normalizePdfText — post-process text extracted from a PDF to repair common
 * fragmentation artifacts before tokenizing.
 *
 * PDF text extraction frequently yields:
 *   - Soft-hyphenated line breaks:  "read-\ning"  → "reading"
 *   - Space-padded glyphs:          "w o r d"     → "word"  (heuristic)
 *   - Collapsed leading whitespace: "  word"      → "word"
 *   - Runs of blank space:          "foo   bar"   → "foo bar"
 *
 * The single-char heuristic is conservative: it only joins a run of
 * space-separated single characters when there are ≥ 3 consecutive ones and
 * none of them are common standalone words (I, a).  False positives (e.g.
 * "A B C" abbreviations) are rare enough in body text to be acceptable.
 */
export function normalizePdfText(text: string): string {
  return (
    text
      // 1. Remove soft hyphens at line breaks: "word-\nword" → "wordword",
      //    "word- \nword" → "wordword".
      .replace(/-[ \t]*\n[ \t]*/g, "")
      // 2. Collapse runs of space-separated single characters (≥3 in a row)
      //    that aren't standalone words: "w o r d s" → "words".
      .replace(/\b(?<![IA] )([A-Za-z]) (?=[A-Za-z] [A-Za-z])/g, "$1")
      .replace(/\b([A-Za-z]) (?=[A-Za-z]\b)/g, "$1")
      // 3. Collapse horizontal whitespace within a line to a single space.
      .replace(/[ \t]+/g, " ")
      // 4. Normalize paragraph breaks: preserve up to two newlines (paragraph
      //    boundary), collapse anything more.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
