/**
 * The wikiLink node's attribute spec + rendered-span attrs — ONE definition
 * shared by the client node (wiki-link.ts) and the server node
 * (wiki-link-server.ts), the same way `noteWindowAttrSpec()` keeps the
 * Note Window's two nodes from drifting. Server-safe: no React, no DOM.
 *
 * Every attribute renders NOTHING when absent, so a link authored before an
 * attribute existed serializes byte-identically and the markdown round-trip
 * is unmoved.
 */

import {
  DEFAULT_WIKI_LINK_VIEW,
  isWikiLinkInlineView,
  type WikiLinkInlineView,
} from "@/lib/domain/content/wiki-link-markdown";
import { parseColumnAnchor } from "@/lib/domain/data/column-anchor";

export type { WikiLinkInlineView };

/** A nullable string attr carried as `data-<key>`; absent when null/empty. */
function optionalString(dataKey: string, attrName: string) {
  return {
    default: null as string | null,
    parseHTML: (element: Element) => element.getAttribute(dataKey),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[attrName] ? { [dataKey]: attributes[attrName] } : {},
  };
}

export function wikiLinkAttrSpec() {
  return {
    /**
     * Per-link opt-out from context expansion. `null` (default) means EXPAND:
     * a read of this document pulls in the target's `derivedText`. Only an
     * explicit opt-out is stored and rendered. This is the "not this
     * mention" control; its counterpart, "never this thing", is
     * `AgenticMetadata.contextOptOut` on the target node.
     */
    expand: {
      default: null as boolean | null,
      parseHTML: (element: Element) =>
        element.getAttribute("data-expand") === "false" ? false : null,
      renderHTML: (attributes: Record<string, unknown>) =>
        attributes.expand === false ? { "data-expand": "false" } : {},
    },
    /**
     * Stable ContentNode id of the target, when known. The title is a LABEL,
     * not a pointer — renaming a note used to orphan every inbound link. This
     * is the durable pointer; `targetTitle` stays as the human text and the
     * fallback for links authored without an id (typed, AI, imported).
     */
    targetId: optionalString("data-target-id", "targetId"),
    targetTitle: optionalString("data-target-title", "targetTitle"),
    displayText: optionalString("data-display-text", "displayText"),
    /**
     * Derived slug of an in-document heading target ([[#Heading]]). Heading
     * ids are LIVE slugs (lib/domain/content/heading-ids.ts); the
     * heading-link-integrity extension rewrites this attr on rename.
     */
    headingSlug: optionalString("data-heading-slug", "headingSlug"),
    /**
     * Where inside the target: `"<kind>:<id>"` (lib/domain/content/
     * link-anchor.ts). The editor never interprets the kind; the target's
     * viewer does.
     */
    anchor: optionalString("data-anchor", "anchor"),
    /** Human label of the anchor (a quote, a heading) — display + hover only. */
    anchorLabel: optionalString("data-anchor-label", "anchorLabel"),
    /**
     * How the link is DISPLAYED: "link" (default, plain text link), "chip"
     * (icon + title pill), "card" (title + excerpt preview). The fourth
     * display, the windowed note, is not a value here — it is the
     * `noteWindow` block, and the view chooser converts between the two
     * (lib/domain/editor/link-views.ts). Only a non-default view is stored.
     */
    view: {
      default: null as string | null,
      parseHTML: (element: Element) => {
        const raw = element.getAttribute("data-view");
        return raw && raw !== DEFAULT_WIKI_LINK_VIEW ? raw : null;
      },
      renderHTML: (attributes: Record<string, unknown>) =>
        typeof attributes.view === "string" && attributes.view !== DEFAULT_WIKI_LINK_VIEW
          ? { "data-view": attributes.view }
          : {},
    },
  };
}

/** The effective inline view of a link's attrs (unknown values fall to "link"). */
export function wikiLinkViewOf(attrs: { view?: string | null }): WikiLinkInlineView {
  return isWikiLinkInlineView(attrs.view) ? attrs.view : DEFAULT_WIKI_LINK_VIEW;
}

/**
 * What a link shows: the alias, else the title — plus the anchor's label for
 * an anchored link ("Pride and Prejudice › “It is a truth…”"). A column is a
 * name, not a quotation, so it goes unquoted ("Jobs › Status").
 */
export function wikiLinkDisplayText(attrs: {
  displayText?: string | null;
  targetTitle?: string | null;
  anchor?: string | null;
  anchorLabel?: string | null;
}): string {
  if (attrs.displayText) return attrs.displayText;
  const title = attrs.targetTitle || "Unknown";
  if (!attrs.anchorLabel) return title;
  const label = attrs.anchorLabel.length > 40 ? `${attrs.anchorLabel.slice(0, 39)}…` : attrs.anchorLabel;
  return parseColumnAnchor(attrs.anchor) ? `${title} › ${label}` : `${title} › “${label}”`;
}

/**
 * The attrs every rendered wiki-link span carries, client and server alike:
 * the type marker the click/context-menu handlers key on, the base class
 * plus a view modifier, and the anchor tooltip.
 */
export function wikiLinkRenderAttrs(attrs: {
  targetTitle?: string | null;
  anchorLabel?: string | null;
  view?: string | null;
}): Record<string, string> {
  const view = wikiLinkViewOf(attrs);
  return {
    "data-type": "wiki-link",
    class: view === DEFAULT_WIKI_LINK_VIEW ? "wiki-link" : `wiki-link wiki-link--${view}`,
    ...(attrs.anchorLabel
      ? { title: `“${attrs.anchorLabel}” — ${attrs.targetTitle ?? ""}` }
      : {}),
  };
}

/** The [[...]] source text a link un-wraps back into (Backspace/Delete, renderText). */
export function wikiLinkSourceText(attrs: {
  targetTitle?: string | null;
  displayText?: string | null;
  headingSlug?: string | null;
  anchor?: string | null;
}): string {
  const title = `${attrs.headingSlug ? "#" : ""}${attrs.targetTitle ?? ""}${attrs.anchor ? `#^${attrs.anchor}` : ""}`;
  return attrs.displayText ? `[[${title}|${attrs.displayText}]]` : `[[${title}]]`;
}
