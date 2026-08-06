/**
 * DGHeading — StarterKit's Heading plus one attribute: `collapsed`.
 *
 * `collapsed` is the ONLY stored fact of the heading-fold feature: a collapsed
 * heading hides its following siblings up to the next heading of equal-or-
 * higher rank (see heading-fold.ts — the fold range is derived per edit, never
 * stored). Living on the node means fold state persists with the document and
 * syncs to every collaborator via Y.js — the shared-state behavior the feature
 * requires — with no store, no sidecar, no migration.
 *
 * Serialization contract: `data-collapsed="true"` is emitted ONLY when true,
 * so a non-collapsed heading's HTML is byte-identical to before this attr
 * existed — tier-1 markdown, exports, and published pages are unmoved for the
 * common case. Heading anchor ids are deliberately NOT an attribute: they are
 * live slugs derived from heading text (lib/domain/content/heading-ids.ts)
 * and are stamped onto the DOM by decorations / the public post-processor.
 *
 * Register with `heading: false` in StarterKit.configure in ALL THREE
 * extension sets (client, server, collaboration) — the collab CI gate's
 * regex only discovers `Node.create`, so a missed `heading: false` will NOT
 * be caught automatically.
 */

import Heading from "@tiptap/extension-heading";

export const DGHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) =>
          attributes.collapsed ? { "data-collapsed": "true" } : {},
      },
    };
  },
});

/**
 * Server-safe variant. The base Heading has no React/NodeView, so the client
 * extension IS server-safe — the alias keeps the Server* naming convention
 * the extension sets expect (Callout follows the same single-instance shape).
 */
export const ServerDGHeading = DGHeading;
