import { Node, mergeAttributes } from "@tiptap/core";

/** Mirrors the client `wikiLinkDisplayText` (kept local: this file must stay server-safe). */
function serverWikiLinkDisplayText(attrs: {
  displayText?: string | null;
  targetTitle?: string | null;
  anchorLabel?: string | null;
}): string {
  if (attrs.displayText) return attrs.displayText;
  const title = attrs.targetTitle || "Unknown";
  if (!attrs.anchorLabel) return title;
  const label = attrs.anchorLabel.length > 40 ? `${attrs.anchorLabel.slice(0, 39)}…` : attrs.anchorLabel;
  return `${title} › “${label}”`;
}

export const ServerWikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      // Stable ContentNode id of the target — survives renames. See the client
      // WikiLink extension for the full rationale.
      // Per-link opt-out from context expansion. null = expand (default); only
      // an explicit opt-out is stored and rendered. See the client WikiLink
      // extension for the full rationale.
      expand: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-expand") === "false" ? false : null,
        renderHTML: (attributes) =>
          attributes.expand === false ? { "data-expand": "false" } : {},
      },
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id"),
        renderHTML: (attributes) =>
          attributes.targetId ? { "data-target-id": attributes.targetId } : {},
      },
      targetTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-title"),
        renderHTML: (attributes) =>
          attributes.targetTitle ? { "data-target-title": attributes.targetTitle } : {},
      },
      displayText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-display-text"),
        renderHTML: (attributes) =>
          attributes.displayText ? { "data-display-text": attributes.displayText } : {},
      },
      // In-document heading target (derived slug) — see client WikiLink.
      headingSlug: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-heading-slug"),
        renderHTML: (attributes) =>
          attributes.headingSlug ? { "data-heading-slug": attributes.headingSlug } : {},
      },
      // Where inside the target ("<kind>:<id>") + its label — see client WikiLink.
      anchor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-anchor"),
        renderHTML: (attributes) =>
          attributes.anchor ? { "data-anchor": attributes.anchor } : {},
      },
      anchorLabel: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-anchor-label"),
        renderHTML: (attributes) =>
          attributes.anchorLabel ? { "data-anchor-label": attributes.anchorLabel } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-link",
        class: "wiki-link",
      }),
      serverWikiLinkDisplayText(node.attrs),
    ];
  },

  renderText({ node }) {
    const { targetTitle, displayText, headingSlug, anchor } = node.attrs;
    const title = `${headingSlug ? "#" : ""}${targetTitle ?? ""}${anchor ? `#^${anchor}` : ""}`;
    if (displayText) {
      return `[[${title}|${displayText}]]`;
    }
    return `[[${title}]]`;
  },
});
