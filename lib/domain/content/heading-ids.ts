/**
 * Heading identity — the ONE slug algorithm for heading anchors.
 *
 * Heading ids are LIVE SLUGS: derived from heading text in document order,
 * never stored in the document. Renaming a heading changes its slug (link
 * healing is the heading-link-integrity extension's job). Because the id is a
 * pure function of (heading texts, document order), the editor DOM, outline
 * panel, TOC block, and published page can all derive identical anchors with
 * nothing to migrate, sync, or drift.
 *
 * Before this module there were three near-identical slugifiers (public
 * post-processor, TOC block, outline extractor) with diverging dedup suffixes
 * (`-2` vs `-1`) and empty-text fallbacks. The published-anchor behavior wins:
 * `base`, `base-2`, `base-3`, … — it is the compatibility contract for
 * anything that ever linked to a published page.
 *
 * Deliberately PURE (no TipTap-extension imports, PM imports type-only) so it
 * is usable from server components, client plugins, and tsx scripts alike.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";

/** One derived heading identity in document order. */
export interface HeadingId {
  /** Anchor slug, unique within the document. */
  slug: string;
  /** Heading level 1–6. */
  level: number;
  /** ProseMirror position of the heading node (start, before the node). */
  pos: number;
  /** Trimmed heading text (may be "" only never — blank headings are skipped). */
  text: string;
}

/** Lowercase, trim, strip non-word chars, spaces→hyphens, collapse hyphens. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Stateful slug assigner for one document walk.
 *
 * - Whitespace-only text → `null` (blank headings exist and fold, but are not
 *   linkable — no anchor).
 * - Non-empty text that slugifies to nothing (e.g. "!!!") → base `"heading"`.
 * - Duplicates dedup by call order: `base`, `base-2`, `base-3`, …
 *
 * A used-set guarantees global uniqueness even when distinct texts collide
 * with a suffixed form (heading "Intro" twice plus heading "Intro 2" would
 * otherwise mint "intro-2" twice).
 */
export function createSlugAssigner(): (text: string) => string | null {
  const counts = new Map<string, number>();
  const used = new Set<string>();

  return (text: string) => {
    if (!text.trim()) return null;
    const base = slugifyHeading(text) || "heading";
    let count = counts.get(base) ?? 0;
    let slug = count === 0 ? base : `${base}-${count + 1}`;
    while (used.has(slug)) {
      count += 1;
      slug = `${base}-${count + 1}`;
    }
    counts.set(base, count + 1);
    used.add(slug);
    return slug;
  };
}

/**
 * Derive every linkable heading's identity from a ProseMirror document.
 * Blank headings are skipped (not linkable); everything else gets a unique
 * slug in document order.
 */
export function computeHeadingIds(doc: ProseMirrorNode): HeadingId[] {
  const assign = createSlugAssigner();
  const ids: HeadingId[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const slug = assign(node.textContent);
    if (slug === null) return;
    ids.push({
      slug,
      level: node.attrs.level as number,
      pos,
      text: node.textContent.trim(),
    });
  });

  return ids;
}

/** Extract plain text from a TipTap JSON node (headings have inline content). */
function jsonTextContent(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(jsonTextContent).join("");
}

/**
 * JSON twin of computeHeadingIds for consumers that hold TipTap JSON rather
 * than a ProseMirror node (outline extraction, server-side callers). `pos` is
 * absent — JSON has no positions.
 */
export function computeHeadingIdsFromJson(
  json: JSONContent,
): Array<Omit<HeadingId, "pos">> {
  const assign = createSlugAssigner();
  const ids: Array<Omit<HeadingId, "pos">> = [];

  const walk = (node: JSONContent) => {
    if (node.type === "heading" && node.attrs?.level) {
      const text = jsonTextContent(node);
      const slug = assign(text);
      if (slug !== null) {
        ids.push({ slug, level: node.attrs.level as number, text: text.trim() });
      }
    }
    (node.content ?? []).forEach(walk);
  };

  walk(json);
  return ids;
}
