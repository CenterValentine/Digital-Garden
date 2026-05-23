"use client";

/**
 * FlashcardSelectionCommit (Epoch 19, Sprint 8)
 *
 * Listens for `dg:flashcard-selection-commit` (emitted by the
 * FlashcardSelect mark when both sides are highlighted) and:
 *   1. POSTs the new flashcard to /api/flashcards
 *   2. On success: notifies the store + toast
 *   3. On failure: rolls back both marks (via the editor reference
 *      passed in the event detail) + toast + store.resolveError()
 *
 * The mark module is intentionally fetch-free — keeping API calls in
 * the flashcards extension means this surface can be swapped without
 * touching the editor schema.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
// Client-safe logger entry — see FlashcardSelectionStarter for context
// on why the barrel can't be imported from a "use client" graph.
import { clientLogger } from "@/lib/core/logger/client";
import { useFlashcardSelectionStore } from "@/state/flashcard-selection-store";
import { removeMarksByCardSetId } from "@/lib/domain/editor/extensions/flashcard-select";

interface CommitDetail {
  cardSetId: string;
  deckId: string;
  paletteIndex: number;
  frontText: string;
  backText: string;
  editor: Editor;
}

function isCommitDetail(value: unknown): value is CommitDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cardSetId === "string" &&
    typeof v.deckId === "string" &&
    typeof v.frontText === "string" &&
    typeof v.backText === "string" &&
    !!v.editor
  );
}

// Minimal TipTap doc — the POST endpoint expects backContent to be a
// valid Tiptap document (front side accepts plain frontText, but back
// must be a doc). Constructing inline avoids reaching into editor
// internals for trivial text wrapping.
function plainTextDoc(text: string): { type: string; content: unknown[] } {
  if (!text) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

export function FlashcardSelectionCommit() {
  const resolveSuccess = useFlashcardSelectionStore((s) => s.resolveSuccess);
  const resolveError = useFlashcardSelectionStore((s) => s.resolveError);

  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isCommitDetail(detail)) return;

      const { cardSetId, deckId, frontText, backText, editor } = detail;

      if (!frontText.trim() || !backText.trim()) {
        toast.error("Both sides of the card need some text. Try again.");
        const rollback = resolveError();
        if (rollback?.cardSetId) {
          removeMarksByCardSetId(editor, rollback.cardSetId);
        }
        return;
      }

      try {
        const res = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            deckId,
            isFrontRichText: false,
            frontText,
            backContent: plainTextDoc(backText),
            // Server fills these from defaults if omitted; explicit
            // here so future renames are visible in the diff.
            frontLabel: "Question",
            backLabel: "Answer",
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body?.error?.message || `HTTP ${res.status}`);
        }

        // Card created — wire flashcardId back into both marks so the
        // editor doc carries the link. This is a best-effort step;
        // the mark is still useful (and removable) without it.
        const json = (await res.json()) as {
          success?: boolean;
          data?: { id?: string };
        };
        const flashcardId = json?.data?.id;
        if (flashcardId) {
          updateMarksWithFlashcardId(editor, cardSetId, flashcardId);
        }

        toast.success("Flashcard added");
        resolveSuccess();
      } catch (err) {
        clientLogger.warn({
          layer: "fetch",
          event: "flashcard_selection_create_failed",
          summary: "Could not create flashcard from selection",
          error: err instanceof Error ? err : undefined,
          attrs: { cardSetId, deckId },
        });
        toast.error(
          err instanceof Error
            ? `Couldn't save card: ${err.message}`
            : "Couldn't save card",
        );
        const rollback = resolveError();
        if (rollback?.cardSetId) {
          removeMarksByCardSetId(editor, rollback.cardSetId);
        }
      }
    };

    window.addEventListener("dg:flashcard-selection-commit", handler);
    return () => {
      window.removeEventListener("dg:flashcard-selection-commit", handler);
    };
  }, [resolveError, resolveSuccess]);

  return null;
}

/**
 * Walk the doc, find every flashcardSelect mark belonging to this
 * card set, and update its flashcardId attr. We use the same descend
 * pattern as removeMarksByCardSetId — the mark may have been split
 * into multiple physical spans by document edits between application
 * and the POST completing.
 */
function updateMarksWithFlashcardId(
  editor: Editor,
  cardSetId: string,
  flashcardId: string,
): void {
  const markType = editor.schema.marks.flashcardSelect;
  if (!markType) return;

  const tr = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (
        mark.type.name === "flashcardSelect" &&
        mark.attrs.cardSetId === cardSetId
      ) {
        tr.removeMark(pos, pos + node.nodeSize, mark.type);
        tr.addMark(
          pos,
          pos + node.nodeSize,
          mark.type.create({ ...mark.attrs, flashcardId }),
        );
        changed = true;
      }
    }
  });

  if (changed) {
    editor.view.dispatch(tr);
  }
}
