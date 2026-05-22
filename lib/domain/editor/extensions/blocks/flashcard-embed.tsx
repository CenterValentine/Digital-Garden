import { Node } from "@tiptap/core";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";

// Server-safe block module (Epoch 19, Sprint 4).
//
// This file MUST stay free of React, react-dom, and any DOM imports —
// `extensions-server.ts` pulls it in for API routes (markdown export,
// collab schema) and Next.js's server-component check rejects any
// client-only transitive import. The client-only NodeView mount lives
// in flashcard-embed-client.tsx; `extensions-client.ts` imports the
// `FlashcardEmbed` Node from there.
//
// Reference-only — card payloads live in the global FlashcardDeck /
// Flashcard tables. The block stores just enough to look up what to
// render, plus per-block UX preferences.
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
export { flashcardEmbedSchema, flashcardEmbedDefaults };

// registerBlock is server-safe (the registry is just a Map; the only
// thing that touches the client-side settings store is `getAllSlashBlocks`,
// and that's called at lookup time, not registration time). Calling it
// here means both server and client bundles see the registration.
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

// ─── Shared attribute spec ──────────────────────────────────────────────
//
// Exported as a function so both the client and server Node.create calls
// can use exactly the same attrs definitions — drift between client and
// server schemas is one of the few ways to break TipTap/Y.Doc round-trip.

// TipTap's addAttributes return type is opaque; Record<string, unknown> is
// the right shape (each attr is { default, parseHTML?, renderHTML? }) and
// matches what the framework accepts.
export function flashcardEmbedAttrSpec(): Record<string, unknown> {
  return {
    blockId: { default: null },
    blockType: { default: "flashcardEmbed" },
    deckId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-deck-id") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.deckId ? { "data-deck-id": attrs.deckId as string } : {},
    },
    cardIds: {
      default: null,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute("data-card-ids");
        if (!raw) return null;
        const ids = raw.split(",").filter(Boolean);
        return ids.length > 0 ? ids : null;
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        Array.isArray(attrs.cardIds) && (attrs.cardIds as string[]).length > 0
          ? { "data-card-ids": (attrs.cardIds as string[]).join(",") }
          : {},
    },
    defaultMode: {
      default: "study",
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-default-mode") === "reference"
          ? "reference"
          : "study",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.defaultMode === "reference"
          ? { "data-default-mode": "reference" }
          : {},
    },
    showRatingButtons: {
      default: true,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-show-rating-buttons") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showRatingButtons === false
          ? { "data-show-rating-buttons": "false" }
          : {},
    },
    showBackground: {
      default: true,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-show-background") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showBackground === false ? { "data-show-background": "false" } : {},
    },
    showBorder: {
      default: true,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-show-border") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showBorder === false ? { "data-show-border": "false" } : {},
    },
  };
}

// ─── Server-safe Node ───────────────────────────────────────────────────
//
// Used by:
//   - getServerExtensions() for API routes that need to parse / serialize
//     TipTap docs (markdown export, search indexing)
//   - getCollaborationServerExtensions() for the Hocuspocus server's
//     Y.Doc schema (so a collab session knows this node type exists)
//
// PUBLIC-SAFETY: this is also the schema used by the public-page
// renderer in `components/public/TipTapContent.tsx`. We intentionally
// do NOT propagate the deckId / cardIds attributes into the rendered
// HTML — flashcards are private user data, and a published note that
// embeds a deck should not leak the deck's UUID. Same pattern as
// `ServerCalendarViewBlock` in extensions/calendar: emit a static
// generic placeholder, not the underlying identifiers.
//
// The attribute spec stays defined (so parseHTML on the server can
// still hydrate documents that DO carry data-deck-id, e.g. a fresh
// editor save round-tripping through API → DB → render). The outer
// renderHTML just doesn't propagate them onto the output element.

export const ServerFlashcardEmbed = Node.create({
  name: "flashcardEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return flashcardEmbedAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="flashcardEmbed"]' }];
  },

  renderHTML() {
    // Generic placeholder — no deckId, no cardIds, no card content.
    // The block is interactive in the authenticated editor; in any
    // server-rendered surface (publishing, markdown export, search
    // indexing, etc.) it shows up as a single static label.
    return [
      "div",
      {
        class: "block-flashcard-embed",
        "data-block-type": "flashcardEmbed",
      },
      ["span", { class: "block-flashcard-embed-export-label" }, "Flashcards"],
    ];
  },
});
