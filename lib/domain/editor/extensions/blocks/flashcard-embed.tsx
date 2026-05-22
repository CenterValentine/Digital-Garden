import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { FlashcardEmbedNodeView } from "@/extensions/flashcards/components/FlashcardEmbedNodeView";

// Block schema (Epoch 19, Sprint 4). Reference-only — card payloads live
// in the global FlashcardDeck/Flashcard tables. The block stores just
// enough to look up what to render, plus per-block UX preferences.
//
//   deckId            FK reference to a FlashcardDeck (or null while
//                     the user is mid-picking).
//   cardIds           Optional pinned subset — embeds N specific cards
//                     from the deck rather than the whole deck.
//   defaultMode       "study"     — flips are scored reviews (default)
//                     "reference" — flips are non-scoring skims
//                     Per-block toggle in the NodeView lets the viewer
//                     swap on the fly.
//   showRatingButtons When true (default), the inline UI shows the
//                     4-button rating row in study mode. When false,
//                     only the Play button is shown (compact mode).
const { schema: flashcardEmbedSchema, defaults: flashcardEmbedDefaults } =
  createBlockSchema("flashcardEmbed", {
    deckId: z.string().nullable().default(null).describe("FK to FlashcardDeck"),
    cardIds: z
      .array(z.string())
      .nullable()
      .default(null)
      .describe("Pinned card subset; null = whole deck"),
    defaultMode: z
      .enum(["study", "reference"])
      .default("study")
      .describe("Default mode for inline flips; viewer can toggle on the fly"),
    showRatingButtons: z
      .boolean()
      .default(true)
      .describe("Show inline rating buttons in study mode"),
    showBackground: z.boolean().default(true).describe("Show background fill"),
    showBorder: z.boolean().default(true).describe("Show border"),
  });

export type FlashcardEmbedAttrs = z.infer<typeof flashcardEmbedSchema>;

registerBlock({
  type: "flashcardEmbed",
  label: "Flashcard Deck",
  description: "Embed a flashcard deck or card subset; tap to flip, Play to review",
  iconName: "Layers",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: flashcardEmbedSchema,
  defaultAttrs: flashcardEmbedDefaults(),
  slashCommand: "/flashcards",
  searchTerms: [
    "flashcard",
    "flashcards",
    "deck",
    "review",
    "study",
    "spaced",
    "repetition",
    "anki",
    "fsrs",
  ],
});

// ─── Client Node ────────────────────────────────────────────────────────

// Extend the contentDom with React root + cleanup hooks. Same pattern as
// excalidraw-block — the NodeView factory expects renderContent to mount
// content into contentDom; we mount a React tree and stash the root for
// later updateContent / unmount cleanup.
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
    return {
      blockId: { default: null },
      blockType: { default: "flashcardEmbed" },
      deckId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-deck-id") || null,
        renderHTML: (attrs) =>
          attrs.deckId ? { "data-deck-id": attrs.deckId } : {},
      },
      cardIds: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-card-ids");
          if (!raw) return null;
          const ids = raw.split(",").filter(Boolean);
          return ids.length > 0 ? ids : null;
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs.cardIds) && attrs.cardIds.length > 0
            ? { "data-card-ids": attrs.cardIds.join(",") }
            : {},
      },
      defaultMode: {
        default: "study",
        parseHTML: (el) =>
          el.getAttribute("data-default-mode") === "reference"
            ? "reference"
            : "study",
        renderHTML: (attrs) =>
          attrs.defaultMode === "reference"
            ? { "data-default-mode": "reference" }
            : {},
      },
      showRatingButtons: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-rating-buttons") !== "false",
        renderHTML: (attrs) =>
          attrs.showRatingButtons === false
            ? { "data-show-rating-buttons": "false" }
            : {},
      },
      showBackground: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-background") !== "false",
        renderHTML: (attrs) =>
          attrs.showBackground === false ? { "data-show-background": "false" } : {},
      },
      showBorder: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-border") !== "false",
        renderHTML: (attrs) =>
          attrs.showBorder === false ? { "data-show-border": "false" } : {},
      },
    };
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
        // Run cleanup before clearing so React's StrictMode / dev double-mount
        // doesn't leave orphan listeners.
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

// ─── Server-safe Node ───────────────────────────────────────────────────
//
// Identical attribute schema, no NodeView. Used by:
//   - getServerExtensions() for API routes that need to parse / serialize
//     TipTap docs (markdown export, search indexing)
//   - getCollaborationServerExtensions() for the Hocuspocus server's
//     Y.Doc schema (so a collab session knows this node type exists)
//
// The export-time renderHTML emits a static placeholder so non-interactive
// surfaces (PDF export, RSS feeds) get a sensible label rather than a
// blank div.

export const ServerFlashcardEmbed = Node.create({
  name: "flashcardEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "flashcardEmbed" },
      deckId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-deck-id") || null,
        renderHTML: (attrs) =>
          attrs.deckId ? { "data-deck-id": attrs.deckId } : {},
      },
      cardIds: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-card-ids");
          if (!raw) return null;
          const ids = raw.split(",").filter(Boolean);
          return ids.length > 0 ? ids : null;
        },
        renderHTML: (attrs) =>
          Array.isArray(attrs.cardIds) && attrs.cardIds.length > 0
            ? { "data-card-ids": attrs.cardIds.join(",") }
            : {},
      },
      defaultMode: {
        default: "study",
        parseHTML: (el) =>
          el.getAttribute("data-default-mode") === "reference"
            ? "reference"
            : "study",
        renderHTML: (attrs) =>
          attrs.defaultMode === "reference"
            ? { "data-default-mode": "reference" }
            : {},
      },
      showRatingButtons: { default: true },
      showBackground: { default: true },
      showBorder: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="flashcardEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const deckId = HTMLAttributes["data-deck-id"];
    const cardIds = HTMLAttributes["data-card-ids"];
    const summary = deckId
      ? cardIds
        ? `Flashcards (deck ${deckId}, ${String(cardIds).split(",").length} pinned)`
        : `Flashcards (deck ${deckId})`
      : "Flashcards (unlinked)";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-flashcard-embed",
        "data-block-type": "flashcardEmbed",
      }),
      ["span", { class: "block-flashcard-embed-export-label" }, summary],
    ];
  },
});
