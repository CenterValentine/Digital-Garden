import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { resolveNoteYdoc } from "@/lib/domain/blocks/resolve-note-ydoc";
import { noteWindowAttrSpec, type NoteWindowAttrs } from "./note-window";

// Client-only Node spec.
//
// Kept in a separate file from the server-safe sibling so the server
// bundle never traces `react-dom/client`. extensions-client.ts imports
// `NoteWindow` from here; extensions-server.ts and
// collaboration/extensions.ts import `ServerNoteWindow` from
// ./note-window. Attributes are shared via noteWindowAttrSpec() so
// client + server can never drift on the schema.
//
// The React component is lazy-imported: NoteWindowNodeView composes
// MarkdownEditor, and MarkdownEditor imports extensions-client (which
// imports this file) — a static import would close that cycle at module
// init. The dynamic import() defers resolution to first render, same
// reason excalidraw-block lazy-imports ExcalidrawViewer.

/**
 * Options threaded from the host editor via getEditorExtensions():
 *
 *   depth              0 in a top-level editor. A NodeView rendering a
 *                      nested editor passes depth + 1 — at depth ≥ 1 the
 *                      window renders collapsed (expand-on-click, read-only
 *                      snapshot); at depth ≥ 3 it renders an inert chip.
 *   ancestorTargetIds  Chain of windowed target ids above this editor.
 *                      A window whose target is already in the chain is a
 *                      cycle and renders an inert chip.
 *   getHostContentId   Resolves the contentId of the note this editor is
 *                      showing (stale-proof fn, not a snapshot) — the
 *                      self-embed guard.
 */
export interface NoteWindowOptions {
  depth: number;
  ancestorTargetIds: string[];
  getHostContentId: (() => string | undefined) | null;
}

type NodeViewModule = typeof import("@/components/content/editor/NoteWindowNodeView");
let nodeViewModulePromise: Promise<NodeViewModule> | null = null;
function loadNodeViewModule(): Promise<NodeViewModule> {
  if (!nodeViewModulePromise) {
    nodeViewModulePromise = import(
      "@/components/content/editor/NoteWindowNodeView"
    );
  }
  return nodeViewModulePromise;
}

// React lifecycle handles stashed on the contentDom — the
// flashcard-embed-client pattern: keep the root alive across updates,
// fast-path unchanged attrs, defer unmount to a microtask.
type BlockContentDom = HTMLElement & {
  __reactRoot?: Root;
  __cleanup?: () => void;
  __lastAttrs?: NoteWindowAttrs;
  __renderSeq?: number;
};

function attrsEqual(a: NoteWindowAttrs, b: NoteWindowAttrs): boolean {
  return (
    a.targetContentId === b.targetContentId &&
    a.targetTitle === b.targetTitle &&
    a.height === b.height &&
    a.showBorder === b.showBorder
  );
}

function renderNoteWindow(
  attrs: NoteWindowAttrs,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: () => number | undefined,
  options: NoteWindowOptions,
) {
  const dom = contentDom as BlockContentDom;

  // Fast path: same attrs as last render → React tree already shows the
  // right state. Hot path on every focus/selection change.
  if (dom.__reactRoot && dom.__lastAttrs && attrsEqual(dom.__lastAttrs, attrs)) {
    return;
  }

  if (!dom.__reactRoot) {
    contentDom.innerHTML = "";
    const mount = document.createElement("div");
    // The stopEvent allowlist in node-view-factory keys off this class —
    // without it, ProseMirror steals mousedown/keydown from the nested
    // editor. It is also the belt-and-braces "am I nested?" marker.
    mount.className = "block-note-window-mount";
    contentDom.appendChild(mount);
    dom.__reactRoot = createRoot(mount);
    dom.__cleanup = () => {
      // React 18 forbids root.unmount() during a render pass; the destroy
      // hook can fire from inside a ProseMirror transaction commit that
      // coincides with React mid-render. Defer to a microtask.
      const root = dom.__reactRoot;
      delete dom.__reactRoot;
      delete dom.__lastAttrs;
      if (root) {
        queueMicrotask(() => {
          try {
            root.unmount();
          } catch {
            // ignore — root may already be gone with the host node
          }
        });
      }
    };
  }

  // The component is lazy-loaded (cycle-avoidance, see header comment).
  // Sequence renders so a stale resolution can't clobber a newer one.
  dom.__renderSeq = (dom.__renderSeq ?? 0) + 1;
  const seq = dom.__renderSeq;
  dom.__lastAttrs = attrs;
  void loadNodeViewModule().then((mod) => {
    if (dom.__renderSeq !== seq || !dom.__reactRoot) return;
    dom.__reactRoot.render(
      createElement(mod.NoteWindowNodeView, {
        attrs,
        editor,
        getPos,
        depth: options.depth,
        ancestorTargetIds: options.ancestorTargetIds,
        getHostContentId: options.getHostContentId,
        // Re-resolved on every render, like excalidraw — reliable at
        // NodeView mount time, unlike editor.storage.
        hostYdoc: resolveNoteYdoc(editor),
      }),
    );
  });
}

export const NoteWindow = Node.create<NoteWindowOptions>({
  name: "noteWindow",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      depth: 0,
      ancestorTargetIds: [],
      getHostContentId: null,
    };
  },

  addAttributes() {
    return noteWindowAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="noteWindow"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // In-editor serialization keeps the full data-attrs (copy/paste
    // round-trip); the published page uses ServerNoteWindow's
    // title-only placeholder instead.
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-note-window",
        "data-block-type": "noteWindow",
      }),
    ];
  },

  addNodeView() {
    const getOptions = () => this.options;
    return createBlockNodeView({
      blockType: "noteWindow",
      label: "Note Window",
      iconName: "AppWindow",
      atom: true,
      containerAttr: "showBorder",
      renderContent(node, contentDom, editor, getPos) {
        renderNoteWindow(
          node.attrs as NoteWindowAttrs,
          contentDom,
          editor,
          getPos,
          getOptions(),
        );
      },
      updateContent(node, contentDom, editor, getPos) {
        // Keeps the React root alive — renderNoteWindow diffs in place
        // and fast-paths unchanged attrs (no flash, no re-fetch on
        // focus/selection churn).
        renderNoteWindow(
          node.attrs as NoteWindowAttrs,
          contentDom,
          editor,
          getPos,
          getOptions(),
        );
        return true;
      },
    });
  },
});
