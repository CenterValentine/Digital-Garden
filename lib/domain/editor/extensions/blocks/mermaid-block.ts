/**
 * Mermaid Block
 *
 * Embeds a live Mermaid diagram inside a TipTap note (Path A).
 * The block stores a `contentId` referencing a real `visualization` ContentNode
 * (engine: "mermaid"). When first inserted the contentId is null — the editor
 * fires an `embed-diagram-create` CustomEvent so MarkdownEditor can call the API,
 * receive the new contentId, and write it back into the node attrs.
 *
 * Path A: the diagram source lives as a Y.Text on the NOTE's Y.Doc keyed by
 * `blockMermaid:{blockId}`. No separate Hocuspocus session; piggybacks on the
 * note's existing collaboration. Server load/store hooks seed/extract the
 * Y.Text from the visualization payload as a non-canonical backup.
 *
 * Block states:
 *   collapsed  — pill with title + character count
 *   expanded   — renders the full MermaidViewer at a fixed height
 *   unlinked   — contentId is null; shows a spinner while creating
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import type * as Y from "yjs";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

/**
 * Sub-Y.Text naming convention — kept in one place so server (documents.ts)
 * and client (block node-view + viewer) agree on the key.
 */
export function mermaidEmbedSubTextKey(blockId: string): string {
  return `blockMermaid:${blockId}`;
}

/**
 * De-dupe guard: if updateContent fires again while the original POST is
 * still in flight (e.g. because a remote Y.js sync re-renders the doc), the
 * block would dispatch a second embed-diagram-create event → two concurrent
 * creates → slug collision. Track which blockIds have already dispatched so
 * we only fire once per block until the contentId lands back in attrs.
 */
const pendingCreateBlockIds = new Set<string>();

/**
 * Look up the note's Y.Doc via the Collaboration extension's options. This is
 * reliable at NodeView mount time, which a useEffect-populated
 * editor.storage.noteYdoc is not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveNoteYdoc(editor: any): Y.Doc | null {
  try {
    const ext = editor?.extensionManager?.extensions?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.name === "collaboration"
    );
    const doc = ext?.options?.document ?? null;
    return doc as Y.Doc | null;
  } catch {
    return null;
  }
}

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
        // Run cleanup (unmount) before clearing DOM
        const cleanup = (contentDom as any).__cleanup;
        if (cleanup) {
          try { cleanup(); } catch {}
          delete (contentDom as any).__cleanup;
        }
        // Also unmount any root not yet cleaned up
        const existingRoot = (contentDom as any).__reactRoot;
        if (existingRoot) {
          try { existingRoot.unmount(); } catch {}
          delete (contentDom as any).__reactRoot;
        }
        contentDom.innerHTML = "";
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

  // ── Unlinked state: auto-create immediately, show spinner ─────────────
  if (!attrs.contentId) {
    const creating = document.createElement("div");
    creating.className = "block-mermaid-creating";
    creating.textContent = "Creating diagram…";
    contentDom.appendChild(creating);
    if (attrs.blockId && !pendingCreateBlockIds.has(attrs.blockId)) {
      pendingCreateBlockIds.add(attrs.blockId);
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
    }
    return;
  } else if (attrs.blockId) {
    pendingCreateBlockIds.delete(attrs.blockId);
  }

  // ── Collapsed/expanded toggle (accordion-style) ─────────────────────────
  const collapseRow = document.createElement("div");
  collapseRow.className = "block-accordion-summary block-accordion-no-divider";

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

  // Live character count pulled from the note's sub-Y.Text (Path A).
  // Same motivation as excalidraw-block: editor.storage.noteYdoc lags (set in
  // useEffect) so we go straight to the Collaboration extension's document.
  const noteYdoc = resolveNoteYdoc(editor);
  let charCount = 0;
  if (noteYdoc && attrs.blockId) {
    try {
      const subText = noteYdoc.getText(mermaidEmbedSubTextKey(attrs.blockId));
      charCount = subText.length;
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

  // ── Expanded state: mount React viewer ────────────────────────────────
  if (attrs.expanded) {
    const mountEl = document.createElement("div");
    mountEl.className = "block-mermaid-mount";
    mountEl.style.height = `${attrs.height}px`;
    contentDom.appendChild(mountEl);

    // Path A: no runtime acquisition. The viewer binds directly to the note's
    // Y.Doc via embedYdoc + embedYTextKey. Persistence is implicit through
    // the note's ydoc sync + server store hook extracting the mermaid
    // sub-Y.Text back into the visualization payload.
    const yTextKey = attrs.blockId ? mermaidEmbedSubTextKey(attrs.blockId) : null;
    // Re-resolve at mount time to pick up the current note ydoc even if it
    // became available after the synchronous charCount pass above.
    const mountYdoc = resolveNoteYdoc(editor);

    Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@/components/content/viewer/MermaidViewer"),
    ]).then(([React, ReactDOM, { MermaidViewer }]) => {
      const root = ReactDOM.createRoot(mountEl);
      (contentDom as any).__reactRoot = root;

      const el = React.createElement(MermaidViewer, {
        contentId: attrs.contentId!,
        title: attrs.title,
        isEmbedded: true,
        embedYdoc: mountYdoc,
        embedYTextKey: yTextKey,
      });

      root.render(el);

      // Defer unmount — synchronous unmount during a React render cycle throws
      // "Attempted to synchronously unmount a root while React was already rendering".
      (contentDom as any).__cleanup = () => {
        queueMicrotask(() => { try { root.unmount(); } catch {} });
      };
    }).catch(console.error);
  }
}
