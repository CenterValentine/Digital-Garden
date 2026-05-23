/**
 * Cloze Deletion Mark — Session 3A
 *
 * Anki-style cloze deletions: select text and mark it for "remove on
 * front, reveal on back". Multiple ordinals on the same source doc
 * produce sibling flashcards (one per ordinal) via extractClozeCards.
 *
 * Why a mark and not a node:
 *   - Composes with other inline marks (bold, italic, link, code)
 *   - Doesn't break text selection or cursor navigation
 *   - Round-trips through TipTap JSON / Y.Doc cleanly like any mark
 *
 * Two variants exported from this file (same name, different renderHTML):
 *   - `ClozeDeletion`        — client surface; ordinal badge + tint
 *   - `ServerClozeDeletion`  — bare span on publishing surfaces;
 *                              the text stays, the cloze annotation is
 *                              stripped (cloze is a study artifact, not
 *                              publishing content)
 *
 * Attribute surface:
 *   - ordinal — 1-indexed marker. The extractor groups cards by this.
 *                Multiple text spans can share an ordinal (e.g. cloze[2]
 *                wrapping discontinuous text) → still produces one card.
 *   - hint    — optional override for the [...] placeholder on the front
 *                of that ordinal's card. From Anki: `{{c1::word::hint}}`.
 */

import { Mark, mergeAttributes, type Editor } from "@tiptap/core";

export type ClozeDeletionAttrs = {
  ordinal: number;
  hint: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    clozeDeletion: {
      /** Apply a cloze mark to the current selection at the given (or
       *  auto-assigned next) ordinal. */
      setClozeDeletion: (attrs?: Partial<ClozeDeletionAttrs>) => ReturnType;
      /** Remove the cloze mark from the current selection. */
      unsetClozeDeletion: () => ReturnType;
      /** Toggle the cloze mark on the current selection. If unmarked,
       *  applies with the next available ordinal across the document. */
      toggleClozeDeletion: (attrs?: Partial<ClozeDeletionAttrs>) => ReturnType;
    };
  }
}

// Walk the doc and return max(existing ordinals) + 1, or 1 if none.
// Stable across calls because the doc is the source of truth — no
// "what ordinal did I last assign?" state to keep in sync.
function nextOrdinal(editor: Editor): number {
  let maxOrdinal = 0;
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "clozeDeletion") {
        const ord = Number(mark.attrs.ordinal ?? 0);
        if (Number.isFinite(ord) && ord > maxOrdinal) maxOrdinal = ord;
      }
    }
    return true;
  });
  return maxOrdinal + 1;
}

function clozeAttrSpec(): Record<string, unknown> {
  return {
    ordinal: {
      default: 1,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute("data-cloze-ordinal");
        const n = raw ? Number(raw) : 1;
        return Number.isFinite(n) && n > 0 ? n : 1;
      },
      renderHTML: (attrs: Record<string, unknown>) => ({
        "data-cloze-ordinal": String(attrs.ordinal ?? 1),
      }),
    },
    hint: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-cloze-hint") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.hint ? { "data-cloze-hint": attrs.hint as string } : {},
    },
  };
}

// Client mark — styled placeholder with ordinal badge via CSS.
export const ClozeDeletion = Mark.create({
  name: "clozeDeletion",
  // Don't extend the mark when typing at boundaries — adjacent typing
  // should be plain text, not auto-clozed.
  inclusive: false,

  addAttributes() {
    return clozeAttrSpec();
  },

  parseHTML() {
    return [{ tag: "span[data-cloze]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-cloze": "true",
        class: "cloze-deletion",
      }),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-c": () => {
        const editor = this.editor;
        if (!editor) return false;
        const ordinal = nextOrdinal(editor);
        return editor.commands.toggleMark(this.name, { ordinal, hint: null });
      },
    };
  },

  addCommands() {
    return {
      setClozeDeletion:
        (attrs) =>
        ({ commands, editor }) => {
          const ordinal = attrs?.ordinal ?? nextOrdinal(editor);
          return commands.setMark(this.name, {
            ordinal,
            hint: attrs?.hint ?? null,
          });
        },
      unsetClozeDeletion:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      toggleClozeDeletion:
        (attrs) =>
        ({ commands, editor }) => {
          const ordinal = attrs?.ordinal ?? nextOrdinal(editor);
          return commands.toggleMark(this.name, {
            ordinal,
            hint: attrs?.hint ?? null,
          });
        },
    };
  },
});

// Server mark — same name + attrs (so parseHTML round-trips through
// the server bundle without losing the mark), but renderHTML emits a
// bare span. Cloze annotations are private study artifacts and don't
// belong in published HTML; the text content of the marked passage
// still renders (the mark wraps real user content).
export const ServerClozeDeletion = Mark.create({
  name: "clozeDeletion",
  inclusive: false,

  addAttributes() {
    return clozeAttrSpec();
  },

  parseHTML() {
    return [{ tag: "span[data-cloze]" }];
  },

  renderHTML() {
    // Unattributed span — text passes through, no class, no data attrs.
    // CSS in app/globals.css scopes the .cloze-deletion styling to the
    // editor surface only, but emitting nothing here is safer than
    // emitting class names that could leak into published markup.
    return ["span", {}, 0];
  },
});
