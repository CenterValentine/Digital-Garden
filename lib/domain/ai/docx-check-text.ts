/**
 * DOCX check text (ITERATION-RUN-HARNESS-FIXES §10 round 3). Pure — no editor,
 * no Prisma — so the gate can pin it under tsx.
 */

/**
 * The document's text as read FROM THE FILE: paragraphs and headings on
 * their own lines, line breaks kept, each link shown with its target
 * (`LinkedIn [→ https://…]`) so a label with no visible URL is visible as
 * exactly that. Built from mammoth's HTML reading — its raw-text mode drops
 * line breaks outright and would report correctly broken lines as glued.
 * Pure.
 */
export function docxHtmlToCheckText(html: string): string {
  const decode = (t: string) =>
    t
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) =>
        `${label} [→ ${href}]`,
      )
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/(p|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
