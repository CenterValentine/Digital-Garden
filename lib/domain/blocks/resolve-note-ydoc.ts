import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";

/**
 * Look up the note's Y.Doc via the Collaboration extension's options. This
 * is reliable *at NodeView mount time*, which a useEffect-populated
 * editor.storage.noteYdoc is not (useEffect runs after the first render).
 *
 * Extracted from excalidraw-block.ts so every block that keys per-instance
 * state off the host note's Y.Doc (excalidraw, mermaid, noteWindow) shares
 * one resolution path.
 */
export function resolveNoteYdoc(editor: Editor): Y.Doc | null {
  try {
    const ext = editor?.extensionManager?.extensions?.find(
      (e: { name: string }) => e.name === "collaboration"
    );
    const doc =
      (ext?.options as { document?: Y.Doc } | undefined)?.document ?? null;
    return doc ?? null;
  } catch {
    return null;
  }
}
