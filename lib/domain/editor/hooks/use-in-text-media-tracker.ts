/**
 * Report what a note's text gains and loses — images and audio clips with a
 * content id — so the file tree shows it at once instead of after the save
 * (lib/features/content/in-text-media.ts).
 *
 * Every way media gets in or out goes through the document: paste, drop,
 * the /image command, AI images, delete, cut, undo and redo. So this watches
 * the document rather than each of those paths. A placeholder only counts
 * once its upload lands and it carries the new content id.
 */
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { isArrivingChange, mediaInDoc, trackMediaStep } from "@/lib/features/content/in-text-media";
import { useInTextMediaStore } from "@/state/in-text-media-store";

export function useInTextMediaTracker(editor: Editor | null, noteId: string | null | undefined): void {
  useEffect(() => {
    if (!editor || !noteId) return;
    let known = mediaInDoc(editor.state.doc);
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged) return;
      // A change arriving (another session, or the document loading) moves
      // the baseline without counting as an edit made here.
      const step = trackMediaStep(
        known,
        mediaInDoc(transaction.doc),
        isArrivingChange(transaction.getMeta("y-sync$")),
      );
      if (step.added.length > 0 || step.removed.length > 0) {
        useInTextMediaStore.getState().record(noteId, step.added, step.removed);
      }
      known = step.known;
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor, noteId]);
}
