/**
 * Wiki-Link Node Extension for TipTap
 *
 * Converts [[Note Title]] into clickable inline nodes (Obsidian-style)
 * Supports alias syntax: [[Note Title|Display Name]]
 * Works with backlinks API
 *
 * Uses a Node approach (not Mark) to properly replace the bracketed text
 *
 * M6: Search & Knowledge Features - Wiki Links
 */

import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { InputRule } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { slugifyHeading } from "@/lib/domain/content/heading-ids";
import { parseLinkAnchor } from "@/lib/domain/content/link-anchor";
import {
  wikiLinkAttrSpec,
  wikiLinkDisplayText,
  wikiLinkRenderAttrs,
  wikiLinkSourceText,
} from "./wiki-link-attrs";
import { createWikiLinkNodeView } from "./wiki-link-node-view";

export { wikiLinkDisplayText };

/**
 * Attrs for a hand-typed [[...]] body. A leading `#` makes an in-document
 * heading link: [[#Heading]] / [[#Heading|alias]] — the slug is derived from
 * the text (no dedup context when typed by hand, so duplicate headings
 * resolve to the first occurrence's slug).
 */
function attrsForTypedLink(
  body: string,
  displayText: string | null,
): {
  targetTitle: string;
  displayText: string | null;
  headingSlug: string | null;
  anchor?: string | null;
} | null {
  // [[Title#^kind:id]] — an anchored link (lib/domain/content/link-anchor.ts).
  // The Obsidian block-ref marker `#^` keeps it distinct from [[#Heading]].
  const anchorAt = body.indexOf("#^");
  if (anchorAt > 0) {
    const title = body.slice(0, anchorAt).trim();
    const anchor = body.slice(anchorAt + 2).trim();
    if (title && parseLinkAnchor(anchor)) {
      return { targetTitle: title, displayText, headingSlug: null, anchor };
    }
  }
  if (body.startsWith("#")) {
    const headingText = body.slice(1).trim();
    if (!headingText) return null;
    return {
      targetTitle: headingText,
      displayText,
      headingSlug: slugifyHeading(headingText) || "heading",
    };
  }
  return { targetTitle: body, displayText, headingSlug: null };
}

export interface WikiLinkSuggestionItem {
  id: string;
  title: string;
  slug: string;
}

/**
 * What a wiki-link click hands to the app layer.
 *
 * `heal` and `markBroken` keep the ProseMirror/DOM specifics inside this
 * extension: the app resolves the target asynchronously and reports back,
 * without needing the editor view or the node position.
 */
export interface WikiLinkClickTarget {
  /** Stable target id, when the link carries one. */
  targetId: string | null;
  /** The authored title — label, and fallback lookup key. */
  targetTitle: string;
  /**
   * Derived slug of an in-document heading target ([[#Heading]] links).
   * When present (and targetId is null), the click is same-document
   * navigation — scroll to the heading, expanding folds — not a note lookup.
   */
  headingSlug: string | null;
  /**
   * Where inside the target (`"<kind>:<id>"`, lib/domain/content/link-anchor.ts),
   * e.g. a highlight in a book. The app opens the target, then hands the
   * anchor to its viewer.
   */
  anchor: string | null;
  /**
   * Persist a resolved id back into the clicked node. Called when resolution
   * fell back to a title search, so the link upgrades itself in place and the
   * next rename can't orphan it. No-op on read-only surfaces or if the node
   * moved/changed under the async gap.
   */
  heal: (contentId: string) => void;
  /** Flag the clicked link as unresolvable (transient visual state). */
  markBroken: () => void;
}

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onClickLink?: (target: WikiLinkClickTarget) => void;
  suggestion?: Partial<import("@tiptap/suggestion").SuggestionOptions>;
  /**
   * The hover affordance — a compact chooser for the link's display (link /
   * chip / card / window) plus Open. Built by wiki-link-hover.tsx (React,
   * tippy) and injected here so this file stays React-free. Null = no
   * hover UI (viewers, embeds).
   */
  hover?: ((editor: Editor) => Plugin | null) | null;
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",

  group: "inline",

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onClickLink: undefined,
      suggestion: {
        char: "[[",
        allowSpaces: true,
        items: async () => [],
        render: () => ({}),
        command: () => {},
      },
      hover: null,
    };
  },

  // One spec for the client and server nodes (wiki-link-attrs.ts): the
  // durable `targetId`, the label `targetTitle`, alias, heading slug, anchor
  // + label, the context-expansion opt-out, and the display `view`.
  addAttributes() {
    return wikiLinkAttrSpec();
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wiki-link"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The plain span is what reaches the clipboard and the HTML tier — the
    // chip/card chrome lives in the NodeView only (never in renderHTML, or it
    // would re-parse as stray content on paste).
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, wikiLinkRenderAttrs(node.attrs), {
        class: "cursor-pointer text-primary hover:underline",
      }),
      wikiLinkDisplayText(node.attrs),
    ];
  },

  renderText({ node }) {
    // For markdown export, show the full wiki-link syntax
    return wikiLinkSourceText(node.attrs);
  },

  // Chip and card displays decorate the rendered span in place; the default
  // link display returns renderHTML's span untouched.
  addNodeView() {
    return createWikiLinkNodeView();
  },

  addInputRules() {
    return [
      // Input rule for [[Note Title]] syntax
      // Triggers when user types the closing ]]
      new InputRule({
        find: /\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/,
        handler: ({ state, range, match }) => {
          const body = match[1]?.trim();
          const displayText = match[2]?.trim() || null;

          if (!body) return null;
          const attrs = attrsForTypedLink(body, displayText);
          if (!attrs) return null;

          const { tr } = state;
          const start = range.from;
          const end = range.to;

          // Replace the entire [[...]] text with a wiki-link node
          tr.replaceWith(start, end, this.type.create(attrs));

          return tr;
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const nodeType = this.type;

    const hoverPlugin = options.hover ? options.hover(this.editor) : null;

    return [
      // Autocomplete suggestion when typing [[
      Suggestion({
        editor: this.editor,
        ...options.suggestion,
      }),

      // Hover chooser for the link's display (editable surfaces only).
      ...(hoverPlugin ? [hoverPlugin] : []),

      // Convert [[text]] to wiki-link when Space or Enter is pressed
      new Plugin({
        key: new PluginKey("wikiLinkConvert"),

        props: {
          handleKeyDown(view, event) {
            // Only trigger on Space or Enter
            if (event.key !== " " && event.key !== "Enter") {
              return false;
            }

            const { state } = view;
            const { selection, doc } = state;
            const { $from } = selection;

            // Get the current paragraph or heading
            const parent = $from.parent;
            if (parent.type.name !== "paragraph" && parent.type.name !== "heading") {
              return false;
            }

            // Get text before cursor
            const textBefore = parent.textContent.slice(0, $from.parentOffset);

            // Check if text ends with ]]
            const match = textBefore.match(/\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]$/);
            if (!match) {
              return false;
            }

            const body = match[1]?.trim();
            const displayText = match[2]?.trim() || null;

            if (!body) {
              return false;
            }
            const attrs = attrsForTypedLink(body, displayText);
            if (!attrs) {
              return false;
            }

            // Calculate positions
            const matchStart = $from.start() + ($from.parentOffset - match[0].length);
            const matchEnd = $from.start() + $from.parentOffset;

            // Replace with wiki-link node
            const tr = state.tr.replaceWith(matchStart, matchEnd, nodeType.create(attrs));

            // Insert the space/enter that triggered this
            if (event.key === " ") {
              tr.insertText(" ");
            } else if (event.key === "Enter") {
              // Let the default Enter handler take over
              view.dispatch(tr);
              return false;
            }

            view.dispatch(tr);
            return true;
          },
        },
      }),

      // Handle clicks and keyboard on wiki links
      new Plugin({
        key: new PluginKey("wikiLinkInteraction"),

        props: {
          handleClick(view, _pos, event) {
            // Only handle left-click; right-click must reach the contextmenu handler
            if (event.button !== 0) return false;

            // Read directly from DOM — posAtCoords.inside is layout-sensitive and
            // can return -1 in prod when fonts/CSS differ from dev.
            const target = event.target as HTMLElement;
            const wikiLinkEl = target.closest('[data-type="wiki-link"]');
            if (!wikiLinkEl) return false;

            const targetTitle = wikiLinkEl.getAttribute("data-target-title");
            if (!targetTitle || !options.onClickLink) return false;

            const targetId = wikiLinkEl.getAttribute("data-target-id");

            /**
             * Stamp the resolved id onto every equivalent link in the document.
             *
             * Matched by attrs rather than by the clicked node's position:
             * position math (posAtDOM) would silently no-op whenever it came
             * back off-by-one, and the document may have shifted during the
             * async lookup anyway. Attr-matching also heals duplicates — three
             * links to the same renamed note are all fixed by one click.
             *
             * Only nodes carrying the SAME (missing or stale) id are touched;
             * a link with a different non-null id points somewhere else and is
             * left alone.
             */
            const heal = (contentId: string) => {
              // Never mutate a document from a read-only surface (viewers,
              // embeds) — the user didn't open it to edit it.
              if (!view.editable || !contentId) return;

              const { tr, doc } = view.state;
              let changed = false;

              doc.descendants((node, pos) => {
                if (
                  node.type.name !== "wikiLink" ||
                  node.attrs.targetTitle !== targetTitle ||
                  node.attrs.targetId === contentId ||
                  // Same provenance as the clicked link: both blank, or both
                  // holding the same stale id.
                  (node.attrs.targetId ?? null) !== targetId
                ) {
                  return;
                }
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  targetId: contentId,
                });
                changed = true;
              });

              if (changed) view.dispatch(tr);
            };

            // Transient DOM-only state: a failed lookup is not necessarily a
            // permanent fact (offline, transport hiccup), so it must never be
            // written into the document.
            const markBroken = () => {
              wikiLinkEl.classList.add("wiki-link-broken");
            };

            const headingSlug = wikiLinkEl.getAttribute("data-heading-slug");
            const anchor = wikiLinkEl.getAttribute("data-anchor");

            event.preventDefault();
            // Each attempt starts clean — a link that failed while offline
            // shouldn't stay marked once it resolves.
            wikiLinkEl.classList.remove("wiki-link-broken");
            options.onClickLink({ targetId, targetTitle, headingSlug, anchor, heal, markBroken });
            return true;
          },

          handleKeyDown(view, event) {
            const { selection, doc, schema } = view.state;
            const { $from } = selection;

            // Check if cursor is directly before or after a wiki-link node
            const nodeBefore = $from.nodeBefore;
            const nodeAfter = $from.nodeAfter;

            // Backspace on a wiki-link node (cursor right after it)
            if (event.key === "Backspace" && nodeBefore?.type.name === "wikiLink") {
              event.preventDefault();

              const wikiText = wikiLinkSourceText(nodeBefore.attrs);

              const nodePos = $from.pos - nodeBefore.nodeSize;
              const transaction = view.state.tr.replaceWith(
                nodePos,
                $from.pos,
                schema.text(wikiText)
              );

              view.dispatch(transaction);
              return true;
            }

            // Delete on a wiki-link node (cursor right before it)
            if (event.key === "Delete" && nodeAfter?.type.name === "wikiLink") {
              event.preventDefault();

              const wikiText = wikiLinkSourceText(nodeAfter.attrs);

              const nodePos = $from.pos;
              const transaction = view.state.tr.replaceWith(
                nodePos,
                nodePos + nodeAfter.nodeSize,
                schema.text(wikiText)
              );

              view.dispatch(transaction);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
