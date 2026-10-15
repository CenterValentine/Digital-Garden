import { Node, mergeAttributes } from "@tiptap/core";

import {
  wikiLinkAttrSpec,
  wikiLinkDisplayText,
  wikiLinkRenderAttrs,
  wikiLinkSourceText,
} from "./wiki-link-attrs";

/**
 * Server-safe wikiLink node. Attributes, rendered-span attrs and the
 * `[[…]]` text form all come from wiki-link-attrs.ts, shared with the
 * client node — the two cannot drift.
 */
export const ServerWikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return wikiLinkAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, wikiLinkRenderAttrs(node.attrs)),
      wikiLinkDisplayText(node.attrs),
    ];
  },

  renderText({ node }) {
    return wikiLinkSourceText(node.attrs);
  },
});
