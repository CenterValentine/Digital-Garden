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
// a React tree and stash the root for later updateContent.
//
// Sprint 8 follow-up perf fix: previously updateContent unmounted +
// remounted the React tree on EVERY ProseMirror update — including
// focus/selection events that don't actually change node attrs. That
// triggered a full re-fetch of the deck + queue on every click in/out
// of the block. Now we:
//   - Keep the React root alive across updates (no unmount until
//     ProseMirror destroys the NodeView via the chrome's destroy hook)
//   - Track the last-rendered attrs and skip the re-render when they're
//     shallow-equal to the previous ones
//   - When attrs DO change, call root.render() again — React handles
//     the prop diff in-place; effects fire only on changed deps
// Result: focus/blur on the block is essentially free.
type BlockContentDom = HTMLElement & {
  __reactRoot?: Root;
  __cleanup?: () => void;
  __lastAttrs?: FlashcardEmbedAttrs;
};

// Shallow attribute comparison — returns true when every key in the
// FlashcardEmbedAttrs surface matches between `a` and `b`. cardIds is
// the only array-valued attr; we compare element-by-element instead of
// by reference so a fresh array literal with the same contents counts
// as equal.
function attrsEqual(a: FlashcardEmbedAttrs, b: FlashcardEmbedAttrs): boolean {
  if (a.deckId !== b.deckId) return false;
  if (a.defaultMode !== b.defaultMode) return false;
  if (a.showRatingButtons !== b.showRatingButtons) return false;
  if (a.showBackground !== b.showBackground) return false;
  if (a.showBorder !== b.showBorder) return false;
  const aIds = a.cardIds ?? null;
  const bIds = b.cardIds ?? null;
  if (aIds === null && bIds === null) return true;
  if (aIds === null || bIds === null) return false;
  if (aIds.length !== bIds.length) return false;
  for (let i = 0; i < aIds.length; i += 1) {
    if (aIds[i] !== bIds[i]) return false;
  }
  return true;
}

function renderFlashcardEmbed(
  attrs: FlashcardEmbedAttrs,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: () => number | undefined,
) {
  const dom = contentDom as BlockContentDom;

  // Fast path: same attrs as last render → React tree already shows
  // the right state. This is the hot path on every focus/selection
  // change; bail before touching the DOM.
  if (dom.__reactRoot && dom.__lastAttrs && attrsEqual(dom.__lastAttrs, attrs)) {
    return;
  }

  // First mount: create the root + container div once.
  if (!dom.__reactRoot) {
    contentDom.innerHTML = "";
    const mount = document.createElement("div");
    contentDom.appendChild(mount);
    dom.__reactRoot = createRoot(mount);
    dom.__cleanup = () => {
      if (dom.__reactRoot) {
        try {
          dom.__reactRoot.unmount();
        } catch {
          // ignore
        }
        delete dom.__reactRoot;
        delete dom.__lastAttrs;
      }
    };
  }

  // Re-render with new props. React diffs the tree; effects that depend
  // on changed values run, others don't. No unmount, no full re-fetch.
  dom.__reactRoot.render(
    createElement(FlashcardEmbedNodeView, {
      attrs,
      editor,
      getPos,
    }),
  );
  dom.__lastAttrs = attrs;
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
        // Sprint 8 follow-up: NO LONGER UNMOUNTS the React root.
        // renderFlashcardEmbed handles the diff in-place — keeps the
        // root alive, re-renders with new props, fast-paths when attrs
        // are unchanged. The previous unmount+remount on every update
        // was causing the block to flash a loading state every time the
        // user clicked in/out of it.
        renderFlashcardEmbed(node.attrs as FlashcardEmbedAttrs, contentDom, editor, getPos);
        return true;
      },
    });
  },
});
