/**
 * Mermaid Block
 *
 * Embeds a live Mermaid diagram canvas inside a TipTap note.
 * The block stores a `contentId` referencing a real `visualization` ContentNode
 * (engine: "mermaid"). When first inserted the contentId is null — the editor
 * fires an `embed-diagram-create` CustomEvent so MarkdownEditor can call the API,
 * receive the new contentId, and write it back into the node attrs.
 *
 * Collaboration is free: the runtime attaches to the contentId exactly as it does
 * for standalone Mermaid viewers (Y.Text "source").
 *
 * Block states:
 *   collapsed  — default; shows a pill with title + character count
 *   expanded   — renders the full MermaidViewer at a fixed height
 *   unlinked   — contentId is null; shows a "Create diagram" prompt
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { collaborationRuntimeManager } from "@/lib/domain/collaboration/runtime";
import { getContentCollaborationCapability } from "@/lib/domain/collaboration/runtime";

const { schema: mermaidBlockSchema, defaults: mermaidBlockDefaults } =
  createBlockSchema("mermaidBlock", {
    contentId: z
      .string()
      .nullable()
      .default(null)
      .describe("ID of the linked visualization ContentNode"),
    title: z
      .string()
      .default("Untitled Diagram")
      .describe("Display name for the diagram"),
    expanded: z
      .boolean()
      .default(false)
      .describe("Whether the diagram is currently expanded"),
    height: z
      .number()
      .int()
      .min(200)
      .max(1200)
      .default(400)
      .describe("Viewer height in pixels when expanded"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "mermaidBlock",
  label: "Mermaid Diagram",
  description: "Embedded text-based diagram — collapses to a pill when not in use",
  iconName: "GitBranch",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: mermaidBlockSchema,
  defaultAttrs: mermaidBlockDefaults(),
  slashCommand: "/mermaid",
  searchTerms: [
    "mermaid",
    "diagram",
    "flowchart",
    "sequence",
    "gantt",
    "graph",
    "chart",
    "embed",
  ],
  hiddenFields: ["contentId", "expanded"],
});

// ─── Client Node ─────────────────────────────────────────────────────────────

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "mermaidBlock" },
      contentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-content-id") || null,
        renderHTML: (attrs) =>
          attrs.contentId ? { "data-content-id": attrs.contentId } : {},
      },
      title: {
        default: "Untitled Diagram",
        parseHTML: (el) =>
          el.getAttribute("data-title") || "Untitled Diagram",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      expanded: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-expanded") === "true",
        renderHTML: (attrs) =>
          attrs.expanded ? { "data-expanded": "true" } : {},
      },
      height: {
        default: 400,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-height") || "400", 10),
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
    return [{ tag: 'div[data-block-type="mermaidBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-mermaid",
        "data-block-type": "mermaidBlock",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "mermaidBlock",
      label: "Mermaid",
      iconName: "GitBranch",
      atom: true,
      containerAttr: "showContainer",

      renderContent(node, contentDom, editor, getPos) {
        renderMermaidBlock(node.attrs as MermaidBlockAttrs, contentDom, editor, getPos);
      },

      updateContent(node, contentDom, editor, getPos) {
        contentDom.innerHTML = "";
        // Unmount any existing React root before re-rendering
        const existingRoot = (contentDom as any).__reactRoot;
        if (existingRoot) {
          try { existingRoot.unmount(); } catch {}
          delete (contentDom as any).__reactRoot;
        }
        renderMermaidBlock(node.attrs as MermaidBlockAttrs, contentDom, editor, getPos);
        return true;
      },
    });
  },
});

// ─── Server-safe Node ────────────────────────────────────────────────────────

export const ServerMermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "mermaidBlock" },
      contentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-content-id") || null,
        renderHTML: (attrs) =>
          attrs.contentId ? { "data-content-id": attrs.contentId } : {},
      },
      title: {
        default: "Untitled Diagram",
        parseHTML: (el) => el.getAttribute("data-title") || "Untitled Diagram",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      expanded: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-expanded") === "true",
        renderHTML: (attrs) =>
          attrs.expanded ? { "data-expanded": "true" } : {},
      },
      height: {
        default: 400,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-height") || "400", 10),
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
    return [{ tag: 'div[data-block-type="mermaidBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes["data-title"] || "Untitled Diagram");
    const contentId = HTMLAttributes["data-content-id"] || null;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-mermaid",
        "data-block-type": "mermaidBlock",
      }),
      // Render a static placeholder for export/server contexts
      ["span", { class: "block-mermaid-export-label" },
        contentId ? `[Mermaid: ${title}]` : "[Mermaid: unlinked]"
      ],
    ];
  },
});

// ─── NodeView renderer ───────────────────────────────────────────────────────

interface MermaidBlockAttrs {
  blockId: string | null;
  contentId: string | null;
  title: string;
  expanded: boolean;
  height: number;
}

function renderMermaidBlock(
  attrs: MermaidBlockAttrs,
  contentDom: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  getPos: (() => number | undefined) | undefined
) {
  contentDom.className = "block-mermaid-content";

  // ── Unlinked state: auto-create immediately, show spinner ────────────
  if (!attrs.contentId) {
    const creating = document.createElement("div");
    creating.className = "block-mermaid-creating";
    creating.textContent = "Creating diagram…";
    contentDom.appendChild(creating);
    // Defer by one frame so the NodeView is fully mounted before dispatching
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("embed-diagram-create", {
          detail: {
            engine: "mermaid",
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

  // ── Collapsed state: pill summary ─────────────────────────────────────
  const collapseRow = document.createElement("div");
  collapseRow.className = "block-accordion-summary block-accordion-no-divider";

  // Chevron toggle
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
  titleSpan.setAttribute("data-placeholder", "Diagram title…");
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

  // Live character count badge
  let charCount = 0;
  const capability = getContentCollaborationCapability("visualization", "mermaid");
  if (capability && process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true") {
    try {
      const handle = collaborationRuntimeManager.getHandle(attrs.contentId, "__pill__");
      if (handle?.ydoc) {
        charCount = handle.ydoc.getText("source").length;
      }
    } catch {}
  }

  collapseRow.appendChild(chevron);
  collapseRow.appendChild(titleSpan);
  if (charCount > 0) {
    const badge = document.createElement("span");
    badge.className = "block-mermaid-pill-count";
    badge.textContent = `${charCount} char${charCount !== 1 ? "s" : ""}`;
    collapseRow.appendChild(badge);
  }
  contentDom.appendChild(collapseRow);

  // ── Expanded state: mount React viewer ───────────────────────────────
  if (attrs.expanded) {
    const mountEl = document.createElement("div");
    mountEl.className = "block-mermaid-mount";
    mountEl.style.height = `${attrs.height}px`;
    contentDom.appendChild(mountEl);

    // Dynamically import React + MermaidViewer to avoid SSR and keep
    // the TipTap extension itself server-safe.
    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/components/content/viewer/MermaidViewer"),
      import("@/lib/domain/collaboration/runtime"),
    ]).then(([React, ReactDOM, { MermaidViewer }, { collaborationRuntimeManager: mgr, getContentCollaborationCapability: getCap }]) => {
      // Acquire collab runtime for the embedded viewer
      const colabEnabled = process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true";
      const cap = colabEnabled ? getCap("visualization", "mermaid") : null;
      const viewInstanceId = `mermaidBlock:${attrs.blockId ?? "unknown"}`;
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

      const el = React.createElement(MermaidViewer, {
        contentId: attrs.contentId!,
        title: attrs.title,
        isEmbedded: true,
        collaborationRuntime: runtimeHandle,
        onSave: async (source: string) => {
          try {
            await fetch(`/api/content/content/${attrs.contentId}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ visualizationData: { source } }),
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
