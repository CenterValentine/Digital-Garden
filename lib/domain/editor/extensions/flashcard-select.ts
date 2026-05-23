import { Mark, mergeAttributes } from "@tiptap/core";

// Flashcard Selection Mark (Epoch 19, Sprint 8).
//
// Inline mark applied to a passage that the user has flagged as one
// side of a flashcard. Two marks with the same `cardSetId` form a
// front/back pair; a card row in the global Flashcard table is
// created when both sides commit.
//
// Why a mark and not a node:
//   - Survives reload / paste / collab round-trip (lives in the doc
//     JSON, like `bold` or `link`)
//   - Doesn't disrupt inline text flow the way a wrapping node would
//   - Cheap to apply/remove via the standard mark commands
//
// Why a separate file from the existing `ai-highlight` mark:
//   - We need a different `renderHTML` on the server side so the
//     highlight strip leaves no trace in published HTML. Marks are
//     wrappers by definition — to "strip on publish" we register a
//     parallel `ServerFlashcardSelect` whose renderHTML emits an
//     unattributed span (no class, no data attrs, no border).
//
// Public-safety contract:
//   - The CLIENT mark adds `data-flashcard-select` + class names that
//     drive the highlight CSS.
//   - The SERVER mark emits a bare `<span>` with no class and no data
//     attributes. CSS doesn't match it, so the highlight disappears
//     entirely on published pages. The text itself is still rendered
//     (it has to be — the mark wraps actual content the user wrote).
//
// Attribute surface:
//   - cardSetId    — UUID shared between the front + back marks of a
//                    single card. Hash source for palette color.
//   - side         — "front" | "back". Drives the dashed-vs-solid
//                    underline style.
//   - deckId       — FK to FlashcardDeck. Stored on the mark so the
//                    selection can be re-linked when the user edits.
//   - flashcardId  — FK to Flashcard, populated AFTER the card is
//                    created. Null while the back side is still
//                    pending (the "abandon" path keys off this).
//   - paletteIndex — 0..11 index into a 12-hue rotation defined in
//                    app/globals.css. Computed once at front-mark
//                    creation time from the cardSetId hash so the
//                    same card always gets the same color across
//                    reloads.

export type FlashcardSelectSide = "front" | "back";

export interface FlashcardSelectAttrs {
  cardSetId: string | null;
  side: FlashcardSelectSide;
  deckId: string | null;
  flashcardId: string | null;
  paletteIndex: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    flashcardSelect: {
      setFlashcardSelect: (attrs: Partial<FlashcardSelectAttrs>) => ReturnType;
      unsetFlashcardSelect: () => ReturnType;
    };
  }
}

const PALETTE_SLOTS = 12;

// Stable hash → palette index. Same cardSetId always lands on the same
// hue across sessions, devices, reloads.
export function paletteIndexFromCardSetId(cardSetId: string): number {
  let acc = 0;
  for (let i = 0; i < cardSetId.length; i += 1) {
    acc = (acc * 31 + cardSetId.charCodeAt(i)) >>> 0;
  }
  return acc % PALETTE_SLOTS;
}

function flashcardSelectAttrSpec(): Record<string, unknown> {
  return {
    cardSetId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-card-set-id") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.cardSetId
          ? { "data-card-set-id": attrs.cardSetId as string }
          : {},
    },
    side: {
      default: "front" as FlashcardSelectSide,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-side") === "back" ? "back" : "front",
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-side": (attrs.side as string) || "front",
      }),
    },
    deckId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-deck-id") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.deckId ? { "data-deck-id": attrs.deckId as string } : {},
    },
    flashcardId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-flashcard-id") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.flashcardId
          ? { "data-flashcard-id": attrs.flashcardId as string }
          : {},
    },
    paletteIndex: {
      default: 0,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute("data-palette-index");
        const n = raw ? Number.parseInt(raw, 10) : 0;
        return Number.isFinite(n) ? Math.max(0, Math.min(PALETTE_SLOTS - 1, n)) : 0;
      },
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-palette-index": String(attrs.paletteIndex ?? 0),
      }),
    },
  };
}

// ─── Client mark ────────────────────────────────────────────────────────
//
// Wraps the selected text in a styled <span>. The class list encodes the
// side (front/back) and the palette slot — CSS in app/globals.css uses
// `data-palette-index` via the .flashcard-select--p{0..11} classes (set
// in addition to data attrs so CSS doesn't need attribute selectors).

export const FlashcardSelect = Mark.create({
  name: "flashcardSelect",

  // Typing at the mark boundary should NOT extend the mark — the user
  // is annotating a specific passage, not painting forward.
  inclusive: false,

  // Allow the user to step out of the mark by pressing arrow keys.
  exitable: true,

  addAttributes() {
    return flashcardSelectAttrSpec();
  },

  parseHTML() {
    return [{ tag: "span[data-flashcard-select]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const side =
      (HTMLAttributes["data-side"] as string | undefined) === "back"
        ? "back"
        : "front";
    const paletteIndexRaw = HTMLAttributes["data-palette-index"] as
      | string
      | undefined;
    const paletteIndex = paletteIndexRaw
      ? Math.max(0, Math.min(PALETTE_SLOTS - 1, Number.parseInt(paletteIndexRaw, 10) || 0))
      : 0;

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-flashcard-select": "",
        class: `flashcard-select flashcard-select--side-${side} flashcard-select--p${paletteIndex}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setFlashcardSelect:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs as Record<string, unknown>),
      unsetFlashcardSelect:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

// ─── Server mark (publish-safe) ─────────────────────────────────────────
//
// Identical schema (so JSON round-trips through API → DB → render
// without losing attrs), but renderHTML emits a bare <span> with no
// class and no data attributes. The mark wrapper is still present in
// the output — it has to be, because marks ARE wrappers — but it
// carries zero identifying signal. CSS doesn't match, the underline
// vanishes, the deck identity is invisible.
//
// Used by:
//   - getServerExtensions()                  (HTML export, markdown)
//   - getCollaborationServerExtensions()     (Hocuspocus Y.Doc schema)
//   - The public-page renderer in components/public/TipTapContent.tsx

export const ServerFlashcardSelect = Mark.create({
  name: "flashcardSelect",
  inclusive: false,

  addAttributes() {
    return flashcardSelectAttrSpec();
  },

  parseHTML() {
    return [{ tag: "span[data-flashcard-select]" }];
  },

  renderHTML() {
    return ["span", {}, 0];
  },
});
