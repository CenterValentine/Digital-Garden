/**
 * BlockIdPasteHygiene — collision-scoped blockId re-identification on paste.
 *
 * blockId is the key for per-instance block state that lives OUTSIDE the
 * node attrs: excalidraw scene sub-maps (`blockExcalidraw:{id}`), mermaid
 * source sub-texts (`blockMermaid:{id}`), and Note Window retarget history
 * (`blockNoteWindow:{id}`), all on the host note's Y.Doc. Two nodes in one
 * document sharing a blockId therefore share that state — the hazard
 * `dedupeBlockIds` (markdown-serialize.ts) already closes for the
 * source-view fence channel. Nothing closed it for the ordinary
 * ProseMirror clipboard until this extension.
 *
 * COLLISION-scoped, not unconditional, and for ALL blockId-bearing node
 * types — the same semantics as the fence-channel dedupe, so every paste
 * channel behaves uniformly:
 *   - copy/paste inside one note   → collision → fresh id → state (e.g.
 *     Note Window history) does NOT follow the copy ✓
 *   - cut/paste (move) in one note → no collision → id kept → excalidraw
 *     drawings and window history travel with a moved block ✓ (an
 *     unconditional re-id here would orphan excalidraw/mermaid sub-map
 *     data on every within-note move — a regression)
 *   - paste into a DIFFERENT note  → id kept harmlessly → sub-maps are
 *     per-host-ydoc, so the pasted instance starts fresh anyway ✓
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment, type Node as PMNode } from "@tiptap/pm/model";

/**
 * Rebuild `fragment`, assigning a fresh blockId to any node whose id is
 * already present in `existingIds` (the host document) or repeated within
 * the pasted content itself. Returns the ORIGINAL fragment when nothing
 * collides (the overwhelmingly common case).
 *
 * Exported for the validate-block-id-hygiene script — the logic is pure
 * over ProseMirror structures and runs server-side against getSchema().
 */
export function remapCollidingBlockIds(
  fragment: Fragment,
  existingIds: ReadonlySet<string>,
  makeId: () => string = () => crypto.randomUUID(),
  seenInSlice: Set<string> = new Set(),
): Fragment {
  let changed = false;
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    let attrs = node.attrs;
    const blockId = node.attrs?.blockId;
    if (typeof blockId === "string" && blockId) {
      if (existingIds.has(blockId) || seenInSlice.has(blockId)) {
        attrs = { ...node.attrs, blockId: makeId() };
      } else {
        seenInSlice.add(blockId);
      }
    }
    const content = remapCollidingBlockIds(
      node.content,
      existingIds,
      makeId,
      seenInSlice,
    );
    if (attrs !== node.attrs || content !== node.content) {
      changed = true;
      nodes.push(node.type.create(attrs, content, node.marks));
    } else {
      nodes.push(node);
    }
  });
  return changed ? Fragment.fromArray(nodes) : fragment;
}

export function collectBlockIds(doc: PMNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const blockId = node.attrs?.blockId;
    if (typeof blockId === "string" && blockId) ids.add(blockId);
    return true;
  });
  return ids;
}

export const BlockIdPasteHygiene = Extension.create({
  name: "blockIdPasteHygiene",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockIdPasteHygiene"),
        props: {
          transformPasted(slice, view) {
            const existingIds = collectBlockIds(view.state.doc);
            const remapped = remapCollidingBlockIds(slice.content, existingIds);
            if (remapped === slice.content) return slice;
            return new Slice(remapped, slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});
