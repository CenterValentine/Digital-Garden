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

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import * as Y from "yjs";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { collaborationRuntimeManager } from "@/lib/domain/collaboration/runtime";
import { getContentCollaborationCapability } from "@/lib/domain/collaboration/runtime";

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
      blockId: { default: null },
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
        contentDom.innerHTML = "";
        // Unmount any existing React root before re-rendering
        const existingRoot = (contentDom as any).__reactRoot;
        if (existingRoot) {
          try { existingRoot.unmount(); } catch {}
          delete (contentDom as any).__reactRoot;
        }
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
      blockId: { default: null },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  getPos: (() => number | undefined) | undefined
) {
  contentDom.className = "block-excalidraw-content";

  // ── Unlinked state: auto-create immediately, show spinner ─────────────
  if (!attrs.contentId) {
    const creating = document.createElement("div");
    creating.className = "block-excalidraw-creating";
    creating.textContent = "Creating drawing…";
    contentDom.appendChild(creating);
    // Defer by one frame so the NodeView is fully mounted before dispatching
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
    return;
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
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
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
      detail: { blockId, key: "title", value: titleSpan.textContent || "" },
    }));
  });

  // Live element count badge
  let elementCount = 0;
  const capability = getContentCollaborationCapability("visualization", "excalidraw");
  if (capability && process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true") {
    try {
      const handle = collaborationRuntimeManager.getHandle(attrs.contentId, "__pill__");
      if (handle?.ydoc) {
        elementCount = handle.ydoc.getArray("elements").length;
      }
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

    // Dynamically import React + ExcalidrawViewer to avoid SSR and keep
    // the TipTap extension itself server-safe.
    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/components/content/viewer/ExcalidrawViewer"),
      import("@/lib/domain/collaboration/runtime"),
    ]).then(([React, ReactDOM, { ExcalidrawViewer }, { collaborationRuntimeManager: mgr, getContentCollaborationCapability: getCap }]) => {
      // Acquire collab runtime for the embedded viewer
      const colabEnabled = process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true";
      const cap = colabEnabled ? getCap("visualization", "excalidraw") : null;
      const viewInstanceId = `excalidrawBlock:${attrs.blockId ?? "unknown"}`;
      const runtimeHandle = cap && attrs.contentId
        ? mgr.acquire(
            attrs.contentId,
            cap,
            {
              surfaceKind: "other",
              viewInstanceId,
            }
          )
        : null;

      const root = ReactDOM.createRoot(mountEl);
      (contentDom as any).__reactRoot = root;
      (contentDom as any).__runtimeHandle = runtimeHandle;

      const el = React.createElement(ExcalidrawViewer, {
        contentId: attrs.contentId!,
        title: attrs.title,
        isEmbedded: true,
        collaborationRuntime: runtimeHandle,
        onSave: async (data: any) => {
          try {
            await fetch(`/api/content/content/${attrs.contentId}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ visualizationData: data }),
            });
          } catch {}
        },
      });

      root.render(el);

      // Clean up on block destroy — hoisted via parentElement marker
      (mountEl as any).__cleanup = () => {
        try { root.unmount(); } catch {}
        try { runtimeHandle?.release(); } catch {}
      };
    }).catch(console.error);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
