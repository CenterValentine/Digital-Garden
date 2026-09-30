/**
 * Pure parsing for book details (no I/O) — kept separate from the
 * server-only enrichment so `pnpm reader:check` can pin it.
 */

/** Strip HTML and boilerplate; null when nothing useful remains. */
export function cleanDescription(raw: unknown): string | null {
  const value =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && "value" in raw
        ? String((raw as { value: unknown }).value)
        : null;
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Open Library appends source links / "See also" blocks in markdown.
    .replace(/\n-{3,}[\s\S]*$/, "")
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/\[\d+\]:\s*\S+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length >= 40 ? text.slice(0, 6000) : null;
}

/**
 * Project Gutenberg's own book page carries a "Summary" row in its
 * bibliographic table (added 2024) — the primary source for Gutenberg
 * descriptions; Gutendex mirrors it but its public server is often slow.
 */
export function parseGutenbergSummary(html: string): { summary: string | null; subjects: string[] } {
  const row = html.match(/<th[^>]*>\s*Summary\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i)?.[1];
  const subjects = [...html.matchAll(/<th[^>]*>\s*Subject\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .map((subject) => subject.replace(/ -- .*$/, ""))
    .filter((subject, index, all) => subject && all.indexOf(subject) === index)
    .slice(0, 8);
  return {
    summary: cleanDescription(row?.replace(/\(This is an automatically generated summary\.\)/i, "")),
    subjects,
  };
}

