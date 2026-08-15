/**
 * Excalidraw Block
 *
 * Embeds a live Excalidraw canvas inside a TipTap note.
 * The block stores a `contentId` referencing a real `visualization` ContentNode
 * (engine: "excalidraw"). When first inserted the contentId is null — the editor
 * fires an `embed-diagram-create` CustomEvent so MarkdownEditor can call the API,
 * receive the new contentId, and write it back into the node attrs.
 *
 * Collaboration is free: the runtime attaches to the contentId exactly as it does
 * for standalone Excalidraw viewers (Y.Array "elements").
 *
 * Block states:
 *   collapsed  — default; shows a pill with title + element count
 *   expanded   — renders the full ExcalidrawViewer at a fixed height
 *   unlinked   — contentId is null; shows a "Create drawing" prompt
 */

import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { z } from "zod";
import type { Root as ReactRoot } from "react-dom/client";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { consumePendingDiagramCreate } from "./pending-diagram-creates";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { resolveNoteYdoc } from "@/lib/domain/blocks/resolve-note-ydoc";
import {
  syncEditableField,
  onlyFieldChanged,
  attachTitleRenameOnBlur,
} from "@/lib/domain/blocks/inline-edit";

type BlockContentDom = HTMLElement & {
  __cleanup?: () => void;
  __reactRoot?: ReactRoot;
  /** Persistent header title element — synced in place on title-only updates. */
  __titleEl?: HTMLElement;
  /** Full node.attrs from the last render, for the title-only fast path. */
  __lastAttrs?: Record<string, unknown>;
};

/**
 * Sub-map naming convention — kept in one place so server (documents.ts) and
 * client (block node-view + viewer) agree on the key.
 */
export function excalidrawEmbedSubMapKey(blockId: string): string {
  return `blockExcalidraw:${blockId}`;
}

/**
 * De-dupe guard: if updateContent fires again while the original POST is
 * still in flight (e.g. because a remote Y.js sync re-renders the doc), the
 * block would dispatch a second embed-diagram-create event → two concurrent
 * creates → slug collision. Track which blockIds have already dispatched so
 * we only fire once per block until the contentId lands back in attrs.
 */
const pendingCreateBlockIds = new Set<string>();

const { schema: excalidrawBlockSchema, defaults: excalidrawBlockDefaults } =
  createBlockSchema("excalidrawBlock", {
    contentId: z
      .string()
      .nullable()
      .default(null)
      .describe("ID of the linked visualization ContentNode"),
    title: z
      .string()
      .default("Untitled Drawing")
      .describe("Display name for the drawing"),
    expanded: z
      .boolean()
      .default(false)
      .describe("Whether the canvas is currently expanded"),
    height: z
      .number()
      .int()
      .min(200)
      .max(1200)
      .default(480)
      .describe("Canvas height in pixels when expanded"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "excalidrawBlock",
  ttsSkip: true, // diagram canvas — not narratable prose
  label: "Drawing",
  description: "Embedded hand-drawn canvas — collapses to a pill when not in use",
  iconName: "PenLine",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: excalidrawBlockSchema,
  defaultAttrs: excalidrawBlockDefaults(),
  slashCommand: "/excalidraw",
  searchTerms: [
    "excalidraw",
    "drawing",
    "canvas",
    "whiteboard",
    "diagram",
    "sketch",
    "freehand",
    "embed",
  ],
  hiddenFields: ["contentId", "expanded"],
});

// ─── Client Node ─────────────────────────────────────────────────────────────

export const ExcalidrawBlock = Node.create({
  name: "excalidrawBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "excalidrawBlock" },
      contentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-content-id") || null,
        renderHTML: (attrs) =>
          attrs.contentId ? { "data-content-id": attrs.contentId } : {},
      },
      title: {
        default: "Untitled Drawing",
        parseHTML: (el) =>
          el.getAttribute("data-title") || "Untitled Drawing",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      expanded: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-expanded") === "true",
        renderHTML: (attrs) =>
          attrs.expanded ? { "data-expanded": "true" } : {},
      },
      height: {
        default: 480,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-height") || "480", 10),
        renderHTML: (attrs) => ({ "data-height": String(attrs.height) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) =>
          el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) =>
          attrs.showContainer ? { "data-show-container": "true" } : {},
      },
      ...makeWrapAttrs(),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="excalidrawBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-excalidraw",
        "data-block-type": "excalidrawBlock",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "excalidrawBlock",
      label: "Drawing",
      iconName: "PenLine",
      atom: true,
      containerAttr: "showContainer",

      renderContent(node, contentDom, editor, getPos) {
        renderExcalidrawBlock(node.attrs as ExcalidrawBlockAttrs, contentDom, editor, getPos);
      },

      updateContent(node, contentDom, editor, getPos) {
        const d = contentDom as BlockContentDom;
        // Title-only change (per-keystroke header rename): sync the
        // persistent title element in place instead of tearing down the
        // DOM — the rebuild below destroys the focused contentEditable,
        // which ate the caret between every typed character.
        const nextAttrs = node.attrs as Record<string, unknown>;
        if (
          d.__lastAttrs &&
          d.__titleEl &&
          d.__titleEl.isConnected &&
          onlyFieldChanged(d.__lastAttrs, nextAttrs, "title")
        ) {
          d.__lastAttrs = nextAttrs;
          syncEditableField(d.__titleEl, String(nextAttrs.title ?? ""));
          return true;
        }
        // Run cleanup (unmount + runtime release) before clearing DOM
        const cleanup = d.__cleanup;
        if (cleanup) {
          try { cleanup(); } catch {}
          delete d.__cleanup;
        }
        // Also unmount any root not yet cleaned up
        const existingRoot = d.__reactRoot;
        if (existingRoot) {
          try { existingRoot.unmount(); } catch {}
          delete d.__reactRoot;
        }
        delete d.__titleEl;
        contentDom.innerHTML = "";
        renderExcalidrawBlock(node.attrs as ExcalidrawBlockAttrs, contentDom, editor, getPos);
        return true;
      },
    });
  },
});

// ─── Server-safe Node ────────────────────────────────────────────────────────

export const ServerExcalidrawBlock = Node.create({
  name: "excalidrawBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: blockIdAttr,
      blockType: { default: "excalidrawBlock" },
      contentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-content-id") || null,
        renderHTML: (attrs) =>
          attrs.contentId ? { "data-content-id": attrs.contentId } : {},
      },
      title: {
        default: "Untitled Drawing",
        parseHTML: (el) => el.getAttribute("data-title") || "Untitled Drawing",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      expanded: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-expanded") === "true",
        renderHTML: (attrs) =>
          attrs.expanded ? { "data-expanded": "true" } : {},
      },
      height: {
        default: 480,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-height") || "480", 10),
        renderHTML: (attrs) => ({ "data-height": String(attrs.height) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) =>
          attrs.showContainer ? { "data-show-container": "true" } : {},
      },
      ...makeWrapAttrs(),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="excalidrawBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes["data-title"] || "Untitled Drawing");
    const contentId = HTMLAttributes["data-content-id"] || null;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-excalidraw",
        "data-block-type": "excalidrawBlock",
      }),
      // Render a static placeholder for export/server contexts
      ["span", { class: "block-excalidraw-export-label" },
        contentId ? `[Excalidraw: ${title}]` : "[Excalidraw: unlinked]"
      ],
    ];
  },
});

// ─── NodeView renderer ───────────────────────────────────────────────────────

interface ExcalidrawBlockAttrs {
  blockId: string | null;
  contentId: string | null;
  title: string;
  expanded: boolean;
  height: number;
}

function renderExcalidrawBlock(
  attrs: ExcalidrawBlockAttrs,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: (() => number | undefined) | undefined
) {
  contentDom.className = "block-excalidraw-content";
  // Prevent right-clicks inside the Excalidraw canvas from bubbling up to
  // TipTap's onContextMenu handler and showing the app's editor context menu.
  contentDom.addEventListener("contextmenu", (e) => e.stopPropagation());

  // ── Pending-create pickup: if a prior MarkdownEditor listener completed
  // the POST while we were unmounted (Fast Refresh, navigation, etc.), the
  // contentId is waiting for us in the shared map. Apply it via our own
  // fresh getPos and let the next render handle the expanded state.
  if (!attrs.contentId && attrs.blockId && getPos) {
    const pending = consumePendingDiagramCreate(attrs.blockId);
    if (pending) {
      const pos = getPos();
      if (pos !== undefined) {
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...attrs,
            contentId: pending.contentId,
            expanded: pending.expanded,
          })
        );
        return; // The setNodeMarkup will trigger a fresh render with the new attrs.
      }
    }
  }

  // ── Unlinked state: auto-create immediately, show spinner ─────────────
  if (!attrs.contentId) {
    const creating = document.createElement("div");
    creating.className = "block-excalidraw-creating";
    creating.textContent = "Creating drawing…";
    contentDom.appendChild(creating);
    // Guard: a remote Y.js sync or any tr.dispatch can re-fire updateContent
    // before the POST completes. Only dispatch once per blockId.
    if (attrs.blockId && !pendingCreateBlockIds.has(attrs.blockId)) {
      pendingCreateBlockIds.add(attrs.blockId);
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("embed-diagram-create", {
            detail: {
              engine: "excalidraw",
              blockId: attrs.blockId,
              defaultTitle: attrs.title,
              getPos,
              editor,
            },
          })
        );
      });
    }
    return;
  } else if (attrs.blockId) {
    // Clear the guard now that the block has a contentId.
    pendingCreateBlockIds.delete(attrs.blockId);
  }

  // ── Collapsed/expanded toggle — matches accordion style ───────────────
  const collapseRow = document.createElement("div");
  collapseRow.className = "block-accordion-summary block-accordion-no-divider";

  // Chevron toggle button
  const chevron = document.createElement("span");
  chevron.className = "block-accordion-chevron" + (attrs.expanded ? " block-accordion-chevron-open" : "");
  chevron.textContent = "▶";
  chevron.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!getPos) return;
    const pos = getPos();
    if (pos === undefined) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        expanded: !attrs.expanded,
      })
    );
  });

  // Inline-editable title
  const titleSpan = document.createElement("span");
  titleSpan.className = "block-accordion-title";
  titleSpan.contentEditable = "true";
  titleSpan.textContent = attrs.title;
  titleSpan.setAttribute("data-placeholder", "Drawing title…");
  titleSpan.setAttribute("data-header-level", "3");
  titleSpan.addEventListener("mousedown", (e) => e.stopPropagation());
  titleSpan.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      titleSpan.blur(); // commit — the focusout handler PATCHes the file
    }
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      const atStart = sel?.rangeCount && sel.isCollapsed && sel.getRangeAt(0).startOffset === 0;
      if (atStart) { e.preventDefault(); e.stopPropagation(); }
    }
  });
  titleSpan.addEventListener("beforeinput", (e) => e.stopPropagation());
  titleSpan.addEventListener("input", () => {
    const blockId = attrs.blockId;
    if (!blockId) return;
    window.dispatchEvent(new CustomEvent("block-attrs-change", {
      // `editor` addresses the event to THIS block's editor — blockIds can
      // legitimately repeat across documents (cross-note paste keeps them),
      // and multiple editors are mounted at once with Note Windows.
      detail: { blockId, key: "title", value: titleSpan.textContent || "", editor },
    }));
  });
  // Blur/Enter commits the rename to the ACTUAL visualization file (the
  // per-keystroke event above only writes the node attr — the file title
  // desynced forever after creation before this).
  attachTitleRenameOnBlur(titleSpan, () => {
    const d = contentDom as BlockContentDom;
    return (d.__lastAttrs?.contentId as string | null) ?? attrs.contentId;
  });
  // Persistent handles for updateContent's title-only fast path.
  {
    const d = contentDom as BlockContentDom;
    d.__titleEl = titleSpan;
    d.__lastAttrs = attrs as unknown as Record<string, unknown>;
  }

  // Live element count badge — read from the note's sub-map (Path A).
  // The Collaboration extension's options.document holds the authoritative
  // note ydoc. We read from there (not editor.storage.noteYdoc) because the
  // latter is set in a useEffect that runs AFTER this NodeView first mounts,
  // leaving boundYdoc null on initial render and breaking sync for good.
  const noteYdoc = resolveNoteYdoc(editor);
  let elementCount = 0;
  if (noteYdoc && attrs.blockId) {
    try {
      const subMap = noteYdoc.getMap<unknown>(excalidrawEmbedSubMapKey(attrs.blockId));
      elementCount = subMap.size;
    } catch {}
  }

  collapseRow.appendChild(chevron);
  collapseRow.appendChild(titleSpan);
  if (elementCount > 0) {
    const badge = document.createElement("span");
    badge.className = "block-excalidraw-pill-count";
    badge.textContent = `${elementCount} element${elementCount !== 1 ? "s" : ""}`;
    collapseRow.appendChild(badge);
  }
  contentDom.appendChild(collapseRow);

  // ── Expanded state: mount React viewer ───────────────────────────────
  if (attrs.expanded) {
    const mountEl = document.createElement("div");
    mountEl.className = "block-excalidraw-mount";
    mountEl.style.height = `${attrs.height}px`;
    contentDom.appendChild(mountEl);

    // Path A: drawing data lives inside the note's Y.Doc as a sub-map keyed
    // by blockId. No separate Hocuspocus session, no acquire/release. Saves
    // happen through the note's existing ydoc sync; server store hook writes
    // the non-canonical backup into the visualization payload.
    const yMapKey = attrs.blockId ? excalidrawEmbedSubMapKey(attrs.blockId) : null;
    // Re-resolve at mount time so we always pick up the current note ydoc,
    // even if it became available after the first synchronous pass above.
    const mountYdoc = resolveNoteYdoc(editor);

    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/components/content/viewer/ExcalidrawViewer"),
    ]).then(([React, ReactDOM, { ExcalidrawViewer }]) => {
      const root = ReactDOM.createRoot(mountEl);
      (contentDom as BlockContentDom).__reactRoot = root;

      const el = React.createElement(ExcalidrawViewer, {
        contentId: attrs.contentId!,
        title: attrs.title,
        isEmbedded: true,
        embedYdoc: mountYdoc,
        embedYMapKey: yMapKey,
      });

      root.render(el);

      // Defer unmount — synchronous unmount during a React render cycle throws
      // "Attempted to synchronously unmount a root while React was already rendering".
      (contentDom as BlockContentDom).__cleanup = () => {
        queueMicrotask(() => { try { root.unmount(); } catch {} });
      };
    }).catch(console.error);
  }
}

