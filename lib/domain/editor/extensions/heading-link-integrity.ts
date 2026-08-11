/**
 * Heading-Link Integrity — keeps in-document heading links ([[#Heading]],
 * wikiLink nodes carrying `headingSlug`) truthful in real time.
 *
 * Heading ids are LIVE slugs derived from heading text (heading-ids.ts), so
 * two things can invalidate a link:
 *
 * 1. The heading is RENAMED (or duplicate ordering reshuffles a `-2` suffix).
 *    An appendTransaction diffs the derived slugs of oldState vs newState,
 *    maps surviving headings through the transaction batch, and rewrites
 *    affected links' `headingSlug` + `targetTitle` in the same edit. Pure
 *    function of state ⇒ every collaborator computes the identical repair ⇒
 *    convergent. Wholesale doc replacement (source-view apply) maps nothing —
 *    every old heading reads as deleted and the pass safely no-ops.
 *
 * 2. The heading is DELETED. Links to a slug with no current match get a
 *    `wiki-link-heading-broken` DECORATION — never a rewrite. The node keeps
 *    its data, so undoing the deletion (or retyping the heading) un-breaks
 *    the link instantly. A dedicated class, not the click handler's
 *    `wiki-link-broken` (that one is DOM-managed and would fight a
 *    decoration).
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { computeHeadingIds } from "@/lib/domain/content/heading-ids";

const headingLinkIntegrityKey = new PluginKey<DecorationSet>("headingLinkIntegrity");

function buildBrokenDecorations(doc: ProseMirrorNode): DecorationSet {
  const slugs = new Set(computeHeadingIds(doc).map((heading) => heading.slug));
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "wikiLink") return;
    const headingSlug = node.attrs.headingSlug as string | null;
    if (headingSlug && !slugs.has(headingSlug)) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "wiki-link-heading-broken",
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const HeadingLinkIntegrity = Extension.create({
  name: "headingLinkIntegrity",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: headingLinkIntegrityKey,

        state: {
          init: (_config, state) => buildBrokenDecorations(state.doc),
          apply: (tr, value, _oldState, newState) =>
            tr.docChanged ? buildBrokenDecorations(newState.doc) : value,
        },

        props: {
          decorations(state) {
            return headingLinkIntegrityKey.getState(state);
          },
        },

        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const oldHeadings = computeHeadingIds(oldState.doc);
          if (oldHeadings.length === 0) return null;

          const newHeadings = computeHeadingIds(newState.doc);
          const newBySlug = new Map(newHeadings.map((heading) => [heading.slug, heading]));
          const newByPos = new Map(newHeadings.map((heading) => [heading.pos, heading]));

          // Map each old heading to its position in the new doc; a deleted
          // result means the heading is gone (or the doc was replaced
          // wholesale) — no repair from it.
          const renames = new Map<string, { slug: string; text: string }>();
          for (const heading of oldHeadings) {
            let mapped = heading.pos;
            let deleted = false;
            for (const tr of transactions) {
              const result = tr.mapping.mapResult(mapped);
              if (result.deleted) {
                deleted = true;
                break;
              }
              mapped = result.pos;
            }
            if (deleted) continue;

            const survivor = newByPos.get(mapped);
            if (!survivor) continue;
            if (survivor.slug !== heading.slug) {
              renames.set(heading.slug, { slug: survivor.slug, text: survivor.text });
            }
          }
          if (renames.size === 0) return null;

          // Never retarget a link away from a slug that STILL resolves — if
          // "intro" was renamed but another heading now owns "intro", links
          // to it are still valid as written.
          for (const oldSlug of Array.from(renames.keys())) {
            if (newBySlug.has(oldSlug)) renames.delete(oldSlug);
          }
          if (renames.size === 0) return null;

          const tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "wikiLink") return;
            const headingSlug = node.attrs.headingSlug as string | null;
            if (!headingSlug) return;
            const rename = renames.get(headingSlug);
            if (!rename) return;

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              headingSlug: rename.slug,
              // The label follows the rename unless the author aliased it.
              targetTitle: rename.text,
            });
            modified = true;
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
