import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { FlashcardEmbedNodeView } from "@/extensions/flashcards/components/FlashcardEmbedNodeView";
import {
  flashcardEmbedAttrSpec,
  type FlashcardEmbedAttrs,
} from "./flashcard-embed";

// Client-only Node spec (Epoch 19, Sprint 4).
//
// Kept in a separate file from the server-safe sibling so the server
// bundle never traces `react-dom/client` (Next.js rejects client-only
// transitive imports from server-component code).
//
// extensions-client.ts imports `FlashcardEmbed` from here.
// extensions-server.ts and collaboration/extensions.ts import
// `ServerFlashcardEmbed` from ./flashcard-embed.
//
// Attributes are shared via flashcardEmbedAttrSpec() so client + server
// can never drift on the schema (which would break TipTap/Y.Doc
// round-trip).

// Extend the contentDom with React root + cleanup hooks. Same pattern as
// excalidraw-block — createBlockNodeView gives us a contentDom; we mount
// a React tree and stash the root for later updateContent / unmount.
type BlockContentDom = HTMLElement & {
  __reactRoot?: Root;
  __cleanup?: () => void;
};

function renderFlashcardEmbed(
  attrs: FlashcardEmbedAttrs,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: () => number | undefined,
) {
  const dom = contentDom as BlockContentDom;
  // Defensive cleanup — updateContent already unmounts before calling us
  // again, but this guards against a renderContent re-entry.
  if (dom.__reactRoot) {
    try {
      dom.__reactRoot.unmount();
    } catch {
      // Ignore unmount errors; React will GC.
    }
    delete dom.__reactRoot;
  }
  contentDom.innerHTML = "";
  const mount = document.createElement("div");
  contentDom.appendChild(mount);
  const root = createRoot(mount);
  root.render(
    createElement(FlashcardEmbedNodeView, {
      attrs,
      editor,
      getPos,
    }),
  );
  dom.__reactRoot = root;
  dom.__cleanup = () => {
    if (dom.__reactRoot) {
      try {
        dom.__reactRoot.unmount();
      } catch {
        // ignore
      }
      delete dom.__reactRoot;
    }
  };
}

export const FlashcardEmbed = Node.create({
  name: "flashcardEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return flashcardEmbedAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="flashcardEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-flashcard-embed",
        "data-block-type": "flashcardEmbed",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "flashcardEmbed",
      label: "Flashcards",
      iconName: "Layers",
      atom: true,
      containerAttr: "showBorder",
      renderContent(node, contentDom, editor, getPos) {
        renderFlashcardEmbed(node.attrs as FlashcardEmbedAttrs, contentDom, editor, getPos);
      },
      updateContent(node, contentDom, editor, getPos) {
        // Run cleanup before clearing so React's StrictMode / dev double-
        // mount doesn't leave orphan listeners.
        const cleanup = (contentDom as BlockContentDom).__cleanup;
        if (cleanup) {
          try {
            cleanup();
          } catch {
            // ignore
          }
          delete (contentDom as BlockContentDom).__cleanup;
        }
        const existingRoot = (contentDom as BlockContentDom).__reactRoot;
        if (existingRoot) {
          try {
            existingRoot.unmount();
          } catch {
            // ignore
          }
          delete (contentDom as BlockContentDom).__reactRoot;
        }
        contentDom.innerHTML = "";
        renderFlashcardEmbed(node.attrs as FlashcardEmbedAttrs, contentDom, editor, getPos);
        return true;
      },
    });
  },
});
