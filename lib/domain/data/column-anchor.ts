/**
 * Column anchors — a wiki-link that points at ONE column of a database
 * (client-safe, pure).
 *
 * `[[Jobs#` in the link menu (Tab on a database) lists its columns; picking
 * one stores `anchor: "column:<DataColumn.id>"` + `anchorLabel: <name>` on the
 * link (the generic anchor contract, lib/domain/content/link-anchor.ts). The
 * id is the durable pointer — a renamed column still resolves — and the label
 * is only what the link shows.
 *
 * The point of the link is what the AI gets from it: every AI read of a note
 * renders the link as `[[Jobs#Status]]` and adds the column's header and its
 * description (lib/domain/data/server/column-links.ts). A column's
 * description is AI-facing by design (DataColumn.description, plan D9).
 */

import type { JSONContent } from "@tiptap/core";
import { parseLinkAnchor } from "@/lib/domain/content/link-anchor";

export const COLUMN_ANCHOR_KIND = "column";

export function formatColumnAnchor(columnId: string): string {
  return `${COLUMN_ANCHOR_KIND}:${columnId}`;
}

/** The column id a link's anchor names, or null for any other anchor. */
export function parseColumnAnchor(anchor: string | null | undefined): string | null {
  const parsed = parseLinkAnchor(anchor);
  return parsed?.kind === COLUMN_ANCHOR_KIND ? parsed.id : null;
}

/**
 * `[[Title#Column]]` — the model-facing text of a column link. Null when the
 * link is not a column link, so callers keep their own rendering for the rest.
 */
export function columnLinkSyntax(attrs: Record<string, unknown>): string | null {
  const anchor = typeof attrs.anchor === "string" ? attrs.anchor : null;
  const label = typeof attrs.anchorLabel === "string" ? attrs.anchorLabel : "";
  const title = typeof attrs.targetTitle === "string" ? attrs.targetTitle : "";
  if (!parseColumnAnchor(anchor) || !title || !label) return null;
  return `${title}#${label}`;
}

/** Column ids of every column link in a document, in order, de-duplicated. */
export function collectColumnLinkIds(doc: JSONContent | null | undefined): string[] {
  const ids: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "wikiLink") {
      const id = parseColumnAnchor(node.attrs?.anchor as string | undefined);
      if (id && !ids.includes(id)) ids.push(id);
    }
    for (const child of node.content ?? []) walk(child);
  };
  if (doc) walk(doc);
  return ids;
}

const COLUMN_ANCHOR_IN_TEXT = /#\^column:([0-9a-f-]{36})/gi;

/**
 * Column ids in rendered markdown (`[[Jobs#^column:<id>]]{label=…}`, the
 * lossless serializer's form) — for readers that only hold a slice of the
 * document's text, such as one chunk of it.
 */
export function columnIdsInText(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(COLUMN_ANCHOR_IN_TEXT)) {
    const id = match[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
