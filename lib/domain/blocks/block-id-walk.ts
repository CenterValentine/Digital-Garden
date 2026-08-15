/**
 * Server-safe blockId regeneration walk.
 *
 * Used by the duplicate route: a duplicated note is a brand-new document
 * with no Y.Doc, so every copied block gets a fresh blockId
 * unconditionally — otherwise per-instance state keyed by blockId
 * (excalidraw/mermaid sub-maps, Note Window history) would be shared
 * between the original and the copy the first time both are open.
 *
 * (Excalidraw duplicates already lose in-note drawing data today — the
 * sub-map lives on the ORIGINAL note's Y.Doc and never followed the
 * copy; regenerating the id makes that pre-existing behavior explicit
 * rather than changing it.)
 *
 * Sibling of `regenerateBlockId` in ./schema.ts (single-attrs variant).
 */

import { v4 as uuid } from "uuid";
import type { JSONContent } from "@tiptap/core";

export function regenerateAllBlockIds(json: JSONContent): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    const hasBlockId =
      node.attrs && typeof node.attrs.blockId === "string" && node.attrs.blockId;
    const attrs = hasBlockId ? { ...node.attrs, blockId: uuid() } : node.attrs;
    const content = Array.isArray(node.content)
      ? node.content.map(walk)
      : node.content;
    const next: JSONContent = { ...node };
    if (attrs !== node.attrs) next.attrs = attrs;
    if (content !== node.content) next.content = content;
    return next;
  };
  return walk(json);
}
