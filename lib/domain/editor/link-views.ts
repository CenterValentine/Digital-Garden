/**
 * Link views — ONE reference, four displays.
 *
 *   link    `[[Title]]`          the inline text link (default)
 *   chip    `[[Title]]{.card}`   icon + title pill, inline
 *   card    `[[Title]]{.card}`   title + excerpt preview, inline-block
 *   window  `![[Title]]`         the note itself, in place — the noteWindow block
 *
 * The first three are the wikiLink node's `view` attr. The fourth is a
 * different node (a block, with its own height/border and an editable
 * body), so choosing it is a CONVERSION, not an attr change — and choosing
 * any inline view on a window converts back. This module owns both
 * directions so the hover chooser, the window header and the context menu
 * cannot disagree about what "display as" means.
 *
 * Client-safe, React-free: ProseMirror transactions only.
 */

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { v4 as uuid } from "uuid";
import {
  DEFAULT_WIKI_LINK_VIEW,
  NOTE_WINDOW_DEFAULT_HEIGHT,
  isWikiLinkInlineView,
  type WikiLinkInlineView,
} from "@/lib/domain/content/wiki-link-markdown";
import { isContentNodeId } from "./wiki-link-refs";

export type LinkView = WikiLinkInlineView | "window";

export interface LinkViewOption {
  id: LinkView;
  label: string;
  description: string;
}

export const LINK_VIEW_OPTIONS: LinkViewOption[] = [
  { id: "link", label: "Link", description: "Plain text link" },
  { id: "chip", label: "Chip", description: "Icon and title, inline" },
  { id: "card", label: "Card", description: "Title with a short excerpt" },
  { id: "window", label: "Window", description: "View and edit the other note right here" },
];

export function isLinkView(value: unknown): value is LinkView {
  return value === "window" || isWikiLinkInlineView(value);
}

/** The display a node currently has. */
export function linkViewOfNode(node: PMNode): LinkView | null {
  if (node.type.name === "noteWindow") return "window";
  if (node.type.name !== "wikiLink") return null;
  return isWikiLinkInlineView(node.attrs.view) ? node.attrs.view : DEFAULT_WIKI_LINK_VIEW;
}

/**
 * Can this link become a window? Needs a real node to window: a ContentNode
 * id (not an extension's virtual target), and no heading/anchor — those
 * point INSIDE a document, which a window does not know how to show.
 */
export function canWindowLink(attrs: {
  targetId?: string | null;
  headingSlug?: string | null;
  anchor?: string | null;
}): boolean {
  return Boolean(
    attrs.targetId && isContentNodeId(attrs.targetId) && !attrs.headingSlug && !attrs.anchor,
  );
}

export interface ApplyLinkViewOptions {
  /** Height for a new window (the user's persisted default, when they have one). */
  windowHeight?: number | null;
}

/**
 * Give the node at `pos` the display `view`. Returns false when nothing
 * could be done (no such node, a link that cannot be windowed, a schema
 * position that will not take the block) — callers resolve a missing id
 * first (`resolveWikiLinkTarget`) and retry.
 */
export function applyLinkView(
  editor: Editor,
  pos: number,
  view: LinkView,
  options: ApplyLinkViewOptions = {},
): boolean {
  if (!Number.isInteger(pos) || pos < 0 || pos >= editor.state.doc.content.size) return false;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;

  if (node.type.name === "wikiLink") {
    if (view !== "window") {
      const next = view === DEFAULT_WIKI_LINK_VIEW ? null : view;
      if ((node.attrs.view ?? null) === next) return true;
      return editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, view: next });
          return true;
        })
        .run();
    }
    return linkToWindow(editor, pos, node, options);
  }

  if (node.type.name === "noteWindow") {
    if (view === "window") return true;
    return windowToLink(editor, pos, node, view);
  }

  return false;
}

/**
 * Inline link → window block. The link's paragraph is split around it:
 * text before stays in the paragraph, the window takes its own block, text
 * after starts a new paragraph. A link alone in its paragraph simply
 * replaces it.
 */
function linkToWindow(
  editor: Editor,
  pos: number,
  node: PMNode,
  options: ApplyLinkViewOptions,
): boolean {
  if (!canWindowLink(node.attrs)) return false;
  const windowType = editor.schema.nodes.noteWindow;
  if (!windowType) return false;

  const $pos = editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return false;

  const windowNode = windowType.create({
    blockId: uuid(),
    targetContentId: node.attrs.targetId,
    targetTitle: node.attrs.targetTitle ?? "",
    height: options.windowHeight ?? NOTE_WINDOW_DEFAULT_HEIGHT,
  });

  const offset = pos - $pos.start();
  const before = parent.cut(0, offset);
  const after = parent.cut(offset + node.nodeSize);
  const replacement: PMNode[] = [];
  if (before.content.size > 0) replacement.push(before);
  replacement.push(windowNode);
  if (after.content.size > 0) replacement.push(after);

  try {
    return editor
      .chain()
      .command(({ tr }) => {
        tr.replaceWith($pos.before(), $pos.after(), replacement);
        return true;
      })
      .run();
  } catch {
    return false;
  }
}

/** Window block → a paragraph holding the inline link in the chosen view. */
function windowToLink(
  editor: Editor,
  pos: number,
  node: PMNode,
  view: WikiLinkInlineView,
): boolean {
  const { schema } = editor;
  const linkType = schema.nodes.wikiLink;
  const paragraph = schema.nodes.paragraph;
  if (!linkType || !paragraph) return false;
  const targetId = typeof node.attrs.targetContentId === "string" ? node.attrs.targetContentId : null;
  const targetTitle = typeof node.attrs.targetTitle === "string" ? node.attrs.targetTitle : "";
  if (!targetId && !targetTitle) return false;

  const link = linkType.create({
    targetId,
    targetTitle: targetTitle || "Untitled",
    view: view === DEFAULT_WIKI_LINK_VIEW ? null : view,
  });
  try {
    return editor
      .chain()
      .command(({ tr }) => {
        tr.replaceWith(pos, pos + node.nodeSize, paragraph.create(null, link));
        return true;
      })
      .run();
  } catch {
    return false;
  }
}

/**
 * Document position of a rendered wiki-link element. `posAtDOM` on an
 * inline atom's own element lands either on or just after the node
 * depending on the browser's DOM position math, so both are tried.
 */
export function wikiLinkPosFromElement(editor: Editor, element: Element): number | null {
  let pos: number;
  try {
    pos = editor.view.posAtDOM(element, 0);
  } catch {
    return null;
  }
  if (pos < 0) return null;
  for (const candidate of [pos, pos - 1]) {
    if (candidate < 0) continue;
    const node = editor.state.doc.nodeAt(candidate);
    if (node?.type.name === "wikiLink") return candidate;
  }
  return null;
}

/** Document position of the noteWindow block carrying `blockId`. */
export function noteWindowPosByBlockId(editor: Editor, blockId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "noteWindow" && node.attrs.blockId === blockId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}
